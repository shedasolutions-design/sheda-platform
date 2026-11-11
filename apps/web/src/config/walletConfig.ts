// ============================================================================
// NEAR RPC Failover Configuration
// ============================================================================
// Multiple RPC endpoints per network with automatic failover.
// If primary fails, we try the next endpoint in order.
// ============================================================================

export interface RpcEndpoint {
    url: string;
    label: string;
    priority: number;
}

// Every endpoint below was individually curl-verified (2026-07-28) for the
// things that actually matter for this app, not just "listed as free" in the
// docs — and then latency-benchmarked (3 timed requests each) to keep only
// the fast ones:
//   1. Sends `Access-Control-Allow-Origin` so browsers (web build) can call
//      it directly — native iOS/Android aren't affected by CORS at all, but
//      the web deploy is.
//   2. Actually answers the JSON-RPC methods this app calls (`status`,
//      `query`/call_function) without a provisioned API key.
//   3. Isn't dead/deprecated.
//   4. Responds fast and consistently (~0.4-0.6s in testing).
//
// Cut for failing one of those, keep the reason on record so nobody re-adds
// them on a hunch:
//   - rpc.testnet.near.org / rpc.mainnet.near.org: OFFICIALLY DEPRECATED.
//     Every request now returns a hardcoded 429 telling you to switch away,
//     and that response never carries an ACAO header — so on web this fails
//     CORS on every single call, forever, not just under load. This is what
//     produced the "blocked by CORS policy" error in production.
//   - 1RPC: sends CORS headers fine, but its gateway doesn't implement the
//     base `query`/`status`/`block` JSON-RPC methods at all (-32601 method
//     not found) — near-api-js can't use it for anything.
//   - Ankr, BlockPI, dRPC (mainnet only — its testnet endpoint is fine): all
//     return "Unauthorized / Apikey not found" without a paid key.
//   - Lava Network: free tier discontinued.
//   - Intear: works and has CORS, but bakes in a deliberate throttle without
//     an API key ("requests without an API key are being slowed down for one
//     second") — measured consistently at ~1.8-2s per call, 3-4x slower than
//     the others, and it even 429'd once mid-benchmark. Too slow to keep in
//     a "fast and efficient only" list; revisit only if we provision a paid
//     Intear API key.
export const TESTNET_RPC_ENDPOINTS: RpcEndpoint[] = [
    { url: "https://test.rpc.fastnear.com", label: "FastNEAR Testnet", priority: 1 },
    { url: "https://near-testnet.drpc.org", label: "dRPC Testnet", priority: 2 },
];

export const MAINNET_RPC_ENDPOINTS: RpcEndpoint[] = [
    { url: "https://free.rpc.fastnear.com", label: "FastNEAR Mainnet", priority: 1 },
    { url: "https://rpc.shitzuapes.xyz", label: "Shitzu Mainnet", priority: 2 },
];

export function getRpcEndpoints(network: "testnet" | "mainnet"): RpcEndpoint[] {
    return network === "testnet" ? TESTNET_RPC_ENDPOINTS : MAINNET_RPC_ENDPOINTS;
}

// Parent (funding) account IDs per network
export const FUNDING_ACCOUNTS = {
    testnet: {
        // Moved off sheda.testnet (2026-09-06) as part of a clean restart.
        // Wallets under the old .sheda.testnet namespace are abandoned rather
        // than migrated — see WALLET_EPOCH below.
        accountId: "shedauser.testnet",
        walletSuffix: ".shedauser.testnet",
    },
    mainnet: {
        accountId: "shedauser.near",
        walletSuffix: ".shedauser.near",
    },
} as const;

/**
 * Wallet generation counter. Bump this to make every device start fresh.
 *
 * WHAT IT DOES: wallet metadata is stamped with the epoch it was created
 * under. On launch, a stored wallet whose epoch is older than this constant is
 * detached — the app forgets the account pointer and offers wallet creation
 * again, exactly as it would for a new user.
 *
 * WHY IT EXISTS: the funding account moved from sheda.testnet to
 * shedauser.testnet, so every previously-issued *.sheda.testnet wallet now
 * belongs to a namespace the app no longer provisions under. Without this,
 * those users would keep reconnecting to old accounts forever and never see
 * the new flow, because the account pointer is keyed by email and persists
 * across app updates.
 *
 * WHAT IT DOES NOT DO: it never deletes key material. The seed phrase for an
 * abandoned wallet stays in secure storage, so anything that ended up in one
 * of those accounts is still recoverable by importing the phrase. Only the
 * "this is your current wallet" pointer is dropped. Detaching a wallet is
 * reversible; deleting its seed is not.
 *
 *   1 — original .sheda.testnet namespace
 *   2 — .shedauser.testnet namespace (current)
 */
export const WALLET_EPOCH = 2;

// ── Retry Configuration ─────────────────────────────────────────────────────

export const RETRY_CONFIG = {
    /** Maximum number of retries for RPC calls */
    maxRetries: 3,
    /** Initial delay in ms before first retry */
    initialDelayMs: 1000,
    /** Multiplier for exponential backoff */
    backoffMultiplier: 2,
    /** Maximum delay in ms */
    maxDelayMs: 10000,
} as const;

/**
 * Calculate delay for retry attempt using exponential backoff.
 * @param attempt 0-indexed retry attempt number
 */
export function getRetryDelay(attempt: number): number {
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
    // Add jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

// ── Username sanitization ───────────────────────────────────────────────────

/** Maximum length for the username prefix (before the suffix like .sheda.testnet) */
export const MAX_USERNAME_LENGTH = 32;

/**
 * Sanitize an email prefix into a valid NEAR sub-account name.
 *
 * Rules:
 * - Lowercase
 * - Only alphanumeric, hyphens, underscores
 * - Trim leading/trailing hyphens or underscores
 * - Max 32 characters
 */
export function sanitizeUsername(emailPrefix: string): string {
    let username = emailPrefix
        .toLowerCase()
        // Remove all characters that are NOT alphanumeric, hyphens, or underscores
        .replace(/[^a-z0-9\-_]/g, "")
        // Trim leading/trailing hyphens or underscores
        .replace(/^[-_]+|[-_]+$/g, "");

    // Enforce max length
    if (username.length > MAX_USERNAME_LENGTH) {
        username = username.slice(0, MAX_USERNAME_LENGTH);
        // Re-trim trailing hyphens/underscores after truncation
        username = username.replace(/[-_]+$/, "");
    }

    return username;
}

/**
 * Build a full NEAR account ID from a username and network.
 */
export function buildAccountId(
    username: string,
    network: "testnet" | "mainnet"
): string {
    return `${username}${FUNDING_ACCOUNTS[network].walletSuffix}`;
}
