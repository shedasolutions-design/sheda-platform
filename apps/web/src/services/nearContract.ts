import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { InMemoryKeyStore } from "@near-js/keystores";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";

// ── New config imports (single source of truth) ──
import { CONTRACT_ID, ACTIVE_NETWORK } from "../config/near";
import { GAS, DEPOSITS } from "../config/gas";
import { getRpcEndpoints, RETRY_CONFIG, getRetryDelay } from "../config/walletConfig";
import {
  pickEndpointIndex,
  markEndpointHealthy,
  markEndpointUnhealthy,
  isRateLimitError,
  isTransportError,
} from "./rpcHealth";

/**
 * How long a read-only view result stays reusable. Short on purpose — see
 * NearContractService.viewCall.
 */
const VIEW_CACHE_TTL_MS = 2_000;

/**
 * Whether an operation can be safely re-sent after an ambiguous failure.
 *
 * "read"  — a view call. Idempotent: asking twice costs a request and nothing
 *           else, so network errors are retried across endpoints.
 * "write" — a signed transaction. NOT idempotent, because
 *           `account.functionCall()` builds and signs a new transaction with a
 *           fresh nonce on every invocation. A timeout, 429, dropped socket or
 *           CORS-masked response means the *reply* was lost — it is never
 *           evidence that the transaction failed to execute. Retrying one of
 *           these submits a genuine second transaction.
 *
 * That is what made a single bid charge the user more than once: ft_transfer_call
 * ran on-chain, the response didn't make it back, withRetry re-signed and sent
 * it again, and the caller ultimately surfaced the last attempt's error — so
 * the funds moved repeatedly while the UI reported a failure and showed nothing.
 * Every state-changing call in this service had the same exposure: double
 * accepts, double escrow releases, double mints.
 */
type OperationKind = "read" | "write";

/**
 * How many property reads the per-property bid scan keeps in flight. These go
 * to a shared, free, rate-limited public RPC; the point is to finish, not to
 * start everything at once.
 */
const PER_PROPERTY_SCAN_CONCURRENCY = 5;

/**
 * Promise.allSettled with a ceiling on how many run at once, preserving input
 * order in the results.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Thrown when a signed transaction's outcome is unknown. Deliberately worded
 * for the user: the safe action is to check whether it went through, never to
 * blindly fire it again.
 */
export const AMBIGUOUS_WRITE_ERROR =
  "We lost connection while submitting your transaction, so we can't confirm whether it went through. " +
  "Please check your transaction history before trying again — it may already have succeeded.";

// ── Types ──
import {
  Property,
  PropertyView,
  Bid,
  BidView,
  Lease,
  LeaseView,
  Token,
  ContractCallResult,
  Action,
  PlacePropertyParams,
  PlaceBidParams,
  AcceptBidParams,
  ConfirmDocumentReleaseParams,
  ConfirmDocumentReceiptParams,
  ReleasePaymentParams,
  CompleteBidParams,
  RejectBidParams,
  CancelBidParams,
  CompleteLeaseParams,
  RaiseDisputeParams,
  ResolveDisputeParams,
  TransferPropertyParams,
  GetPropertiesParams,
  GetBidsByBidderParams,
  GetBidsForPropertyPaginatedParams,
  ContractConfig,
  // Legacy compat
  MintPropertyParams,
  BidMessage,
  CommitPaymentMessage,
  GAS_AMOUNTS,
  DEPOSIT_AMOUNTS,
} from "../types/contract";

export type NetworkType = "testnet" | "mainnet";

export class NearContractService {
  private provider: JsonRpcProvider | null = null;
  private keyStore: InMemoryKeyStore;
  private currentNetwork: NetworkType = "testnet";
  private currentRpcIndex: number = 0;
  /** In-flight endpoint probe, shared by concurrent initialize() callers */
  private initPromise: Promise<void> | null = null;
  /** Read-only view results, keyed by network+contract+method+args — see viewCall */
  private static viewCache = new Map<string, { value: unknown; expiresAt: number }>();
  /** In-flight view requests, so identical concurrent reads share one call */
  private static viewInFlight = new Map<string, Promise<unknown>>();
  /**
   * Set once the contract's whole-map bid reads (get_bids_by_bidder,
   * get_all_bids) have been shown to fail — they iterate every bid, so one
   * undeserializable entry breaks them permanently, for every account. Static
   * because it describes the deployed contract, not any one caller.
   */
  private static wholeMapBidReadsBroken = false;

  /**
   * In-flight value-moving writes, keyed by exactly what they would do.
   *
   * WHY: submitting the same bid twice moves the user's money twice. The UI
   * guards it with React state (setIsPlacingBid), but state updates are
   * asynchronous — a second tap landing in the same tick sees the button still
   * enabled and fires a second real ft_transfer_call. That is the whole bug,
   * and it is worst on a slow connection, which is exactly when people tap
   * again.
   *
   * A React-level fix would have to be repeated correctly in every caller
   * (property details, the expiry card, anything added later). Collapsing
   * identical concurrent writes here protects all of them at once, including
   * ones not written yet.
   *
   * Keyed on the full parameter set, so raising a bid or bidding on a
   * different property is never blocked — only a literal repeat is.
   */
  private static writeInFlight = new Map<string, Promise<any>>();

  /**
   * Briefly remembers writes that just completed.
   *
   * The in-flight map alone does not cover a second tap that arrives after the
   * first transaction resolved but before the UI has caught up — a real window
   * on a slow render. Short enough that a deliberate repeat is only delayed,
   * long enough to absorb a double-tap.
   */
  private static recentWrites = new Map<string, number>();
  private static readonly DUPLICATE_WRITE_WINDOW_MS = 15_000;

  /**
   * Runs `operation` unless an identical one is already in flight or just
   * finished, in which case the existing result is shared.
   */
  private static async dedupeWrite<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const existing = NearContractService.writeInFlight.get(key);
    if (existing) {
      console.warn(`NearContract: duplicate write suppressed (in flight): ${key}`);
      return existing as Promise<T>;
    }

    const finishedAt = NearContractService.recentWrites.get(key);
    if (
      finishedAt &&
      Date.now() - finishedAt < NearContractService.DUPLICATE_WRITE_WINDOW_MS
    ) {
      // Refusing loudly rather than silently pretending to succeed: the user
      // asked for something that already happened, and telling them is more
      // honest than a second confirmation for one transaction.
      throw new Error(
        "That request was already submitted a moment ago. Check your activity before trying again."
      );
    }

    const run = operation();
    NearContractService.writeInFlight.set(key, run);
    try {
      const result = await run;
      NearContractService.recentWrites.set(key, Date.now());
      return result;
    } finally {
      NearContractService.writeInFlight.delete(key);
    }
  }

  /** Test seam — forget in-flight and recent writes. */
  static resetWriteDedupe(): void {
    NearContractService.writeInFlight.clear();
    NearContractService.recentWrites.clear();
  }

  /** Test seam — forget what we learned about this contract's bid reads. */
  static resetBidReadStrategy(): void {
    NearContractService.wholeMapBidReadsBroken = false;
  }

  constructor() {
    this.keyStore = new InMemoryKeyStore();
  }

  // ============================================================================
  // Initialization & Configuration — RPC failover
  // ============================================================================

  /**
   * Initialize the RPC provider with failover support, trying each configured
   * endpoint in order until one responds. Mirrors nearWalletService so both
   * services share the same resilience against a single congested/rate-limited
   * public RPC (this is what was silently killing accept-bid / book-appointment /
   * release-document calls whenever the sole hardcoded fastnear.com endpoint hiccuped).
   */
  /**
   * Ensure an RPC provider exists, probing endpoints only when one doesn't.
   *
   * Nearly every read in this service is preceded by an `initialize()` call
   * from its caller. This used to tear the provider down and re-run a
   * `status()` health-check POST every single time, which meant:
   *   - every logical read cost two requests instead of one, and
   *   - the probe always restarted at endpoint[0], so a rotation away from a
   *     rate-limited endpoint was immediately undone by the next caller.
   * With a fan-out like useTransactions' (bids + properties + per-property
   * bids) that turned a dozen reads into dozens of requests aimed squarely at
   * the endpoint that had just returned 429 — which is how a single throttle
   * escalated into a sustained storm of "blocked by CORS policy" failures.
   *
   * Returning early when the provider is already good is the single biggest
   * reduction in RPC traffic here. Call it as often as you like.
   */
  async initialize(network: NetworkType = "testnet"): Promise<void> {
    if (this.provider && this.currentNetwork === network) return;

    // Concurrent callers share one probe rather than each starting their own —
    // screens routinely kick off several reads in parallel on mount.
    if (this.initPromise && this.currentNetwork === network) {
      return this.initPromise;
    }

    this.currentNetwork = network;
    this.initPromise = this.probeEndpoints(network).finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async probeEndpoints(network: NetworkType): Promise<void> {
    const endpoints = getRpcEndpoints(network);
    // Begin at a healthy endpoint instead of always at index 0.
    const start = pickEndpointIndex(network, this.currentRpcIndex);

    for (let offset = 0; offset < endpoints.length; offset++) {
      const i = (start + offset) % endpoints.length;
      try {
        const endpoint = endpoints[i];
        const provider = new JsonRpcProvider({ url: endpoint.url });

        await Promise.race([
          provider.status(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC connection timeout")), 15000)
          ),
        ]);

        this.provider = provider;
        this.currentRpcIndex = i;
        markEndpointHealthy(network, i);
        console.log(`NearContract: Initialized on ${network} via ${endpoint.label}`);
        return;
      } catch (error: any) {
        const message = error?.message || String(error);
        markEndpointUnhealthy(
          network,
          i,
          isRateLimitError(message) ? "rate-limited" : "failed"
        );
        console.warn(
          `NearContract: Failed to connect to ${endpoints[i].label}:`,
          message
        );
        this.provider = null;
      }
    }

    throw new Error(
      "ERR_RPC_TIMEOUT: Unable to connect to any NEAR RPC endpoint. Please check your internet connection and try again."
    );
  }

  private getContractId(): string {
    return CONTRACT_ID;
  }

  private getProvider(): JsonRpcProvider {
    if (!this.provider) {
      const endpoints = getRpcEndpoints(this.currentNetwork);
      this.provider = new JsonRpcProvider({ url: endpoints[0].url });
      this.currentRpcIndex = 0;
      console.log(`NearContract: Auto-initialized provider on ${this.currentNetwork}`);
    }
    return this.provider;
  }

  /**
   * Execute an async RPC operation with retry + endpoint failover.
   *
   * IMPORTANT: `operation` must call `this.getProvider()` / `this.getAccount()`
   * itself on every invocation rather than closing over a provider/account
   * captured before the call — otherwise a retry after a rotation still hits
   * the same dead endpoint, because a `JsonRpcProvider`/`Account` instance
   * doesn't follow `this.provider` once it's been swapped out from under it.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "operation",
    kind: OperationKind = "read"
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        // near-js puts the kind of failure on `type` ("MethodNotFound") and a
        // sentence in `message` ("Contract method is not found"), so match
        // both; checking the message alone missed this and retried a call
        // that can never succeed four times, with growing waits.
        const errorMsg = `${error?.type ?? ""} ${error?.message || String(error)}`.toLowerCase();

        // Don't retry non-transient errors — these are genuine outcomes, not RPC flakiness
        if (
          errorMsg.includes("method is not found") ||
          errorMsg.includes("smart contract panicked") ||
          errorMsg.includes("prohibitedinview") ||
          errorMsg.includes("accountdoesnotexist") ||
          errorMsg.includes("methodnotfound") ||
          errorMsg.includes("notenoughbalance") ||
          errorMsg.includes("lackbalanceforstate") ||
          errorMsg.includes("accesskeynotfound") ||
          errorMsg.includes("invalidnonce") ||
          errorMsg.includes("notenoughallowance")
        ) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.maxRetries) {
          const isNetworkError =
            errorMsg.includes("timeout") ||
            errorMsg.includes("timed out") ||
            errorMsg.includes("econnrefused") ||
            errorMsg.includes("econnreset") ||
            errorMsg.includes("enotfound") ||
            errorMsg.includes("enetunreach") ||
            errorMsg.includes("epipe") ||
            errorMsg.includes("fetch failed") ||
            errorMsg.includes("network request failed") ||
            errorMsg.includes("network error") ||
            errorMsg.includes("network") ||
            errorMsg.includes("failed to fetch") ||
            errorMsg.includes("load failed") ||
            errorMsg.includes("cors") ||
            errorMsg.includes("aborted") ||
            errorMsg.includes("socket hang up") ||
            errorMsg.includes("502") ||
            errorMsg.includes("503") ||
            errorMsg.includes("504") ||
            errorMsg.includes("429") ||
            errorMsg.includes("too many requests") ||
            errorMsg.includes("rate limit") ||
            errorMsg.includes("bad gateway") ||
            errorMsg.includes("service unavailable") ||
            errorMsg.includes("rpc connection timeout");

          if (isNetworkError) {
            // Rest the endpoint that just failed before moving on, so this
            // retry — and every other caller — stops aiming at it. Retrying
            // straight back into a throttled endpoint is what turned a single
            // 429 into a self-sustaining storm.
            markEndpointUnhealthy(
              this.currentNetwork,
              this.currentRpcIndex,
              isRateLimitError(errorMsg) ? "rate-limited" : "failed"
            );

            const endpoints = getRpcEndpoints(this.currentNetwork);
            this.currentRpcIndex = pickEndpointIndex(
              this.currentNetwork,
              this.currentRpcIndex + 1
            );
            try {
              this.provider = new JsonRpcProvider({ url: endpoints[this.currentRpcIndex].url });
              console.warn(
                `NearContract: Switching to ${endpoints[this.currentRpcIndex].label} after network error`
              );
            } catch {
              // Next attempt will surface the failure again
            }
          }

          // A signed transaction stops here. See OperationKind: a network
          // error tells us the *response* was lost, never that the
          // transaction wasn't executed, and account.functionCall() signs a
          // fresh nonce per attempt — so retrying submits a second real
          // transaction rather than re-sending the first. The endpoint has
          // been rested and rotated just above, so the caller's next attempt
          // starts on a healthy endpoint.
          //
          // Bailing before the backoff sleep, not after: this call is never
          // going to be retried, so waiting on it only makes the user stare at
          // a spinner for an extra second before being told what happened.
          if (kind === "write" && isNetworkError) {
            throw new Error(AMBIGUOUS_WRITE_ERROR);
          }

          const delay = getRetryDelay(attempt);
          console.warn(
            `NearContract: ${operationName} failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${Math.round(delay)}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after retries`);
  }

  /**
   * Get NEAR Account instance for contract interactions.
   * Cheap (just key derivation + object construction, no network call), so it's
   * safe — and required — to call this fresh on every retry attempt rather than
   * reusing one instance, otherwise it keeps pointing at whatever provider was
   * current at the moment it was first built.
   */
  private async getAccount(
    accountId: string,
    privateKey: string
  ): Promise<Account> {
    const keyPair = KeyPair.fromString(privateKey as any);
    const signer = new KeyPairSigner(keyPair);
    return new Account(accountId, this.getProvider(), signer);
  }

  // ============================================================================
  // Property Management — mint_property
  // ============================================================================

  /**
   * List a property on-chain via mint_property
   * On-chain: mint_property(title, description, media_uri, price: U128, is_for_sale, lease_duration_days: Option<u64>)
   */
  async placeProperty(
    accountId: string,
    privateKey: string,
    params: PlacePropertyParams
  ): Promise<ContractCallResult<number>> {
    try {
      console.log("NearContract: Minting property...", params);
      const contractId = this.getContractId();

      // Exact args matching on-chain mint_property signature
      const argsObject: any = {
        title: params.title,
        description: params.description,
        media_uri: params.media_uri,
        price: String(params.price),  // U128 - always required
        is_for_sale: params.is_for_sale,
        lease_duration_days: params.lease_duration_days ?? null,
        // Required by the contract even when unset — near_sdk does not default
        // a missing Option, so omitting it fails to deserialize.
        damage_deposit_required: params.damage_deposit_required ?? null,
      };

      console.log("NearContract: mint_property args:", JSON.stringify(argsObject));

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "mint_property",
          args: argsObject,
          gas: BigInt(GAS.MINT_PROPERTY),
          attachedDeposit: BigInt(DEPOSITS.PLACE_PROPERTY),
        });
      }, "mint_property", "write");

      const outcomeValue =
        typeof result.status === "object" && "SuccessValue" in result.status
          ? result.status.SuccessValue
          : "";
      const propertyId = JSON.parse(
        Buffer.from(outcomeValue as string, "base64").toString()
      );

      console.log("NearContract: Property minted successfully:", propertyId);
      return {
        success: true,
        data: propertyId,
        transactionHash: result.transaction.hash,
      };
    } catch (error: any) {
      console.error("NearContract: Failed to mint property:", error);
      return {
        success: false,
        error: error.message || "Failed to mint property",
      };
    }
  }

  /**
   * @deprecated Use placeProperty instead. Kept for backward compatibility.
   * Maps old mint_property call to new placeProperty.
   */
  async mintProperty(
    accountId: string,
    privateKey: string,
    params: MintPropertyParams
  ): Promise<ContractCallResult<number>> {
    // Map old params to new format — 1:1 since the contract uses the same fields
    return this.placeProperty(accountId, privateKey, {
      title: params.title,
      description: params.description,
      media_uri: params.media_uri,
      is_for_sale: params.is_for_sale,
      price: params.price,
      lease_duration_days: params.lease_duration_days ?? null,
      damage_deposit_required: params.damage_deposit_required ?? null,
    });
  }

  // ============================================================================
  // Payment & Bidding — NEW: ft_approve + place_bid (was ft_transfer_call)
  // ============================================================================

  /**
   * STEP 1: Approve stablecoin spending by the Sheda contract.
   * This calls ft_approve (or ft_transfer_call with 0 amount for approval)
   * on the TOKEN contract, not on shedasolution.
   *
   * NOTE: NEAR NEP-141 doesn't have ft_approve natively. The contract uses
   * ft_transfer_call internally. We implement the two-step flow as described
   * in the integration guide.
   */
  async approveFunds(
    accountId: string,
    privateKey: string,
    tokenContractId: string,
    amount: string
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Approving funds...", { tokenContractId, amount });

      // Sender/receiver registration are independent reads — check both at once.
      const contractId = this.getContractId();
      const [isRegistered, isReceiverRegistered] = await Promise.all([
        this.isRegisteredWithToken(tokenContractId, accountId),
        this.isRegisteredWithToken(tokenContractId, contractId),
      ]);

      if (!isRegistered) {
        console.log("NearContract: Registering sender with token contract...");
        const regResult = await this.registerWithToken(accountId, privateKey, tokenContractId);
        if (!regResult.success) {
          return { success: false, error: `Registration failed: ${regResult.error}` };
        }
      }

      if (!isReceiverRegistered) {
        console.log("NearContract: Registering Sheda contract with token...");
        await this.withRetry(async () => {
          const account = await this.getAccount(accountId, privateKey);
          return account.functionCall({
            contractId: tokenContractId,
            methodName: "storage_deposit",
            args: { account_id: contractId },
            gas: BigInt(GAS.STORAGE_DEPOSIT),
            attachedDeposit: BigInt(DEPOSITS.STORAGE_MINIMUM),
          });
        }, "storage_deposit", "write");
      }

      console.log("NearContract: Funds approval setup complete");
      return { success: true };
    } catch (error: any) {
      console.error("NearContract: Failed to approve funds:", error);
      return { success: false, error: error.message || "Failed to approve funds" };
    }
  }

  /**
   * STEP 2: Place a bid on a property.
   *
   * CRITICAL: The contract uses ft_transfer_call internally to pull funds.
   * The buyer calls ft_transfer_call on the token contract with a JSON msg
   * containing the bid details. The Sheda contract's ft_on_transfer handler
   * processes the bid.
   *
   * This is the actual payment+bid in one step from the user's perspective.
   */
  async placeBid(
    accountId: string,
    privateKey: string,
    tokenContractId: string,
    propertyId: number,
    amount: string,
    action: Action
  ): Promise<ContractCallResult<number>> {
    // Identical concurrent/immediate repeats collapse to one on-chain transfer.
    // See dedupeWrite: the UI's React-state guard cannot catch a second tap in
    // the same tick, and this call moves real funds.
    return NearContractService.dedupeWrite(
      `placeBid:${accountId}:${propertyId}:${tokenContractId}:${amount}:${action}`,
      () => this.placeBidUnguarded(accountId, privateKey, tokenContractId, propertyId, amount, action)
    );
  }

  private async placeBidUnguarded(
    accountId: string,
    privateKey: string,
    tokenContractId: string,
    propertyId: number,
    amount: string,
    action: Action
  ): Promise<ContractCallResult<number>> {
    try {
      console.log("NearContract: Placing bid...", {
        tokenContractId, propertyId, amount, action,
      });

      // Sender/receiver registration are independent reads — check both at once.
      const shedaContractId = this.getContractId();
      const [isRegistered, isReceiverRegistered] = await Promise.all([
        this.isRegisteredWithToken(tokenContractId, accountId),
        this.isRegisteredWithToken(tokenContractId, shedaContractId),
      ]);

      if (!isRegistered) {
        console.log("NearContract: Account not registered with token, registering...");
        const registerResult = await this.registerWithToken(accountId, privateKey, tokenContractId);
        if (!registerResult.success) {
          return { success: false, error: `Registration failed: ${registerResult.error}` };
        }
      }

      if (!isReceiverRegistered) {
        console.log("NearContract: Registering Sheda contract with token...");
        await this.withRetry(async () => {
          const account = await this.getAccount(accountId, privateKey);
          return account.functionCall({
            contractId: tokenContractId,
            methodName: "storage_deposit",
            args: { account_id: shedaContractId },
            gas: BigInt(GAS.STORAGE_DEPOSIT),
            attachedDeposit: BigInt(DEPOSITS.STORAGE_MINIMUM),
          });
        }, "storage_deposit", "write");
      }

      // Build ft_transfer_call message for the contract's ft_on_transfer
      const msg: BidMessage = {
        property_id: propertyId,
        action: action,
        stablecoin_token: tokenContractId,
      };

      console.log("NearContract: ft_transfer_call msg:", JSON.stringify(msg));

      // Call ft_transfer_call on the token contract
      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId: tokenContractId,
          methodName: "ft_transfer_call",
          args: {
            receiver_id: shedaContractId,
            amount: amount,
            msg: JSON.stringify(msg),
          },
          gas: BigInt(GAS.FT_TRANSFER_CALL),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "ft_transfer_call", "write");

      // Check ft_resolve_transfer return value
      const outcomeValue =
        typeof result.status === "object" && "SuccessValue" in result.status
          ? result.status.SuccessValue
          : "";

      if (outcomeValue) {
        try {
          const usedAmount = JSON.parse(
            Buffer.from(outcomeValue as string, "base64").toString()
          );
          console.log("NearContract: ft_resolve_transfer amount used:", usedAmount);
          if (usedAmount === "0" || usedAmount === 0) {
            return {
              success: false,
              error: "Bid was rejected by the contract. The full amount was refunded.",
            };
          }
        } catch {
          // Could not parse return value, proceed
        }
      }

      console.log("NearContract: Bid placed successfully, tx:", result.transaction.hash);

      // Find the new bid's id. Views read final state, a few blocks behind the
      // transaction that just finished, so a single lookup usually missed the
      // new bid; the caller then skipped the seller's notification and the
      // inbox card went out without a bid id. The BidPlaced event in this
      // transaction's own logs gives the bid's created_at, which identifies
      // it exactly; the lookup is retried until the bid is visible.
      let createdAt: number | undefined;
      try {
        for (const receipt of (result as any).receipts_outcome ?? []) {
          for (const line of receipt?.outcome?.logs ?? []) {
            if (typeof line !== "string" || !line.startsWith("EVENT_JSON:")) continue;
            const event = JSON.parse(line.slice("EVENT_JSON:".length));
            if (event?.event_type === "BidPlaced" && event?.data?.bidder_id === accountId) {
              createdAt = Number(event.data.created_at);
            }
          }
        }
      } catch {
        // No usable event: fall back to the newest bid by this account.
      }
      let bidId: number | undefined;
      for (let attempt = 0; attempt < 8 && bidId === undefined; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        try {
          const bidsResult = await this.getBidsForProperty(propertyId);
          if (!bidsResult.success || !bidsResult.data) continue;
          const mine = bidsResult.data.filter((b: any) => (b.bidder_id || b.bidder) === accountId);
          const match =
            createdAt !== undefined
              ? mine.find((b: any) => Number(b.created_at) === createdAt)
              : mine.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0))[0];
          bidId = match?.id;
        } catch {
          // Try again.
        }
      }
      if (bidId === undefined) console.warn("NearContract: Could not find the new bid's id");
      else console.log("NearContract: Found bid ID:", bidId);

      return {
        success: true,
        data: bidId,
        transactionHash: result.transaction.hash,
      };
    } catch (error: any) {
      console.error("NearContract: Failed to place bid:", error);
      return { success: false, error: error.message || "Failed to place bid" };
    }
  }

  /**
   * Commit payment for a property (convenience wrapper over placeBid)
   * Used by the existing UI flows — routes through the same ft_transfer_call mechanism.
   */
  async commitPayment(
    accountId: string,
    privateKey: string,
    tokenContractId: string,
    propertyId: number,
    amount: string,
    action: Action
  ): Promise<ContractCallResult<void>> {
    const result = await this.placeBid(
      accountId, privateKey, tokenContractId, propertyId, amount, action
    );
    return {
      success: result.success,
      error: result.error,
      transactionHash: result.transactionHash,
    };
  }

  // ============================================================================
  // Bid Lifecycle — Accept, Reject, Cancel
  // ============================================================================

  /**
   * PATH 1: Seller accepts bid — immediate payment release after docs confirmed
   */
  async acceptBid(
    accountId: string,
    privateKey: string,
    params: AcceptBidParams
  ): Promise<ContractCallResult<void>> {
    // One-shot state transition — see dedupeWrite.
    return NearContractService.dedupeWrite(
      `acceptBid:${accountId}:${params.property_id}:${params.bid_id}`,
      () => this.acceptBidUnguarded(accountId, privateKey, params)
    );
  }

  private async acceptBidUnguarded(
    accountId: string,
    privateKey: string,
    params: AcceptBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Accepting bid (PATH 1)...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "accept_bid",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.ACCEPT_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "accept_bid", "write");

      console.log("NearContract: Bid accepted (PATH 1) successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to accept bid:", error);
      return { success: false, error: error.message || "Failed to accept bid" };
    }
  }

  /**
   * PATH 3: Seller accepts bid — 24-hour escrow hold before payment can release
   */
  async acceptBidWithEscrow(
    accountId: string,
    privateKey: string,
    params: AcceptBidParams
  ): Promise<ContractCallResult<void>> {
    // One-shot state transition — see dedupeWrite.
    return NearContractService.dedupeWrite(
      `acceptBidWithEscrow:${accountId}:${params.property_id}:${params.bid_id}`,
      () => this.acceptBidWithEscrowUnguarded(accountId, privateKey, params)
    );
  }

  private async acceptBidWithEscrowUnguarded(
    accountId: string,
    privateKey: string,
    params: AcceptBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Accepting bid with escrow (PATH 3)...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "accept_bid_with_escrow",  // ← CORRECT method name for PATH 3
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.ACCEPT_BID_WITH_ESCROW),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "accept_bid_with_escrow", "write");

      console.log("NearContract: Bid accepted with escrow (PATH 3) successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to accept bid with escrow:", error);
      return { success: false, error: error.message || "Failed to accept bid with escrow" };
    }
  }

  /**
   * Owner accepts a renewal bid from the property's current tenant.
   * Releases payment immediately (no 24h escrow timelock, no NFT transfer —
   * the tenant already holds it) and extends the existing lease/mints its
   * own new document. Contract-side this is a completely separate
   * entrypoint from accept_bid/accept_bid_with_escrow, which both refuse
   * to touch any bid while the property has an active lease.
   */
  async acceptLeaseRenewal(
    accountId: string,
    privateKey: string,
    params: AcceptBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Accepting lease renewal...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "accept_lease_renewal",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.ACCEPT_LEASE_RENEWAL),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "accept_lease_renewal", "write");

      console.log("NearContract: Lease renewal accepted successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to accept lease renewal:", error);
      return { success: false, error: error.message || "Failed to accept lease renewal" };
    }
  }

  /**
   * Seller rejects a bid
   */
  async rejectBid(
    accountId: string,
    privateKey: string,
    params: RejectBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Rejecting bid...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "reject_bid",
          args: { bid_id: params.bid_id, property_id: params.property_id },
          gas: BigInt(GAS.REJECT_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "reject_bid", "write");

      console.log("NearContract: Bid rejected successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to reject bid:", error);
      return { success: false, error: error.message || "Failed to reject bid" };
    }
  }

  /**
   * Bidder cancels own bid / claims refund after rejection
   */
  async cancelBid(
    accountId: string,
    privateKey: string,
    params: CancelBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Canceling bid...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "cancel_bid",
          args: { bid_id: params.bid_id, property_id: params.property_id },
          gas: BigInt(GAS.CANCEL_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "cancel_bid", "write");

      console.log("NearContract: Bid canceled successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to cancel bid:", error);
      return { success: false, error: error.message || "Failed to cancel bid" };
    }
  }

  /**
   * Walk away from a deal the seller accepted but hasn't sent an agreement for.
   *
   * `cancelBid` only covers a bid the seller hasn't acted on. This is the
   * stage where appointments happen, and there is deliberately no deadline on
   * it — viewings fall through for reasons the chain can't see, and none of
   * them should cost the buyer their escrow.
   */
  async buyerCancelAcceptedBid(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number }
  ): Promise<ContractCallResult<void>> {
    return this.buyerStagedCancel(
      accountId,
      privateKey,
      params,
      "buyer_cancel_accepted_bid",
      "cancel this deal"
    );
  }

  /**
   * Reject the agreement the seller sent, and cancel the deal.
   *
   * Burns the agreement NFT on chain — a buyer who walks away must not keep
   * the terms the seller handed over. Only available before the buyer confirms
   * the agreement; confirming is the commitment and there is no exit past it.
   */
  async buyerRejectDocumentsAndCancel(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number }
  ): Promise<ContractCallResult<void>> {
    return this.buyerStagedCancel(
      accountId,
      privateKey,
      params,
      "buyer_reject_documents_and_cancel",
      "reject the agreement"
    );
  }

  private async buyerStagedCancel(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number },
    methodName: string,
    label: string
  ): Promise<ContractCallResult<void>> {
    try {
      console.log(`NearContract: ${methodName}...`, params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName,
          args: { bid_id: params.bid_id, property_id: params.property_id },
          gas: BigInt(GAS.BUYER_CANCEL_STAGED),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, methodName, "write");

      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error(`NearContract: Failed to ${label}:`, error);
      // The contract's panics carry the useful part — which stage the bid is
      // actually at, or how long ago the window closed — so surface them
      // rather than replacing them with a generic message.
      return { success: false, error: error.message || `Failed to ${label}` };
    }
  }

  /**
   * Claim a lost bid (refund tokens for a rejected/outbid bid)
   */
  async claimLostBid(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number }
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Claiming lost bid...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "claim_lost_bid",
          args: { bid_id: params.bid_id, property_id: params.property_id },
          gas: BigInt(GAS.CLAIM_LOST_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "claim_lost_bid", "write");

      console.log("NearContract: Lost bid claimed successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to claim lost bid:", error);
      return { success: false, error: error.message || "Failed to claim lost bid" };
    }
  }

  /**
   * Seller: submit document URI and description on-chain
   * On-chain: confirm_document_release(bid_id, property_id, document_image_uri, document_description)
   */
  async confirmDocumentRelease(
    accountId: string,
    privateKey: string,
    params: ConfirmDocumentReleaseParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Confirming document release...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "confirm_document_release",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
            document_image_uri: params.document_image_uri,
            document_description: params.document_description,
          },
          gas: BigInt(GAS.CONFIRM_DOCUMENT_RELEASE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "confirm_document_release", "write");

      console.log("NearContract: Document release confirmed");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to confirm document release:", error);
      return { success: false, error: error.message || "Failed to confirm document release" };
    }
  }

  /**
   * Buyer: confirm receipt of document NFT
   */
  async confirmDocumentReceipt(
    accountId: string,
    privateKey: string,
    params: ConfirmDocumentReceiptParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Confirming document receipt...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "confirm_document_receipt",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.CONFIRM_DOCUMENT_RECEIPT),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "confirm_document_receipt", "write");

      console.log("NearContract: Document receipt confirmed");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to confirm document receipt:", error);
      return { success: false, error: error.message || "Failed to confirm document receipt" };
    }
  }

  // ============================================================================
  // Payment & Completion — renamed methods
  // ============================================================================

  /**
   * Release escrow payment to seller
   * On-chain method: release_escrow (verified at shedasolution.testnet)
   * PATH 1: releases immediately after DocsConfirmed
   * PATH 3: requires 24h hold to pass first
   */
  async releasePayment(
    accountId: string,
    privateKey: string,
    params: ReleasePaymentParams
  ): Promise<ContractCallResult<void>> {
    // One-shot state transition — see dedupeWrite.
    return NearContractService.dedupeWrite(
      `releasePayment:${accountId}:${params.property_id}:${params.bid_id}`,
      () => this.releasePaymentUnguarded(accountId, privateKey, params)
    );
  }

  private async releasePaymentUnguarded(
    accountId: string,
    privateKey: string,
    params: ReleasePaymentParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Releasing escrow...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "release_escrow",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.RELEASE_PAYMENT),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "release_escrow", "write");

      console.log("NearContract: Escrow released successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to release escrow:", error);
      return { success: false, error: error.message || "Failed to release escrow" };
    }
  }

  /**
   * @deprecated Use releasePayment instead
   */
  async releaseEscrow(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number }
  ): Promise<ContractCallResult<void>> {
    return this.releasePayment(accountId, privateKey, params);
  }

  /**
   * Finalize the transaction
   * Was: complete_transaction → Now: complete_bid
   */
  async completeBid(
    accountId: string,
    privateKey: string,
    params: CompleteBidParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Completing bid...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "complete_transaction",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
          },
          gas: BigInt(GAS.COMPLETE_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "complete_transaction", "write");

      console.log("NearContract: Bid completed successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to complete bid:", error);
      return { success: false, error: error.message || "Failed to complete bid" };
    }
  }

  /**
   * @deprecated Use completeBid instead
   */
  async completeTransaction(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number }
  ): Promise<ContractCallResult<void>> {
    return this.completeBid(accountId, privateKey, params);
  }

  // ============================================================================
  // Lease & Dispute Methods
  // ============================================================================

  /**
   * Complete a lease after expiry
   */
  async completeLease(
    accountId: string,
    privateKey: string,
    params: CompleteLeaseParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Completing lease...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "expire_lease",
          args: {
            lease_id: params.lease_id,
          },
          gas: BigInt(GAS.COMPLETE_LEASE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "expire_lease", "write");

      console.log("NearContract: Lease completed successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to complete lease:", error);
      return { success: false, error: error.message || "Failed to complete lease" };
    }
  }

  /**
   * Raise a dispute on a lease
   */
  async raiseDispute(
    accountId: string,
    privateKey: string,
    params: RaiseDisputeParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Raising dispute...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "raise_dispute",
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
            reason: params.reason,
          },
          gas: BigInt(GAS.RAISE_DISPUTE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "raise_dispute", "write");

      console.log("NearContract: Dispute raised successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to raise dispute:", error);
      return { success: false, error: error.message || "Failed to raise dispute" };
    }
  }

  /**
   * Owner claims against a tenant's security deposit after the lease ends.
   *
   * `amount` is what they are asking for, not what they get: an admin settles
   * it, and whatever is not awarded goes back to the tenant. Only valid in the
   * window between the lease ending and `damage_claim_deadline`.
   */
  async raiseDamageClaim(
    accountId: string,
    privateKey: string,
    params: { lease_id: number; amount: string; reason: string }
  ): Promise<ContractCallResult<void>> {
    try {
      const contractId = this.getContractId();
      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "raise_damage_claim",
          args: {
            lease_id: params.lease_id,
            amount: params.amount,
            reason: params.reason,
          },
          gas: BigInt(GAS.RAISE_DISPUTE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "raise_damage_claim", "write");

      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to raise damage claim:", error);
      return { success: false, error: error.message || "Failed to raise damage claim" };
    }
  }

  /**
   * Tenant takes their security deposit back once the owner's claim window has
   * closed without a claim.
   *
   * The contract lets anyone call this because the money can only go to the
   * tenant — so a tenant who has lost access to their wallet is not the only
   * one who can unstick their own funds.
   */
  async refundDamageDeposit(
    accountId: string,
    privateKey: string,
    params: { lease_id: number }
  ): Promise<ContractCallResult<void>> {
    try {
      const contractId = this.getContractId();
      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "refund_damage_deposit",
          args: { lease_id: params.lease_id },
          gas: BigInt(GAS.CLAIM_LOST_BID),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "refund_damage_deposit", "write");

      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to refund damage deposit:", error);
      return { success: false, error: error.message || "Failed to refund damage deposit" };
    }
  }

  /**
   * Resolve a dispute manually (owner)
   */
  async resolveDispute(
    accountId: string,
    privateKey: string,
    params: ResolveDisputeParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Resolving dispute...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "resolve_dispute",
          args: {
            lease_id: params.lease_id,
            winner: params.winner,
            payout_amount: params.payout_amount,
            resolution_notes: params.resolution_notes,
          },
          gas: BigInt(GAS.RESOLVE_DISPUTE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "resolve_dispute", "write");

      console.log("NearContract: Dispute resolved successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to resolve dispute:", error);
      return { success: false, error: error.message || "Failed to resolve dispute" };
    }
  }


  // ============================================================================
  // Property Management — Delete, Delist, Transfer
  // ============================================================================

  async deleteProperty(
    accountId: string,
    privateKey: string,
    propertyId: number
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Deleting property...", propertyId);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "delete_property",
          args: { property_id: propertyId },
          gas: BigInt(GAS.DELETE_PROPERTY),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "delete_property", "write");

      console.log("NearContract: Property deleted successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to delete property:", error);
      return { success: false, error: error.message || "Failed to delete property" };
    }
  }

  async delistProperty(
    accountId: string,
    privateKey: string,
    propertyId: number
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Delisting property...", propertyId);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "delist_property",
          args: { property_id: propertyId },
          gas: BigInt(GAS.DELIST_PROPERTY),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "delist_property", "write");

      console.log("NearContract: Property delisted successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to delist property:", error);
      return { success: false, error: error.message || "Failed to delist property" };
    }
  }

  /**
   * List an already-owned property, or edit an existing listing's terms.
   *
   * This is the resale path: the caller already holds the property NFT, so
   * there is nothing to mint — mintProperty would create a *second* token for
   * a property that already exists on-chain. Use this whenever the user is
   * listing something already in their wallet.
   *
   * Owner-only on-chain, and rejected while the property has an active lease.
   * Pass isForSale: false to take a listing down while keeping updated terms.
   */
  async updateListing(
    accountId: string,
    privateKey: string,
    params: {
      property_id: number;
      /** Atomic stablecoin units, same convention as mintProperty's price. */
      price: string;
      is_for_sale: boolean;
      lease_duration_days?: number | null;
      damage_deposit_required?: string | null;
    }
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Updating listing...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "update_listing",
          args: {
            property_id: params.property_id,
            price: params.price,
            is_for_sale: params.is_for_sale,
            lease_duration_days: params.lease_duration_days ?? null,
            damage_deposit_required: params.damage_deposit_required ?? null,
          },
          gas: BigInt(GAS.UPDATE_LISTING),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "update_listing", "write");

      console.log("NearContract: Listing updated successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to update listing:", error);
      return { success: false, error: error.message || "Failed to update listing" };
    }
  }

  async transferProperty(
    accountId: string,
    privateKey: string,
    params: TransferPropertyParams
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Transferring property...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "nft_transfer",
          args: {
            receiver_id: params.receiver_id,
            token_id: params.token_id,
            approval_id: params.approval_id,
            memo: params.memo,
          },
          gas: BigInt(GAS.NFT_TRANSFER),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "nft_transfer", "write");

      console.log("NearContract: Property transferred successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to transfer property:", error);
      return { success: false, error: error.message || "Failed to transfer property" };
    }
  }

  // ============================================================================
  // Token Registration (NEP-145 Storage Management) — UNCHANGED
  // ============================================================================

  async isRegisteredWithToken(
    tokenContractId: string,
    accountId: string
  ): Promise<boolean> {
    try {
      const argsBase64 = Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64");
      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        finality: "final",
        account_id: tokenContractId,
        method_name: "storage_balance_of",
        args_base64: argsBase64,
      }), "storage_balance_of");

      const balance = JSON.parse(
        Buffer.from((result as any).result).toString()
      );

      return balance !== null && balance.total !== "0";
    } catch (error) {
      console.log("NearContract: Error checking token registration:", error);
      return false;
    }
  }

  async registerWithToken(
    accountId: string,
    privateKey: string,
    tokenContractId: string
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Registering account with token contract...", {
        accountId, tokenContractId,
      });

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId: tokenContractId,
          methodName: "storage_deposit",
          args: { account_id: accountId, registration_only: true },
          gas: BigInt(GAS.STORAGE_DEPOSIT),
          attachedDeposit: BigInt(DEPOSITS.STORAGE_MINIMUM),
        });
      }, "storage_deposit", "write");

      console.log("NearContract: Account registered with token contract");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to register with token:", error);
      return { success: false, error: error.message || "Failed to register with token contract" };
    }
  }

  async mintTestTokens(
    accountId: string,
    privateKey: string,
    tokenContractId: string,
    amount: string
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Minting test tokens...", { accountId, tokenContractId, amount });

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId: tokenContractId,
          methodName: "mint",
          args: { account_id: accountId, amount },
          gas: BigInt(GAS.MINT_TEST_TOKENS),
          attachedDeposit: BigInt(DEPOSITS.ZERO),
        });
      }, "mint", "write");

      console.log("NearContract: Test tokens minted successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to mint test tokens:", error);
      return { success: false, error: error.message || "Failed to mint test tokens" };
    }
  }

  // ============================================================================
  // View Methods — Updated method names for new ABI
  // ============================================================================

  /**
   * Run a read-only contract view, collapsing duplicate requests.
   *
   * Reads here arrive in bursts, not evenly: useTransactions fans out to
   * getBidsForProperty per owned property, the wallet tab resolves a property
   * per bid, and both screens poll the same data on their own timers while
   * staying mounted behind each other. Firing all of those at a shared,
   * rate-limited public RPC is what earns the 429s.
   *
   * Two things collapse that burst:
   *  - identical calls already in flight share one request rather than racing
   *    each other, and
   *  - a completed call is reusable for VIEW_CACHE_TTL_MS.
   *
   * The TTL is deliberately tiny. It exists to absorb a single mount/refresh
   * cascade, not to cache state: on-chain finality plus the UI's own refresh
   * take far longer than this, so no user action can observe a stale read
   * through it. Call clearViewCache() if you need a guaranteed-fresh read.
   */
  private async viewCall<T>(
    methodName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    return this.viewOn<T>(this.getContractId(), methodName, args);
  }

  /**
   * A view call against any contract, not just the marketplace.
   *
   * Collections puts each unit in its own vault account and keeps builder
   * stake in a registry, so reads reach contracts whose ids are not known
   * until runtime. This is the same body viewCall always had, with the
   * contract taken as an argument instead of fetched from config, so those
   * reads inherit the caching, the request coalescing and the endpoint
   * failover rather than growing a second, worse RPC path beside them.
   *
   * Public because the collections service lives outside this class. It
   * reads only: nothing here can sign.
   */
  async viewOn<T>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const argsJson = JSON.stringify(args);
    const cacheKey = `${this.currentNetwork}:${contractId}:${methodName}:${argsJson}`;

    const cached = NearContractService.viewCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value as T;
    }

    const inFlight = NearContractService.viewInFlight.get(cacheKey);
    if (inFlight) return inFlight as Promise<T>;

    const argsBase64 = Buffer.from(argsJson).toString("base64");
    const request = this.withRetry(
      () => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: methodName,
        args_base64: argsBase64,
        finality: "final",
      }),
      methodName
    )
      .then((result) => {
        const value = JSON.parse(Buffer.from((result as any).result).toString());
        NearContractService.viewCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + VIEW_CACHE_TTL_MS,
        });
        markEndpointHealthy(this.currentNetwork, this.currentRpcIndex);
        return value as T;
      })
      .finally(() => {
        NearContractService.viewInFlight.delete(cacheKey);
      });

    NearContractService.viewInFlight.set(cacheKey, request);
    return request;
  }

  /** Drop every cached view result — use after a write that must be re-read. */
  static clearViewCache(): void {
    NearContractService.viewCache.clear();
  }

  /**
   * A signed call against any contract, not just the marketplace.
   *
   * The counterpart to viewOn, and the same argument applies: Collections
   * signs against vault accounts and a stake registry whose ids are only
   * known at runtime, and a second signing path beside this one would be a
   * second place for the retry and duplicate-suppression rules to be got
   * wrong. Those rules are the reason this class exists rather than callers
   * holding an Account themselves.
   *
   * `dedupeKey` must identify the intent, not the attempt. Two taps on
   * Claim are one instruction; two claims against different vaults are two.
   */
  async callOn(
    accountId: string,
    privateKey: string,
    params: {
      contractId: string;
      methodName: string;
      args?: Record<string, unknown>;
      gas: bigint;
      attachedDeposit: bigint;
      dedupeKey?: string;
    }
  ): Promise<ContractCallResult<void>> {
    const { contractId, methodName, args = {}, gas, attachedDeposit } = params;
    const dedupeKey =
      params.dedupeKey ?? `${accountId}:${contractId}:${methodName}:${JSON.stringify(args)}`;

    try {
      const result = await NearContractService.dedupeWrite(dedupeKey, () =>
        this.withRetry(
          async () => {
            const account = await this.getAccount(accountId, privateKey);
            return account.functionCall({
              contractId,
              methodName,
              args,
              gas,
              attachedDeposit,
            });
          },
          methodName,
          "write"
        )
      );

      // A write makes every cached read of that contract potentially wrong,
      // and the collections screens re-read immediately after acting.
      NearContractService.clearViewCache();
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error(`NearContract: ${methodName} on ${contractId} failed:`, error);
      return {
        success: false,
        error: error?.message || `Failed to call ${methodName}`,
      };
    }
  }

  /**
   * Get all properties (paginated)
   */
  async getProperties(
    params: GetPropertiesParams
  ): Promise<ContractCallResult<PropertyView[]>> {
    try {
      const properties = await this.viewCall<PropertyView[]>("get_properties", params as any);
      return { success: true, data: properties };
    } catch (error: any) {
      console.error("NearContract: Failed to get properties:", error);
      return { success: false, error: error.message || "Failed to get properties" };
    }
  }

  /**
   * Get a single property by ID
   * Was: get_property_by_id → Now: get_property_view
   */
  async getPropertyById(
    propertyId: number
  ): Promise<ContractCallResult<PropertyView | null>> {
    try {
      const property = await this.viewCall<PropertyView | null>("get_property_by_id", {
        property_id: propertyId,
      });
      return { success: true, data: property };
    } catch (error: any) {
      console.error("NearContract: Failed to get property:", error);
      return { success: false, error: error.message || "Failed to get property" };
    }
  }

  /**
   * Get user's properties (by owner).
   *
   * This backs the wallet's Assets tab and the seller's listings, so a hard
   * failure here shows someone an empty portfolio for properties they still
   * own on-chain. `get_property_by_owner` is one contract-side fault away from
   * that — the same way `get_bids_by_bidder` hits ProhibitedInView — so when
   * it fails for a contract reason, fall back to paging `get_properties` and
   * filtering by owner client-side.
   *
   * The fallback is not attempted for transport failures: withRetry has
   * already exhausted retries and endpoint failover by then, and paging the
   * whole property list over a connection that just failed would be a lot of
   * requests aimed at an RPC that is likely rate-limiting us.
   */
  async getMyProperties(
    accountId: string
  ): Promise<ContractCallResult<PropertyView[]>> {
    try {
      const properties = await this.viewCall<PropertyView[]>("get_property_by_owner", {
        owner_id: accountId,
      });
      return { success: true, data: properties };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error("NearContract: Failed to get user properties:", error);

      if (isTransportError(errorMsg)) {
        return { success: false, error: errorMsg || "Failed to get user properties" };
      }

      console.warn(
        "NearContract: get_property_by_owner failed, falling back to " +
        "get_properties + client-side owner filter..."
      );
      try {
        const owned: PropertyView[] = [];
        let offset = 0;
        const pageSize = 50;

        // Bounded so a contract that ignores from_index can't loop forever.
        for (let page = 0; page < 20; page++) {
          const batch = await this.viewCall<PropertyView[]>("get_properties", {
            from_index: offset,
            limit: pageSize,
          });
          if (!batch || batch.length === 0) break;
          owned.push(...batch.filter((p) => p.owner_id === accountId));
          if (batch.length < pageSize) break;
          offset += pageSize;
        }

        return { success: true, data: owned };
      } catch (fallbackError: any) {
        console.error(
          "NearContract: get_properties fallback also failed:",
          fallbackError
        );
        return {
          success: false,
          error: NearContractService.parseContractError(errorMsg),
        };
      }
    }
  }

  /**
   * Get all bids for a property
   */
  async getBidsForProperty(
    propertyId: number
  ): Promise<ContractCallResult<BidView[]>> {
    try {
      const bids = await this.viewCall<BidView[]>("get_bids_for_property", {
        property_id: propertyId,
      });
      return { success: true, data: bids };
    } catch (error: any) {
      console.error("NearContract: Failed to get bids:", error);
      return { success: false, error: error.message || "Failed to get bids" };
    }
  }

  /**
   * Get a single bid by property_id + bid_id
   * New method: get_bid_view
   */
  async getBidView(
    propertyId: number,
    bidId: number
  ): Promise<ContractCallResult<Bid | null>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(
        JSON.stringify({ property_id: propertyId, bid_id: bidId })
      ).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "get_bids_for_property",
        args_base64: argsBase64,
        finality: "final",
      }), "get_bids_for_property");

      const bid = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: bid };
    } catch (error: any) {
      console.error("NearContract: Failed to get bid:", error);
      return { success: false, error: error.message || "Failed to get bid" };
    }
  }

  /**
   * Get bids for property with pagination
   */
  async getBidsForPropertyPaginated(
    params: GetBidsForPropertyPaginatedParams
  ): Promise<ContractCallResult<BidView[]>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(JSON.stringify(params)).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "get_bids_for_property_paginated",
        args_base64: argsBase64,
        finality: "final",
      }), "get_bids_for_property_paginated");

      const bids = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: bids };
    } catch (error: any) {
      console.error("NearContract: Failed to get bids:", error);
      return { success: false, error: error.message || "Failed to get bids" };
    }
  }

  /**
   * Get all bids by a specific bidder.
   *
   * The contract's `get_bids_by_bidder` currently has a bug where it calls
   * `storage_write` internally, causing a `ProhibitedInView` error.
   * We work around this by falling back to `get_all_bids` and filtering
   * client-side when the primary method fails.
   */
  async getBidsByBidder(
    params: GetBidsByBidderParams
  ): Promise<ContractCallResult<BidView[]>> {
    const contractId = this.getContractId();

    // Whole-map scans are a property of the deployed contract, not of this
    // call: once one has failed, every later call fails the same way. Skipping
    // them saves two doomed round trips on every fetch — and both the wallet
    // and the history tabs run this on mount and again on each poll, so it was
    // a steady drip of requests that could never succeed.
    if (NearContractService.wholeMapBidReadsBroken) {
      return this.scanBidsPerProperty(params, null);
    }

    // ── Strategy 1: Try the direct method ──
    try {
      const bids = await this.viewCall<BidView[]>("get_bids_by_bidder", params as any);
      return { success: true, data: bids };
    } catch (primaryError: any) {
      const errorMsg = primaryError?.message || String(primaryError);
      const isProhibitedInView =
        errorMsg.includes("ProhibitedInView") ||
        errorMsg.includes("storage_write");
      // A single undeserializable bid entry takes down every method that
      // scans the whole map — get_bids_by_bidder and get_all_bids both do
      // `self.bids.iter()`. That's not a transient RPC problem and it isn't
      // specific to this bidder: it fails identically for an account that has
      // never bid. Falling through to the per-property scan below is the only
      // way a buyer sees any of their bids while such an entry exists.
      const isUndeserializable =
        errorMsg.includes("Cannot deserialize") ||
        errorMsg.includes("deserialize element");

      if (!isProhibitedInView && !isUndeserializable) {
        // Some other error — don't fall back
        console.error("NearContract: Failed to get user bids:", primaryError);
        return {
          success: false,
          error: NearContractService.parseContractError(errorMsg),
        };
      }

      // ── Strategy 2: Fallback — fetch all bids and filter client-side ──
      console.warn(
        `NearContract: get_bids_by_bidder failed (${isUndeserializable ? "undeserializable entry" : "ProhibitedInView"
        }), falling back to get_all_bids + client-side filter...`
      );

      try {
        const allBids: BidView[] = [];
        let offset = 0;
        const pageSize = 50;

        // Paginate through all bids
        while (true) {
          const pageArgsBase64 = Buffer.from(
            JSON.stringify({ from_index: offset, limit: pageSize })
          ).toString("base64");

          const pageResult = await this.withRetry(() => this.getProvider().query({
            request_type: "call_function",
            account_id: contractId,
            method_name: "get_all_bids",
            args_base64: pageArgsBase64,
            finality: "final",
          }), "get_all_bids");

          const page: BidView[] = JSON.parse(
            Buffer.from((pageResult as any).result).toString()
          );

          if (!page || page.length === 0) break;
          allBids.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }

        // Filter to only this bidder's bids
        const filtered = allBids.filter(
          (b) =>
            b.bidder_id === params.bidder ||
            (b as any).bidder === params.bidder
        );

        // Apply pagination params (from_index / limit)
        const start = params.from_index || 0;
        const end = start + (params.limit || 100);
        const paginated = filtered.slice(start, end);

        return { success: true, data: paginated };
      } catch (fallbackError: any) {
        console.warn(
          "NearContract: get_all_bids fallback also failed, trying per-property scan:",
          fallbackError?.message || fallbackError
        );

        // Both whole-map strategies are out. That's a property of the
        // deployed contract, so don't pay for them again this session.
        NearContractService.wholeMapBidReadsBroken = true;

        return this.scanBidsPerProperty(params, fallbackError);
      }
    }
  }

  /**
   * Strategy 3 — read bids one property at a time.
   *
   * get_bids_for_property touches a single property's bids, so an entry the
   * contract can't deserialize only takes down that property instead of every
   * read. get_bids_by_bidder and get_all_bids both do `self.bids.iter()` and
   * die wholesale on one bad entry, which is why this exists at all.
   *
   * Costs one call per property, so it's deliberately last — but it's the
   * difference between a buyer seeing their bids and seeing nothing.
   * Properties that fail are skipped rather than aborting the scan.
   */
  private async scanBidsPerProperty(
    params: GetBidsByBidderParams,
    priorError: Error | null
  ): Promise<ContractCallResult<BidView[]>> {
    try {
      const counterResult = await this.getPropertyCounter();
      if (!counterResult.success || counterResult.data == null) {
        throw new Error("Could not determine how many properties exist");
      }

      const propertyIds = Array.from({ length: counterResult.data }, (_, i) => i);

      // Bounded concurrency. This used to fire one request per property
      // simultaneously, so a contract with fifty properties opened fifty
      // connections to a shared public RPC in one go — which earns an
      // immediate 429, and those refusals then surface to the user as "some
      // transactions couldn't be loaded". Slower per batch, far faster to
      // actually complete, because the requests stop being rejected.
      const settled = await mapWithConcurrency(
        propertyIds,
        PER_PROPERTY_SCAN_CONCURRENCY,
        (id) => this.getBidsForProperty(id)
      );

      const collected: BidView[] = [];
      let unreadable = 0;
      settled.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value.success && result.value.data) {
          collected.push(...result.value.data);
        } else {
          unreadable++;
        }
      });

      if (unreadable > 0) {
        console.warn(
          `NearContract: per-property scan skipped ${unreadable}/${propertyIds.length} propert${unreadable === 1 ? "y" : "ies"
          } whose bids can't be read`
        );
      }

      const mine = collected.filter(
        (b) =>
          b.bidder_id === params.bidder ||
          (b as any).bidder === params.bidder
      );
      const start = params.from_index || 0;
      const end = start + (params.limit || 100);

      return { success: true, data: mine.slice(start, end) };
    } catch (scanError: any) {
      console.error("NearContract: per-property scan failed too:", scanError);
      return {
        success: false,
        error: NearContractService.parseContractError(
          scanError?.message || priorError?.message || "Failed to get user bids"
        ),
      };
    }
  }

  // ============================================================================
  // Error Parsing — translates cryptic RPC errors into user-friendly messages
  // ============================================================================

  /**
   * Parse a contract/RPC error string into a user-friendly message.
   * This is used throughout the service and exposed for callers.
   */
  static parseContractError(raw: string): string {
    if (!raw) return "An unknown error occurred.";

    // Contract panics carry a readable message after "Smart contract panicked:",
    // but it arrives embedded in the RPC's JSON envelope, so the tail is
    // usually a run of quotes and closing braces. Those were being shown to
    // users verbatim — e.g. `Underflow in staged cancel refund"}}}}`.
    const panicMatch = raw.match(
      /Smart contract panicked:\s*(.+?)(?:\s*\{|\s*$)/i
    );
    if (panicMatch) {
      const panic = panicMatch[1].replace(/["'\}\]\s]+$/, "").trim();

      // An arithmetic underflow is the contract refusing an operation its own
      // books cannot support — not something the user did wrong and not
      // something retrying will fix. Cancelling a bid that has already been
      // accepted is the known trigger: the escrow has moved on from what the
      // cancel path expects to subtract.
      if (/underflow|overflow/i.test(panic)) {
        return (
          "This deal can't be cancelled from its current state — the contract's " +
          "escrow accounting won't allow it. Your funds are still held safely. " +
          "Please report this with the property name; it needs a contract-side fix."
        );
      }

      return panic;
    }

    // HostError patterns
    if (raw.includes("ProhibitedInView"))
      return "This action is temporarily unavailable. Please try again later.";
    if (raw.includes("AccountDoesNotExist"))
      return "The specified account does not exist on-chain.";
    if (raw.includes("MethodNotFound"))
      return "The contract method was not found. The contract may have been updated.";
    if (raw.includes("GuestPanic"))
      return "The contract encountered an internal error.";
    // "Requires attached deposit" is the contract refusing a payable method
    // that arrived with too little NEAR — a different problem from the wallet
    // being empty, and it needs a different answer from the user. Checked
    // before the balance cases below, which would otherwise swallow it and
    // tell someone to top up an account that is already funded.
    if (
      raw.includes("Requires attached deposit") ||
      raw.includes("requires attached deposit") ||
      raw.includes("attached deposit") ||
      raw.includes("RequiresAttachedDeposit")
    )
      return (
        "This action needs a small amount of NEAR attached to cover on-chain storage, " +
        "and the app didn't send enough. Your funds are untouched — please report this, " +
        "as it needs a fix rather than a retry."
      );
    if (raw.includes("NotEnoughBalance") || raw.includes("LackBalanceForState"))
      return "Your NEAR balance is too low to cover this transaction's fees. Add a little NEAR and try again.";
    if (raw.includes("AccessKeyNotFound"))
      return "Your access key is invalid. Please re-import your wallet.";
    if (raw.includes("Expired") || raw.includes("InvalidNonce"))
      return "Transaction expired. Please try again.";
    if (raw.includes("NotEnoughAllowance"))
      return "Insufficient function-call allowance. Please reconnect your wallet.";

    // Network errors
    if (raw.includes("fetch") || raw.includes("network") || raw.includes("ECONNREFUSED"))
      return "Network error. Please check your internet connection.";
    if (raw.includes("timeout") || raw.includes("Timeout"))
      return "Request timed out. The network may be congested — please try again.";

    // If raw is long/technical, truncate it
    if (raw.length > 120) {
      return raw.substring(0, 117) + "...";
    }

    return raw;
  }

  /**
   * Get active lease for a property
   * Was: get_lease_by_id → Now: get_lease (by property_id)
   */
  async getLease(
    propertyId: number
  ): Promise<ContractCallResult<Lease | null>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(
        JSON.stringify({ property_id: propertyId })
      ).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "get_lease_by_id",
        args_base64: argsBase64,
        finality: "final",
      }), "get_lease_by_id");

      const lease = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: lease };
    } catch (error: any) {
      console.error("NearContract: Failed to get lease:", error);
      return { success: false, error: error.message || "Failed to get lease" };
    }
  }

  /**
   * @deprecated Use getLease(propertyId) instead
   */
  async getLeaseById(
    leaseId: number
  ): Promise<ContractCallResult<LeaseView | null>> {
    try {
      const lease = await this.viewCall<LeaseView | null>("get_lease_by_id", {
        lease_id: leaseId,
      });
      return { success: true, data: lease };
    } catch (error: any) {
      console.error("NearContract: Failed to get lease by id:", error);
      return { success: false, error: error.message || "Failed to get lease" };
    }
  }

  /**
   * Get contract configuration
   */
  async getContractConfig(): Promise<ContractCallResult<ContractConfig>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(JSON.stringify({})).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "get_time_lock_config",
        args_base64: argsBase64,
        finality: "final",
      }), "get_time_lock_config");

      const config = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: config };
    } catch (error: any) {
      console.error("NearContract: Failed to get config:", error);
      return { success: false, error: error.message || "Failed to get config" };
    }
  }

  /**
   * Get supported stablecoins
   */
  async getSupportedStablecoins(): Promise<ContractCallResult<string[]>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(JSON.stringify({})).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "supported_stablecoins",
        args_base64: argsBase64,
        finality: "final",
      }), "supported_stablecoins");

      const stablecoins = JSON.parse(
        Buffer.from((result as any).result).toString()
      );

      return { success: true, data: stablecoins };
    } catch (error: any) {
      console.error("NearContract: Failed to get stablecoins:", error);
      return { success: false, error: error.message || "Failed to get stablecoins" };
    }
  }

  /**
   * Get NFT token info
   */
  async getNftToken(
    tokenId: string
  ): Promise<ContractCallResult<Token | null>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(
        JSON.stringify({ token_id: tokenId })
      ).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "nft_token",
        args_base64: argsBase64,
        finality: "final",
      }), "nft_token");

      const token = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: token };
    } catch (error: any) {
      console.error("NearContract: Failed to get NFT token:", error);
      return { success: false, error: error.message || "Failed to get NFT token" };
    }
  }

  /**
   * Get all NFTs owned by an account
   */
  async getNftTokensForOwner(
    accountId: string
  ): Promise<ContractCallResult<Token[]>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(
        JSON.stringify({ account_id: accountId })
      ).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "nft_tokens_for_owner",
        args_base64: argsBase64,
        finality: "final",
      }), "nft_tokens_for_owner");

      const tokens = JSON.parse(Buffer.from((result as any).result).toString());
      return { success: true, data: tokens };
    } catch (error: any) {
      console.error("NearContract: Failed to get NFT tokens:", error);
      return { success: false, error: error.message || "Failed to get NFT tokens" };
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(accountId: string): Promise<ContractCallResult<boolean>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(
        JSON.stringify({ account_id: accountId })
      ).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "is_admin",
        args_base64: argsBase64,
        finality: "final",
      }), "is_admin");

      const isAdmin = JSON.parse(
        Buffer.from((result as any).result).toString()
      );

      return { success: true, data: isAdmin };
    } catch (error: any) {
      console.error("NearContract: Failed to check admin status:", error);
      return { success: false, error: error.message || "Failed to check admin status" };
    }
  }

  /**
   * Get property counter (total properties minted)
   */
  async getPropertyCounter(): Promise<ContractCallResult<number>> {
    try {
      const contractId = this.getContractId();
      const argsBase64 = Buffer.from(JSON.stringify({})).toString("base64");

      const result = await this.withRetry(() => this.getProvider().query({
        request_type: "call_function",
        account_id: contractId,
        method_name: "get_property_counter",
        args_base64: argsBase64,
        finality: "final",
      }), "get_property_counter");

      const counter = JSON.parse(
        Buffer.from((result as any).result).toString()
      );

      return { success: true, data: counter };
    } catch (error: any) {
      console.error("NearContract: Failed to get property counter:", error);
      return { success: false, error: error.message || "Failed to get property counter" };
    }
  }

  /**
   * @deprecated Use expireLease via completeLease instead
   */
  async expireLease(
    accountId: string,
    privateKey: string,
    leaseId: number
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Expiring lease...", leaseId);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "expire_lease",
          args: { lease_id: leaseId },
          gas: BigInt(GAS.EXPIRE_LEASE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "expire_lease", "write");

      console.log("NearContract: Lease expired successfully");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to expire lease:", error);
      return { success: false, error: error.message || "Failed to expire lease" };
    }
  }

  /**
   * @deprecated Kept for backward compat — not used by current UI
   */
  async raiseTransactionDispute(
    accountId: string,
    privateKey: string,
    params: { bid_id: number; property_id: number; reason: string }
  ): Promise<ContractCallResult<void>> {
    try {
      console.log("NearContract: Raising transaction dispute...", params);
      const contractId = this.getContractId();

      const result = await this.withRetry(async () => {
        const account = await this.getAccount(accountId, privateKey);
        return account.functionCall({
          contractId,
          methodName: "raise_dispute",
          // `reason` is required by the contract. Without it every dispute
          // was refused before it started ("missing field `reason`").
          args: {
            bid_id: params.bid_id,
            property_id: params.property_id,
            reason: params.reason,
          },
          gas: BigInt(GAS.RAISE_DISPUTE),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "raise_dispute", "write");

      console.log("NearContract: Transaction dispute raised");
      return { success: true, transactionHash: result.transaction.hash };
    } catch (error: any) {
      console.error("NearContract: Failed to raise transaction dispute:", error);
      return { success: false, error: error.message || "Failed to raise transaction dispute" };
    }
  }
}

// Export singleton instance
const nearContractService = new NearContractService();
export default nearContractService;
