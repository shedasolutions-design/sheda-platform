/**
 * Transaction Types
 *
 * Defines the phases, display data, and types used by the transaction
 * lifecycle UI (OngoingCard, HistoryList, useTransactions, transactionStore).
 */

import { BidView, PropertyView, BidStatus } from "./contract";
import { PropertyShow } from "@/services/api";

// ============================================================================
// Transaction Phases
// ============================================================================

export enum TransactionPhase {
    BID_PENDING = "bid_pending",
    BID_ACCEPTED = "bid_accepted",
    APPOINTMENT_BOOKED = "appointment_booked",
    APPOINTMENT_ACCEPTED = "appointment_accepted",
    BID_REJECTED = "bid_rejected",
    CANCELLED = "cancelled",
    DOCS_RELEASED = "docs_released",
    DOCS_CONFIRMED = "docs_confirmed",
    PAYMENT_RELEASED = "payment_released",
    COMPLETED = "completed",
    DISPUTED = "disputed",
}

// ============================================================================
// Phase Display Metadata
// ============================================================================

export const PHASE_LABELS: Record<TransactionPhase, string> = {
    [TransactionPhase.BID_PENDING]: "Bid Pending",
    [TransactionPhase.BID_ACCEPTED]: "Bid Accepted",
    [TransactionPhase.APPOINTMENT_BOOKED]: "Appointment Booked",
    [TransactionPhase.APPOINTMENT_ACCEPTED]: "Appointment Confirmed",
    [TransactionPhase.BID_REJECTED]: "Bid Rejected",
    [TransactionPhase.CANCELLED]: "Cancelled",
    [TransactionPhase.DOCS_RELEASED]: "Docs Released",
    [TransactionPhase.DOCS_CONFIRMED]: "Docs Confirmed",
    [TransactionPhase.PAYMENT_RELEASED]: "Payment Released",
    [TransactionPhase.COMPLETED]: "Completed",
    [TransactionPhase.DISPUTED]: "Disputed",
};

export const PHASE_COLORS: Record<
    TransactionPhase,
    { bg: string; text: string }
> = {
    [TransactionPhase.BID_PENDING]: { bg: "#FEF3C7", text: "#92400E" },
    [TransactionPhase.BID_ACCEPTED]: { bg: "#DBEAFE", text: "#1E40AF" },
    [TransactionPhase.APPOINTMENT_BOOKED]: { bg: "#E0F2FE", text: "#0369A1" },
    [TransactionPhase.APPOINTMENT_ACCEPTED]: { bg: "#DCFCE7", text: "#166534" },
    [TransactionPhase.BID_REJECTED]: { bg: "#FEE2E2", text: "#991B1B" },
    [TransactionPhase.CANCELLED]: { bg: "#F3F4F6", text: "#6B7280" },
    [TransactionPhase.DOCS_RELEASED]: { bg: "#E0E7FF", text: "#3730A3" },
    [TransactionPhase.DOCS_CONFIRMED]: { bg: "#D1FAE5", text: "#065F46" },
    [TransactionPhase.PAYMENT_RELEASED]: { bg: "#CFFAFE", text: "#155E75" },
    [TransactionPhase.COMPLETED]: { bg: "#D1FAE5", text: "#065F46" },
    [TransactionPhase.DISPUTED]: { bg: "#FEE2E2", text: "#991B1B" },
};

export const BUYER_STATUS: Record<TransactionPhase, string> = {
    [TransactionPhase.BID_PENDING]: "Waiting for the seller to accept your bid…",
    [TransactionPhase.BID_ACCEPTED]: "Bid accepted! Book an appointment with the seller.",
    [TransactionPhase.APPOINTMENT_BOOKED]: "Appointment booked! Waiting for seller to confirm…",
    [TransactionPhase.APPOINTMENT_ACCEPTED]: "Appointment confirmed! Waiting for documents…",
    [TransactionPhase.BID_REJECTED]: "Your bid was rejected.",
    [TransactionPhase.CANCELLED]: "You cancelled this bid.",
    [TransactionPhase.DOCS_RELEASED]:
        "Documents released. Review and confirm them.",
    [TransactionPhase.DOCS_CONFIRMED]:
        "Documents confirmed. Release payment when ready.",
    [TransactionPhase.PAYMENT_RELEASED]:
        "Payment released. Waiting for completion.",
    [TransactionPhase.COMPLETED]: "Transaction completed!",
    [TransactionPhase.DISPUTED]: "Dispute raised. Escrow frozen.",
};

export const SELLER_STATUS: Record<TransactionPhase, string> = {
    [TransactionPhase.BID_PENDING]: "New bid received. Accept or reject.",
    [TransactionPhase.BID_ACCEPTED]: "Bid accepted. Waiting for buyer to book appointment…",
    [TransactionPhase.APPOINTMENT_BOOKED]: "Buyer booked an appointment. Accept or reject.",
    [TransactionPhase.APPOINTMENT_ACCEPTED]: "Appointment confirmed. Release documents now.",
    [TransactionPhase.BID_REJECTED]: "You rejected this bid.",
    [TransactionPhase.CANCELLED]: "Buyer cancelled this bid.",
    [TransactionPhase.DOCS_RELEASED]:
        "Documents sent. Waiting for buyer to confirm.",
    [TransactionPhase.DOCS_CONFIRMED]:
        "Buyer confirmed docs. Waiting for payment.",
    [TransactionPhase.PAYMENT_RELEASED]:
        "Payment received! Complete the transaction.",
    [TransactionPhase.COMPLETED]: "Transaction completed!",
    [TransactionPhase.DISPUTED]: "Dispute raised. Escrow frozen.",
};

// ============================================================================
// Transaction Data Types
// ============================================================================

export interface Transaction {
    key: string;
    bid: BidView;
    property: PropertyView;
    propertyDetails: PropertyShow | null;
    phase: TransactionPhase;
    role: "buyer" | "seller";
    updatedAt: number;
    documentTokenId?: string;
    escrowReleaseTxHash?: string;
    /** Every agreement image the seller released (the chain holds the first). */
    documentUrls?: string[];
    /** Timestamp (ms) when the transaction was completed */
    completedAt?: number;
    /** Agreement duration in months (from rental_period_months or default 12) — Lease only */
    agreementDurationDays?: number;
    /**
     * Lease end timestamp (ms) — Lease bids only, never set for Purchase.
     * Sourced from the real on-chain property.active_lease.end_time when
     * available (property was fetched fresh and still shows this bid's
     * tenant as the active lease); otherwise estimated from
     * completedAt + agreementDurationDays as a fallback for when the
     * property fetch didn't come back with lease data attached.
     */
    expiresAt?: number;
    /**
     * The on-chain Lease.id (distinct from bid.id/property.id), needed to
     * call expire_lease/completeLease. Only set when active_lease data was
     * available and matched this transaction's tenant.
     */
    leaseId?: number;
    /**
     * Whether property.active_lease.active is still true on-chain. Once
     * expiresAt has passed this can still be true — nobody has called
     * expire_lease/completeLease yet to flip it — which is exactly the
     * state that needs a "reclaim property" action surfaced.
     */
    leaseActiveOnChain?: boolean;
}

/**
 * Local state persisted in AsyncStorage for each transaction.
 * Used by transactionStore to track post-acceptance phases.
 */
export interface TransactionLocalState {
    phase: TransactionPhase;
    updatedAt: number;
    documentTokenId?: string;
    documentMediaUri?: string;
    acceptTxHash?: string;
    docReleaseTxHash?: string;
    escrowReleaseTxHash?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a unique key for a transaction (bid + property combo).
 */
export function makeTransactionKey(
    bidId: number,
    propertyId: number
): string {
    return `${bidId}_${propertyId}`;
}

/**
 * Map the on-chain BidStatus to a TransactionPhase.
 */
export function mapBidStatusToPhase(status: BidStatus): TransactionPhase {
    switch (status) {
        case BidStatus.Pending:
            return TransactionPhase.BID_PENDING;
        case BidStatus.Accepted:
            return TransactionPhase.BID_ACCEPTED;
        case BidStatus.Rejected:
            return TransactionPhase.BID_REJECTED;
        case BidStatus.Cancelled:
            return TransactionPhase.CANCELLED;
        case BidStatus.DocsReleased:
            return TransactionPhase.DOCS_RELEASED;
        case BidStatus.DocsConfirmed:
            return TransactionPhase.DOCS_CONFIRMED;
        case BidStatus.PaymentReleased:
            return TransactionPhase.PAYMENT_RELEASED;
        case BidStatus.Completed:
            return TransactionPhase.COMPLETED;
        case BidStatus.Disputed:
            return TransactionPhase.DISPUTED;
        default:
            return TransactionPhase.BID_PENDING;
    }
}

// ============================================================================
// History Tab Partitioning
// ============================================================================

export interface TransactionTabs {
    /** Deals still needing an action from someone */
    ongoing: Transaction[];
    /** Closed and still live: a completed purchase, or a lease inside its term */
    completed: Transaction[];
    /** Leases whose term has run out */
    expired: Transaction[];
    /** Ended without completing */
    cancelled: Transaction[];
}

/**
 * The escrow is settled. NOT the same as "done": PAYMENT_RELEASED still needs
 * someone to call complete_transaction, which is why it stays in `ongoing`.
 */
export const isClosedPhase = (t: Transaction): boolean =>
    t.phase === TransactionPhase.COMPLETED ||
    t.phase === TransactionPhase.PAYMENT_RELEASED;

/**
 * Only Lease bids ever get expiresAt (see computeLeaseExpiry) — a Purchase has
 * no end_time and so can never be "expired".
 */
export const isExpiredLease = (t: Transaction, now: number = Date.now()): boolean =>
    t.expiresAt !== undefined && t.expiresAt <= now;

// NEAR contract timestamps are nanoseconds; backend-sourced ones arrive
// already converted to ms — normalize by magnitude, same rule OngoingCard
// uses for its own escrow countdown.
const ESCROW_RELEASE_DELAY_MS = 24 * 60 * 60 * 1000;
function toMs(value?: number | null): number | undefined {
    if (value == null) return undefined;
    return value > 1e14 ? Math.floor(value / 1_000_000) : value;
}

/**
 * True when this transaction is sitting in a phase where *this user* (given
 * their role on the deal) has a required next step — not just an optional
 * one like "Cancel Bid" or "Raise Dispute", which are available but never
 * block the deal from progressing on their own. Backs the unread-style badge
 * on the Activities/History tab; kept in sync with OngoingCard's
 * renderActions() by hand since that's the only other place this logic lives.
 */
export function needsAction(t: Transaction, now: number = Date.now()): boolean {
    if (t.role === "seller") {
        switch (t.phase) {
            case TransactionPhase.BID_PENDING:
            case TransactionPhase.APPOINTMENT_BOOKED:
            case TransactionPhase.APPOINTMENT_ACCEPTED:
            case TransactionPhase.PAYMENT_RELEASED:
                return true;
            default:
                return false;
        }
    }

    // buyer
    switch (t.phase) {
        case TransactionPhase.BID_ACCEPTED:
        case TransactionPhase.DOCS_RELEASED:
        case TransactionPhase.PAYMENT_RELEASED:
            return true;
        case TransactionPhase.BID_PENDING: {
            // Only actionable once expired — "Reclaim Funds" — a pending bid
            // still awaiting the seller isn't something the buyer needs to do
            // anything about yet.
            const expiresAtMs = toMs(t.bid.expires_at);
            return expiresAtMs !== undefined && expiresAtMs <= now;
        }
        case TransactionPhase.DOCS_CONFIRMED: {
            // "Release Payment" only actually does anything once the 24h
            // escrow timelock has elapsed — before that the button is
            // disabled, so it shouldn't count as needing attention yet.
            const releaseAtMs =
                toMs(t.bid.escrow_release_after) ??
                (toMs(t.updatedAt) ?? now) + ESCROW_RELEASE_DELAY_MS;
            return releaseAtMs <= now;
        }
        default:
            return false;
    }
}

/**
 * Split transactions across the four history tabs.
 *
 * This is a partition: every transaction lands in exactly one bucket. That
 * property is the whole point — PAYMENT_RELEASED used to satisfy both
 * `ongoing` and `completed`, so the same deal appeared twice, once with the
 * "Complete" button that finishes it and once without, reading as two
 * different deals in two different states.
 */
export function partitionTransactions(
    transactions: Transaction[],
    now: number = Date.now()
): TransactionTabs {
    const ongoing: Transaction[] = [];
    const completed: Transaction[] = [];
    const expired: Transaction[] = [];
    const cancelled: Transaction[] = [];

    for (const t of transactions) {
        if (
            t.phase === TransactionPhase.BID_REJECTED ||
            t.phase === TransactionPhase.CANCELLED ||
            t.phase === TransactionPhase.DISPUTED
        ) {
            cancelled.push(t);
            continue;
        }

        // A settled-escrow lease whose term has also run out belongs to the
        // Expired tab, which is where the reclaim action lives.
        //
        // The isClosedPhase() guard is load-bearing, not decoration: a *lease
        // renewal* bid sits at BID_PENDING while carrying the outgoing lease's
        // end_time as its expiresAt (computeLeaseExpiry matches
        // property.active_lease against the bidder, and the tenant renewing is
        // that same account). Testing expiry alone would drop every renewal bid
        // out of Ongoing — and out of every other tab too — taking the seller's
        // "Accept Renewal" button with it.
        if (isClosedPhase(t) && isExpiredLease(t, now)) {
            expired.push(t);
            continue;
        }

        if (t.phase === TransactionPhase.COMPLETED) {
            completed.push(t);
            continue;
        }

        ongoing.push(t);
    }

    return { ongoing, completed, expired, cancelled };
}
