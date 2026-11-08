/**
 * RPC endpoint health tracking.
 *
 * The public testnet RPCs are shared and rate-limited, and a 429 from them is
 * uniquely nasty in the browser: the error response carries no
 * `Access-Control-Allow-Origin` header, so the request surfaces as "blocked by
 * CORS policy" rather than "you are being throttled". Chasing the CORS message
 * leads nowhere — the fix is always to make fewer requests.
 *
 * This module remembers which endpoints are currently throttled or unreachable
 * so callers stop sending traffic at them. Without it, every retry and every
 * re-initialisation went back to the first endpoint in the list, which is
 * precisely the one that had just rejected us.
 *
 * Module-level state on purpose: nearContract and nearWallet issue requests to
 * the same shared endpoints, so what one learns the other should not have to
 * rediscover.
 */

import { getRpcEndpoints } from "@/config/walletConfig";

type Network = "testnet" | "mainnet";

/** How long to stop using an endpoint that rate-limited us. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** How long to stop using an endpoint that failed for any other reason. */
const FAILURE_COOLDOWN_MS = 15_000;

/** endpoint url -> timestamp (ms) it becomes usable again */
const cooldowns = new Map<string, number>();

const key = (network: Network, index: number) => {
    const endpoints = getRpcEndpoints(network);
    return endpoints[index % endpoints.length]?.url ?? `${network}:${index}`;
};

/** True while this endpoint is being rested. */
export function isCoolingDown(network: Network, index: number): boolean {
    const until = cooldowns.get(key(network, index));
    if (until === undefined) return false;
    if (Date.now() >= until) {
        cooldowns.delete(key(network, index));
        return false;
    }
    return true;
}

/**
 * Rest an endpoint. Rate limits get a longer cooldown than ordinary failures —
 * a throttled endpoint stays throttled for a while, and retrying it early is
 * what turns one 429 into a sustained storm.
 */
export function markEndpointUnhealthy(
    network: Network,
    index: number,
    reason: "rate-limited" | "failed"
): void {
    const cooldown =
        reason === "rate-limited" ? RATE_LIMIT_COOLDOWN_MS : FAILURE_COOLDOWN_MS;
    cooldowns.set(key(network, index), Date.now() + cooldown);
}

/** Clear an endpoint's cooldown after a successful response. */
export function markEndpointHealthy(network: Network, index: number): void {
    cooldowns.delete(key(network, index));
}

/**
 * Pick the next endpoint to try, starting at `from` and preferring any that
 * isn't cooling down. Falls back to `from` when every endpoint is resting, so
 * callers always get something to try rather than failing outright — a stale
 * cooldown must never make the app permanently offline.
 */
export function pickEndpointIndex(network: Network, from: number = 0): number {
    const endpoints = getRpcEndpoints(network);
    if (endpoints.length === 0) return 0;

    for (let offset = 0; offset < endpoints.length; offset++) {
        const index = (from + offset) % endpoints.length;
        if (!isCoolingDown(network, index)) return index;
    }
    return from % endpoints.length;
}

/** True when the error is the RPC telling us to slow down. */
export function isRateLimitError(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes("429") ||
        m.includes("too many requests") ||
        m.includes("rate limit") ||
        // A 429 from these endpoints arrives without CORS headers, so the
        // browser reports it as a CORS/network failure and the status code
        // never reaches us. Treat those as throttling too: backing off is the
        // right response either way, and hammering on is never correct.
        m.includes("cors") ||
        m.includes("failed to fetch") ||
        m.includes("load failed") ||
        m.includes("network request failed")
    );
}

/**
 * True when we never got an answer out of the chain — a timeout, a dropped
 * connection, or a throttle — as opposed to the contract answering with an
 * error of its own.
 *
 * Callers use this to decide whether a fallback query is worth attempting: a
 * contract-side fault often has a workaround (query it a different way), while
 * a dead or rate-limited connection does not, and retrying it a different way
 * just adds load to an endpoint already refusing us.
 */
export function isTransportError(message: string): boolean {
    if (isRateLimitError(message)) return true;
    const m = message.toLowerCase();
    return (
        m.includes("err_rpc_timeout") ||
        m.includes("timeout") ||
        m.includes("timed out") ||
        m.includes("econnrefused") ||
        m.includes("econnreset") ||
        m.includes("enotfound") ||
        m.includes("enetunreach") ||
        m.includes("epipe") ||
        m.includes("fetch failed") ||
        m.includes("network")
    );
}

/** Test seam — drops all recorded cooldowns. */
export function resetRpcHealth(): void {
    cooldowns.clear();
}
