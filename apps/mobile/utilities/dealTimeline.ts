import type { AppointmentStageShow } from "@/services/api";
import { BidStatus } from "@/types/contract";

/**
 * One continuous view of a deal, across both halves of the system.
 *
 * A deal lives in two places that never referred to each other. The bid, the
 * escrow and the agreement NFT are on chain; the appointments are in the
 * backend. The buyer's money is locked from the moment their bid is accepted,
 * but the next on-chain step — the seller releasing the agreement — waits on a
 * real-world meeting the chain can't see.
 *
 * So a deal that was progressing normally looked exactly like one that had
 * stalled, from either side. This joins them so both parties can see where
 * things actually stand and what they're waiting for.
 */

export type DealStep =
  | "bid_placed"
  | "bid_accepted"
  | "appointment_booked"
  | "appointment_completed"
  | "agreement_sent"
  | "agreement_accepted"
  | "payment_released"
  | "cancelled";

export interface DealTimelineStep {
  step: DealStep;
  label: string;
  /** Done, in progress, or not reached yet. */
  state: "done" | "current" | "upcoming";
  /** Who the deal is waiting on, when this is the current step. */
  waitingOn?: "buyer" | "seller" | "both";
  detail?: string;
}

export interface DealTimeline {
  steps: DealTimelineStep[];
  /** True while the buyer can still walk away and be refunded. */
  buyerCanCancel: boolean;
  /** True once the seller may release the agreement. */
  sellerCanReleaseDocuments: boolean;
  /** The parties met and didn't agree. */
  viewingNotAgreed: boolean;
  /**
   * The viewing still awaiting an outcome, if there is one.
   *
   * Surfaced so the parties can record what the meeting produced — the signal
   * that unblocks the agreement. Without it `ready_for_documents` can never
   * become true and the deal sits at the viewing step indefinitely.
   */
  pendingAppointmentId: number | null;
  loading: boolean;
  /** Set only when the stage genuinely failed to load, not when absent. */
  error: string | null;
}

const LABELS: Record<DealStep, string> = {
  bid_placed: "Offer placed",
  bid_accepted: "Offer accepted",
  appointment_booked: "Viewing booked",
  appointment_completed: "Viewing completed",
  agreement_sent: "Agreement sent",
  agreement_accepted: "Agreement accepted",
  payment_released: "Payment released",
  cancelled: "Cancelled",
};

const ORDER: DealStep[] = [
  "bid_placed",
  "bid_accepted",
  "appointment_booked",
  "appointment_completed",
  "agreement_sent",
  "agreement_accepted",
  "payment_released",
];

/**
 * How far the on-chain half has got.
 *
 * Deliberately does not try to infer the appointment steps — those come from
 * the backend, and guessing them from bid status is what produced a timeline
 * that disagreed with itself.
 */
function reachedFromBidStatus(status: BidStatus | string): DealStep {
  switch (status) {
    case BidStatus.Cancelled:
    case BidStatus.Rejected:
      return "cancelled";
    case BidStatus.Completed:
    case BidStatus.PaymentReleased:
      return "payment_released";
    case BidStatus.DocsConfirmed:
      return "agreement_accepted";
    case BidStatus.DocsReleased:
      return "agreement_sent";
    case BidStatus.Accepted:
      return "bid_accepted";
    default:
      return "bid_placed";
  }
}

export function buildDealTimeline(
  bidStatus: BidStatus | string,
  stage: AppointmentStageShow | null
): Omit<DealTimeline, "loading" | "error"> {
  const reached = reachedFromBidStatus(bidStatus);
  const cancelled = reached === "cancelled";

  const hasAppointment = (stage?.appointments?.length ?? 0) > 0;
  const readyForDocuments = stage?.ready_for_documents ?? false;
  const viewingNotAgreed = stage?.viewing_not_agreed ?? false;

  // The chain only knows the bid was accepted; how far past that the deal has
  // got depends on the backend. Take whichever is further along, so a seller
  // who released the agreement without logging the viewing doesn't make the
  // timeline appear to go backwards.
  const onChainIndex = ORDER.indexOf(reached);
  let appointmentIndex = -1;
  if (readyForDocuments) appointmentIndex = ORDER.indexOf("appointment_completed");
  else if (hasAppointment) appointmentIndex = ORDER.indexOf("appointment_booked");

  const reachedIndex = Math.max(onChainIndex, appointmentIndex);

  const steps: DealTimelineStep[] = ORDER.map((step, index) => {
    if (cancelled) {
      return {
        step,
        label: LABELS[step],
        state: index <= onChainIndex ? "done" : "upcoming",
      };
    }

    if (index < reachedIndex) {
      return { step, label: LABELS[step], state: "done" };
    }
    if (index > reachedIndex) {
      return { step, label: LABELS[step], state: "upcoming" };
    }

    // The current step — say who it's waiting on, because "in progress" on its
    // own is what left people unable to tell progress from a stall.
    let waitingOn: DealTimelineStep["waitingOn"];
    let detail: string | undefined;
    switch (step) {
      case "bid_accepted":
        waitingOn = "both";
        detail = "Book a viewing to move this forward.";
        break;
      case "appointment_booked":
        waitingOn = "both";
        detail = "Waiting for the viewing to take place.";
        break;
      case "appointment_completed":
        waitingOn = "seller";
        detail = "Waiting for the seller to send the agreement.";
        break;
      case "agreement_sent":
        waitingOn = "buyer";
        detail = "Review the agreement and accept or reject it.";
        break;
      case "agreement_accepted":
        waitingOn = "buyer";
        detail = "Waiting for payment to be released.";
        break;
      default:
        break;
    }

    return { step, label: LABELS[step], state: "current", waitingOn, detail };
  });

  if (cancelled) {
    steps.push({ step: "cancelled", label: LABELS.cancelled, state: "done" });
  }

  return {
    steps,
    // The buyer can walk away right up until they accept the agreement. While
    // the bid is merely accepted there is no deadline at all — appointments
    // fall through for reasons the chain can't see, and none of them should
    // cost the buyer their money.
    buyerCanCancel:
      !cancelled &&
      (bidStatus === BidStatus.Accepted || bidStatus === BidStatus.DocsReleased),
    sellerCanReleaseDocuments:
      !cancelled && bidStatus === BidStatus.Accepted && readyForDocuments,
    viewingNotAgreed,
    pendingAppointmentId:
      stage?.appointments?.find(
        (a) => a.status === "pending" || a.status === "confirmed"
      )?.id ?? null,
  };
}
