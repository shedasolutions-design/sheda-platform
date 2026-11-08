import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import InterRegular from "@/components/Text/InterRegular";
import InterBold from "@/components/Text/InterBold";
import { StarRatingDisplay } from "react-native-star-rating-widget";
import { REVIEW } from "@/components/HouseCard/types";

const Comments = ({ reviews }: { reviews: REVIEW[] }) => {
  const [showMore, setShowMore] = useState(false);

  if (!reviews || reviews.length === 0) {
    return (
      <View className="bg-[#00000008] rounded-lg p-2">
        <InterRegular className="text-xs/[150%] italic text-secondaryText">
          No reviews yet.
        </InterRegular>
      </View>
    );
  }

  const ReviewItem = ({ review }: { review: REVIEW }) => (
    <View className="bg-[#00000008] rounded-lg p-2 gap-1">
      <View className="flex-row justify-between items-center">
        <InterBold className="text-xs">{review.name}</InterBold>
        {review.rating !== undefined && review.rating > 0 && (
          <StarRatingDisplay rating={review.rating} starSize={12} />
        )}
      </View>
      <InterRegular className="text-sm/[150%] italic">
        {review.comment || "No comment provided"}
      </InterRegular>
      <InterRegular className="text-right text-xs/[150%] text-secondaryText">
        {review.date}
      </InterRegular>
    </View>
  );

  return (
    <View>
      {!showMore ? (
        <ReviewItem review={reviews[0]} />
      ) : (
        <View className="gap-2">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </View>
      )}

      {reviews.length > 1 && (
        <View className="mt-2 items-end">
          <TouchableOpacity onPress={() => setShowMore(!showMore)}>
            <InterRegular className="text-primary">
              {!showMore ? `Show All (${reviews.length})` : "Show Less"}
            </InterRegular>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default Comments;
