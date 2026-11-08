// @ts-nocheck — Test file
//
// A deal's backend property row has to be findable no matter where the
// property sits in the feed.
//
// The transaction list used to read its backend rows out of the marketplace
// feed, which is a single page of twenty rows from the lowest backend id
// upwards. Whether a property falls inside those twenty rows has nothing to do
// with whether someone is mid-deal on it, so deals regularly resolved to no
// backend row — and booking a viewing and releasing documents both need the
// backend's numeric property id, so both refused outright with "Property
// Details Unavailable" on a deal that was otherwise perfectly valid.
// Refreshing could never fix it: the feed returned the same page again.
import { resolveBackendProperties } from "@/services/backendPropertyLookup";

/** A backend property row, keyed to an on-chain id. */
const row = (backendId, chainId) => ({
  id: backendId,
  agent_id: 7,
  title: `Property ${backendId}`,
  blockchain_property_id: String(chainId),
});

/**
 * A stand-in for the real feed: `WHERE id >= cursor LIMIT n`, returning
 * `next_coursor` exactly as the backend does (typo included).
 */
function makeFeed(rows, { failAfter = Infinity } = {}) {
  const calls = [];
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const fetchPage = async (limit, cursor) => {
    calls.push({ limit, cursor });
    if (calls.length > failAfter) return { ok: false };
    const page = sorted.filter((r) => r.id >= cursor).slice(0, limit);
    const last = page[page.length - 1];
    return { ok: true, data: { data: page, next_coursor: last ? last.id + 1 : null } };
  };
  return { fetchPage, calls };
}

describe("resolving a deal's backend property row", () => {
  it("finds a property that sits well past the first page", async () => {
    // Chain ids are offset well clear of backend ids so the two spaces cannot
    // be confused for one another — the whole point of the lookup.
    const rows = Array.from({ length: 300 }, (_, i) => row(i + 1, i + 1001));
    // The one we want: chain id 90, living at backend id 250, three pages in.
    rows[249] = row(250, 90);
    const { fetchPage, calls } = makeFeed(rows);
    const cache = {};

    await resolveBackendProperties(new Set([90]), cache, fetchPage, 100, 20);

    expect(cache[90]).toBeTruthy();
    expect(cache[90].id).toBe(250);
    // It had to walk to get there — this is the case the old code could not do.
    expect(calls.length).toBeGreaterThan(1);
  });

  it("does not call the feed at all when the row is already cached", async () => {
    const { fetchPage, calls } = makeFeed([row(1, 1)]);
    const cache = { 1: row(1, 1) };

    await resolveBackendProperties(new Set([1]), cache, fetchPage);

    expect(calls).toHaveLength(0);
  });

  it("stops as soon as every needed id is found", async () => {
    // Everything needed is on page one, so page two must never be requested.
    const rows = Array.from({ length: 500 }, (_, i) => row(i + 1, i + 1));
    const { fetchPage, calls } = makeFeed(rows);

    await resolveBackendProperties(new Set([3, 9]), {}, fetchPage, 100, 20);

    expect(calls).toHaveLength(1);
  });

  it("records a genuinely absent property as null, so it is not hunted again", async () => {
    // Chain id 4242 was minted on-chain and never listed through the app.
    const rows = Array.from({ length: 50 }, (_, i) => row(i + 1, i + 1));
    const first = makeFeed(rows);
    const cache = {};

    await resolveBackendProperties(new Set([4242]), cache, first.fetchPage, 100, 20);
    expect(cache).toHaveProperty("4242", null);
    const spentLookingOnce = first.calls.length;
    expect(spentLookingOnce).toBeGreaterThan(0);

    // Second pass over the same cache must not touch the feed again.
    const second = makeFeed(rows);
    await resolveBackendProperties(new Set([4242]), cache, second.fetchPage, 100, 20);
    expect(second.calls).toHaveLength(0);
  });

  it("never exceeds its page ceiling", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => row(i + 1, i + 1));
    const { fetchPage, calls } = makeFeed(rows);

    await resolveBackendProperties(new Set([999_999]), {}, fetchPage, 100, 5);

    expect(calls).toHaveLength(5);
  });

  it("gives up quietly when a page fails rather than failing the deal list", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i + 1, i + 1));
    const { fetchPage } = makeFeed(rows, { failAfter: 1 });
    const cache = {};

    await expect(
      resolveBackendProperties(new Set([480]), cache, fetchPage, 10, 20)
    ).resolves.toBeUndefined();
    expect(cache).toHaveProperty("480", null);
  });

  it("stops instead of looping when the cursor stops advancing", async () => {
    // A feed that always answers with the same cursor would otherwise be
    // re-read until the page ceiling, doing nothing each time.
    const calls = [];
    const stuck = async (limit, cursor) => {
      calls.push(cursor);
      return { ok: true, data: { data: [row(1, 1)], next_coursor: 1 } };
    };

    await resolveBackendProperties(new Set([77]), {}, stuck, 100, 20);

    expect(calls).toHaveLength(1);
  });
});
