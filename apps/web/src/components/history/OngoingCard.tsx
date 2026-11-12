"use client";

import Alert from "@/utilities/alertPolyfill";
import DealProgress from "@/components/history/DealProgress";
import { useDealTimeline } from "@/hooks/useDealTimeline";
import api from "@/services/api";

import { router } from "@/lib/router";

import {
  Transaction,
  TransactionPhase,
  PHASE_LABELS,
  PHASE_COLORS,
  BUYER_STATUS,
  SELLER_STATUS,
} from "@/types/transaction";
import { stablecoinUnitsToNaira, stablecoinUnitsToUsd, formatNaira } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useState, useEffect } from "react";
import nearContractService from "@/services/nearContract";
import { NearContractService } from "@/services/nearContract";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import { formatCountdown } from "@/utilities/formatDuration";
import { openTxOnExplorer, getTxExplorerUrl } from "@/utilities/nearExplorer";
import PriceDisplay from "@/components/property/PriceDisplay";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Bath, BedDouble, MapPin } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import getFullImageUrl from "@/utilities/imageUrl";

interface OngoingCardProps {
  transaction: Transaction;
  onPhaseUpdate: (
    bidId: number,
    propertyId: number,
    phase: TransactionPhase,
    extra?: any
  ) => Promise<void>;
}

// ---- Escrow release timelock helpers ----
// The contract's release_escrow rejects the call until
// block_timestamp >= bid.escrow_release_after (24h after confirm_document_receipt).

const ESCROW_RELEASE_DELAY_MS = 24 * 60 * 60 * 1000;

// NEAR contract timestamps are nanoseconds; backend-sourced timestamps arrive
// already converted to ms (see useTransactions.ts). Normalize by magnitude so
// this works regardless of which source populated the value.
function toMs(value?: number | null): number | undefined {
  if (value == null) return undefined;
  return value > 1e14 ? Math.floor(value / 1_000_000) : value;
}

function formatEscrowCountdown(releaseAtMs?: number): { label: string; ready: boolean } {
  if (!releaseAtMs) return { label: "", ready: true };

  const diff = releaseAtMs - Date.now();
  if (diff <= 0) return { label: "", ready: true };

  const totalMinutes = Math.ceil(diff / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const label = hours > 0
    ? `Available in ${hours}h ${minutes}m`
    : `Available in ${minutes}m`;

  return { label, ready: false };
}

const OngoingCard = ({ transaction, onPhaseUpdate }: OngoingCardProps) => {
  const { bid, property, propertyDetails, phase, role } = transaction;
  // Joins the on-chain bid status with the backend's appointment stage. The
  // chain can't see appointments, so on its own it can't tell whether a deal
  // is moving or stuck.
  const dealTimeline = useDealTimeline(bid.id, bid.status);
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { sendMessage, sendTransactionUpdate, getUserByWallet } = useApi();
  const { addNotification } = useNotifications();
  const { run: runTransaction } = useTransactionToast();
  const [actionLoading, setActionLoading] = useState(false);
  const { ngnPerUsd } = useExchangeRates();
  const { formatPrice } = useCurrency();

  // A Pending Lease bid from the account that already holds this
  // property's active lease is a renewal request, not a competing new
  // lease — the contract's accept_bid/accept_bid_with_escrow both refuse
  // any bid while active_lease is set, so this one can only go through
  // accept_lease_renewal.
  // A lease only makes a bid a RENEWAL while it is genuinely still running.
  //
  // The contract leaves active_lease in place, with active: true, after
  // end_time passes — it is cleared by expire_lease, which nobody is obliged
  // to call. Treating existence alone as "currently leased" means that once a
  // tenant's lease lapses, every future bid they ever place on that property
  // is classified as a renewal, and the seller is offered Accept Renewal for a
  // lease that ended. accept_lease_renewal then fails on a contract that no
  // longer considers the lease live.
  //
  // Checking end_time as well keeps a real renewal working while a lapsed
  // lease correctly falls back to being an ordinary new bid.
  const activeLease = property.active_lease;
  const leaseStillRunning =
    !!activeLease &&
    activeLease.active !== false &&
    // Absent end_time means the contract did not give us one; trust `active`
    // rather than inventing an expiry.
    (activeLease.end_time == null ||
      Number(activeLease.end_time) / 1e6 > Date.now());

  const isRenewalBid =
    bid.action === "Lease" &&
    leaseStillRunning &&
    activeLease!.tenant_id === bid.bidder_id;

  // Escrow release timelock: prefer the on-chain field when present, otherwise
  // estimate from when docs were confirmed (transaction.updatedAt at this phase).
  const escrowReleaseAtMs =
    toMs(bid.escrow_release_after) ??
    (phase === TransactionPhase.DOCS_CONFIRMED
      ? (toMs(transaction.updatedAt) ?? Date.now()) + ESCROW_RELEASE_DELAY_MS
      : undefined);

  const [escrowCountdown, setEscrowCountdown] = useState(() => formatEscrowCountdown(escrowReleaseAtMs));

  useEffect(() => {
    setEscrowCountdown(formatEscrowCountdown(escrowReleaseAtMs));
    if (!escrowReleaseAtMs) return;
    const interval = setInterval(() => {
      setEscrowCountdown(formatEscrowCountdown(escrowReleaseAtMs));
    }, 30_000);
    return () => clearInterval(interval);
  }, [escrowReleaseAtMs]);

  // The released agreement: every page the backend kept, else the one the
  // chain holds.
  const agreementImages = (
    transaction.documentUrls && transaction.documentUrls.length > 0
      ? transaction.documentUrls
      : bid.document_image_uri
        ? [bid.document_image_uri]
        : []
  ).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  const agreementShown =
    (phase === TransactionPhase.DOCS_RELEASED || phase === TransactionPhase.DOCS_CONFIRMED) &&
    (agreementImages.length > 0 || !!bid.document_description);

  const phaseColor = PHASE_COLORS[phase];
  const statusMessage = role === "buyer" ? BUYER_STATUS[phase] : SELLER_STATUS[phase];

  // A finished deal has nothing left to wait on, so the progress list would
  // just be noise above the outcome.
  const isTerminalPhase =
    phase === TransactionPhase.COMPLETED ||
    phase === TransactionPhase.CANCELLED ||
    phase === TransactionPhase.BID_REJECTED;

  // Property display data
  const title = propertyDetails?.title || property.description || "Property";
  const location = propertyDetails?.location || "—";
  const bedrooms = propertyDetails?.bedroom || 0;
  const bathrooms = propertyDetails?.bathroom || 0;
  const priceUsd = stablecoinUnitsToUsd(parseInt(bid.bid_amount) || 0);
  const displayPrice = formatPrice(priceUsd);
  const mode = bid.action === "Lease" ? "rent" : "buy";
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : { uri: "/images/apt-1.png" };

  // Navigate to property details
  const handleDetailsNavigation = () => {
    if (propertyDetails?.id) {
      router.push({
        pathname: "/details/[id]",
        params: { id: String(propertyDetails.id) },
      });
    }
  };

  // Resolve the counterparty's numeric backend user id — buyer's own id
  // isn't known here (only their wallet address, bid.bidder_id), so it needs
  // a lookup; the seller's id is already available as propertyDetails.agent_id.
  const resolveCounterpartyUserId = async (): Promise<number | null> => {
    if (role === "buyer") {
      return propertyDetails?.agent_id ?? null;
    }
    try {
      const buyerInfo = await getUserByWallet(bid.bidder_id);
      return buyerInfo?.id ?? null;
    } catch (err) {
      console.warn("OngoingCard: Failed to resolve buyer's user id from wallet:", err);
      return null;
    }
  };

  // Send structured message to counterparty via chat API. Previously this
  // always sent to propertyDetails.agent_id (the seller) — correct when the
  // buyer is acting, but when the seller accepts/rejects a bid it meant they
  // were messaging themselves and the buyer never saw the response.
  const sendTransactionMessage = async (messageObj: any) => {
    try {
      const numericReceiverId = await resolveCounterpartyUserId();
      if (numericReceiverId) {
        await sendMessage({
          receiver_id: numericReceiverId,
          message: JSON.stringify(messageObj),
          property_id: propertyDetails?.id,
        });
      } else {
        console.warn("OngoingCard: No receiver ID found for transaction message");
      }
    } catch (err) {
      console.warn("OngoingCard: Failed to send transaction message:", err);
    }
  };

  // ---- SELLER ACTIONS ----

  const handleAcceptBid = async () => {
    Alert.alert(
      "Accept Bid",
      `Accept this bid of ${displayPrice} for "${title}"? Funds will remain in escrow until the transaction is completed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Accepting bid...",
                successMessage: "Bid accepted! Now release the documents.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to accept bid"),
                notification: {
                  type: "bid_accepted",
                  title: "Bid Accepted",
                  message: `You accepted a bid of ${displayPrice} for "${title}".`,
                },
                action: async () => {
                  const bidResult = await nearContractService.acceptBidWithEscrow(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to accept bid"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.BID_ACCEPTED, {
                  acceptTxHash: result.transactionHash,
                });

                // Notify buyer
                await sendTransactionMessage({
                  type: "offer_response",
                  offerId: `bid_${bid.id}`,
                  status: "accepted",
                  propertyId: bid.property_id,
                  propertyTitle: title,
                  message: "Your bid has been accepted! Awaiting document release.",
                  timestamp: new Date().toISOString(),
                  bidId: bid.id,
                  sellerId: propertyDetails?.agent_id,
                });

                // Notify buyer via backend
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "bid_accepted",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Your bid for "${title}" has been accepted!`,
                    metadata: {
                      buyer_wallet_id: bid.bidder_id,
                      seller_wallet_id: walletState.account?.accountId,
                      bid_amount: bid.bid_amount,
                      stablecoin_token: bid.stablecoin_token,
                      // Backend's TransactionActionEnum is lowercase ("purchase"/"lease");
                      // the on-chain Action enum is capitalized ("Purchase"/"Lease").
                      action: String(bid.action).toLowerCase(),
                    },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to accept bid"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Owner accepts a renewal bid from the property's current tenant.
  // Unlike handleAcceptBid this releases payment immediately and finishes
  // in one step — accept_lease_renewal skips the docs/timelock staging
  // entirely, so the bid goes straight to Completed.
  const handleAcceptRenewal = async () => {
    Alert.alert(
      "Accept Renewal",
      `Accept ${displayPrice} to renew this tenant's lease on "${title}"? Payment releases immediately and a new lease document is issued.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept Renewal",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Accepting renewal...",
                successMessage: `Renewal accepted! Payment released and a new document issued for "${title}".`,
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to accept renewal"),
                notification: {
                  type: "general",
                  title: "Renewal Accepted",
                  message: `You accepted a lease renewal for "${title}".`,
                },
                action: async () => {
                  const bidResult = await nearContractService.acceptLeaseRenewal(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to accept renewal"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.COMPLETED, {
                  escrowReleaseTxHash: result.transactionHash,
                });

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "lease_renewed",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Your renewal for "${title}" was accepted! A new lease document has been issued.`,
                    metadata: {
                      buyer_wallet_id: bid.bidder_id,
                      seller_wallet_id: walletState.account?.accountId,
                      bid_amount: bid.bid_amount,
                      stablecoin_token: bid.stablecoin_token,
                      action: "lease",
                    },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to accept renewal"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRejectBid = async () => {
    Alert.alert(
      "Reject Bid",
      `Reject this bid of ${displayPrice}? The buyer's funds will be refunded.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Rejecting bid...",
                successMessage: "Bid rejected. Funds returned to buyer.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to reject bid"),
                notification: {
                  type: "bid_rejected",
                  title: "Bid Rejected",
                  message: `You rejected a bid for "${title}".`,
                },
                action: async () => {
                  const bidResult = await nearContractService.rejectBid(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to reject bid"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.BID_REJECTED);

                await sendTransactionMessage({
                  type: "offer_response",
                  offerId: `bid_${bid.id}`,
                  status: "rejected",
                  propertyId: bid.property_id,
                  propertyTitle: title,
                  message: "Your bid has been rejected.",
                  timestamp: new Date().toISOString(),
                });

                // Notify buyer via backend
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "bid_rejected",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Your bid for "${title}" has been rejected.`,
                    metadata: {
                      buyer_wallet_id: bid.bidder_id,
                      seller_wallet_id: walletState.account?.accountId,
                      bid_amount: bid.bid_amount,
                      stablecoin_token: bid.stablecoin_token,
                      // Backend's TransactionActionEnum is lowercase ("purchase"/"lease");
                      // the on-chain Action enum is capitalized ("Purchase"/"Lease").
                      action: String(bid.action).toLowerCase(),
                    },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to reject bid"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReleaseDocuments = () => {
    // propertyDetails.id is the backend's own numeric property id — a
    // completely different id space from bid.property_id (the on-chain
    // contract id). It's only populated once this property has been loaded
    // into the app's backend property cache (see useTransactions.ts); if it
    // hasn't, falling back to the on-chain id here would silently send the
    // wrong id to the backend, which then 404s with no useful explanation.
    if (!propertyDetails?.id) {
      Alert.alert(
        "This property isn't in our records",
        "The deal is live on-chain, but we have no saved record of this property, which is what releasing documents needs. That usually means the listing was created directly on-chain rather than through the app. Ask the seller to re-save the listing, or contact support with this property's on-chain ID: " +
        String(bid.property_id) + "."
      );
      return;
    }
    router.push({
      pathname: "/release-document",
      params: {
        id: String(propertyDetails.id),
        bidId: String(bid.id),
        blockchainPropertyId: String(bid.property_id),
        buyerAccountId: bid.bidder_id,
        propertyTitle: title,
      },
    });
  };

  // Seller: Accept appointment booked by buyer
  const handleAcceptAppointment = async () => {
    Alert.alert(
      "Accept Appointment",
      `Accept the buyer's appointment request for "${title}"? You can then chat to arrange the meeting.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.APPOINTMENT_ACCEPTED);

              await sendTransactionMessage({
                type: "appointment_accepted",
                propertyId: bid.property_id,
                bidId: bid.id,
                propertyTitle: title,
                message: "Your appointment has been confirmed! Let's chat to arrange meeting details.",
                timestamp: new Date().toISOString(),
              });

              Alert.alert("Success", "Appointment accepted! You can now chat with the buyer and release documents when ready.");
              addNotification("appointment_accepted", "Appointment Confirmed", `You confirmed the appointment for "${title}".`);

              // Notify buyer via backend (see Sheda-Backend PR #16)
              resolveCounterpartyUserId().then((recipientUserId) => {
                if (!recipientUserId) return;
                sendTransactionUpdate({
                  transaction_id: String(bid.id),
                  event: "appointment_accepted",
                  recipient_user_id: recipientUserId,
                  property_id: bid.property_id,
                  message: `Your appointment for "${title}" has been confirmed by the seller!`,
                  metadata: { buyer_wallet_id: bid.bidder_id },
                }).catch(() => { });
              });
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to accept appointment");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Seller: Reject appointment
  const handleRejectAppointment = async () => {
    Alert.alert(
      "Reject Appointment",
      "Reject this appointment? The buyer can book a new date.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              // Move back to BID_ACCEPTED so buyer can rebook
              await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.BID_ACCEPTED);

              await sendTransactionMessage({
                type: "appointment_rejected",
                propertyId: bid.property_id,
                bidId: bid.id,
                propertyTitle: title,
                message: "The seller could not accept your appointment. Please book a different date.",
                timestamp: new Date().toISOString(),
              });

              Alert.alert("Done", "Appointment rejected. The buyer will be notified to rebook.");
              addNotification("appointment_rejected", "Appointment Rejected", `You rejected the appointment for "${title}". The buyer can rebook.`);

              // Notify buyer via backend (see Sheda-Backend PR #16)
              resolveCounterpartyUserId().then((recipientUserId) => {
                if (!recipientUserId) return;
                sendTransactionUpdate({
                  transaction_id: String(bid.id),
                  event: "appointment_rejected",
                  recipient_user_id: recipientUserId,
                  property_id: bid.property_id,
                  message: `Your appointment for "${title}" has been rejected. You can rebook.`,
                  metadata: { buyer_wallet_id: bid.bidder_id },
                }).catch(() => { });
              });
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to reject appointment");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // ---- BUYER ACTIONS ----

  // The contract stamps every bid with expires_at (bid_expiry_ns, 7 days by
  // default). Once that passes the funds are still locked in escrow — the
  // contract only sweeps an expired bid lazily, when the seller happens to
  // try accepting it. If the seller simply walks away (or deletes the
  // property, which doesn't touch bids at all), nothing ever refunds the
  // buyer on its own. claim_lost_bid is the buyer's own way out, and until
  // now it had no call site anywhere in the app.
  const bidExpiresAtMs = toMs(bid.expires_at);
  const isBidExpired =
    phase === TransactionPhase.BID_PENDING &&
    bidExpiresAtMs !== undefined &&
    bidExpiresAtMs <= Date.now();

  const handleClaimLostBid = () => {
    Alert.alert(
      "Reclaim Funds",
      `This bid expired without being accepted. Reclaim your ${displayPrice} from escrow?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reclaim",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Reclaiming your funds...",
                successMessage: `${displayPrice} has been returned to your wallet.`,
                errorMessage: (err) =>
                  NearContractService.parseContractError(
                    err?.message || "Failed to reclaim funds"
                  ),
                notification: {
                  type: "bid_cancelled",
                  title: "Funds Reclaimed",
                  message: `Your expired bid for "${title}" was refunded.`,
                },
                action: async () => {
                  const claimResult = await nearContractService.claimLostBid(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!claimResult.success) {
                    throw new Error(
                      NearContractService.parseContractError(
                        claimResult.error || "Failed to reclaim funds"
                      )
                    );
                  }
                  return claimResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(
                  bid.id,
                  bid.property_id,
                  TransactionPhase.CANCELLED
                );
              }
            } catch (err: any) {
              Alert.alert(
                "Error",
                NearContractService.parseContractError(
                  err.message || "Failed to reclaim funds"
                )
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelBid = async () => {
    Alert.alert(
      "Cancel Bid",
      "Cancel your bid and get your funds refunded?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Cancelling bid...",
                successMessage: "Bid cancelled. Funds returned to your wallet.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to cancel bid"),
                notification: {
                  type: "bid_cancelled",
                  title: "Bid Cancelled",
                  message: `Your bid for "${title}" has been cancelled. Funds returned to your wallet.`,
                },
                action: async () => {
                  const bidResult = await nearContractService.cancelBid(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to cancel bid"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.CANCELLED);

                // This was previously missing entirely — the seller never
                // found out a bid on their property was cancelled.
                await sendTransactionMessage({
                  type: "bid_cancelled",
                  propertyId: bid.property_id,
                  bidId: bid.id,
                  propertyTitle: title,
                  timestamp: new Date().toISOString(),
                });

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "bid_cancelled",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `A bid on "${title}" was cancelled by the buyer.`,
                    metadata: {},
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to cancel bid"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmDocuments = async () => {
    Alert.alert(
      "Confirm Documents",
      "Confirm that you have read the agreement shown on this card and accept it? Payment can be released to the seller once the escrow wait ends.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Confirming documents...",
                successMessage: "Documents confirmed on-chain! You can now release the payment when satisfied.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to confirm documents"),
                notification: {
                  type: "docs_confirmed",
                  title: "Documents Confirmed",
                  message: `You confirmed the documents for "${title}". You can now release payment.`,
                },
                action: async () => {
                  const bidResult = await nearContractService.confirmDocumentReceipt(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to confirm documents on-chain"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.DOCS_CONFIRMED);

                await sendTransactionMessage({
                  type: "docs_confirmed",
                  propertyId: bid.property_id,
                  bidId: bid.id,
                  propertyTitle: title,
                  timestamp: new Date().toISOString(),
                });

                // This was previously missing entirely — the seller never
                // found out the buyer confirmed documents (i.e. that the
                // 24h escrow timelock had started).
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "docs_confirmed",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `The buyer confirmed the documents for "${title}". Payment can be released after the 24h escrow window.`,
                    metadata: {},
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to confirm documents"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  /**
   * The buyer's exit from a deal that's already under way.
   *
   * `handleCancelBid` only covers a bid the seller hasn't acted on. Once it
   * was accepted the buyer had no way out at all — a viewing that never got
   * booked, or a seller who went quiet, left their escrow locked with nothing
   * they could do about it.
   *
   * Two stages, and the difference matters enough to spell out in the prompt:
   * before the agreement arrives it's a plain refund, and after it arrives
   * rejecting also burns the agreement, which cannot be undone.
   */
  const handleBuyerCancelDeal = (stage: "accepted" | "documents") => {
    const isDocuments = stage === "documents";

    Alert.alert(
      isDocuments ? "Reject Agreement" : "Cancel This Deal",
      isDocuments
        ? "This rejects the agreement the seller sent and cancels the deal. The agreement will be destroyed on-chain and your funds returned. This can't be undone — if you accept the agreement instead, the deal is final."
        : "This cancels the deal and returns your funds. The property goes back on the market.",
      [
        { text: "Keep Deal", style: "cancel" },
        {
          text: isDocuments ? "Reject & Cancel" : "Cancel Deal",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: isDocuments
                  ? "Rejecting agreement..."
                  : "Cancelling deal...",
                successMessage:
                  "Deal cancelled. Your funds are on their way back to your wallet.",
                errorMessage: (err) =>
                  NearContractService.parseContractError(
                    err?.message || "Failed to cancel this deal"
                  ),
                notification: {
                  type: "general",
                  title: "Deal Cancelled",
                  message: `You cancelled the deal for "${title}" and your funds are being refunded.`,
                },
                action: async () => {
                  const call = isDocuments
                    ? nearContractService.buyerRejectDocumentsAndCancel
                    : nearContractService.buyerCancelAcceptedBid;
                  const bidResult = await call.call(
                    nearContractService,
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(
                      NearContractService.parseContractError(
                        bidResult.error || "Failed to cancel this deal"
                      )
                    );
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(
                  bid.id,
                  bid.property_id,
                  TransactionPhase.CANCELLED
                );

                // The seller set this property aside when they accepted, so
                // they need telling it's free again — not left to notice.
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "bid_cancelled",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: isDocuments
                      ? `The buyer rejected the agreement for "${title}". The deal is cancelled and the property is back on the market.`
                      : `The buyer cancelled the deal for "${title}". The property is back on the market.`,
                    metadata: {},
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert(
                "Error",
                NearContractService.parseContractError(
                  err.message || "Failed to cancel this deal"
                )
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Record what the viewing produced.
   *
   * Accepting an appointment only ever meant the slot was agreed — nothing
   * said whether the meeting happened or how it went. This is the signal the
   * seller's document release is gated on, and without it a deal would sit at
   * the viewing step forever.
   *
   * Off-chain only: appointments live in the backend, so there's no wallet
   * signature and no gas here.
   */
  const handleRecordViewingOutcome = (agreed: boolean) => {
    const appointmentId = dealTimeline.pendingAppointmentId;
    if (!appointmentId) {
      Alert.alert(
        "No Viewing Found",
        "We couldn't find a booked viewing for this deal. Please refresh and try again."
      );
      return;
    }

    Alert.alert(
      agreed ? "Confirm the Viewing Went Ahead" : "Viewing Didn't End in Agreement",
      agreed
        ? "This confirms you and the buyer met and agreed to proceed. You'll then be able to send the agreement."
        : "This records that the viewing happened but you didn't reach an agreement. The buyer can cancel and be refunded.",
      [
        { text: "Back", style: "cancel" },
        {
          text: agreed ? "We Agreed" : "We Didn't Agree",
          style: agreed ? "default" : "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              const response = await api.recordAppointmentOutcome(
                appointmentId,
                agreed
              );
              if (!response.ok) {
                throw new Error(
                  (response as any).error?.message ||
                  "Couldn't record the viewing outcome."
                );
              }
              // Re-reads the stage so the gate on "Release Documents" opens
              // straight away rather than after the next full refresh.
              await dealTimeline.refresh();
            } catch (err: any) {
              Alert.alert(
                "Error",
                err?.message || "Couldn't record the viewing outcome."
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReleasePayment = () => {
    Alert.alert(
      "Release Payment",
      `Release ${displayPrice} from escrow to the seller? This action is final and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release Payment",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Releasing payment...",
                successMessage: "Payment released from escrow! You can now complete the transaction.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to release payment"),
                notification: {
                  type: "payment_released",
                  title: "Payment Released",
                  message: `You released ${displayPrice} for "${title}".`,
                },
                action: async () => {
                  const bidResult = await nearContractService.releaseEscrow(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to release escrow on-chain"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.PAYMENT_RELEASED, {
                  escrowReleaseTxHash: result.transactionHash,
                });

                await sendTransactionMessage({
                  type: "payment_released",
                  propertyId: bid.property_id,
                  bidId: bid.id,
                  propertyTitle: title,
                  txHash: result.transactionHash,
                  timestamp: new Date().toISOString(),
                });

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "payment_released",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Payment of ${displayPrice} released for "${title}"!`,
                    metadata: { txHash: result.transactionHash },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to release payment"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCompleteTransaction = () => {
    Alert.alert(
      "Complete Transaction",
      `Finalize this transaction for "${title}"? This marks everything as done.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Finalizing transaction...",
                successMessage: `The transaction for "${title}" has been finalized.`,
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to complete transaction"),
                notification: {
                  type: "transaction_completed",
                  title: "Transaction Complete",
                  message: `Your transaction for "${title}" has been completed successfully.`,
                },
                action: async () => {
                  const bidResult = await nearContractService.completeTransaction(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to complete transaction"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.COMPLETED);

                await sendTransactionMessage({
                  type: "transaction_completed",
                  propertyId: bid.property_id,
                  bidId: bid.id,
                  propertyTitle: title,
                  txHash: result.transactionHash,
                  timestamp: new Date().toISOString(),
                });

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "transaction_completed",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Transaction for "${title}" has been completed!`,
                    metadata: { txHash: result.transactionHash },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to complete transaction"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRaiseDispute = () => {
    Alert.alert(
      "Raise Dispute",
      "Are you sure you want to raise a dispute? Escrow funds will be frozen until an admin resolves it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Raise Dispute",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Raising dispute...",
                successMessage: "Escrow funds are now frozen. An admin will review and resolve this dispute.",
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to raise dispute"),
                notification: {
                  type: "dispute_raised",
                  title: "Dispute Raised",
                  message: `You raised a dispute for "${title}". Escrow frozen.`,
                },
                action: async () => {
                  const bidResult = await nearContractService.raiseTransactionDispute(
                    walletState.account!.accountId,
                    privateKey,
                    { bid_id: bid.id, property_id: bid.property_id }
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to raise dispute"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.DISPUTED);

                await sendTransactionMessage({
                  type: "dispute_raised",
                  propertyId: bid.property_id,
                  bidId: bid.id,
                  propertyTitle: title,
                  timestamp: new Date().toISOString(),
                });

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "dispute_raised",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `A dispute has been raised for "${title}".`,
                    metadata: {},
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to raise dispute"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // ---- RENDER ACTION BUTTONS ----
  // Which actions each side gets at each phase. Unchanged from mobile; see
  // the comments on each case there for why a step is gated.
  type Act = { label: string; onPress: () => void; color?: string; disabled?: boolean };
  const actionsFor = (): { left?: Act; right?: Act } => {
    const a: { left?: Act; right?: Act } = {};
    if (role === "seller") {
      switch (phase) {
        case TransactionPhase.BID_PENDING:
          a.left = { label: "Reject", onPress: handleRejectBid, color: "#6B7280" };
          a.right = isRenewalBid
            ? { label: "Accept Renewal", onPress: handleAcceptRenewal, color: "#C1272D" }
            : { label: "Accept Bid", onPress: handleAcceptBid, color: "#C1272D" };
          break;
        case TransactionPhase.APPOINTMENT_BOOKED:
          a.left = { label: "Reject", onPress: handleRejectAppointment, color: "#6B7280" };
          a.right = { label: "Accept Appointment", onPress: handleAcceptAppointment, color: "#C1272D" };
          break;
        case TransactionPhase.APPOINTMENT_ACCEPTED:
          // The agreement goes out only once the viewing happened and was agreed.
          if (dealTimeline.pendingAppointmentId && !dealTimeline.viewingNotAgreed) {
            a.left = { label: "Viewing Done", onPress: () => handleRecordViewingOutcome(true), color: "#065F46" };
          }
          if (dealTimeline.viewingNotAgreed) {
            a.right = {
              label: "Viewing Not Agreed",
              onPress: () =>
                Alert.alert(
                  "The Viewing Didn't End in Agreement",
                  "This viewing was recorded as not agreed, so the deal isn't ready for documents. The buyer can cancel and be refunded at this stage."
                ),
              color: "#9CA3AF",
              disabled: true,
            };
          } else if (!dealTimeline.sellerCanReleaseDocuments && !dealTimeline.loading) {
            a.right = {
              label: "Awaiting Viewing",
              onPress: () =>
                Alert.alert(
                  "Confirm the Viewing First",
                  "Once you and the buyer have met and agreed to go ahead, mark the appointment as completed. Releasing the agreement before then hands over your terms to someone who hasn't committed to the viewing."
                ),
              color: "#9CA3AF",
              disabled: true,
            };
          } else {
            a.right = { label: "Release Documents", onPress: handleReleaseDocuments, color: "#C1272D" };
          }
          break;
        case TransactionPhase.DOCS_CONFIRMED:
          a.left = { label: "Raise Dispute", onPress: handleRaiseDispute, color: "#991B1B" };
          break;
        case TransactionPhase.PAYMENT_RELEASED:
          a.right = { label: "Complete", onPress: handleCompleteTransaction, color: "#065F46" };
          break;
      }
    } else {
      switch (phase) {
        case TransactionPhase.BID_PENDING:
          // Past expiry the seller can no longer accept; the funds must be reclaimed.
          if (isBidExpired) a.right = { label: "Reclaim Funds", onPress: handleClaimLostBid, color: "#C1272D" };
          else a.left = { label: "Cancel Bid", onPress: handleCancelBid, color: "#6B7280" };
          break;
        case TransactionPhase.BID_ACCEPTED:
          a.left = { label: "Cancel Deal", onPress: () => handleBuyerCancelDeal("accepted"), color: "#6B7280" };
          a.right = {
            label: "Book Appointment",
            color: "#C1272D",
            onPress: () => {
              // propertyDetails.id is the backend's id; bid.property_id is the on-chain one.
              if (!propertyDetails?.id) {
                Alert.alert(
                  "This property isn't in our records",
                  "The deal is live on-chain, but we have no saved record of this property, which is what booking a viewing needs. Ask the seller to re-save the listing, or contact support with this property's on-chain ID: " +
                    String(bid.property_id) +
                    "."
                );
                return;
              }
              router.push({
                pathname: "/book-appointment",
                params: {
                  id: String(propertyDetails.id),
                  bidId: String(bid.id),
                  blockchainPropertyId: String(bid.property_id),
                  sellerId: propertyDetails?.agent_id ? String(propertyDetails.agent_id) : "",
                  propertyTitle: title,
                },
              });
            },
          };
          break;
        case TransactionPhase.DOCS_RELEASED:
          a.left = { label: "Reject Agreement", onPress: () => handleBuyerCancelDeal("documents"), color: "#991B1B" };
          a.right = { label: "Confirm Documents", onPress: handleConfirmDocuments, color: "#C1272D" };
          break;
        case TransactionPhase.DOCS_CONFIRMED:
          a.left = { label: "Raise Dispute", onPress: handleRaiseDispute, color: "#991B1B" };
          a.right = escrowCountdown.ready
            ? { label: "Release Payment", onPress: handleReleasePayment, color: "#C1272D" }
            : {
                label: escrowCountdown.label,
                onPress: () =>
                  Alert.alert(
                    "Escrow Locked",
                    "Funds are held in escrow for 24 hours after document confirmation before payment can be released. This protects both parties."
                  ),
                color: "#9CA3AF",
                disabled: true,
              };
          break;
        case TransactionPhase.PAYMENT_RELEASED:
          a.right = { label: "Complete", onPress: handleCompleteTransaction, color: "#065F46" };
          break;
      }
    }
    return a;
  };

  const actions = actionsFor();
  const img =
    typeof imageSource === "object" && imageSource && "uri" in imageSource
      ? String((imageSource as { uri: string }).uri)
      : "/images/apt-1.png";
  const imgSrc = img.startsWith("/images/") ? img : getFullImageUrl(img) || "/images/apt-1.png";

  return (
    <article className="w-full overflow-hidden rounded-lg border border-borderColor/60 bg-white">
      <button type="button" onClick={handleDetailsNavigation} className="relative block w-full text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={title} className="h-[175px] w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ backgroundColor: phaseColor.bg, color: phaseColor.text }}>
          {PHASE_LABELS[phase]}
        </span>
        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-medium ${
            role === "seller" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
          }`}
        >
          {role === "seller" ? "Selling" : "Buying"}
        </span>
      </button>

      <div className="w-full px-3 py-2">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-[#878787BF]">
          <li className="flex items-center gap-1">
            <MapPin size={12} /> {location}
          </li>
          {bedrooms > 0 && (
            <li className="flex items-center gap-1">
              <BedDouble size={14} /> {bedrooms} Bed
            </li>
          )}
          {bathrooms > 0 && (
            <li className="flex items-center gap-1">
              <Bath size={13} /> {bathrooms} Bath
            </li>
          )}
        </ul>
        <div className="mt-1 flex items-center justify-between">
          <PriceDisplay amountUsd={stablecoinUnitsToUsd(parseInt(bid.bid_amount) || 0)} suffix={mode === "rent" ? "/yr" : ""} compact />
        </div>

        {!isTerminalPhase && (
          <DealProgress steps={dealTimeline.steps} viewingNotAgreed={dealTimeline.viewingNotAgreed} role={role === "seller" ? "seller" : "buyer"} />
        )}

        <p className="my-1 text-xs italic text-secondaryText">{statusMessage}</p>

        {/* The agreement itself. The buyer used to be asked to confirm
            documents they had never been shown: nothing on the card or in the
            dialog displayed them. */}
        {agreementShown && (
          <div className="my-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-[#333]">Agreement from the seller</p>
            {bid.document_description && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-[#555]">{bid.document_description}</p>
            )}
            {agreementImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {agreementImages.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Agreement page ${i + 1}`} className="h-20 w-16 rounded border border-amber-200 object-cover" />
                  </a>
                ))}
              </div>
            )}
            {agreementImages.length > 0 && (
              <p className="mt-1 text-[11px] text-secondaryText">Tap a page to open it full size.</p>
            )}
          </div>
        )}

        {phase === TransactionPhase.BID_PENDING && bidExpiresAtMs !== undefined && (
          <p className={`my-1 text-[11px] ${isBidExpired ? "text-red-600" : "text-amber-700"}`}>
            {isBidExpired
              ? role === "buyer"
                ? "This bid expired. The seller can no longer accept it. Reclaim your funds below."
                : "This bid has expired and can no longer be accepted."
              : `Expires ${formatCountdown(bidExpiresAtMs).label.replace(" left", " from now")}`}
          </p>
        )}

        {transaction.escrowReleaseTxHash && transaction.escrowReleaseTxHash !== "confirmed_by_buyer" && (
          <a
            href={getTxExplorerUrl(transaction.escrowReleaseTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="my-1 block text-[10px] text-blue-600 underline"
          >
            View on NEAR Explorer ↗
          </a>
        )}

        {role === "seller" && <p className="mt-1 break-all rounded bg-gray-50 px-2 py-1.5 text-[10px] text-secondaryText">Bidder: {bid.bidder_id}</p>}
      </div>

      {actionLoading ? (
        <p className="flex items-center justify-center gap-2 border-t border-borderColor py-3 text-sm text-secondaryText">
          <Spinner size={18} /> Processing...
        </p>
      ) : actions.left || actions.right ? (
        <div className="flex border-t border-borderColor">
          {actions.left ? (
            <ActionButton act={actions.left} half={!!actions.right} />
          ) : (
            <button type="button" onClick={handleDetailsNavigation} className="w-1/2 border-r border-borderColor py-3 text-sm text-secondaryText hover:bg-cardBackground">
              View Details
            </button>
          )}
          {actions.right && <ActionButton act={actions.right} half />}
        </div>
      ) : null}
    </article>
  );
};

function ActionButton({ act, half }: { act: { label: string; onPress: () => void; color?: string; disabled?: boolean }; half: boolean }) {
  return (
    <button
      type="button"
      onClick={act.onPress}
      aria-disabled={act.disabled || undefined}
      className={`${half ? "w-1/2" : "w-full"} truncate border-r border-borderColor px-2 py-3 text-sm last:border-r-0 hover:bg-cardBackground ${act.disabled ? "text-xs" : ""}`}
      style={{ color: act.color || "#C1272D" }}
    >
      {act.label}
    </button>
  );
}

export default OngoingCard;
