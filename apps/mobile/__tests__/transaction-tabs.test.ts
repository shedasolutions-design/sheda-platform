// @ts-nocheck — Test file
//
// The four history tabs must partition the transaction list: every deal in
// exactly one bucket.
//
// PAYMENT_RELEASED used to satisfy both `ongoing` and `completed`, so the same
// deal rendered twice — once in Ongoing with the "Complete" button that
// finishes it, once in Active without it — reading as two different deals in
// two different states.
import {
  partitionTransactions,
  isClosedPhase,
  TransactionPhase,
} from "@/types/transaction";
import { Action } from "@/types/contract";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const ALL_PHASES = Object.values(TransactionPhase);

function tx(phase, over = {}) {
  return {
    key: `${phase}-${over.expiresAt ?? "none"}`,
    phase,
    role: "buyer",
    updatedAt: NOW,
    bid: { id: 1, property_id: 1, action: Action.Purchase },
    property: {},
    propertyDetails: null,
    ...over,
  };
}

function bucketsFor(transaction) {
  const tabs = partitionTransactions([transaction], NOW);
  return Object.entries(tabs)
    .filter(([, list]) => list.length > 0)
    .map(([name]) => name);
}

describe("history tab partition", () => {
  it("puts every phase in exactly one tab", () => {
    for (const phase of ALL_PHASES) {
      expect(bucketsFor(tx(phase))).toHaveLength(1);
    }
  });

  it("puts every phase in exactly one tab when a lease has expired too", () => {
    for (const phase of ALL_PHASES) {
      expect(bucketsFor(tx(phase, { expiresAt: NOW - DAY }))).toHaveLength(1);
    }
  });

  it("loses nothing: the buckets add up to the input", () => {
    const all = ALL_PHASES.flatMap((phase) => [
      tx(phase),
      tx(phase, { expiresAt: NOW - DAY }),
      tx(phase, { expiresAt: NOW + DAY }),
    ]);
    const { ongoing, completed, expired, cancelled } = partitionTransactions(all, NOW);
    expect(
      ongoing.length + completed.length + expired.length + cancelled.length
    ).toBe(all.length);
  });
});

describe("PAYMENT_RELEASED placement", () => {
  it("stays in Ongoing, the only tab whose card can complete the deal", () => {
    expect(bucketsFor(tx(TransactionPhase.PAYMENT_RELEASED))).toEqual(["ongoing"]);
  });

  it("moves to Expired once the lease term has also run out", () => {
    // That's where the seller's reclaim action lives.
    expect(
      bucketsFor(tx(TransactionPhase.PAYMENT_RELEASED, { expiresAt: NOW - DAY }))
    ).toEqual(["expired"]);
  });
});

describe("COMPLETED placement", () => {
  it("goes to Active while the lease is still inside its term", () => {
    expect(
      bucketsFor(tx(TransactionPhase.COMPLETED, { expiresAt: NOW + DAY }))
    ).toEqual(["completed"]);
  });

  it("goes to Active for a purchase, which never expires", () => {
    expect(bucketsFor(tx(TransactionPhase.COMPLETED))).toEqual(["completed"]);
  });

  it("goes to Expired once the lease term has run out", () => {
    expect(
      bucketsFor(tx(TransactionPhase.COMPLETED, { expiresAt: NOW - DAY }))
    ).toEqual(["expired"]);
  });
});

describe("lease renewal bids", () => {
  it("keeps a renewal bid in Ongoing even though it carries a past expiry", () => {
    // A renewal bid sits at BID_PENDING while carrying the *outgoing* lease's
    // end_time as expiresAt. Filtering on expiry alone would drop it out of
    // Ongoing — and out of every other tab, since Expired needs a closed
    // phase — taking the seller's "Accept Renewal" button with it and
    // stranding the tenant's escrowed renewal payment.
    expect(
      bucketsFor(tx(TransactionPhase.BID_PENDING, { expiresAt: NOW - DAY }))
    ).toEqual(["ongoing"]);
  });

  it("keeps mid-pipeline phases in Ongoing regardless of expiry", () => {
    const midPipeline = [
      TransactionPhase.BID_ACCEPTED,
      TransactionPhase.APPOINTMENT_BOOKED,
      TransactionPhase.APPOINTMENT_ACCEPTED,
      TransactionPhase.DOCS_RELEASED,
      TransactionPhase.DOCS_CONFIRMED,
    ];
    for (const phase of midPipeline) {
      expect(bucketsFor(tx(phase, { expiresAt: NOW - DAY }))).toEqual(["ongoing"]);
    }
  });
});

describe("isClosedPhase — what seller revenue is summed over", () => {
  // Revenue must follow the escrow, not the tab. Funds reach the seller at
  // release_escrow (PAYMENT_RELEASED); complete_transaction is bookkeeping
  // after it. SellerActivities sums this predicate over the full transaction
  // list rather than over the Active tab, so a paid-out deal is counted before
  // it's finalized and a lease stays counted after its term ends.
  it("counts a deal whose escrow has been released", () => {
    expect(isClosedPhase(tx(TransactionPhase.PAYMENT_RELEASED))).toBe(true);
  });

  it("counts a completed deal", () => {
    expect(isClosedPhase(tx(TransactionPhase.COMPLETED))).toBe(true);
  });

  it("still counts a lease whose term has ended", () => {
    // This one lives in the Expired tab, not Active — summing `completed`
    // silently erased collected rent the moment a lease ran out.
    const endedLease = tx(TransactionPhase.COMPLETED, { expiresAt: NOW - DAY });
    expect(bucketsFor(endedLease)).toEqual(["expired"]);
    expect(isClosedPhase(endedLease)).toBe(true);
  });

  it("does not count money that has not been released yet", () => {
    for (const phase of [
      TransactionPhase.BID_PENDING,
      TransactionPhase.BID_ACCEPTED,
      TransactionPhase.DOCS_RELEASED,
      TransactionPhase.DOCS_CONFIRMED,
      TransactionPhase.BID_REJECTED,
      TransactionPhase.CANCELLED,
      TransactionPhase.DISPUTED,
    ]) {
      expect(isClosedPhase(tx(phase))).toBe(false);
    }
  });

  it("never counts the same deal as both collected and pending", () => {
    // PAYMENT_RELEASED sits in `ongoing` until it is completed, so the pending
    // bucket has to exclude settled deals or it double-counts them.
    const settled = tx(TransactionPhase.PAYMENT_RELEASED);
    expect(bucketsFor(settled)).toEqual(["ongoing"]);
    expect(isClosedPhase(settled)).toBe(true);

    const { ongoing } = partitionTransactions([settled], NOW);
    expect(ongoing.filter((t) => !isClosedPhase(t))).toHaveLength(0);
  });
});

describe("closed-without-completing placement", () => {
  it("routes rejected, cancelled and disputed to the Cancelled tab", () => {
    for (const phase of [
      TransactionPhase.BID_REJECTED,
      TransactionPhase.CANCELLED,
      TransactionPhase.DISPUTED,
    ]) {
      expect(bucketsFor(tx(phase))).toEqual(["cancelled"]);
      // Even a disputed lease past its term stays under Cancelled — escrow is
      // frozen, so there is nothing to reclaim.
      expect(bucketsFor(tx(phase, { expiresAt: NOW - DAY }))).toEqual(["cancelled"]);
    }
  });
});
