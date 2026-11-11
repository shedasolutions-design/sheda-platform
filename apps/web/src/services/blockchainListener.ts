/**
 * Blockchain Listener Service
 *
 * Polls the NEARBlocks indexer API for new transactions involving the user's
 * wallet and the Sheda contract. Detects on-chain events (bids, payments,
 * document releases, etc.) and fires callback notifications in real-time.
 *
 * Uses the same public NEARBlocks API that nearIndexer.ts already uses —
 * no API key or infrastructure required.
 */

import { AppState, type AppStateStatus } from "@/lib/appState";
import AsyncStorage from "@/lib/storage";
import { CONTRACT_ID, ACTIVE_NETWORK } from "../config/near";

// ============================================================================
// Configuration
// ============================================================================

const NEARBLOCKS_API = {
  testnet: "https://api-testnet.nearblocks.io/v1",
  mainnet: "https://api.nearblocks.io/v1",
} as const;

/** Polling interval in ms (15 seconds) */
const POLL_INTERVAL_MS = 15_000;
/** Maximum backoff on repeated errors (2 minutes) */
const MAX_BACKOFF_MS = 120_000;
/** AsyncStorage key prefix for last-seen timestamp */
const LAST_SEEN_KEY = "@sheda_chain_last_seen_";

// ============================================================================
// Types
// ============================================================================

/** Contract methods we care about for notifications */
export type MonitoredMethod =
  | "place_bid"
  | "accept_bid"
  | "accept_bid_with_escrow"
  | "reject_bid"
  | "cancel_bid"
  | "claim_lost_bid"
  | "confirm_document_release"
  | "confirm_document_receipt"
  | "release_escrow"
  | "complete_transaction"
  | "raise_dispute"
  | "resolve_dispute"
  | "mint_property"
  | "ft_transfer_call";

/** Notification-ready event emitted by the listener */
export interface BlockchainEvent {
  /** Transaction hash */
  txHash: string;
  /** Contract method that was called */
  method: MonitoredMethod;
  /** Account that signed the transaction */
  signer: string;
  /** Account that received the transaction */
  receiver: string;
  /** Block timestamp in milliseconds */
  timestamp: number;
  /** Parsed args (best-effort) */
  args?: Record<string, any>;
  /** Was the tx successful? */
  success: boolean;
}

type EventCallback = (event: BlockchainEvent) => void;

// All methods we monitor (set for O(1) lookup)
const MONITORED_METHODS = new Set<string>([
  "place_bid",
  "accept_bid",
  "accept_bid_with_escrow",
  "reject_bid",
  "cancel_bid",
  "claim_lost_bid",
  "confirm_document_release",
  "confirm_document_receipt",
  "release_escrow",
  "complete_transaction",
  "raise_dispute",
  "resolve_dispute",
  "mint_property",
  "ft_transfer_call",
]);

// ============================================================================
// Service
// ============================================================================

export class BlockchainListenerService {
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private accountId: string | null = null;
  private callback: EventCallback | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastSeenTimestamp: number = 0;
  private seenTxHashes = new Set<string>();

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Start listening for blockchain events for the given account.
   * Safe to call multiple times — restarts with new accountId if different.
   */
  start(accountId: string, callback: EventCallback): void {
    if (this.running && this.accountId === accountId) {
      // Already listening for this account
      this.callback = callback;
      return;
    }

    // Stop any existing listener
    this.stop();

    this.accountId = accountId;
    this.callback = callback;
    this.running = true;
    this.consecutiveErrors = 0;

    console.log(`[BlockchainListener] Starting for ${accountId}`);

    // Load last-seen timestamp, then begin polling
    this.loadLastSeen().then(() => {
      this.schedulePoll(0); // first poll immediately
    });

    // Pause/resume when app goes to background/foreground
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppState
    );
  }

  /** Stop listening and clean up all timers */
  stop(): void {
    if (!this.running) return;

    console.log("[BlockchainListener] Stopping");
    this.running = false;
    this.accountId = null;
    this.callback = null;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.seenTxHashes.clear();
  }

  /** Whether the service is currently active */
  get isRunning(): boolean {
    return this.running;
  }

  // ── Polling Loop ─────────────────────────────────────────────────────

  private schedulePoll(delayMs: number): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(async () => {
      await this.poll();
      // Schedule next poll with potential backoff
      const nextDelay =
        this.consecutiveErrors > 0
          ? Math.min(
              POLL_INTERVAL_MS * Math.pow(2, this.consecutiveErrors),
              MAX_BACKOFF_MS
            )
          : POLL_INTERVAL_MS;
      this.schedulePoll(nextDelay);
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.accountId) return;

    try {
      const baseUrl = NEARBLOCKS_API[ACTIVE_NETWORK];
      const contractId = CONTRACT_ID;

      // Fetch recent transactions for the user's account
      const url = `${baseUrl}/account/${this.accountId}/txns?per_page=25&order=desc`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`NEARBlocks API ${response.status}`);
      }

      const data = await response.json();
      const txns: any[] = data?.txns || [];

      let newEventsCount = 0;

      for (const tx of txns) {
        const hash = tx.transaction_hash || tx.hash;
        if (!hash) continue;

        // Skip already-seen transactions
        if (this.seenTxHashes.has(hash)) continue;

        // Parse timestamp (NEARBlocks uses nanoseconds)
        const timestampNano = Number(tx.block_timestamp || 0);
        const timestampMs = Math.floor(timestampNano / 1_000_000);

        // Skip transactions older than our last-seen marker
        if (timestampMs <= this.lastSeenTimestamp) {
          this.seenTxHashes.add(hash);
          continue;
        }

        // Check if this tx involves the Sheda contract
        const receiver = tx.receiver_account_id || "";
        const signer = tx.signer_account_id || "";
        const involvesContract =
          receiver === contractId || signer === contractId;

        // Also check for ft_transfer_call TO the contract (token transfers for bids)
        const actions: any[] = tx.actions || [];
        const firstAction = actions[0];
        const methodName: string =
          firstAction?.method || firstAction?.args?.method_name || "";

        // For ft_transfer_call, check if the msg targets our contract
        let isRelevantFtCall = false;
        if (methodName === "ft_transfer_call") {
          try {
            const args =
              typeof firstAction?.args === "string"
                ? JSON.parse(firstAction.args)
                : firstAction?.args;
            if (args?.receiver_id === contractId) {
              isRelevantFtCall = true;
            }
          } catch {
            // If we can't parse args, still include if receiver is a token contract
          }
        }

        if (!involvesContract && !isRelevantFtCall) {
          this.seenTxHashes.add(hash);
          continue;
        }

        // Check if the method is one we monitor
        if (!MONITORED_METHODS.has(methodName)) {
          this.seenTxHashes.add(hash);
          continue;
        }

        // Parse args (best effort)
        let parsedArgs: Record<string, any> | undefined;
        try {
          const rawArgs = firstAction?.args;
          if (typeof rawArgs === "string") {
            parsedArgs = JSON.parse(rawArgs);
          } else if (rawArgs && typeof rawArgs === "object") {
            parsedArgs = rawArgs;
          }
        } catch {
          // ignore parse failures
        }

        // Determine success
        const success =
          tx.outcomes?.status === true ||
          tx.status === "SUCCESS_VALUE" ||
          tx.status === "SUCCESS" ||
          (tx.outcomes_agg?.status !== undefined &&
            tx.outcomes_agg?.status !== false);

        const event: BlockchainEvent = {
          txHash: hash,
          method: methodName as MonitoredMethod,
          signer,
          receiver,
          timestamp: timestampMs,
          args: parsedArgs,
          success,
        };

        // Mark as seen before firing callback
        this.seenTxHashes.add(hash);

        // Only fire notification for events initiated by OTHER users
        // (we don't need to notify ourselves about our own actions)
        if (signer !== this.accountId && this.callback) {
          console.log(
            `[BlockchainListener] 🔔 New event: ${methodName} by ${signer} (tx: ${hash.slice(0, 12)}...)`
          );
          this.callback(event);
          newEventsCount++;
        } else if (signer === this.accountId) {
          // Still log our own actions for debugging
          console.log(
            `[BlockchainListener] ✓ Own action confirmed: ${methodName} (tx: ${hash.slice(0, 12)}...)`
          );
        }

        // Update the high-water mark
        if (timestampMs > this.lastSeenTimestamp) {
          this.lastSeenTimestamp = timestampMs;
        }
      }

      // Persist the high-water mark
      if (newEventsCount > 0 || this.lastSeenTimestamp > 0) {
        await this.saveLastSeen();
      }

      // Keep the seen-set from growing unbounded (keep last 200)
      if (this.seenTxHashes.size > 200) {
        const arr = Array.from(this.seenTxHashes);
        this.seenTxHashes = new Set(arr.slice(arr.length - 200));
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.consecutiveErrors++;
      console.warn(
        `[BlockchainListener] Poll error (attempt ${this.consecutiveErrors}):`,
        error
      );
    }
  }

  // ── App State ────────────────────────────────────────────────────────

  private handleAppState = (state: AppStateStatus): void => {
    if (state === "active" && this.running && !this.pollTimer) {
      console.log("[BlockchainListener] App foregrounded — resuming");
      this.schedulePoll(0);
    } else if (state !== "active" && this.pollTimer) {
      console.log("[BlockchainListener] App backgrounded — pausing");
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  };

  // ── Persistence ──────────────────────────────────────────────────────

  private async loadLastSeen(): Promise<void> {
    if (!this.accountId) return;
    try {
      const raw = await AsyncStorage.getItem(
        LAST_SEEN_KEY + this.accountId
      );
      if (raw) {
        this.lastSeenTimestamp = parseInt(raw, 10) || 0;
        console.log(
          `[BlockchainListener] Loaded last-seen: ${new Date(this.lastSeenTimestamp).toISOString()}`
        );
      } else {
        // First run — set to now so we don't fire notifications for old txs
        this.lastSeenTimestamp = Date.now();
        await this.saveLastSeen();
        console.log(
          "[BlockchainListener] First run — starting from now"
        );
      }
    } catch {
      this.lastSeenTimestamp = Date.now();
    }
  }

  private async saveLastSeen(): Promise<void> {
    if (!this.accountId || this.lastSeenTimestamp === 0) return;
    try {
      await AsyncStorage.setItem(
        LAST_SEEN_KEY + this.accountId,
        String(this.lastSeenTimestamp)
      );
    } catch {
      // non-critical
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────

const blockchainListener = new BlockchainListenerService();
export default blockchainListener;
