import Constants from "expo-constants";

/**
 * Which backend the app talks to, and what to do when it stops answering.
 *
 * There are two deployments — Cloudflare Workers and Render — sharing one
 * database. Sharing the database is what makes this safe: the same accounts,
 * listings and appointments are visible either way, so moving between them is
 * a change of route, not a change of world.
 *
 * Cloudflare is primary because it is consistently faster and does not cold
 * start. Render is kept as the way back: if Cloudflare stops answering, the
 * app keeps working instead of showing everyone an error.
 */

const PRIMARY =
  Constants.expoConfig?.extra?.apiUrl ?? "https://sheda.peni.dev";

const FALLBACK =
  Constants.expoConfig?.extra?.apiUrlFallback ??
  "https://sheda-backend-1.onrender.com";

/** Every base worth trying, best first, with duplicates collapsed. */
export const API_BASES: string[] = [...new Set([PRIMARY, FALLBACK])].filter(Boolean);

/**
 * How long a base stays benched after it fails.
 *
 * Long enough that a hard outage does not cost a timeout on every single
 * request, short enough that recovery is picked up without a restart.
 */
const COOLDOWN_MS = 60_000;

const benchedUntil: Record<string, number> = {};

/** The base to send the next request to. */
export function activeBase(now: number = Date.now()): string {
  for (const base of API_BASES) {
    if (!(benchedUntil[base] > now)) return base;
  }
  // Everything is benched, so the outage is probably not the backend's fault
  // — a phone with no signal benches every base in turn. Keep using the
  // preferred one rather than pinning to whichever failed least recently.
  return API_BASES[0];
}

/** A base that is not currently benched, other than the one given. */
export function alternateBase(to: string, now: number = Date.now()): string | null {
  for (const base of API_BASES) {
    if (base !== to && !(benchedUntil[base] > now)) return base;
  }
  return null;
}

/**
 * Record that a base could not be reached.
 *
 * Only for transport-level failures and gateway errors — the backend being
 * unreachable or broken. A 404 or a 422 is the backend working correctly and
 * disagreeing with us, which says nothing about its health.
 */
export function reportDown(base: string, now: number = Date.now()): void {
  benchedUntil[base] = now + COOLDOWN_MS;
}

/** Record that a base answered, clearing any bench early. */
export function reportUp(base: string): void {
  delete benchedUntil[base];
}

/** Whether a gateway-level status means "this backend is unhealthy". */
export function isUnhealthyStatus(status: number): boolean {
  // 502/503/504 are the edge saying it could not reach or get a timely answer
  // from the app behind it. 500 is deliberately excluded: an application bug
  // raises 500 on both deployments, since they run the same code, so failing
  // over would just pay a second round trip for the same error.
  return status === 502 || status === 503 || status === 504;
}

/**
 * Whether a failed request may be retried against a different backend.
 *
 * Reads only. A write that failed at the transport layer may still have been
 * applied — a timeout says the answer never arrived, not that nothing
 * happened — and both deployments write to the same database, so retrying a
 * POST elsewhere risks a second bid, a second appointment, a second listing.
 * A failed write is reported instead; the next request picks the healthy base
 * from the start, which is where the recovery actually belongs.
 */
export function mayRetryAcrossBases(method: string | undefined): boolean {
  const verb = (method || "GET").toUpperCase();
  return verb === "GET" || verb === "HEAD";
}

/** For tests: forget every bench. */
export function resetEndpointHealth(): void {
  for (const key of Object.keys(benchedUntil)) delete benchedUntil[key];
}
