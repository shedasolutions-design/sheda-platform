import { buildDealTimeline } from "@/utilities/dealTimeline";
import { BidStatus } from "@/types/contract";
import type { AppointmentStageShow } from "@/services/api";

/**
 * A deal lives in two places that never referred to each other: the bid,
 * escrow and agreement are on chain, the appointments are in the backend. The
 * buyer's money is locked the moment their bid is accepted, but the next
 * on-chain step waits on a real-world meeting the chain can't see — so a deal
 * progressing normally looked identical to one that had stalled.
 *
 * These cover the joining logic, which is where the two halves can disagree.
 */

const stage = (over: Partial<AppointmentStageShow> = {}): AppointmentStageShow => ({
  bid_id: 1,
  property_id: 7,
  appointments: [],
  ready_for_documents: false,
  viewing_not_agreed: false,
  ...over,
});

const stepState = (t: ReturnType<typeof buildDealTimeline>, step: string) =>
  t.steps.find((s) => s.step === step)?.state;

const current = (t: ReturnType<typeof buildDealTimeline>) =>
  t.steps.find((s) => s.state === "current");

describe("deal timeline", () => {
  it("does not run ahead of the chain when no viewing is booked", () => {
    const t = buildDealTimeline(BidStatus.Accepted, null);

    expect(stepState(t, "bid_accepted")).toBe("current");
    expect(stepState(t, "appointment_booked")).toBe("upcoming");
    expect(t.sellerCanReleaseDocuments).toBe(false);
  });

  it("advances to the viewing once one is booked, even though the chain still says Accepted", () => {
    const t = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 1 } as any] })
    );

    // The chain has no concept of appointments, so without the backend half
    // this deal would look stuck at "offer accepted" for as long as the
    // viewing takes to arrange.
    expect(stepState(t, "bid_accepted")).toBe("done");
    expect(stepState(t, "appointment_booked")).toBe("current");
  });

  it("only lets the seller release the agreement once a viewing is completed", () => {
    const booked = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 1 } as any] })
    );
    expect(booked.sellerCanReleaseDocuments).toBe(false);

    const done = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 1 } as any], ready_for_documents: true })
    );
    expect(done.sellerCanReleaseDocuments).toBe(true);
  });

  it("never moves backwards when the seller skipped logging the viewing", () => {
    // Agreement already sent on chain, but no appointment was ever recorded.
    // Taking the backend's word alone would rewind the timeline to "viewing".
    const t = buildDealTimeline(BidStatus.DocsReleased, null);

    expect(stepState(t, "appointment_booked")).toBe("done");
    expect(stepState(t, "agreement_sent")).toBe("current");
  });

  it("names who each in-progress step is waiting on", () => {
    // "In progress" with no owner is what left both sides unable to tell
    // progress from a stall.
    const waitingOnSeller = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 1 } as any], ready_for_documents: true })
    );
    expect(current(waitingOnSeller)?.waitingOn).toBe("seller");

    const waitingOnBuyer = buildDealTimeline(BidStatus.DocsReleased, null);
    expect(current(waitingOnBuyer)?.waitingOn).toBe("buyer");
  });

  it("lets the buyer cancel right up until they accept the agreement", () => {
    // No deadline while merely accepted: appointments fall through for reasons
    // the chain can't see, and none should cost the buyer their money.
    expect(buildDealTimeline(BidStatus.Accepted, null).buyerCanCancel).toBe(true);
    expect(buildDealTimeline(BidStatus.DocsReleased, null).buyerCanCancel).toBe(true);
  });

  it("closes the buyer's exit once the agreement is accepted", () => {
    // Accepting the agreement is the commitment the seller relies on when
    // handing the document over. If this ever returns true, the contract-side
    // invariant has been broken too.
    expect(buildDealTimeline(BidStatus.DocsConfirmed, null).buyerCanCancel).toBe(
      false
    );
    expect(
      buildDealTimeline(BidStatus.PaymentReleased, null).buyerCanCancel
    ).toBe(false);
    expect(buildDealTimeline(BidStatus.Completed, null).buyerCanCancel).toBe(false);
  });

  it("surfaces a viewing that ended in no agreement", () => {
    const t = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 1 } as any], viewing_not_agreed: true })
    );

    // Distinct from a cancelled appointment: the parties met and didn't agree,
    // so the buyer should be told plainly rather than left guessing.
    expect(t.viewingNotAgreed).toBe(true);
    expect(t.buyerCanCancel).toBe(true);
    expect(t.sellerCanReleaseDocuments).toBe(false);
  });

  it("surfaces the viewing awaiting an outcome, so the gate can be satisfied", () => {
    // Recording the outcome is what flips ready_for_documents. Without an id
    // to act on, the seller would face a disabled "Release Documents" with no
    // way to satisfy it.
    const t = buildDealTimeline(
      BidStatus.Accepted,
      stage({ appointments: [{ id: 42, status: "confirmed" } as any] })
    );
    expect(t.pendingAppointmentId).toBe(42);
  });

  it("stops offering an outcome once the viewing has one", () => {
    const t = buildDealTimeline(
      BidStatus.Accepted,
      stage({
        appointments: [{ id: 42, status: "completed" } as any],
        ready_for_documents: true,
      })
    );
    expect(t.pendingAppointmentId).toBeNull();
    expect(t.sellerCanReleaseDocuments).toBe(true);
  });

  it("marks a cancelled deal and offers no further actions", () => {
    const t = buildDealTimeline(BidStatus.Cancelled, null);

    expect(t.steps.some((s) => s.step === "cancelled" && s.state === "done")).toBe(
      true
    );
    expect(t.buyerCanCancel).toBe(false);
    expect(t.sellerCanReleaseDocuments).toBe(false);
  });
});
