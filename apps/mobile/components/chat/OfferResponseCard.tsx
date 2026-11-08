import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import InterBold from '@/components/Text/InterBold';
import InterRegular from '@/components/Text/InterRegular';
import InterSemiBold from '@/components/Text/InterSemiBold';
import { OfferResponseMessage } from '@/types/offer';

interface OfferResponseCardProps {
  response: OfferResponseMessage;
  /**
   * True when the current viewer is the seller who sent this response —
   * i.e. the one who accepted/rejected, not the buyer who receives the
   * decision. "Book Appointment" and "Make Another Offer" are buyer-only
   * next steps; without this the seller saw (and could tap) their own
   * buyer's action buttons in their own chat view.
   */
  isSeller: boolean;
  onMakeAnotherOffer?: () => void;
}

const OfferResponseCard: React.FC<OfferResponseCardProps> = ({
  response,
  isSeller,
  onMakeAnotherOffer,
}) => {
  const isAccepted = response.status === 'accepted';

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const handleBookAppointment = () => {
    if (response.bidId == null || response.sellerId == null) {
      // Older accepted-offer messages sent before this field existed won't
      // have it — fall back to the property page rather than sending the
      // user into a route that can't actually book anything.
      router.push({
        pathname: '/details/[id]',
        params: { id: response.propertyId.toString() },
      });
      return;
    }
    router.push({
      pathname: '/book-appointment',
      params: {
        id: response.propertyId.toString(),
        bidId: String(response.bidId),
        blockchainPropertyId: response.propertyId.toString(),
        sellerId: String(response.sellerId),
        propertyTitle: response.propertyTitle,
      },
    });
  };

  const handleMakeAnotherOffer = () => {
    if (onMakeAnotherOffer) {
      onMakeAnotherOffer();
    } else {
      router.push({
        pathname: '/details/[id]',
        params: { id: response.propertyId.toString() },
      });
    }
  };

  return (
    <View
      className={`rounded-lg p-4 my-2 border ${
        isAccepted
          ? 'bg-green-50 border-green-200'
          : 'bg-red-50 border-red-200'
      }`}
    >
      {/* Header with Icon */}
      <View className="flex-row items-center mb-3">
        <View
          className={`rounded-full p-2 mr-3 ${
            isAccepted ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          <InterBold
            className={`text-2xl ${
              isAccepted ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isAccepted ? '✓' : '✗'}
          </InterBold>
        </View>
        <View className="flex-1">
          <InterBold
            className={`text-lg ${
              isAccepted ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {isSeller
              ? (isAccepted ? 'You Accepted This Offer' : 'You Declined This Offer')
              : (isAccepted ? 'Offer Accepted!' : 'Offer Not Accepted')}
          </InterBold>
          <InterRegular className="text-xs text-gray-600">
            {new Date(response.timestamp).toLocaleDateString('en-US', {
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
        <InterSemiBold className="text-base text-gray-900">
          {response.propertyTitle}
        </InterSemiBold>
      </View>

      {/* Accepted Price (if accepted) */}
      {isAccepted && response.acceptedPrice && (
        <View className="bg-white rounded-lg p-3 mb-3 border border-green-200">
          <InterRegular className="text-sm text-gray-600 mb-1">
            Accepted Price
          </InterRegular>
          <InterBold className="text-xl text-green-700">
            {formatPrice(response.acceptedPrice)}
          </InterBold>
        </View>
      )}

      {/* Message — the stored `response.message` is written from the buyer's
          point of view ("Your bid has been accepted!") because that's who it
          was sent to. The seller sees the same thread, so showing it verbatim
          told them their own bid had been accepted. Each side gets wording
          written for their actual role in this deal instead. */}
      <View className="mb-4">
        <InterRegular
          className={`text-sm ${
            isAccepted ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {isSeller
            ? (isAccepted
              ? 'You accepted this bid. The buyer will book a viewing appointment with you next.'
              : 'You declined this bid. The buyer can make another offer.')
            : (isAccepted
              ? 'The seller accepted your bid. You can now book a viewing appointment.'
              : 'The seller declined your bid. You can make another offer.')}
        </InterRegular>
      </View>

      {/* Action Button — buyer-only next step. The seller sent this
          decision; they have nothing to act on here (accepting/rejecting
          again happens in History > Ongoing, not by re-tapping their own
          response). */}
      {!isSeller && (
        isAccepted ? (
          <TouchableOpacity
            onPress={handleBookAppointment}
            className="bg-green-600 rounded-lg py-3 items-center"
          >
            <InterSemiBold className="text-white text-base">
              Book Appointment
            </InterSemiBold>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleMakeAnotherOffer}
            className="bg-red-600 rounded-lg py-3 items-center"
          >
            <InterSemiBold className="text-white text-base">
              Make Another Offer
            </InterSemiBold>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

export default OfferResponseCard;
