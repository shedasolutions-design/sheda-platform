import { View, TouchableOpacity, ActivityIndicator, Image, GestureResponderEvent, Linking } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import InterSemiBold from "@/components/Text/InterSemiBold";
import DealProgress from "@/components/history/DealProgress";
import { useDealTimeline } from "@/hooks/useDealTimeline";
import api from "@/services/api";
import InterBold from "@/components/Text/InterBold";

import Button from "@/components/common/Button";
import { router } from "expo-router";
import Icon from "@/components/common/Icon";
import { MESSAGE, LOCATION, BATH, BED } from "@/assets/icons";

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
import PriceDisplay from "@/components/common/PriceDisplay";
import { useCurrency } from "@/contexts/CurrencyContext";

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
  const priceNaira = stablecoinUnitsToNaira(parseInt(bid.bid_amount) || 0, ngnPerUsd || 1500);
  const priceUsd = stablecoinUnitsToUsd(parseInt(bid.bid_amount) || 0);
  const displayPrice = formatPrice(priceUsd);
  const mode = bid.action === "Lease" ? "rent" : "buy";
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : require("@/assets/images/apt-1.png");

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
      "Confirm that you have received and reviewed the property documents?",
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
                  type: "doc_confirmed",
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

  const renderActions = () => {
    if (actionLoading) {
      return (
        <View className="flex-row border-t border-borderColor py-3 justify-center">
          <ActivityIndicator size="small" color="#C1272D" />
          <InterRegular className="ml-2 text-sm text-secondaryText">Processing...</InterRegular>
        </View>
      );
    }

    const actions: { left?: { label: string; onPress: () => void; color?: string }; right?: { label: string; onPress: () => void; color?: string; disabled?: boolean } } = {};

    if (role === "seller") {
      switch (phase) {
        case TransactionPhase.BID_PENDING:
          actions.left = { label: "Reject", onPress: handleRejectBid, color: "#6B7280" };
          actions.right = isRenewalBid
            ? { label: "Accept Renewal", onPress: handleAcceptRenewal, color: "#C1272D" }
            : { label: "Accept Bid", onPress: handleAcceptBid, color: "#C1272D" };
          break;
        case TransactionPhase.BID_ACCEPTED:
          // Seller waits for buyer to book appointment
          break;
        case TransactionPhase.APPOINTMENT_BOOKED:
          actions.left = { label: "Reject", onPress: handleRejectAppointment, color: "#6B7280" };
          actions.right = { label: "Accept Appointment", onPress: handleAcceptAppointment, color: "#C1272D" };
          break;
        case TransactionPhase.APPOINTMENT_ACCEPTED:
          // Accepting the appointment only means the slot was agreed — it says
          // nothing about whether the viewing happened or how it went. The
          // agreement should only go out once the parties have actually met
          // and agreed, since handing it over is what the buyer's rejection
          // (and the burn behind it) exists to protect.
          //
          // Not a hard block: the outcome is recorded off-chain and a seller
          // who met the buyer but never logged it shouldn't be stuck. Disabled
          // with an explanation rather than hidden.
          // Recording the outcome is what opens the gate below, so it has to
          // be reachable from the same place — otherwise the seller sees a
          // disabled button with no way to satisfy it.
          if (dealTimeline.pendingAppointmentId && !dealTimeline.viewingNotAgreed) {
            actions.left = {
              label: "Viewing Done",
              onPress: () => handleRecordViewingOutcome(true),
              color: "#065F46",
            };
          }

          if (dealTimeline.viewingNotAgreed) {
            actions.right = {
              label: "Viewing Not Agreed",
              onPress: () => Alert.alert(
                "The Viewing Didn't End in Agreement",
                "This viewing was recorded as not agreed, so the deal isn't ready for documents. The buyer can cancel and be refunded at this stage."
              ),
              color: "#9CA3AF",
              disabled: true,
            };
          } else if (!dealTimeline.sellerCanReleaseDocuments && !dealTimeline.loading) {
            actions.right = {
              label: "Awaiting Viewing",
              onPress: () => Alert.alert(
                "Confirm the Viewing First",
                "Once you and the buyer have met and agreed to go ahead, mark the appointment as completed. Releasing the agreement before then hands over your terms to someone who hasn't committed to the viewing."
              ),
              color: "#9CA3AF",
              disabled: true,
            };
          } else {
            actions.right = { label: "Release Documents", onPress: handleReleaseDocuments, color: "#C1272D" };
          }
          break;
        case TransactionPhase.DOCS_RELEASED:
          // Seller waits for buyer to confirm docs
          break;
        case TransactionPhase.DOCS_CONFIRMED:
          actions.left = { label: "Raise Dispute", onPress: handleRaiseDispute, color: "#991B1B" };
          // Seller waits for buyer to release payment
          break;
        case TransactionPhase.PAYMENT_RELEASED:
          actions.right = { label: "Complete", onPress: handleCompleteTransaction, color: "#065F46" };
          break;
      }
    } else {
      // buyer
      switch (phase) {
        case TransactionPhase.BID_PENDING:
          if (isBidExpired) {
            // Past expiry the seller can no longer accept this bid — the
            // contract rejects it on any accept attempt — so "Cancel Bid"
            // understates what's actually needed: the funds are stranded
            // until the buyer claims them back.
            actions.right = {
              label: "Reclaim Funds",
              onPress: handleClaimLostBid,
              color: "#C1272D",
            };
          } else {
            actions.left = { label: "Cancel Bid", onPress: handleCancelBid, color: "#6B7280" };
          }
          break;
        case TransactionPhase.BID_ACCEPTED:
          // The buyer's escrow is locked from here until the deal completes,
          // and this stage waits on a viewing the chain can't see. There is no
          // deadline on this exit for exactly that reason — a viewing that
          // can't be arranged must not cost the buyer their money.
          actions.left = {
            label: "Cancel Deal",
            onPress: () => handleBuyerCancelDeal("accepted"),
            color: "#6B7280",
          };
          actions.right = {
            label: "Book Appointment", onPress: () => {
              // Same id-space hazard as handleReleaseDocuments above:
              // propertyDetails.id is the backend's numeric property id,
              // never bid.property_id (the on-chain id). Booking with the
              // wrong id silently 404s against a property that doesn't
              // exist in the backend's database.
              if (!propertyDetails?.id) {
                Alert.alert(
                  "This property isn't in our records",
                  "The deal is live on-chain, but we have no saved record of this property, which is what booking a viewing needs. That usually means the listing was created directly on-chain rather than through the app. Ask the seller to re-save the listing, or contact support with this property's on-chain ID: " +
                  String(bid.property_id) + "."
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
            }, color: "#C1272D"
          };
          break;
        case TransactionPhase.APPOINTMENT_BOOKED:
          // Buyer waits for seller to accept
          break;
        case TransactionPhase.APPOINTMENT_ACCEPTED:
          // Buyer waits for documents
          break;
        case TransactionPhase.DOCS_RELEASED:
          // Reject rather than dispute: rejecting burns the agreement and
          // refunds the buyer straight away. It replaces "Raise Dispute" here
          // because this is the last point a buyer can simply walk away —
          // confirming is the commitment, and after it a dispute is the only
          // route left.
          actions.left = {
            label: "Reject Agreement",
            onPress: () => handleBuyerCancelDeal("documents"),
            color: "#991B1B",
          };
          actions.right = { label: "Confirm Documents", onPress: handleConfirmDocuments, color: "#C1272D" };
          break;
        case TransactionPhase.DOCS_CONFIRMED:
          actions.left = { label: "Raise Dispute", onPress: handleRaiseDispute, color: "#991B1B" };
          if (!escrowCountdown.ready) {
            actions.right = {
              label: escrowCountdown.label,
              onPress: () => Alert.alert(
                "Escrow Locked",
                "Funds are held in escrow for 24 hours after document confirmation before payment can be released. This protects both parties."
              ),
              color: "#9CA3AF",
              disabled: true,
            };
          } else {
            actions.right = { label: "Release Payment", onPress: handleReleasePayment, color: "#C1272D" };
          }
          break;
        case TransactionPhase.PAYMENT_RELEASED:
          actions.right = { label: "Complete", onPress: handleCompleteTransaction, color: "#065F46" };
          break;
      }
    }

    if (!actions.left && !actions.right) {
      return null; // No actions available at this phase
    }

    return (
      <View className="flex-row border-t border-borderColor">
        {actions.left ? (
          <View className={`${actions.right ? 'w-1/2 border-r border-borderColor' : 'w-full'}`}>
            <Button color="" isFull onPress={(e: GestureResponderEvent) => { e.stopPropagation(); actions.left!.onPress(); }}>
              <InterRegular style={{ color: actions.left.color || "#6B7280" }}>
                {actions.left.label}
              </InterRegular>
            </Button>
          </View>
        ) : actions.right ? (
          <View className="w-1/2 border-r border-borderColor">
            <Button color="" isFull onPress={(e: GestureResponderEvent) => { e.stopPropagation(); handleDetailsNavigation(); }}>
              <InterRegular className="text-secondaryText">View Details</InterRegular>
            </Button>
          </View>
        ) : null}

        {actions.right && (
          <View className={`${actions.left || (!actions.left && actions.right) ? 'w-1/2' : 'w-full'}`}>
            <Button color="" isFull onPress={(e: GestureResponderEvent) => { e.stopPropagation(); actions.right!.onPress(); }}>
              <InterRegular
                className={actions.right.disabled ? "text-xs" : undefined}
                numberOfLines={1}
                style={{ color: actions.right.color || "#C1272D" }}
              >
                {actions.right.label}
              </InterRegular>
            </Button>
          </View>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      className="w-full rounded-lg bg-background"
      onPress={handleDetailsNavigation}
    >
      {/* Property Image */}
      <View className="rounded-t-lg overflow-hidden">
        <Image
          source={imageSource}
          resizeMode="cover"
          style={{ width: "100%", height: 175, borderRadius: 8 }}
        />
        {/* Phase Badge */}
        <View className="absolute top-3 left-3">
          <View
            style={{ backgroundColor: phaseColor.bg }}
            className="px-2.5 py-1 rounded-full"
          >
            <InterMedium style={{ color: phaseColor.text }} className="text-[10px]">
              {PHASE_LABELS[phase]}
            </InterMedium>
          </View>
        </View>
        {/* Role Badge */}
        <View className="absolute top-3 right-3">
          <View
            className={`px-2.5 py-1 rounded-full ${role === "seller" ? "bg-blue-100" : "bg-purple-100"
              }`}
          >
            <InterMedium
              className={`text-[10px] ${role === "seller" ? "text-blue-700" : "text-purple-700"
                }`}
            >
              {role === "seller" ? "Selling" : "Buying"}
            </InterMedium>
          </View>
        </View>
      </View>

      {/* Property Info */}
      <View className="px-3 py-2 w-full">
        <InterMedium className="text-sm/5" numberOfLines={1}>{title}</InterMedium>

        <View className="mt-1 w-full">
          <View className="flex-row gap-2">
            <View className="flex-row items-center gap-1">
              <Icon icon={LOCATION} width={10} height={20} />
              <InterMedium className="text-[#878787BF] text-xs/[150%]">{location}</InterMedium>
            </View>
            {bedrooms > 0 && (
              <View className="flex-row items-center gap-1">
                <Icon icon={BED} width={20} height={20} />
                <InterMedium className="text-[#878787BF] text-xs/[150%]">{bedrooms} Bed</InterMedium>
              </View>
            )}
            {bathrooms > 0 && (
              <View className="flex-row items-center gap-1">
                <Icon icon={BATH} width={15} height={15} />
                <InterMedium className="text-[#878787BF] text-xs/[150%]">{bathrooms} Bath</InterMedium>
              </View>
            )}
          </View>
        </View>

        <View className="flex-row justify-between items-center mt-1">
          <PriceDisplay
            amountFiat={priceNaira}
            fiatCode="NGN"
            suffix={mode === "rent" ? "/yr" : ""}
            size="md"
            compact
          />

          <Button
            isFull={false}
            color=""
            className="p-0 m-0 flex-row"
            onPress={(e: GestureResponderEvent) => {
              e.stopPropagation();
              handleDetailsNavigation();
            }}
          >
            <Icon icon={MESSAGE} width={24} height={24} />
          </Button>
        </View>

        {/* Where the deal actually stands, across both halves of the system.
            The appointments live in the backend and everything else is on
            chain, so without this a deal waiting on a viewing looked exactly
            like one that had stalled. Hidden once the deal is over — a
            completed or cancelled deal has nothing left to wait on. */}
        {!isTerminalPhase && (
          <DealProgress
            steps={dealTimeline.steps}
            viewingNotAgreed={dealTimeline.viewingNotAgreed}
            role={role === "seller" ? "seller" : "buyer"}
          />
        )}

        {/* Status Message */}
        <View className="mt-1 mb-1">
          <InterRegular className="text-xs text-secondaryText italic">
            {statusMessage}
          </InterRegular>
        </View>

        {/* Bid expiry — funds sit in escrow until this passes, and nothing
            refunds them automatically afterwards, so both sides should see
            it coming rather than discovering it later. */}
        {phase === TransactionPhase.BID_PENDING && bidExpiresAtMs !== undefined && (
          <View className="mt-1 mb-1">
            <InterRegular
              className={`text-[11px] ${isBidExpired ? "text-red-600" : "text-amber-700"}`}
            >
              {isBidExpired
                ? role === "buyer"
                  ? "This bid expired — the seller can no longer accept it. Reclaim your funds below."
                  : "This bid has expired and can no longer be accepted."
                : `Expires ${formatCountdown(bidExpiresAtMs).label.replace(" left", " from now")}`}
            </InterRegular>
          </View>
        )}

        {/* Explorer Link for tx hash */}
        {transaction.escrowReleaseTxHash && transaction.escrowReleaseTxHash !== "confirmed_by_buyer" && (
          <TouchableOpacity
            className="mt-1 mb-1"
            onPress={() => openTxOnExplorer(transaction.escrowReleaseTxHash!)}
          >
            <InterRegular className="text-[10px] text-blue-600 underline">
              View on NEAR Explorer ↗
            </InterRegular>
          </TouchableOpacity>
        )}

        {/* Bidder info for seller */}
        {role === "seller" && (
          <View className="mt-1 px-2 py-1.5 bg-gray-50 rounded">
            <InterRegular className="text-[10px] text-secondaryText">
              Bidder: {bid.bidder_id}
            </InterRegular>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {renderActions()}
    </TouchableOpacity>
  );
};

export default OngoingCard;
