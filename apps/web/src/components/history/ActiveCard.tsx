"use client";

import { leaseSuffix } from "@/utilities/leaseTerm";
import { DealCard, DealMedia, Badge, RoleBadge, DealFacts, DealActions, DealAction, dealImage } from "@/components/history/DealCardParts";
import Alert from "@/utilities/alertPolyfill";
import { router } from "@/lib/router";
import {
  Transaction,
  TransactionPhase,
  PHASE_LABELS,
  PHASE_COLORS,
} from "@/types/transaction";
import { stablecoinUnitsToNaira, formatNaira, stablecoinUnitsToUsd } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useState, useEffect, useCallback } from "react";
import nearContractService from "@/services/nearContract";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import RatingModal from "@/components/RatingModal";
import PriceDisplay from "@/components/property/PriceDisplay";
import ProfileVisibilityCard from "@/components/common/ProfileVisibilityCard";
import { sanitizeAgentProfile, buildSafeProfile } from "@/utilities/profileSanitizer";
import { formatCountdown, formatDuration } from "@/utilities/formatDuration";
import type { SafeUserProfile } from "@/types/profile";
import type { AgentFeed } from "@/services/api";

interface ActiveCardProps {
  transaction: Transaction;
  onPhaseUpdate: (
    bidId: number,
    propertyId: number,
    phase: TransactionPhase,
    extra?: any
  ) => Promise<void>;
}

const URGENCY_COLORS = {
  normal: { bg: "#D1FAE5", text: "#065F46" },
  warning: { bg: "#FEF3C7", text: "#92400E" },
  danger: { bg: "#FEE2E2", text: "#991B1B" },
  expired: { bg: "#F3F4F6", text: "#6B7280" },
};

const ActiveCard = ({ transaction, onPhaseUpdate }: ActiveCardProps) => {
  const { bid, property, propertyDetails, phase, role, expiresAt } = transaction;
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { sendTransactionUpdate, getAgentProfile, getUserByWallet } = useApi();
  const { run: runTransaction } = useTransactionToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const { ngnPerUsd } = useExchangeRates();
  const [counterpartyProfile, setCounterpartyProfile] = useState<SafeUserProfile | null>(null);

  // Live countdown state
  const [countdown, setCountdown] = useState(() => formatCountdown(expiresAt));

  useEffect(() => {
    setCountdown(formatCountdown(expiresAt));
    const interval = setInterval(() => {
      setCountdown(formatCountdown(expiresAt));
    }, 60_000); // Update every minute
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Fetch counterparty profile
  useEffect(() => {
    const fetchCounterparty = async () => {
      try {
        if (role === "buyer" && propertyDetails?.agent_id) {
          // Buyer sees the seller/agent profile
          const agentData: AgentFeed = await getAgentProfile(propertyDetails.agent_id, { silent: true });
          if (agentData) {
            setCounterpartyProfile(sanitizeAgentProfile(agentData, "seller"));
          }
        } else if (role === "seller") {
          // Seller sees the buyer — we might only have wallet ID
          // Try fetching buyer as an agent (same API)
          // Fallback to wallet-based minimal profile
          setCounterpartyProfile(buildSafeProfile({
            displayName: bid.bidder_id ? bid.bidder_id.split('.')[0] : "Buyer",
            role: "buyer",
          }));
        }
      } catch {
        // Silent — profile card is non-critical
      }
    };
    fetchCounterparty();
  }, [role, propertyDetails?.agent_id, bid.bidder_id, getAgentProfile]);

  const phaseColor = PHASE_COLORS[phase];
  const title = propertyDetails?.title || property.description || "Property";
  const location = propertyDetails?.location || "—";
  const bedrooms = propertyDetails?.bedroom || 0;
  const bathrooms = propertyDetails?.bathroom || 0;
  const mode = bid.action === "Lease" ? "rent" : "buy";
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : { uri: "/images/apt-1.png" };

  const urgencyColors = URGENCY_COLORS[countdown.urgency];

  // Same counterparty-resolution pattern as OngoingCard: buyer's numeric id
  // isn't known here directly (only their wallet address), the seller's is
  // already propertyDetails.agent_id.
  const resolveCounterpartyUserId = async (): Promise<number | null> => {
    if (role === "buyer") {
      return propertyDetails?.agent_id ?? null;
    }
    try {
      const buyerInfo = await getUserByWallet(bid.bidder_id);
      return buyerInfo?.id ?? null;
    } catch (err) {
      console.warn("ActiveCard: Failed to resolve buyer's user id from wallet:", err);
      return null;
    }
  };

  // Navigate to property details
  const handleDetailsNavigation = () => {
    if (propertyDetails?.id) {
      router.push({
        pathname: "/details/[id]",
        params: { id: String(propertyDetails.id) },
      });
    }
  };

  // ---- Raise Dispute ----
  const handleRaiseDispute = useCallback(() => {
    Alert.alert(
      "Raise Dispute",
      `Are you sure you want to raise a dispute for "${title}"? This will freeze the escrow until the dispute is resolved.`,
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

              // On-chain: raise_dispute(bid_id, property_id, reason)
              const result = await runTransaction({
                loadingMessage: "Raising dispute...",
                successMessage: "The escrow has been frozen. Our team will review your case.",
                notification: {
                  type: "general",
                  title: "Dispute Raised",
                  message: `You raised a dispute for "${title}". Escrow is now frozen.`,
                },
                action: async () => {
                  const bidResult = await nearContractService.raiseDispute(
                    walletState.account!.accountId,
                    privateKey,
                    {
                      bid_id: bid.id,
                      property_id: bid.property_id,
                      reason: `Dispute raised by ${role} for "${title}"`,
                    }
                  );
                  if (!bidResult.success) {
                    throw new Error(bidResult.error || "Failed to raise dispute");
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.DISPUTED);

                // Notify counterparty
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "dispute_raised",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `A dispute has been raised for "${title}".`,
                    metadata: { raised_by: role },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to raise dispute");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [
    title, walletState, getAuthorizedPrivateKey, property,
    bid, onPhaseUpdate, runTransaction, sendTransactionUpdate, role,
  ]);

  return (
    <DealCard>
      <DealMedia
        src={dealImage(imageSource)}
        alt={title}
        onOpen={handleDetailsNavigation}
        badges={
          <>
            <span className="absolute left-3 top-3 flex gap-2">
              <Badge style={{ backgroundColor: phaseColor.bg, color: phaseColor.text }}>{PHASE_LABELS[phase]}</Badge>
              <RoleBadge role={role} />
            </span>
            <Badge className="absolute right-3 top-3 !text-[11px]" style={{ backgroundColor: urgencyColors.bg, color: urgencyColors.text }}>
              ⏱ {countdown.label}
            </Badge>
          </>
        }
      />
      <div className="px-3 py-2">
        <DealFacts title={title} location={location} bedrooms={bedrooms} bathrooms={bathrooms} />
        <div className="mt-1">
          <PriceDisplay amountUsd={stablecoinUnitsToUsd(parseInt(bid.bid_amount) || 0)} suffix={mode === "rent" ? leaseSuffix(property.lease_duration_days) : ""} compact />
        </div>
        <p className="mt-1 rounded bg-gray-50 px-2 py-1.5 text-[10px] text-secondaryText">
          {mode === "rent" ? "🏠 Lease" : "🏡 Purchase"} agreement
          {transaction.agreementDurationDays ? ` • ${formatDuration(transaction.agreementDurationDays * 24 * 60 * 60 * 1000)}` : ""}
        </p>
      </div>

      {counterpartyProfile && <ProfileVisibilityCard profile={counterpartyProfile} variant="transaction" />}

      <DealActions loading={actionLoading}>
        {/* The buyer rates the seller here: this card is where a completed
            purchase and a running lease live. */}
        {role === "buyer" ? (
          <DealAction onClick={() => setShowRating(true)} color="#F59E0B">
            ⭐ Rate Seller
          </DealAction>
        ) : (
          <DealAction onClick={handleDetailsNavigation}>View Details</DealAction>
        )}
        <DealAction onClick={handleRaiseDispute} color="#DC2626">
          Raise Dispute
        </DealAction>
      </DealActions>

      <RatingModal
        visible={showRating}
        onClose={() => setShowRating(false)}
        sellerId={propertyDetails?.agent_id ?? null}
        propertyTitle={title}
      />
    </DealCard>
  );
};

export default ActiveCard;
