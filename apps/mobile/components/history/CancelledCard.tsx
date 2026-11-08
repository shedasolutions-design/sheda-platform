import { View, TouchableOpacity, Image, GestureResponderEvent } from "react-native";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import Button from "@/components/common/Button";
import { router } from "expo-router";
import Icon from "@/components/common/Icon";
import { LOCATION, BATH, BED } from "@/assets/icons";
import {
  Transaction,
  TransactionPhase,
  PHASE_LABELS,
  PHASE_COLORS,
  BUYER_STATUS,
  SELLER_STATUS,
} from "@/types/transaction";
import { Action } from "@/types/contract";
import { stablecoinUnitsToNaira } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import PriceDisplay from "@/components/common/PriceDisplay";
import { formatRelativeTime } from "@/utilities/formatTimestamp";

interface CancelledCardProps {
  transaction: Transaction;
  /** Part of the shared card contract; a closed transaction has no phase to advance. */
  onPhaseUpdate: (
    bidId: number,
    propertyId: number,
    phase: TransactionPhase,
    extra?: any
  ) => Promise<void>;
}

/**
 * Renders a transaction that ended without completing — a rejected bid, a
 * cancelled one, or a dispute with escrow frozen.
 *
 * This is a record, not a pipeline: there is no phase left to advance, so the
 * card carries no lifecycle actions. What it does owe the user is *why* it's
 * here — the phase pill and the role-appropriate status line — and a way back
 * to the property. Buyers get "Bid Again" when the property is still for
 * sale, which is the only forward move available from a dead bid.
 *
 * Before this existed the Cancelled tab fell through to OngoingCard, which is
 * built to drive a live bid/escrow flow, so closed transactions were rendered
 * by a card whose whole purpose doesn't apply to them.
 */
const CancelledCard = ({ transaction }: CancelledCardProps) => {
  const { bid, property, propertyDetails, phase, role, updatedAt } = transaction;
  const { ngnPerUsd } = useExchangeRates();

  const title = propertyDetails?.title || property.description || "Property";
  const location = propertyDetails?.location || "—";
  const bedrooms = propertyDetails?.bedroom || 0;
  const bathrooms = propertyDetails?.bathroom || 0;
  const isLease = bid.action === Action.Lease;
  const priceNaira = stablecoinUnitsToNaira(
    parseInt(bid.bid_amount) || 0,
    ngnPerUsd || 1500
  );
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : require("@/assets/images/apt-1.png");

  const phaseColor = PHASE_COLORS[phase];
  const statusLine = role === "buyer" ? BUYER_STATUS[phase] : SELLER_STATUS[phase];
  const isDisputed = phase === TransactionPhase.DISPUTED;

  // A rejected/cancelled bid is only worth re-placing if the property is
  // still accepting them — and only the buyer can place one.
  const canBidAgain =
    role === "buyer" && !isDisputed && property.is_for_sale === true;

  const handleDetailsNavigation = () => {
    if (propertyDetails?.id) {
      router.push({
        pathname: "/details/[id]",
        params: { id: String(propertyDetails.id) },
      });
    }
  };

  return (
    <TouchableOpacity
      className="w-full rounded-lg bg-background"
      onPress={handleDetailsNavigation}
    >
      <View className="rounded-t-lg overflow-hidden">
        <Image
          source={imageSource}
          resizeMode="cover"
          style={{ width: "100%", height: 175, borderRadius: 8 }}
        />
        <View className="absolute top-3 left-3">
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
        <View className="absolute top-3 right-3">
          <View
            className="px-3 py-1.5 rounded-full"
            style={{ backgroundColor: phaseColor.bg }}
          >
            <InterMedium className="text-[11px]" style={{ color: phaseColor.text }}>
              {PHASE_LABELS[phase]}
            </InterMedium>
          </View>
        </View>
      </View>

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
            suffix={isLease ? "/yr" : ""}
            size="md"
            compact
          />
          {!!updatedAt && (
            <InterRegular className="text-[#878787BF] text-xs">
              {formatRelativeTime(updatedAt)}
            </InterRegular>
          )}
        </View>

        {!!statusLine && (
          <View
            className={`mt-2 px-2 py-1.5 rounded ${isDisputed ? "bg-red-50" : "bg-gray-50"}`}
          >
            <InterRegular
              className={`text-[10px] ${isDisputed ? "text-red-700" : "text-secondaryText"}`}
            >
              {statusLine}
            </InterRegular>
          </View>
        )}
      </View>

      <View className="flex-row border-t border-borderColor">
        <View className={canBidAgain ? "w-1/2 border-r border-borderColor" : "w-full"}>
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
        </View>
        {canBidAgain && (
          <View className="w-1/2">
            <Button
              color=""
              isFull
              onPress={(e: GestureResponderEvent) => {
                e.stopPropagation();
                handleDetailsNavigation();
              }}
            >
              <InterRegular style={{ color: "#C1272D" }}>Bid Again</InterRegular>
            </Button>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default CancelledCard;
