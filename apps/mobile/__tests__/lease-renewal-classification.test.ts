// @ts-nocheck — Test file with Jest mocks
//
// A seller was offered "Accept Renewal" for a tenant who had no live lease,
// and pressing it failed asking for an attached deposit.
//
// The contract leaves active_lease in place — still flagged active: true —
// after end_time passes. It is only cleared by expire_lease, which nobody is
// obliged to call. So "a lease record exists" is not the same question as "this
// property is currently leased", and treating it as such means that once a
// tenant's lease lapses, every future bid they place on that property is
// classified as a renewal forever.

/** Mirrors the leaseStillRunning / isRenewalBid logic in OngoingCard. */
function classify(bid: any, property: any, now = Date.now()): "renewal" | "new" {
  const lease = property.active_lease;
  const leaseStillRunning =
    !!lease &&
    lease.active !== false &&
    (lease.end_time == null || Number(lease.end_time) / 1e6 > now);

  return bid.action === "Lease" &&
    leaseStillRunning &&
    lease.tenant_id === bid.bidder_id
    ? "renewal"
    : "new";
}

const NOW = Date.UTC(2026, 8, 14);
const ns = (ms: number) => ms * 1e6;

const tenant = "shedasolutionn32mm6.testnet";
const leaseBid = { action: "Lease", bidder_id: tenant };

describe("a genuinely running lease", () => {
  it("makes the sitting tenant's new lease bid a renewal", () => {
    const property = {
      active_lease: {
        tenant_id: tenant,
        active: true,
        end_time: ns(NOW + 30 * 864e5),
      },
    };
    expect(classify(leaseBid, property, NOW)).toBe("renewal");
  });

  it("does not make someone else's bid a renewal", () => {
    const property = {
      active_lease: {
        tenant_id: tenant,
        active: true,
        end_time: ns(NOW + 30 * 864e5),
      },
    };
    expect(
      classify({ action: "Lease", bidder_id: "someone-else.testnet" }, property, NOW)
    ).toBe("new");
  });

  it("does not apply to a purchase", () => {
    const property = {
      active_lease: { tenant_id: tenant, active: true, end_time: ns(NOW + 864e5) },
    };
    expect(classify({ action: "Purchase", bidder_id: tenant }, property, NOW)).toBe("new");
  });
});

describe("a lease that has run out", () => {
  it("is a NEW bid, even though the contract still flags it active", () => {
    // The exact shape that caused the bug: end_time in the past, active still
    // true because expire_lease was never called.
    const property = {
      active_lease: {
        tenant_id: tenant,
        active: true,
        end_time: ns(NOW - 864e5),
      },
    };
    expect(classify(leaseBid, property, NOW)).toBe("new");
  });

  it("is a new bid however long ago it lapsed", () => {
    const property = {
      active_lease: {
        tenant_id: tenant,
        active: true,
        end_time: ns(NOW - 365 * 864e5),
      },
    };
    expect(classify(leaseBid, property, NOW)).toBe("new");
  });
});

describe("a lease the contract has closed", () => {
  it("is a new bid even with end_time in the future", () => {
    // active: false is the contract's own word for "not leased any more", and
    // it outranks a date the lease never ran to.
    const property = {
      active_lease: {
        tenant_id: tenant,
        active: false,
        end_time: ns(NOW + 30 * 864e5),
      },
    };
    expect(classify(leaseBid, property, NOW)).toBe("new");
  });
});

describe("missing data", () => {
  it("treats no lease at all as a new bid", () => {
    expect(classify(leaseBid, { active_lease: null }, NOW)).toBe("new");
  });

  it("trusts `active` when the contract gives no end_time", () => {
    // Inventing an expiry the contract never stated would break real renewals,
    // which is a worse failure than the one being fixed.
    const property = { active_lease: { tenant_id: tenant, active: true } };
    expect(classify(leaseBid, property, NOW)).toBe("renewal");
  });
});
