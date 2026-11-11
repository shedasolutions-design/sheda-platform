/**
 * useBlockchainListener
 *
 * React hook that bridges the BlockchainListenerService with the notification
 * system. Starts/stops the listener based on the wallet connection state
 * and converts blockchain events into app notifications.
 */

import { useEffect, useRef, useCallback } from "react";
import blockchainListener, {
  BlockchainEvent,
  MonitoredMethod,
} from "../services/blockchainListener";
import { NotificationType } from "../contexts/NotificationContext";
import { BUYER_TRANSACTIONS_ROUTE } from "@/utilities/transactionsRoute";

// ============================================================================
// Method → NotificationType mapping
// ============================================================================

const METHOD_TO_NOTIFICATION: Record<MonitoredMethod, NotificationType | null> = {
  place_bid: "bid_placed",
  ft_transfer_call: "bid_placed", // ft_transfer_call with bid msg = bid placed
  accept_bid: "bid_accepted",
  accept_bid_with_escrow: "bid_accepted",
  reject_bid: "bid_rejected",
  cancel_bid: "bid_cancelled",
  claim_lost_bid: "bid_cancelled",
  confirm_document_release: "docs_released",
  confirm_document_receipt: "docs_confirmed",
  release_escrow: "payment_released",
  complete_transaction: "transaction_completed",
  raise_dispute: "dispute_raised",
  resolve_dispute: "general",
  mint_property: null, // no notification for property minting
};

const METHOD_TITLES: Record<MonitoredMethod, string> = {
  place_bid: "New Bid Received",
  ft_transfer_call: "New Bid Received",
  accept_bid: "Bid Accepted",
  accept_bid_with_escrow: "Bid Accepted (Escrow)",
  reject_bid: "Bid Rejected",
  cancel_bid: "Bid Cancelled",
  claim_lost_bid: "Bid Refund Claimed",
  confirm_document_release: "Documents Released",
  confirm_document_receipt: "Documents Confirmed",
  release_escrow: "Payment Released",
  complete_transaction: "Transaction Completed",
  raise_dispute: "Dispute Raised",
  resolve_dispute: "Dispute Resolved",
  mint_property: "Property Listed",
};

function buildMessage(event: BlockchainEvent): string {
  const methodLabel = METHOD_TITLES[event.method] || event.method;
  const actor = event.signer.length > 20
    ? `${event.signer.slice(0, 12)}…${event.signer.slice(-8)}`
    : event.signer;

  // Try to include property or bid context from parsed args
  const propertyId = event.args?.property_id;
  const bidId = event.args?.bid_id;

  let detail = "";
  if (propertyId != null && bidId != null) {
    detail = ` (Property #${propertyId}, Bid #${bidId})`;
  } else if (propertyId != null) {
    detail = ` (Property #${propertyId})`;
  }

  return `${methodLabel} by ${actor}${detail}`;
}

// ============================================================================
// Hook
// ============================================================================

interface UseBlockchainListenerOptions {
  /** The connected wallet account ID, or null if not connected */
  accountId: string | null;
  /** Function to add a notification (from NotificationContext) */
  addNotification: (
    type: NotificationType,
    title: string,
    message: string,
    route?: string,
  ) => void;
  /** Function to refresh backend notifications (optional) */
  refreshNotifications?: () => Promise<void>;
}

export function useBlockchainListener({
  accountId,
  addNotification,
  refreshNotifications,
}: UseBlockchainListenerOptions): void {
  const addNotifRef = useRef(addNotification);
  const refreshRef = useRef(refreshNotifications);

  // Keep refs current without triggering effect re-runs
  useEffect(() => {
    addNotifRef.current = addNotification;
    refreshRef.current = refreshNotifications;
  }, [addNotification, refreshNotifications]);

  const handleEvent = useCallback((event: BlockchainEvent) => {
    const notifType = METHOD_TO_NOTIFICATION[event.method];
    if (!notifType) return; // method doesn't need a notification

    if (!event.success) return; // don't notify for failed txs

    const title = METHOD_TITLES[event.method] || "Blockchain Event";
    const message = buildMessage(event);

    // Placeholder: resolved to Activity or History by role when opened,
    // since the reader's mode isn't known here. See utilities/transactionsRoute.
    addNotifRef.current(notifType, title, message, BUYER_TRANSACTIONS_ROUTE);

    // Also refresh backend notifications so they stay in sync
    refreshRef.current?.().catch(() => {
      // non-critical
    });
  }, []);

  useEffect(() => {
    if (!accountId) {
      blockchainListener.stop();
      return;
    }

    blockchainListener.start(accountId, handleEvent);

    return () => {
      blockchainListener.stop();
    };
  }, [accountId, handleEvent]);
}

export default useBlockchainListener;
