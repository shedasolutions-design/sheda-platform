import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair, KeyPairString } from "@near-js/crypto";
import { InMemoryKeyStore } from "@near-js/keystores";
import { NEAR } from "@near-js/tokens";
import * as bip39 from "bip39";
import bs58 from "bs58";
import { apiService } from "./api";
import secureStorageService from "./secureStorage";
import { NearIndexerService } from "./nearIndexer";
import { testnetTokenRegistry, mainnetTokenRegistry } from "./tokenRegistry";
import nearContractService from "./nearContract";
import { fetchExchangeRates, getCachedRates, type ExchangeRates } from "./priceService";
import { getTokenDisplay } from "@/utilities/tokenLogos";
import { getAccountExplorerUrl } from "@/utilities/nearExplorer";
import {
  pickEndpointIndex,
  markEndpointHealthy,
  markEndpointUnhealthy,
  isRateLimitError,
} from "./rpcHealth";
import { AMBIGUOUS_WRITE_ERROR } from "./nearContract";
import { GAS, DEPOSITS } from "@/config/gas";
import {
  getRpcEndpoints,
  FUNDING_ACCOUNTS,
  RETRY_CONFIG,
  getRetryDelay,
  sanitizeUsername,
  buildAccountId,
} from "@/config/walletConfig";
import {
  WALLET_ERRORS,
  buildWalletError,
  classifyWalletError,
  type WalletError,
  type WalletErrorCode,
} from "@/constants/walletErrors";

// ── Sponsored creation goes through the server ──────────────────────────────
// The funding account's private key lives only on the Next.js server
// (src/server/sponsor.ts). The browser asks /api/near/sponsor to create the
// account and never holds the key.

type SponsorResponse =
  | { ok: true; accountId: string; initialBalance: string }
  | { ok: false; code: string; message: string };

async function requestSponsoredAccount(
  accountId: string,
  publicKey: string
): Promise<SponsorResponse> {
  const token = await apiService.getToken();
  try {
    const res = await fetch("/api/near/sponsor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ accountId, publicKey }),
    });
    return (await res.json()) as SponsorResponse;
  } catch (error: any) {
    // The request may have reached the server and created the account before
    // the response was lost. Treat it like any other ambiguous write.
    return { ok: false, code: "ambiguous", message: error?.message || String(error) };
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

// Test token contracts for automatic minting on testnet
const TESTNET_AIRDROP_TOKENS = [
  { contractId: "usdt.fakes.testnet", amount: "5000000", name: "USDT" }, // 5 USDT (6 decimals)
  { contractId: "usdc.fakes.testnet", amount: "5000000", name: "USDC" }, // 5 USDC (6 decimals)
];

// NEAR Network Configurations
// (no nodeUrl here — actual RPC connections always go through the
// getRpcEndpoints() failover list in config/walletConfig.ts; keeping a second
// hardcoded endpoint here was dead weight that could drift from that list.)
// (explorer URLs live in utilities/nearExplorer.ts — NEAR's own explorer was
// retired, so every link goes to NearBlocks and there's exactly one place
// that decides that.)
const NETWORK_CONFIGS = {
  testnet: {
    networkId: "testnet",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    contractName: "testnet",
  },
  mainnet: {
    networkId: "mainnet",
    walletUrl: "https://wallet.near.org",
    helperUrl: "https://helper.near.org",
    contractName: "near",
  },
};

// ── Types ───────────────────────────────────────────────────────────────────

export type NetworkType = "testnet" | "mainnet";

export interface WalletAccount {
  accountId: string;
  publicKey: string;
  privateKey?: string;
  balance: string;
  isCreated: boolean;
  createdAt?: Date;
  /**
   * How the key is held. Mirrors WalletMetadata.authMethod so Phase A can copy
   * metadata straight into an account without a lying cast.
   *
   * Nothing branches on this any more — it distinguished FastAuth's MPC
   * signing from a local key, and FastAuth is gone. Kept because it is written
   * into persisted metadata and restore reads it back.
   */
  authMethod?: "seed" | "privateKey";
}

export interface WalletState {
  isConnected: boolean;
  account: WalletAccount | null;
}

export interface FaucetInfo {
  faucetUrl: string;
  instructions: string;
  requirements: string[];
}

/**
 * How the account came into existence. Wallet creation walks these in order
 * and stops at the first that succeeds — see createWallet().
 *
 * "sponsored" — a sub-account like alice.sheda.testnet, created and funded by
 *               Sheda's own funding account. The nicest outcome: a branded,
 *               readable name, active immediately. Needs the funding account
 *               to hold enough NEAR.
 *
 * "registrar" — a top-level name like alice.testnet, created free by NEAR's
 *               public testnet helper (helper.testnet.near.org), which funds
 *               it with 10 NEAR. TESTNET ONLY — mainnet has no equivalent,
 *               because mainnet names cost real money.
 *
 * "implicit"  — the 64-char hex of the account's own public key. Costs
 *               nothing, needs no funding account, no registrar and no
 *               transaction, and is a valid NEAR address that can receive
 *               funds right away. It does not exist as an on-chain *account*
 *               until its first deposit lands, which is why callers get
 *               `needsFunding: true`. This is the last resort, and on mainnet
 *               it is the only fundless option that exists.
 */
export type AccountKind = "sponsored" | "registrar" | "implicit";

export interface CreateWalletResult {
  accountId: string;
  seedPhrase: string;
  publicKey: string;
  faucetInfo?: FaucetInfo;
  airdropFailed?: boolean;
  /** See AccountKind. */
  accountKind: AccountKind;
  /**
   * True when the account holds nothing on chain yet and must receive a
   * deposit before it can sign anything. Always true for a fresh implicit
   * account. The UI has to say so plainly — presenting an inactive address
   * as a ready wallet is how someone sends funds nowhere.
   */
  needsFunding: boolean;
  /**
   * Why the better options were skipped, when they were. Present only when
   * `accountKind` is not "sponsored", so an unbranded or unfunded wallet is
   * explained rather than mysterious.
   */
  fallbackReason?: string;
}

export interface CreateSubAccountResult {
  accountId: string;
  publicKey: string;
  isCreated: boolean;
}

export interface ImportWalletResult {
  accountId: string;
  publicKey: string;
  isCreated: boolean;
}

/** Progress callback for wallet creation UI */
export type WalletProgressCallback = (step: WalletCreationStep) => void;

export type WalletCreationStep =
  | "generating_keys"
  | "creating_account"
  | "funding_wallet"
  | "setting_up"
  | "airdropping_tokens"
  | "complete"
  | "error";

// ── Service ─────────────────────────────────────────────────────────────────

class NearWalletService {
  private provider: JsonRpcProvider | null = null;
  /** In-flight endpoint probe, shared by concurrent initialize() callers */
  private initPromise: Promise<void> | null = null;
  private keyStore: InMemoryKeyStore;
  private accounts: Map<string, WalletAccount> = new Map();
  private currentNetwork: NetworkType = "testnet";
  private indexerService: NearIndexerService;
  private tokenRegistry: typeof testnetTokenRegistry | typeof mainnetTokenRegistry;
  private currentRpcIndex: number = 0;

  constructor() {
    this.keyStore = new InMemoryKeyStore();
    this.indexerService = new NearIndexerService("testnet");
    this.tokenRegistry = testnetTokenRegistry;

  }

  // ── Key Management ──────────────────────────────────────────────────────

  /** Get the funding account ID for the current network */
  private getFundingAccountId(): string {
    return FUNDING_ACCOUNTS[this.currentNetwork].accountId;
  }

  // ── Fundless account creation ─────────────────────────────────────────
  // Everything below exists so that "the funding wallet is empty" stops being
  // a dead end. Wallet creation used to throw outright when the funding key
  // was missing, which meant a drained funding account took the whole signup
  // flow down with it.

  /**
   * Derives the implicit account ID for a keypair: the lowercase hex of its
   * 32-byte ed25519 public key.
   *
   * This is pure local computation. No RPC, no funding, no transaction — the
   * address is valid the moment the key exists. NEAR treats a 64-char hex
   * account name as owned by whoever holds the matching key, so this is a
   * real self-custodial wallet, just an unmemorable one that stays dormant
   * until someone deposits into it.
   */
  private deriveImplicitAccountId(keyPair: KeyPair): string {
    const pk = keyPair.getPublicKey();
    // `data` is the raw 32 bytes on @near-js/crypto's PublicKey. Fall back to
    // decoding the base58 form if a future version drops the field.
    const bytes: Uint8Array =
      (pk as any).data ??
      bs58.decode(pk.toString().replace(/^ed25519:/, ""));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Creates a free top-level testnet account through NEAR's public helper.
   *
   * TESTNET ONLY, and deliberately so. Mainnet has no counterpart: mainnet
   * account names must be paid for, so there is nothing to call here. Passing
   * a mainnet ID would just fail slowly against a testnet host.
   */
  private async createViaRegistrar(
    accountId: string,
    publicKey: string
  ): Promise<void> {
    if (this.currentNetwork !== "testnet") {
      throw new Error("The public registrar helper is testnet-only.");
    }
    const helperUrl = "https://helper.testnet.near.org/account";

    const res = await Promise.race([
      fetch(helperUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAccountId: accountId,
          newAccountPublicKey: publicKey,
        }),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("Registrar helper timed out")), 20000)
      ),
    ]);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Registrar helper refused the request (${res.status}): ${text.slice(0, 200)}`
      );
    }
  }

  /**
   * A free `*.testnet` name for this user, with a random suffix.
   *
   * The suffix is not decoration: the whole `.testnet` namespace is shared
   * with every other developer on the network, so `alice.testnet` is long
   * gone. Colliding here wastes a round-trip and returns a confusing error,
   * whereas a random tail makes a collision essentially impossible.
   */
  private buildRegistrarAccountId(username: string): string {
    const suffix = Math.random().toString(36).slice(2, 8);
    const base = sanitizeUsername(username) || "shedauser";
    return `${base}${suffix}.testnet`;
  }

  // ── Seed / Key Generation ─────────────────────────────────────────────

  private generateSeedPhrase(): string {
    return bip39.generateMnemonic(128); // 12 words
  }

  private deriveKeyPairFromSeedPhrase(seedPhrase: string): KeyPair {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error("Invalid seed phrase");
    }
    const seed = bip39.mnemonicToSeedSync(seedPhrase);
    const secretKey = seed.slice(0, 32);
    const secretKeyBase58 = bs58.encode(secretKey);
    return KeyPair.fromString(`ed25519:${secretKeyBase58}`);
  }

  private getPrivateKeyFromSeedPhrase(seedPhrase: string): string {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error("Invalid seed phrase");
    }
    const seed = bip39.mnemonicToSeedSync(seedPhrase);
    const secretKey = seed.slice(0, 32);
    const secretKeyBase58 = bs58.encode(secretKey);
    return `ed25519:${secretKeyBase58}`;
  }

  // ── Network Management ────────────────────────────────────────────────

  setNetwork(network: NetworkType): void {
    this.currentNetwork = network;
    this.provider = null; // Force re-initialization with new network
    this.currentRpcIndex = 0;
    this.indexerService = new NearIndexerService(network);
    this.tokenRegistry =
      network === "testnet" ? testnetTokenRegistry : mainnetTokenRegistry;
    this.tokenRegistry.switchNetwork(network);
    console.log(`NearWalletService: Network switched to ${network}`);
  }

  getCurrentNetwork(): NetworkType {
    return this.currentNetwork;
  }

  getNetworkConfig() {
    return NETWORK_CONFIGS[this.currentNetwork];
  }

  // ── RPC Failover ──────────────────────────────────────────────────────

  /**
   * Initialize the RPC provider with failover support.
   * Tries each endpoint in order until one connects.
   */
  async initialize(): Promise<void> {
    // Already connected — don't spend another status() round-trip proving it.
    // These endpoints are shared and rate-limited, and a redundant health check
    // before every operation is pure cost. See services/rpcHealth.ts.
    if (this.provider) return;

    // Concurrent callers share one probe instead of racing several.
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.probeEndpoints().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async probeEndpoints(): Promise<void> {
    const endpoints = getRpcEndpoints(this.currentNetwork);
    // Start from a healthy endpoint rather than blindly at the current index,
    // which may be the one that just rate-limited us.
    const start = pickEndpointIndex(this.currentNetwork, this.currentRpcIndex);

    for (let offset = 0; offset < endpoints.length; offset++) {
      const i = (start + offset) % endpoints.length;
      try {
        const endpoint = endpoints[i];
        console.log(
          `NearWalletService: Trying ${endpoint.label} (${endpoint.url})...`
        );
        const provider = new JsonRpcProvider({ url: endpoint.url });

        // Verify connection with a timeout to avoid hanging on slow mobile networks
        await Promise.race([
          provider.status(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC connection timeout")), 15000)
          ),
        ]);

        this.provider = provider;
        this.currentRpcIndex = i;
        markEndpointHealthy(this.currentNetwork, i);
        console.log(
          `NearWalletService: Connected to ${endpoint.label}`
        );
        return;
      } catch (error: any) {
        const message = error?.message || String(error);
        markEndpointUnhealthy(
          this.currentNetwork,
          i,
          isRateLimitError(message) ? "rate-limited" : "failed"
        );
        console.warn(
          `NearWalletService: Failed to connect to ${endpoints[i].label}:`,
          message
        );
        this.provider = null;
      }
    }

    // If we've exhausted all endpoints, throw
    throw new Error(
      "ERR_RPC_TIMEOUT: Unable to connect to any NEAR RPC endpoint. Please check your internet connection and try again."
    );
  }

  /**
   * Execute an async operation with retry logic and RPC failover.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "operation",
    kind: "read" | "write" = "read"
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorMsg = (error?.message || String(error)).toLowerCase();

        // Don't retry non-transient errors
        if (
          errorMsg.includes("already exists") ||
          errorMsg.includes("does not match") ||
          errorMsg.includes("invalid seed phrase") ||
          errorMsg.includes("invalid private key") ||
          errorMsg.includes("not configured") ||
          errorMsg.includes("key is missing") ||
          errorMsg.includes("insufficient") ||
          errorMsg.includes("not enough balance") ||
          errorMsg.includes("does not exist")
        ) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.maxRetries) {
          // Try next RPC endpoint on network/connectivity errors
          // Cover patterns from all platforms (Android, iOS, web)
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
            errorMsg.includes("nsurlerrordomain") ||
            errorMsg.includes("rpc connection timeout");

          if (isNetworkError) {
            // Rest the endpoint that just failed so this retry — and every
            // other caller sharing these endpoints — stops aiming at it.
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
            // initialize() returns early while a provider is set, so drop the
            // dead one first — otherwise this rotation silently does nothing
            // and every retry goes back to the endpoint that just failed.
            this.provider = null;
            try {
              await this.initialize();
              console.warn(
                `NearWalletService: Switched to ${endpoints[this.currentRpcIndex].label} after network error`
              );
            } catch {
              // Continue — next attempt will fail and try yet another endpoint
            }
          }

          // A signed transfer stops here. A network error means the response
          // was lost, never that the transfer didn't execute — and sendMoney /
          // functionCall sign a fresh nonce per attempt, so retrying moves the
          // user's funds a second time. The endpoint has already been rested
          // and rotated above, so a manual retry starts somewhere healthy.
          // Same defect class as the duplicate bids in nearContract.ts.
          //
          // Before the backoff sleep: this call won't be retried, so waiting
          // only delays telling the user what happened.
          if (kind === "write" && isNetworkError) {
            throw new Error(AMBIGUOUS_WRITE_ERROR);
          }

          const delay = getRetryDelay(attempt);
          console.warn(
            `NearWalletService: ${operationName} failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${Math.round(delay)}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after retries`);
  }

  // ── Username Generation ───────────────────────────────────────────────

  /**
   * Derive the wallet username from an email address.
   * Applies sanitization rules per the spec.
   */
  deriveUsernameFromEmail(email: string): string | null {
    if (!email || !email.includes("@")) return null;
    const prefix = email.split("@")[0];
    const sanitized = sanitizeUsername(prefix);
    return sanitized || null;
  }

  /**
   * Generate the preview wallet address for an email.
   */
  getPreviewAccountId(email: string): string | null {
    const username = this.deriveUsernameFromEmail(email);
    if (!username) return null;
    return buildAccountId(username, this.currentNetwork);
  }

  /**
   * Find a unique account ID by appending numeric suffixes if the base name
   * is already taken.
   */
  private async findUniqueAccountId(
    baseUsername: string
  ): Promise<string> {
    // Try the base name first
    let accountId = buildAccountId(baseUsername, this.currentNetwork);
    let exists = await this.withRetry(() => this.accountExists(accountId), "checkAccountExists");

    if (!exists) return accountId;

    // Try appending numeric suffix: username2, username3, etc.
    for (let suffix = 2; suffix <= 99; suffix++) {
      const candidateUsername = `${baseUsername}${suffix}`;
      accountId = buildAccountId(candidateUsername, this.currentNetwork);
      exists = await this.withRetry(() => this.accountExists(accountId), "checkAccountExists");
      if (!exists) return accountId;
    }

    throw new Error(
      `All variations of ${baseUsername} are taken. Please use a different email.`
    );
  }

  // ── Wallet Creation ───────────────────────────────────────────────────

  async createWallet(
    email?: string,
    onProgress?: WalletProgressCallback
  ): Promise<CreateWalletResult> {
    const progress = onProgress || (() => { });

    try {
      console.log(
        `NearWalletService: Creating ${this.currentNetwork} wallet...`
      );

      // Initialize NEAR if not already done
      if (!this.provider) {
        await this.initialize();
      }

      // NOTE: no funding-key precondition here any more. Creation used to
      // throw at this point whenever the key was absent, which made an empty
      // or unconfigured funding account fatal to signup. The chain below
      // degrades instead: sponsored -> free registrar (testnet) -> implicit.
      // The user always ends up with a real, self-custodial key.

      // ── Step 1: Generate keys ──────────────────────────────────────────
      progress("generating_keys");

      const seedPhrase = this.generateSeedPhrase();
      const subAccountKeyPair = this.deriveKeyPairFromSeedPhrase(seedPhrase);
      const subAccountPublicKey = subAccountKeyPair.getPublicKey().toString();

      console.log("NearWalletService: Keys generated");

      // ── Step 2: Determine account name ─────────────────────────────────
      let username: string;
      if (email && email.includes("@")) {
        const derived = this.deriveUsernameFromEmail(email);
        username = derived || `shedauser${Date.now()}`;
      } else {
        username = `shedauser${Date.now()}${Math.random().toString(36).substr(2, 4)}`;
      }

      progress("creating_account");

      // ── Step 3: Create the account, degrading rather than failing ──────
      // Order is best-outcome-first. Each rung is tried only if the one above
      // is unavailable, and a failure at any rung falls through instead of
      // aborting: the user is mid-signup and ending with no wallet at all is
      // the worst possible result.
      const initialBalance = this.currentNetwork === "testnet" ? "1" : "0.1";

      interface CreatedAccount {
        id: string;
        kind: AccountKind;
        needsFunding: boolean;
        fallbackReason?: string;
      }

      // Each rung returns a fully-formed CreatedAccount or throws, so there is
      // exactly one assignment below and no partially-populated state.
      const created: CreatedAccount = await (async (): Promise<CreatedAccount> => {
        // ── Rung 1: Sheda-sponsored sub-account (alice.shedauser.testnet) ─
        // Created by the server, which alone holds the funding key. Any answer
        // other than "ambiguous" means nothing was written, so falling through
        // to the free rungs cannot leave the user with two wallets.
        let reason = "Sheda couldn't fund a new account just now.";
        try {
          const id = await this.withRetry(
            () => this.findUniqueAccountId(username),
            "findUniqueAccountId"
          );
          progress(this.currentNetwork === "testnet" ? "funding_wallet" : "setting_up");
          const sponsored = await requestSponsoredAccount(id, subAccountPublicKey);
          if (sponsored.ok) {
            console.log("NearWalletService: sponsored account created on-chain");
            return { id: sponsored.accountId, kind: "sponsored", needsFunding: false };
          }
          if (sponsored.code === "ambiguous") {
            throw new Error(`${AMBIGUOUS_WRITE_ERROR} ${sponsored.message}`);
          }
          reason = sponsored.message;
          console.warn("NearWalletService: sponsored creation unavailable, falling back:", reason);
        } catch (sponsorError: any) {
          const message = sponsorError?.message || String(sponsorError);
          if (message.includes(AMBIGUOUS_WRITE_ERROR)) throw sponsorError;
          console.warn("NearWalletService: sponsored creation failed, falling back:", message);
        }

        // ── Rung 2: free top-level name via NEAR's testnet helper ────────
        // Testnet only — mainnet names cost real NEAR, so there is no
        // equivalent service to fall back to there.
        if (this.currentNetwork === "testnet") {
          const candidate = this.buildRegistrarAccountId(username);
          try {
            progress("funding_wallet");
            await this.createViaRegistrar(candidate, subAccountPublicKey);
            console.log(
              "NearWalletService: registrar created free account",
              candidate
            );
            return {
              id: candidate,
              kind: "registrar",
              needsFunding: false,
              fallbackReason: reason,
            };
          } catch (registrarError: any) {
            console.warn(
              "NearWalletService: registrar helper failed, falling back to implicit:",
              registrarError?.message || registrarError
            );
          }
        }

        // ── Rung 3: implicit account ──────────────────────────────────
        // Always available, on every network, with no dependency on anything
        // external. The address is derived locally and stays dormant until it
        // receives its first deposit.
        progress("setting_up");
        const id = this.deriveImplicitAccountId(subAccountKeyPair);
        console.log("NearWalletService: derived implicit account", id);
        return {
          id,
          kind: "implicit",
          needsFunding: true,
          fallbackReason: reason,
        };
      })();

      const subAccountId = created.id;
      const accountKind = created.kind;
      const needsFunding = created.needsFunding;
      const fallbackReason = created.fallbackReason;

      // ── Step 4: Store locally ──────────────────────────────────────────
      const config = this.getNetworkConfig();
      await this.keyStore.setKey(
        config.networkId,
        subAccountId,
        subAccountKeyPair
      );

      const privateKey = this.getPrivateKeyFromSeedPhrase(seedPhrase);

      const walletAccount: WalletAccount = {
        accountId: subAccountId,
        publicKey: subAccountPublicKey,
        privateKey,
        // An implicit account holds nothing until its first deposit. Reporting
        // the sponsored amount here would put a balance on screen that the
        // chain does not agree with.
        balance: needsFunding ? "0" : initialBalance,
        // isCreated means "exists on chain". For an implicit account that is
        // false until funded, and callers branch on it — claiming true would
        // make the app try to sign from an account that isn't there.
        isCreated: !needsFunding,
        createdAt: new Date(),
      };
      this.accounts.set(subAccountId, walletAccount);

      // Save seed phrase securely
      try {
        await secureStorageService.saveSeedPhrase(subAccountId, seedPhrase);
        console.log("NearWalletService: Seed phrase saved securely");
      } catch (storageError) {
        console.error("NearWalletService: Secure storage failed:", storageError);
        // Continue — user can still see/copy the seed phrase
      }

      // ── Step 5: Airdrop (testnet only) ─────────────────────────────────
      // Skipped for an unfunded implicit account: the airdrop is a signed
      // transaction from the new account, and an account that does not exist
      // on chain yet cannot sign. It would fail every time.
      let airdropFailed = false;
      if (this.currentNetwork === "testnet" && !needsFunding) {
        progress("airdropping_tokens");
        try {
          await this.airdropTestTokens(subAccountId, privateKey);
        } catch (airdropError) {
          console.warn("NearWalletService: Airdrop failed:", airdropError);
          airdropFailed = true;
        }
      }

      // ── Complete ───────────────────────────────────────────────────────
      progress("complete");

      const result: CreateWalletResult = {
        accountId: subAccountId,
        seedPhrase,
        publicKey: subAccountPublicKey,
        airdropFailed,
        accountKind,
        needsFunding,
        fallbackReason,
      };

      if (needsFunding) {
        result.faucetInfo = {
          faucetUrl:
            this.currentNetwork === "testnet"
              ? "https://near-faucet.io/"
              : config.walletUrl,
          instructions:
            `Your wallet address is ready, but it isn't active on the blockchain yet. ` +
            `Send any amount of NEAR to ${subAccountId} to activate it.`,
          requirements: [
            "Your recovery phrase is saved — write it down now",
            "The wallet activates on its first deposit",
            "You can receive funds at this address straight away",
          ],
        };
      } else if (this.currentNetwork === "testnet") {
        result.faucetInfo = {
          faucetUrl: config.walletUrl,
          instructions: `Your testnet wallet ${subAccountId} has been created and funded with ${initialBalance} NEAR.`,
          requirements: [
            "Your wallet is ready to use",
            "You received test NEAR tokens",
            "Use Settings > Wallet to export your recovery phrase",
          ],
        };
      }

      console.log("NearWalletService: Wallet creation complete:", result.accountId);
      return result;
    } catch (error: any) {
      progress("error");
      console.error("NearWalletService: Wallet creation failed:", error);
      throw error;
    }
  }

  // ── Token Airdrop ─────────────────────────────────────────────────────

  async airdropTestTokens(
    accountId: string,
    privateKey: string
  ): Promise<void> {
    try {
      await nearContractService.initialize("testnet");

      for (const token of TESTNET_AIRDROP_TOKENS) {
        try {
          console.log(`NearWalletService: Airdropping ${token.name} to ${accountId}...`);

          const isRegistered = await nearContractService.isRegisteredWithToken(
            token.contractId,
            accountId
          );

          if (!isRegistered) {
            await nearContractService.registerWithToken(
              accountId,
              privateKey,
              token.contractId
            );
          }

          const mintResult = await nearContractService.mintTestTokens(
            accountId,
            privateKey,
            token.contractId,
            token.amount
          );

          if (mintResult.success) {
            console.log(`NearWalletService: ✅ Airdropped ${token.name}`);
          } else {
            console.warn(
              `NearWalletService: ⚠️ Airdrop ${token.name} failed:`,
              mintResult.error
            );
          }
        } catch (tokenError) {
          console.warn(`NearWalletService: ⚠️ Error airdropping ${token.name}:`, tokenError);
        }
      }
    } catch (error) {
      console.warn("NearWalletService: ⚠️ Airdrop failed (non-critical):", error);
      // Don't throw — airdrop failure shouldn't prevent wallet creation
    }
  }

  // ── Sub-Account Creation ──────────────────────────────────────────────

  async createSubAccount(
    mainAccountId: string,
    subAccountName: string,
    initialBalance: string = "1.0"
  ): Promise<CreateSubAccountResult> {
    try {
      if (!this.provider) await this.initialize();

      const mainAccount = this.accounts.get(mainAccountId);
      if (!mainAccount) {
        throw new Error(
          `Main account ${mainAccountId} not found. Please connect first.`
        );
      }

      const config = this.getNetworkConfig();
      const mainKeyPair = await this.keyStore.getKey(
        config.networkId,
        mainAccountId
      );
      if (!mainKeyPair) {
        throw new Error(`Key not found for ${mainAccountId}.`);
      }

      if (!this.provider) throw new Error("Provider not initialized");

      const mainAccountObj = new Account(
        mainAccountId,
        this.provider,
        new KeyPairSigner(mainKeyPair)
      );

      const subAccountKeyPair = KeyPair.fromRandom("ed25519");
      const subAccountPublicKey = subAccountKeyPair.getPublicKey().toString();
      const subAccountId = `${subAccountName}.${mainAccountId}`;

      await this.withRetry(async () => {
        await mainAccountObj.createAccount(
          subAccountId,
          subAccountKeyPair.getPublicKey(),
          NEAR.toUnits(initialBalance)
        );
      }, "createSubAccount", "write");

      await this.keyStore.setKey(config.networkId, subAccountId, subAccountKeyPair);

      const subAccount: WalletAccount = {
        accountId: subAccountId,
        publicKey: subAccountPublicKey,
        balance: initialBalance,
        isCreated: true,
        createdAt: new Date(),
      };
      this.accounts.set(subAccountId, subAccount);

      return {
        accountId: subAccountId,
        publicKey: subAccountPublicKey,
        isCreated: true,
      };
    } catch (error) {
      console.error("NearWalletService: Sub-account creation failed:", error);
      throw error;
    }
  }

  // ── Wallet Import ─────────────────────────────────────────────────────

  async importWallet(
    seedPhrase: string,
    accountId?: string,
    email?: string
  ): Promise<ImportWalletResult> {
    try {
      if (!this.provider) await this.initialize();

      const keyPair = this.deriveKeyPairFromSeedPhrase(seedPhrase);
      const publicKey = keyPair.getPublicKey().toString();

      // Determine the account ID
      let finalAccountId = this.resolveAccountId(accountId, email);

      // Check if account exists on blockchain
      const isCreated = await this.withRetry(
        () => this.accountExists(finalAccountId),
        "checkAccountExists"
      );

      if (!isCreated) {
        throw new Error(
          `Account ${finalAccountId} does not exist on the blockchain.`
        );
      }

      // Verify the seed phrase matches this account
      await this.verifyAccessKey(finalAccountId, publicKey);

      // Store the key
      const config = this.getNetworkConfig();
      await this.keyStore.setKey(config.networkId, finalAccountId, keyPair);

      const account: WalletAccount = {
        accountId: finalAccountId,
        publicKey,
        balance: "0",
        isCreated,
        createdAt: new Date(),
      };
      this.accounts.set(finalAccountId, account);

      // Save seed phrase securely
      try {
        await secureStorageService.saveSeedPhrase(finalAccountId, seedPhrase);
      } catch (error) {
        console.error("NearWalletService: Failed to save seed phrase:", error);
      }

      return { accountId: finalAccountId, publicKey, isCreated };
    } catch (error) {
      console.error("NearWalletService: Import failed:", error);
      throw error;
    }
  }

  async importWalletByPrivateKey(
    privateKeyStr: string,
    accountId?: string,
    email?: string
  ): Promise<ImportWalletResult> {
    try {
      if (!this.provider) await this.initialize();

      // Normalise: accept with or without "ed25519:" prefix
      let normalised = privateKeyStr.trim();
      if (!normalised.startsWith("ed25519:")) {
        normalised = `ed25519:${normalised}`;
      }

      let keyPair: KeyPair;
      try {
        keyPair = KeyPair.fromString(normalised as KeyPairString);
      } catch {
        throw new Error("Invalid private key format.");
      }
      const publicKey = keyPair.getPublicKey().toString();

      let finalAccountId = this.resolveAccountId(accountId, email);

      const isCreated = await this.withRetry(
        () => this.accountExists(finalAccountId),
        "checkAccountExists"
      );
      if (!isCreated) {
        throw new Error(
          `Account ${finalAccountId} does not exist on the blockchain.`
        );
      }

      // Verify this key is an access key on the account
      await this.verifyAccessKey(finalAccountId, publicKey);

      const config = this.getNetworkConfig();
      await this.keyStore.setKey(config.networkId, finalAccountId, keyPair);

      const account: WalletAccount = {
        accountId: finalAccountId,
        publicKey,
        privateKey: normalised,
        balance: "0",
        isCreated,
        createdAt: new Date(),
      };
      this.accounts.set(finalAccountId, account);

      // Let a failure here propagate to the outer catch — silently
      // swallowing it would report success while the key never actually
      // got persisted, so the wallet would be unrestorable on next launch
      // with no indication anything went wrong.
      await secureStorageService.savePrivateKey(finalAccountId, normalised);

      return { accountId: finalAccountId, publicKey, isCreated };
    } catch (error) {
      console.error("NearWalletService: Private key import failed:", error);
      throw error;
    }
  }

  // ── Import Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the target account ID from explicit accountId, email, or fail.
   */
  private resolveAccountId(accountId?: string, email?: string): string {
    if (accountId) return accountId;

    if (email && email.includes("@")) {
      const username = this.deriveUsernameFromEmail(email);
      if (username) {
        return buildAccountId(username, this.currentNetwork);
      }
      throw new Error(
        "Could not derive account ID from email. Please provide your account ID manually."
      );
    }

    const suffix = FUNDING_ACCOUNTS[this.currentNetwork].walletSuffix;
    throw new Error(
      `Please provide your account ID (e.g., yourusername${suffix}).`
    );
  }

  /**
   * Verify that a public key is registered as an access key on the given account.
   */
  private async verifyAccessKey(
    accountId: string,
    publicKey: string
  ): Promise<void> {
    try {
      const nearAccount = new Account(accountId, this.provider!);
      const accessKeys = await nearAccount.getAccessKeys();
      const onChainKeys = accessKeys.map((k: any) => k.public_key);

      if (!onChainKeys.includes(publicKey)) {
        throw new Error(
          `The key does not match account ${accountId}. Please check that you entered the correct key.`
        );
      }
    } catch (keyError: any) {
      // Re-throw our own validation errors
      if (keyError.message?.includes("does not match")) {
        throw keyError;
      }
      // Otherwise allow import to proceed (network issues shouldn't block)
      console.warn("NearWalletService: Could not verify access keys:", keyError);
    }
  }

  // ── Connect / Sign In / Sign Out ──────────────────────────────────────

  async connectWallet(accountId: string): Promise<WalletAccount> {
    try {
      if (!this.provider) await this.initialize();
      if (!this.provider) throw new Error("Failed to initialize NEAR connection");

      // Get private key — from seed phrase or direct storage
      let privateKey: string | undefined;
      try {
        const pk = await this.getPrivateKeyFromStoredSeedPhrase(accountId);
        if (pk) privateKey = pk;
      } catch { }

      if (!privateKey) {
        try {
          const storedPK = await secureStorageService.getPrivateKey(accountId);
          if (storedPK) privateKey = storedPK;
        } catch { }
      }

      const config = this.getNetworkConfig();
      const storedKey = await this.keyStore.getKey(config.networkId, accountId);

      // One retried round-trip that both confirms existence and gets the
      // balance, instead of two separate account.state() calls (a prior
      // accountExists() check plus another one here) that doubled the
      // exposure to a single transient RPC failure.
      let state: Awaited<ReturnType<Account["state"]>> | null = null;
      try {
        state = await this.withRetry(async () => {
          const account = new Account(accountId, this.provider!);
          return await account.state();
        }, "getAccountState");
      } catch (error: any) {
        if (!this.isAccountNotFoundError(error)) throw error;
        // else: genuinely not created yet — state stays null
      }

      const walletAccount: WalletAccount = {
        accountId,
        publicKey: storedKey ? storedKey.getPublicKey().toString() : "",
        privateKey,
        balance: state ? state.amount.toString() : "0",
        isCreated: state !== null,
      };
      this.accounts.set(accountId, walletAccount);
      return walletAccount;
    } catch (error) {
      console.error("NearWalletService: connectWallet failed:", error);
      throw error;
    }
  }

  async signIn(accountId: string): Promise<WalletAccount> {
    return this.connectWallet(accountId);
  }

  async signOut(): Promise<void> {
    console.log("NearWalletService: Signed out");
  }

  // ── Balance & Tokens ──────────────────────────────────────────────────

  async getAccountBalance(accountId: string): Promise<string> {
    try {
      return await this.withRetry(async () => {
        if (!this.provider) await this.initialize();
        if (!this.provider) throw new Error("Failed to initialize NEAR provider");

        const accountState = await this.provider.query({
          request_type: "view_account",
          finality: "final",
          account_id: accountId,
        });

        return (accountState as any).amount || "0";
      }, "getAccountBalance");
    } catch (error) {
      console.error(`NearWalletService: Failed to get balance for ${accountId}:`, error);
      throw error;
    }
  }

  async getTokenBalances(accountId: string): Promise<any[]> {
    try {
      const tokenBalances = [];

      // Fetch live prices
      let rates: ExchangeRates | null = getCachedRates();
      let pricesFetched = false;
      try {
        rates = await fetchExchangeRates();
        pricesFetched = true;
      } catch (e) {
        if (rates) pricesFetched = true;
      }

      const nearUsdPrice = rates?.nearUsd ?? 0;
      const usdtUsdPrice = rates?.usdtUsd ?? 1.0;
      const nearPriceAvailable = nearUsdPrice > 0;

      const prices: Record<string, { price: number; available: boolean }> = {
        NEAR: { price: nearUsdPrice, available: nearPriceAvailable },
        USDT: { price: usdtUsdPrice, available: pricesFetched },
        USDC: { price: usdtUsdPrice, available: pricesFetched },
        DAI: { price: 1.0, available: true },
        USN: { price: 1.0, available: true },
        wNEAR: { price: nearUsdPrice, available: nearPriceAvailable },
      };

      // NEAR balance
      const nearBalance = await this.getAccountBalance(accountId);
      const nearAmount = parseFloat(NEAR.toDecimal(nearBalance));
      const nearDisplay = getTokenDisplay("NEAR");

      tokenBalances.push({
        id: "1",
        name: nearDisplay.displayName,
        symbol: "NEAR",
        price: nearUsdPrice,
        amount: parseFloat(nearAmount.toFixed(6)),
        totalValue: nearAmount * nearUsdPrice,
        iconColor: nearDisplay.color,
        contractAddress: "near",
        decimals: 24,
        priceAvailable: nearPriceAvailable,
      });

      // FT balances — construct the Account here (not before the NEAR
      // balance call above) so it picks up whatever provider getAccountBalance
      // ended up on after any retry/failover, rather than a possibly-rate-
      // limited one grabbed before this function did any work.
      if (!this.provider) await this.initialize();
      if (!this.provider) throw new Error("Failed to initialize NEAR provider");
      const account = new Account(accountId, this.provider);

      const ftBalances = await this.tokenRegistry.getAllTokenBalances(
        accountId,
        account
      );

      ftBalances.forEach((tokenBalance, index) => {
        const amount = parseFloat(tokenBalance.balanceFormatted);
        const priceInfo = prices[tokenBalance.symbol] || { price: 0, available: false };
        const display = getTokenDisplay(tokenBalance.symbol, tokenBalance.contractId);

        tokenBalances.push({
          id: (index + 2).toString(),
          name: display.displayName,
          symbol: tokenBalance.symbol,
          price: priceInfo.price,
          amount: parseFloat(amount.toFixed(6)),
          totalValue: amount * priceInfo.price,
          iconColor: display.color,
          contractAddress: tokenBalance.contractId,
          decimals: tokenBalance.decimals,
          priceAvailable: priceInfo.available,
        });
      });

      return tokenBalances;
    } catch (error) {
      console.error(`NearWalletService: Token balances failed for ${accountId}:`, error);

      // Fallback: return only NEAR balance
      try {
        const nearBalance = await this.getAccountBalance(accountId);
        const nearAmount = parseFloat(NEAR.toDecimal(nearBalance));
        const cached = getCachedRates();
        const nearPrice = cached?.nearUsd ?? 0;
        const nearDisplay = getTokenDisplay("NEAR");

        return [{
          id: "1",
          name: nearDisplay.displayName,
          symbol: "NEAR",
          price: nearPrice,
          amount: parseFloat(nearAmount.toFixed(6)),
          totalValue: nearAmount * nearPrice,
          iconColor: nearDisplay.color,
          contractAddress: "near",
          decimals: 24,
          priceAvailable: nearPrice > 0,
        }];
      } catch {
        return [];
      }
    }
  }

  // ── Transactions ──────────────────────────────────────────────────────

  /**
   * Account transaction history, enriched with a USD value per entry.
   *
   * Errors propagate deliberately (see IndexerUnavailableError) — returning
   * [] here made an unreachable indexer render as a confident "no
   * transactions", which is the one thing a wallet must never claim wrongly.
   */
  async getAccountTransactions(
    accountId: string,
    limit: number = 25,
    forceRefresh: boolean = false
  ): Promise<any[]> {
    const transactions = await this.indexerService.getAccountTransactions({
      accountId,
      limit,
      page: 1,
      order: "desc",
      forceRefresh,
    });

    let rates: ExchangeRates | null = getCachedRates();
    try {
      rates = await fetchExchangeRates();
    } catch { }
    const nearUsdPrice = rates?.nearUsd ?? 0;

    return transactions.map((tx) => {
      const amountNum = parseFloat(tx.amount) || 0;
      const usdValue =
        tx.currency === "NEAR" ? amountNum * nearUsdPrice : amountNum;

      return {
        id: tx.id,
        type: tx.type,
        direction: tx.direction,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        currency: tx.currency,
        value: usdValue,
        // Keep the block timestamp intact — the UI formats it into a
        // relative/absolute time and sorts on it. Truncating to a YYYY-MM-DD
        // string here threw away the time of day entirely, so nothing in the
        // wallet could show *when* a transaction actually happened.
        timestamp: tx.timestamp,
        date: new Date(tx.timestamp).toISOString(),
        hash: tx.hash,
        status: tx.status,
        blockHash: tx.blockHash,
        methodName: tx.methodName,
        deposit: tx.deposit,
        gas: tx.gas,
      };
    });
  }

  async sendTransaction(
    accountId: string,
    receiverId: string,
    amount: string
  ): Promise<string> {
    try {
      if (!this.provider) await this.initialize();
      if (!this.provider) throw new Error("Failed to initialize NEAR connection");

      const keyPair = await this.keyStore.getKey(
        this.currentNetwork,
        accountId
      );

      if (!keyPair) {
        throw new Error("No key pair found. Please reconnect your wallet.");
      }

      const signer = new KeyPairSigner(keyPair);
      const account = new Account(accountId, this.provider, signer);
      const amountInYocto = NEAR.toUnits(amount);

      const result = await this.withRetry(async () => {
        return await account.sendMoney(receiverId, BigInt(amountInYocto));
      }, "sendTransaction", "write");

      return result.transaction.hash;
    } catch (error) {
      console.error("NearWalletService: sendTransaction failed:", error);
      throw error;
    }
  }

  async sendFungibleToken(
    accountId: string,
    receiverId: string,
    tokenContractId: string,
    amount: string,
    decimals: number = 6
  ): Promise<string> {
    try {
      if (!this.provider) await this.initialize();
      if (!this.provider) throw new Error("Failed to initialize NEAR connection");

      const privateKey = await this.getPrivateKeyFromStoredSeedPhrase(accountId);
      if (!privateKey) {
        throw new Error("No private key found. Please reconnect your wallet.");
      }

      const keyPair = KeyPair.fromString(privateKey as any);
      const signer = new KeyPairSigner(keyPair);
      const account = new Account(accountId, this.provider, signer);

      // Exact string maths: floats turn 1 wNEAR (24 decimals) into "1e+24",
      // which the contract rejects, and lose digits on larger amounts.
      const clean = String(amount).replace(/,/g, "").trim();
      if (!/^\d*\.?\d*$/.test(clean) || !/\d/.test(clean)) throw new Error("Invalid amount");
      const [whole = "0", fraction = ""] = clean.split(".");
      const atomicAmount = (whole + fraction.slice(0, decimals).padEnd(decimals, "0")).replace(/^0+/, "") || "0";
      if (atomicAmount === "0") throw new Error("Amount must be greater than zero");

      const result = await this.withRetry(async () => {
        return await account.functionCall({
          contractId: tokenContractId,
          methodName: "ft_transfer",
          args: {
            receiver_id: receiverId,
            amount: atomicAmount,
            memo: "Sheda wallet transfer",
          },
          gas: BigInt(GAS.FT_TRANSFER),
          attachedDeposit: BigInt(DEPOSITS.ONE_YOCTO),
        });
      }, "sendFungibleToken", "write");

      return result.transaction.hash;
    } catch (error) {
      console.error("NearWalletService: FT transfer failed:", error);
      throw error;
    }
  }

  // ── Generic contract / transaction helpers ────────────────────────────
  //
  // These exist so UI code never has to assemble a signer itself. Before this,
  // every screen that needed to sign rebuilt the same
  // "fetch key -> KeyPair.fromString -> new KeyPairSigner -> new Account"
  // sequence inline, and they drifted: some read from the in-memory keyStore,
  // others went to secure storage, and only some of them ran inside withRetry.
  // A wallet with several subtly different signing paths fails in several
  // subtly different ways. This is the one path.

  /**
   * Builds a signing-capable Account for `accountId`.
   *
   * Resolves the key from the in-memory keystore first (populated by
   * connectWallet/importWallet), then falls back to secure storage — so this
   * works both mid-session and on a cold call after a restart.
   */
  async getAccount(accountId: string): Promise<Account> {
    if (!this.provider) await this.initialize();
    if (!this.provider) throw new Error("Failed to initialize NEAR connection");

    let keyPair = await this.keyStore.getKey(this.currentNetwork, accountId);

    if (!keyPair) {
      const privateKey = await this.getPrivateKeyFromStoredSeedPhrase(accountId);
      if (!privateKey) {
        throw new Error("No private key found. Please reconnect your wallet.");
      }
      keyPair = KeyPair.fromString(privateKey as KeyPairString);
      // Cache it so the next call in this session skips secure storage — on
      // native that read can be biometric-gated, and prompting per action is
      // how a multi-step flow turns into a stack of Face ID sheets.
      await this.keyStore.setKey(this.currentNetwork, accountId, keyPair);
    }

    return new Account(accountId, this.provider, new KeyPairSigner(keyPair));
  }

  /**
   * Signs and sends an arbitrary action list. Goes through withRetry with
   * kind "write", so it inherits the same RPC failover and the same
   * ambiguous-write handling as every other state-changing call.
   */
  async signAndSendTransaction(
    accountId: string,
    receiverId: string,
    actions: any[]
  ): Promise<string> {
    try {
      const account = await this.getAccount(accountId);
      const result = await this.withRetry(
        async () => account.signAndSendTransaction({ receiverId, actions }),
        "signAndSendTransaction",
        "write"
      );
      return result.transaction.hash;
    } catch (error) {
      console.error("NearWalletService: signAndSendTransaction failed:", error);
      throw error;
    }
  }

  /**
   * Read-only contract call. Needs no key and costs no gas, so it does not
   * build a signer — a view call that demanded a signer would drag a
   * biometric prompt into rendering a balance.
   */
  async viewFunction<T = any>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.provider) await this.initialize();
    if (!this.provider) throw new Error("Failed to initialize NEAR connection");

    return this.withRetry(async () => {
      const res: any = await this.provider!.callFunction(
        contractId,
        methodName,
        args
      );
      return res as T;
    }, `viewFunction:${contractId}.${methodName}`, "read");
  }

  // ── Utility Methods ───────────────────────────────────────────────────

  // NEAR's RPC uses this exact message shape for genuine non-existence (see
  // @near-js/utils's getErrorTypeFromErrorMessage) — anything else (timeout,
  // 429, network blip) is a transient failure, not a real "doesn't exist",
  // and must be treated differently: propagated so withRetry can retry it,
  // never silently reported as non-existence. That false negative is what
  // was making a fully-created wallet appear disconnected after every
  // refresh whenever the shared public testnet RPC hiccuped.
  private isAccountNotFoundError(error: any): boolean {
    const msg = (error?.message || String(error)).toLowerCase();
    return (
      /^account .*? does not exist while viewing$/.test(msg) ||
      /^account .*? doesn't exist$/.test(msg)
    );
  }

  async accountExists(accountId: string): Promise<boolean> {
    if (!this.provider) await this.initialize();
    if (!this.provider) throw new Error("Failed to initialize NEAR connection");

    try {
      const account = new Account(accountId, this.provider);
      await account.state();
      return true;
    } catch (error: any) {
      if (this.isAccountNotFoundError(error)) return false;
      throw error;
    }
  }

  getFaucetInfo(): FaucetInfo | null {
    if (this.currentNetwork === "testnet") {
      const config = this.getNetworkConfig();
      return {
        faucetUrl: config.walletUrl,
        instructions: `Visit the NEAR testnet wallet to manage your account.`,
        requirements: [
          `Visit ${config.walletUrl}`,
          "Import your wallet using your seed phrase",
          "Request testnet NEAR from the faucet if needed",
        ],
      };
    }
    return null;
  }

  getAccountExplorerUrl(accountId: string): string {
    return getAccountExplorerUrl(accountId, this.currentNetwork);
  }

  getWalletUrl(): string {
    return this.getNetworkConfig().walletUrl;
  }

  formatNearAmount(amount: string): string {
    return NEAR.toDecimal(amount);
  }

  parseNearAmount(amount: string): string {
    return NEAR.toUnits(amount).toString();
  }

  isSignedIn(): boolean {
    return this.accounts.size > 0;
  }

  getAccountId(): string | null {
    return Array.from(this.accounts.keys())[0] || null;
  }

  getAccounts(): WalletAccount[] {
    return Array.from(this.accounts.values());
  }

  clearAccounts(): void {
    this.accounts.clear();
  }

  // ── Secure Storage Accessors ──────────────────────────────────────────

  async getStoredSeedPhrase(accountId: string): Promise<string | null> {
    try {
      return await secureStorageService.getSeedPhrase(accountId);
    } catch (error) {
      console.error("NearWalletService: Failed to retrieve seed phrase:", error);
      return null;
    }
  }

  async deleteStoredSeedPhrase(accountId: string): Promise<void> {
    await secureStorageService.deleteSeedPhrase(accountId);
  }

  async isBiometricAvailable(): Promise<boolean> {
    return secureStorageService.isBiometricAvailable();
  }

  async getSupportedBiometryType(): Promise<string | null> {
    return secureStorageService.getSupportedBiometryType();
  }

  async getPrivateKeyFromStoredSeedPhrase(
    accountId: string
  ): Promise<string | null> {
    try {
      const seedPhrase = await this.getStoredSeedPhrase(accountId);
      if (!seedPhrase) return null;
      return this.getPrivateKeyFromSeedPhrase(seedPhrase);
    } catch (error) {
      console.error(
        "NearWalletService: Failed to get private key from stored seed phrase:",
        error
      );
      return null;
    }
  }
}

// Create a singleton instance
const nearWalletService = new NearWalletService();

export default nearWalletService;
