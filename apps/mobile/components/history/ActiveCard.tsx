import { View, TouchableOpacity, ActivityIndicator, Image, GestureResponderEvent } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
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
} from "@/types/transaction";
import { stablecoinUnitsToNaira, formatNaira } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useState, useEffect, useCallback } from "react";
import nearContractService from "@/services/nearContract";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import RatingModal from "@/components/RatingModal";
import PriceDisplay from "@/components/common/PriceDisplay";
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
  const priceNaira = stablecoinUnitsToNaira(parseInt(bid.bid_amount) || 0, ngnPerUsd || 1500);
  const mode = bid.action === "Lease" ? "rent" : "buy";
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : require("@/assets/images/apt-1.png");

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
    <TouchableOpacity
      className="w-full rounded-lg bg-background"
      onPress={handleDetailsNavigation}
    >
      {/* Property Image with Countdown Badge */}
      <View className="rounded-t-lg overflow-hidden">
        <Image
          source={imageSource}
          resizeMode="cover"
          style={{ width: "100%", height: 175, borderRadius: 8 }}
        />

        {/* Countdown Badge */}
        <View className="absolute top-3 right-3">
          <View
            style={{ backgroundColor: urgencyColors.bg }}
            className="px-3 py-1.5 rounded-full"
          >
            <InterMedium style={{ color: urgencyColors.text }} className="text-[11px]">
              ⏱ {countdown.label}
            </InterMedium>
          </View>
        </View>

        {/* Phase + Role Badges */}
        <View className="absolute top-3 left-3 flex-row gap-2">
          <View
            style={{ backgroundColor: phaseColor.bg }}
            className="px-2.5 py-1 rounded-full"
          >
            <InterMedium style={{ color: phaseColor.text }} className="text-[10px]">
              {PHASE_LABELS[phase]}
            </InterMedium>
          </View>
          <View
            className={`px-2.5 py-1 rounded-full ${role === "seller" ? "bg-blue-100" : "bg-purple-100"}`}
          >
            <InterMedium
              className={`text-[10px] ${role === "seller" ? "text-blue-700" : "text-purple-700"}`}
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

        {/* Agreement Duration Info */}
        <View className="mt-1 px-2 py-1.5 bg-gray-50 rounded">
          <InterRegular className="text-[10px] text-secondaryText">
            {mode === "rent" ? "🏠 Lease" : "🏡 Purchase"} agreement
            {transaction.agreementDurationDays
              ? ` • ${formatDuration(transaction.agreementDurationDays * 24 * 60 * 60 * 1000)}`
              : ""}
          </InterRegular>
        </View>
      </View>

      {/* Counterparty Profile */}
      {counterpartyProfile && (
        <ProfileVisibilityCard
          profile={counterpartyProfile}
          variant="transaction"
        />
      )}

      {/* Action Buttons */}
      <View className="flex-row border-t border-borderColor">
        {actionLoading ? (
          <View className="flex-1 flex-row py-3 justify-center">
            <ActivityIndicator size="small" color="#C1272D" />
            <InterRegular className="ml-2 text-sm text-secondaryText">Processing...</InterRegular>
          </View>
        ) : (
          <>
            {/* Left slot is role-specific. The buyer gets Rate Property —
                this card is where a completed purchase and a lease inside
                its term live, which is exactly when a buyer has something
                to rate. (That action used to be gated on
                `phase === DISPUTED`, a condition this card can never see:
                `completed` only ever contains COMPLETED, so the rating
                entry point — and the RatingModal below it — was
                unreachable and buyers had no way to rate at all.)
                Details stay reachable for both roles by tapping the card. */}
            <View className="w-1/2 border-r border-borderColor">
              {role === "buyer" ? (
                <Button
                  color=""
                  isFull
                  onPress={(e: GestureResponderEvent) => {
                    e.stopPropagation();
                    setShowRating(true);
                  }}
                >
                  <InterRegular style={{ color: "#F59E0B" }}>⭐ Rate Property</InterRegular>
                </Button>
              ) : (
                <Button
                  color=""
                  isFull
                  onPress={(e: GestureResponderEvent) => {
                    e.stopPropagation();
                    handleDetailsNavigation();
                  }}
                >
                  <InterRegular className="text-secondaryText">View Details</InterRegular>
                </Button>
              )}
            </View>
            <View className="w-1/2">
              <Button
                color=""
                isFull
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleRaiseDispute();
                }}
              >
                <InterRegular style={{ color: "#DC2626" }}>Raise Dispute</InterRegular>
              </Button>
            </View>
          </>
        )}
      </View>

      {/* Rating Modal */}
      <RatingModal
        visible={showRating}
        onClose={() => setShowRating(false)}
        propertyId={bid.property_id}
        propertyTitle={title}
      />
    </TouchableOpacity>
  );
};

export default ActiveCard;