import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import InterBold from '@/components/Text/InterBold';
import InterRegular from '@/components/Text/InterRegular';
import InterSemiBold from '@/components/Text/InterSemiBold';
import { OfferMessage, OfferStatus } from '@/types/offer';

interface OfferMessageCardProps {
  offer: OfferMessage;
  isSeller: boolean;
  onViewInHistory?: (offer: OfferMessage) => void;
}

// Read-only summary of a bid, shown inline in chat. Accepting/rejecting is
// deliberately NOT done here — it happens in History > Ongoing, which is the
// single place bid actions live (so there's one on-chain action surface per
// bid, not two that can drift out of sync with each other).
const OfferMessageCard: React.FC<OfferMessageCardProps> = ({
  offer,
  isSeller,
  onViewInHistory,
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const priceDifference = offer.originalPrice - offer.offeredPrice;
  const discountPercentage = ((priceDifference / offer.originalPrice) * 100).toFixed(1);

  return (
    <View className="bg-white border border-gray-200 rounded-lg p-4 my-2" style={{ overflow: 'visible' }}>
      {/* Header */}
      <View className="flex-row items-center mb-3">
        <View className="bg-blue-100 rounded-full p-2 mr-3">
          <InterBold className="text-blue-600 text-xs"> </InterBold>
        </View>
        <View className="flex-1">
          <InterSemiBold className="text-base text-gray-800">
            {isSeller ? 'New Offer Received' : 'Offer Sent'}
          </InterSemiBold>
          <InterRegular className="text-xs text-gray-500">
            {new Date(offer.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </InterRegular>
        </View>
      </View>

      {/* Property Info */}
      <View className="mb-3">
        <InterRegular className="text-sm text-gray-600 mb-1">Property</InterRegular>
        <InterSemiBold className="text-base text-gray-900">{offer.propertyTitle}</InterSemiBold>
      </View>

      {/* Buyer Info (only show to seller) */}
      {isSeller && (
        <View className="mb-3">
          <InterRegular className="text-sm text-gray-600 mb-1">From</InterRegular>
          <InterSemiBold className="text-base text-gray-900">{offer.buyerName}</InterSemiBold>
        </View>
      )}

      {/* Price Comparison */}
      <View className="bg-gray-50 rounded-lg p-3 mb-3">
        {offer.originalPrice > 0 && (
          <View className="flex-row justify-between items-center mb-2">
            <InterRegular className="text-sm text-gray-600">Original Price</InterRegular>
            <InterRegular className="text-sm text-gray-500 line-through">
              {formatPrice(offer.originalPrice)}
            </InterRegular>
          </View>
        )}
        <View className="flex-row justify-between items-center">
          <InterSemiBold className="text-base text-gray-800">Offered Price</InterSemiBold>
          <InterBold className="text-lg text-green-600">
            {formatPrice(offer.offeredPrice)}
          </InterBold>
        </View>
        {priceDifference > 0 && (
          <View className="mt-2 pt-2 border-t border-gray-200">
            <InterRegular className="text-xs text-orange-600">
              {discountPercentage}% below asking price (saves {formatPrice(priceDifference)})
            </InterRegular>
          </View>
        )}
      </View>

      {/* Status */}
      <View
        className={`rounded-lg py-2 px-3 items-center ${
          offer.status === OfferStatus.ACCEPTED
            ? 'bg-green-50 border border-green-200'
            : offer.status === OfferStatus.REJECTED
            ? 'bg-red-50 border border-red-200'
            : 'bg-yellow-50 border border-yellow-200'
        }`}
      >
        <InterSemiBold
          className={`text-sm ${
            offer.status === OfferStatus.ACCEPTED
              ? 'text-green-700'
              : offer.status === OfferStatus.REJECTED
              ? 'text-red-700'
              : 'text-yellow-700'
          }`}
        >
          {offer.status === OfferStatus.ACCEPTED
            ? '✓ Offer Accepted'
            : offer.status === OfferStatus.REJECTED
            ? '✗ Offer Rejected'
            : '⏳ Pending Response'}
        </InterSemiBold>
      </View>

      {/* Bid actions (accept/reject/cancel) live in History > Ongoing, not here */}
      {offer.status === OfferStatus.PENDING && (
        <TouchableOpacity
          onPress={() => onViewInHistory?.(offer)}
          className="mt-3 border border-primary rounded-lg py-3 items-center"
        >
          <InterSemiBold className="text-primary">
            {isSeller ? 'Review Offer in History' : 'View Bid in History'}
          </InterSemiBold>
        </TouchableOpacity>
      )}

      {/* Blockchain Badge (if applicable) */}
      {offer.bidId != null && (
        <View className="mt-3 pt-3 border-t border-gray-200">
          <View className="flex-row items-center">
            <View className="bg-purple-100 rounded-full px-2 py-1 mr-2">
              <InterRegular className="text-purple-700 text-xs">🔗 Blockchain</InterRegular>
            </View>
            <InterRegular className="text-xs text-gray-500">
              Bid ID: {offer.bidId}
            </InterRegular>
          </View>
        </View>
      )}
    </View>
  );
};

export default OfferMessageCard;
