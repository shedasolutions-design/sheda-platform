"use client";

import { DealCard, DealMedia, Badge, RoleBadge, DealFacts, DealActions, DealAction, dealImage } from "@/components/history/DealCardParts";
import { router } from "@/lib/router";
import {
  Transaction,
  TransactionPhase,
  PHASE_LABELS,
  PHASE_COLORS,
  BUYER_STATUS,
  SELLER_STATUS,
} from "@/types/transaction";
import { Action } from "@/types/contract";
import { stablecoinUnitsToUsd } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import PriceDisplay from "@/components/property/PriceDisplay";
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
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : { uri: "/images/apt-1.png" };

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
    <DealCard>
      <DealMedia
        src={dealImage(imageSource)}
        alt={title}
        onOpen={handleDetailsNavigation}
        badges={
          <>
            <span className="absolute left-3 top-3">
              <RoleBadge role={role} />
            </span>
            <Badge className="absolute right-3 top-3 !text-[11px]" style={{ backgroundColor: phaseColor.bg, color: phaseColor.text }}>
              {PHASE_LABELS[phase]}
            </Badge>
          </>
        }
      />
      <div className="px-3 py-2">
        <DealFacts title={title} location={location} bedrooms={bedrooms} bathrooms={bathrooms} />
        <div className="mt-1 flex items-center justify-between">
          <PriceDisplay amountUsd={stablecoinUnitsToUsd(parseInt(bid.bid_amount) || 0)} suffix={isLease ? "/yr" : ""} compact />
          {!!updatedAt && <span className="text-xs text-[#878787BF]">{formatRelativeTime(updatedAt)}</span>}
        </div>
        {!!statusLine && <p className="mt-1 rounded bg-gray-50 px-2 py-1.5 text-[11px] italic text-secondaryText">{statusLine}</p>}
      </div>
      <DealActions>
        <DealAction onClick={handleDetailsNavigation}>View Details</DealAction>
        {canBidAgain && (
          <DealAction onClick={handleDetailsNavigation} color="#C1272D">
            Bid Again
          </DealAction>
        )}
      </DealActions>
    </DealCard>
  );
};

export default CancelledCard;
