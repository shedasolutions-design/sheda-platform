import type { PropertyShow } from "./api";

/**
 * Finding a deal's backend property row from its on-chain property id.
 *
 * These are two different id spaces. The chain knows a property by the id the
 * contract minted it under; the backend knows it by its own primary key, and
 * stores the chain's id alongside as `blockchain_property_id`. Anything that
 * talks to the backend about a property — booking a viewing, releasing
 * documents — needs the backend's id, and all a deal carries is the chain's.
 *
 * The backend exposes no lookup by `blockchain_property_id`, which is why this
 * has to walk the feed. Adding one endpoint would replace the whole file with
 * a single request; until then, this keeps the walk bounded and remembers what
 * it has already learned.
 */

/** One page of the backend property feed, as `getProperties` returns it. */
export type PropertyPageFetch = (
  limit: number,
  cursor: number
) => Promise<
  | { ok: true; data?: { data?: PropertyShow[]; next_coursor?: number } }
  | { ok: false }
>;

/** On-chain property id → backend row, or `null` for "looked, there is none". */
export type BackendPropertyCache = Record<number, PropertyShow | null>;

/** How many rows to ask for per page while hunting for a specific property. */
export const BACKEND_PROP_PAGE_SIZE = 100;
/** Ceiling on the hunt, so a large marketplace cannot become an endless crawl. */
export const BACKEND_PROP_MAX_PAGES = 20;

/**
 * One cache per network, shared by every caller.
 *
 * Wallet, History and Activity all mount the transactions hook, so a cache
 * held per hook instance would send three copies of the same walk on the first
 * load. The mapping it holds — on-chain property id to backend row — is a
 * property of the data, not of the screen asking, so there is no reason for
 * each screen to discover it separately.
 *
 * Keyed by network because the two chains number their properties
 * independently: property 5 on testnet and property 5 on mainnet are unrelated
 * listings, and a single cache would hand one screen the other's row.
 */
const sharedCaches: Record<string, BackendPropertyCache> = {};

export function getBackendPropertyCache(network: string): BackendPropertyCache {
  if (!sharedCaches[network]) sharedCaches[network] = {};
  return sharedCaches[network];
}

/** Drop what has been learned — for tests, and for a full account reset. */
export function clearBackendPropertyCache(network?: string): void {
  if (network) delete sharedCaches[network];
  else for (const key of Object.keys(sharedCaches)) delete sharedCaches[key];
}

/**
 * Fill in the backend row for every on-chain property id a deal list needs.
 *
 * The marketplace feed is one page — twenty rows from the lowest backend id
 * upwards — and the transaction list used to take its backend rows from
 * whatever that page happened to contain. Whether a property sits in the first
 * twenty rows has nothing to do with whether someone is mid-deal on it, so
 * deals routinely resolved to no backend row at all.
 *
 * That is not cosmetic: booking a viewing and releasing documents both refuse
 * outright without the backend id, on a deal that is otherwise perfectly
 * valid, and refreshing cannot help because the feed returns the same page
 * again.
 *
 * Ids with no row anywhere are recorded as `null` rather than left unknown, so
 * a later pass does not search all over again for something that does not
 * exist — a property minted on chain but never listed through the app has no
 * row and never will.
 *
 * Mutates `cache` in place and resolves once every needed id has an entry.
 */
export async function resolveBackendProperties(
  neededChainIds: Set<number>,
  cache: BackendPropertyCache,
  fetchPage: PropertyPageFetch,
  pageSize: number = BACKEND_PROP_PAGE_SIZE,
  maxPages: number = BACKEND_PROP_MAX_PAGES
): Promise<void> {
  const ids = [...neededChainIds];
  const isMissing = (id: number) => cache[id] === undefined;
  if (!ids.some(isMissing)) return;

  let cursor = 1;
  for (let page = 0; page < maxPages; page++) {
    if (!ids.some(isMissing)) break;

    let res;
    try {
      res = await fetchPage(pageSize, cursor);
    } catch {
      break; // A failed page is not worth failing the whole deal list over.
    }
    if (!res?.ok) break;

    const rows = res.data?.data ?? [];
    for (const row of rows) {
      if (row?.blockchain_property_id) {
        cache[Number(row.blockchain_property_id)] = row;
      }
    }

    const next = res.data?.next_coursor;
    // No next cursor, an empty page, or a cursor that fails to advance all
    // mean the feed is exhausted. The last of those matters most: without it,
    // a stuck cursor re-reads the same rows `maxPages` times.
    if (!next || rows.length === 0 || next <= cursor) break;
    cursor = next;
  }

  for (const id of ids) {
    if (isMissing(id)) cache[id] = null;
  }
}
