/**
 * RatingModal
 *
 * Modal for submitting a star rating (1-5) + optional comment.
 * Used on ActiveCard (post-expiration / post-dispute) and can be
 * reused anywhere a property rating is needed.
 */

import React, { useState } from "react";
import {
    Modal,
    View,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import StarRating from "react-native-star-rating-widget";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import InterBold from "@/components/Text/InterBold";
import { useApi } from "@/contexts/ApiContext";
import { useNotifications } from "@/contexts/NotificationContext";

interface RatingModalProps {
    visible: boolean;
    onClose: () => void;
    propertyId: number;
    propertyTitle: string;
    onSubmitted?: () => void;
}

const RatingModal: React.FC<RatingModalProps> = ({
    visible,
    onClose,
    propertyId,
    propertyTitle,
    onSubmitted,
}) => {
    const { createRating } = useApi();
    const { addNotification } = useNotifications();

    const [stars, setStars] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (stars === 0) {
            Alert.alert("Rating Required", "Please select at least 1 star.");
            return;
        }

        try {
            setSubmitting(true);
            await createRating({
                ratee_id: propertyId, // propertyId is used as the user ID to rate
                score: stars,
                comment: comment.trim() || undefined,
            });

            addNotification(
                "general",
                "Review Submitted",
                `Your ${stars}-star review for "${propertyTitle}" has been submitted.`
            );

            Alert.alert("Thank you!", "Your review has been submitted successfully.");
            setStars(0);
            setComment("");
            onClose();
            onSubmitted?.();
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to submit review. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-2xl px-5 pt-5 pb-8">
                        {/* Header */}
                        <View className="flex-row justify-between items-center mb-4">
                            <InterBold className="text-lg">Rate Property</InterBold>
                            <TouchableOpacity onPress={onClose} hitSlop={12}>
                                <InterRegular className="text-secondaryText text-2xl">✕</InterRegular>
                            </TouchableOpacity>
                        </View>

                        {/* Property title */}
                        <InterMedium className="text-sm text-secondaryText mb-4" numberOfLines={2}>
                            {propertyTitle}
                        </InterMedium>

                        {/* Star widget */}
                        <View className="items-center mb-4">
                            <StarRating
                                rating={stars}
                                onChange={setStars}
                                starSize={40}
                                color="#F59E0B"
                                emptyColor="#E5E7EB"
                                enableHalfStar={false}
                            />
                            <InterRegular className="mt-2 text-secondaryText text-xs">
                                {stars === 0
                                    ? "Tap a star to rate"
                                    : stars <= 2
                                        ? "We're sorry to hear that"
                                        : stars <= 3
                                            ? "It was okay"
                                            : stars <= 4
                                                ? "Good experience"
                                                : "Excellent!"}
                            </InterRegular>
                        </View>

                        {/* Comment input */}
                        <TextInput
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm mb-4"
                            placeholder="Write a review (optional)..."
                            placeholderTextColor="#9CA3AF"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            maxLength={500}
                            value={comment}
                            onChangeText={setComment}
                            style={{ minHeight: 100 }}
                        />

                        {/* Submit */}
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={submitting || stars === 0}
                            className={`rounded-lg py-3.5 items-center ${stars > 0 ? "bg-primary" : "bg-gray-300"
                                }`}
                            activeOpacity={0.8}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <InterMedium className="text-white text-sm">
                                    Submit Review
                                </InterMedium>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

export default RatingModal;
