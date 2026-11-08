import {
  View,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import BackBtn from "@/components/common/BackBtn";
import AuthGuard from "@/components/AuthGuard";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import { StarRatingDisplay } from "react-native-star-rating-widget";
import { useApi } from "@/contexts/ApiContext";
import getFullImageUrl from "@/utilities/imageUrl";
import type { UserShow, RatingShow } from "@/services/api";

/**
 * Profile of the other party in a conversation or deal.
 *
 * Contact details (phone/email) are deliberately gated. utilities/profileSanitizer.ts
 * strips them everywhere by default, and that default stands here for anyone
 * you merely happen to be viewing. They're revealed only once there's a real
 * deal between you — currently an appointment in either direction — because at
 * that point the two of you genuinely need to reach each other, and each has
 * already chosen to transact with the other.
 */
const UserProfile = () => {
  const { userId, name } = useLocalSearchParams();
  const { getUserById, getUserRatings, user } = useApi();

  const [profile, setProfile] = useState<UserShow | null>(null);
  const [ratings, setRatings] = useState<RatingShow[]>([]);
  const [loading, setLoading] = useState(true);

  const targetId = userId ? Number(userId) : null;

  useEffect(() => {
    let cancelled = false;
    if (!targetId) {
      setLoading(false);
      return;
    }

    (async () => {
      const [profileResult, ratingsResult] = await Promise.allSettled([
        getUserById(targetId),
        getUserRatings(targetId),
      ]);

      if (cancelled) return;

      if (profileResult.status === "fulfilled" && profileResult.value) {
        setProfile(profileResult.value);
      }
      // Ratings are supplementary — a failure here shouldn't blank the profile.
      if (ratingsResult.status === "fulfilled" && Array.isArray(ratingsResult.value)) {
        setRatings(ratingsResult.value);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [targetId, getUserById, getUserRatings]);

  /**
   * True when this person and the signed-in user have an actual deal between
   * them. Appointments carry both sides as numeric user ids in either
   * direction, so they identify the counterparty without needing to resolve a
   * wallet address back to an account the way on-chain bids would.
   */
  const isActiveCounterparty = useMemo(() => {
    if (!targetId || !user?.appointments?.length) return false;
    return user.appointments.some(
      (a) =>
        Number(a.agent_id) === targetId || Number(a.client_id) === targetId
    );
  }, [targetId, user?.appointments]);

  const averageRating = useMemo(() => {
    if (ratings.length === 0) return 0;
    const total = ratings.reduce((sum, r) => sum + (r.score || 0), 0);
    return total / ratings.length;
  }, [ratings]);

  const displayName =
    profile?.fullname ||
    profile?.username ||
    (name as string) ||
    "User";

  const verification = useMemo(() => {
    if (profile?.kyc_status === "verified") {
      return { label: "Verified", bg: "#DCFCE7", fg: "#166534" };
    }
    if (profile?.kyc_status === "pending") {
      return { label: "Verification pending", bg: "#FEF3C7", fg: "#92400E" };
    }
    if (profile?.kyc_status === "rejected") {
      return { label: "Not verified", bg: "#FEE2E2", fg: "#991B1B" };
    }
    return { label: "Not verified", bg: "#F3F4F6", fg: "#6B7280" };
  }, [profile?.kyc_status]);

  const openContact = useCallback((scheme: "tel" | "mailto", value: string) => {
    Linking.openURL(`${scheme}:${value}`).catch(() => {
      Alert.alert("Could Not Open", `Please reach them directly at ${value}.`);
    });
  }, []);

  const avatarUrl = profile?.avatar_url ? getFullImageUrl(profile.avatar_url) : null;

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="container flex-1 mx-auto max-w-2xl" style={{ padding: 20 }}>
          <View className="flex-row items-center gap-4">
            <BackBtn />
            <InterSemiBold className="text-lg/5">Profile</InterSemiBold>
          </View>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator color="#C1272D" />
            </View>
          ) : !profile ? (
            <View className="flex-1 justify-center items-center px-6">
              <InterRegular className="text-secondaryText text-center">
                We couldn't load this profile. Please try again.
              </InterRegular>
            </View>
          ) : (
            <ScrollView
              className="mt-4"
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Identity */}
              <View className="items-center mb-5">
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    overflow: "hidden",
                    backgroundColor: "#DC2626",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{ width: 88, height: 88 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <InterSemiBold style={{ color: "#fff", fontSize: 32 }}>
                      {displayName.charAt(0).toUpperCase()}
                    </InterSemiBold>
                  )}
                </View>

                <InterSemiBold style={{ fontSize: 20, marginTop: 12 }}>
                  {displayName}
                </InterSemiBold>

                {profile.agency_name ? (
                  <InterRegular className="text-sm text-secondaryText mt-1">
                    {profile.agency_name}
                  </InterRegular>
                ) : null}

                <View
                  className="px-3 py-1 rounded-full mt-2"
                  style={{ backgroundColor: verification.bg }}
                >
                  <InterMedium style={{ fontSize: 11, color: verification.fg }}>
                    {verification.label}
                  </InterMedium>
                </View>
              </View>

              {/* Rating */}
              <View
                className="p-4 rounded-lg mb-4"
                style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" }}
              >
                <View className="flex-row justify-between items-center">
                  <InterMedium className="text-sm">Rating</InterMedium>
                  <View className="flex-row items-center gap-2">
                    <StarRatingDisplay rating={averageRating} starSize={16} />
                    <InterRegular className="text-sm text-secondaryText">
                      {ratings.length > 0
                        ? `${averageRating.toFixed(1)} (${ratings.length})`
                        : "No ratings yet"}
                    </InterRegular>
                  </View>
                </View>
              </View>

              {/* Location */}
              <View
                className="p-4 rounded-lg mb-4"
                style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" }}
              >
                <InterMedium className="text-sm mb-1">Location</InterMedium>
                <InterRegular className="text-sm text-secondaryText">
                  {profile.location?.trim() || "Not provided"}
                </InterRegular>
              </View>

              {/* Contact — gated */}
              <View
                className="p-4 rounded-lg mb-4"
                style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" }}
              >
                <InterMedium className="text-sm mb-2">Contact</InterMedium>

                {isActiveCounterparty ? (
                  <>
                    {profile.phone_number ? (
                      <TouchableOpacity
                        className="py-1"
                        onPress={() => openContact("tel", profile.phone_number!)}
                      >
                        <InterRegular className="text-sm text-primary">
                          {profile.phone_number}
                        </InterRegular>
                      </TouchableOpacity>
                    ) : null}
                    {profile.email ? (
                      <TouchableOpacity
                        className="py-1"
                        onPress={() => openContact("mailto", profile.email!)}
                      >
                        <InterRegular className="text-sm text-primary">
                          {profile.email}
                        </InterRegular>
                      </TouchableOpacity>
                    ) : null}
                    {!profile.phone_number && !profile.email ? (
                      <InterRegular className="text-sm text-secondaryText">
                        They haven't added contact details.
                      </InterRegular>
                    ) : null}
                  </>
                ) : (
                  <InterRegular className="text-sm text-secondaryText">
                    Contact details become available once you have a booked
                    viewing together. Until then, message them in the chat.
                  </InterRegular>
                )}
              </View>

              {/* Reviews */}
              <View className="mb-2">
                <InterMedium className="text-sm mb-2">
                  Reviews {ratings.length > 0 ? `(${ratings.length})` : ""}
                </InterMedium>

                {ratings.length === 0 ? (
                  <InterRegular className="text-sm text-secondaryText">
                    No reviews yet.
                  </InterRegular>
                ) : (
                  ratings.map((r) => (
                    <View
                      key={r.id}
                      className="p-3 rounded-lg mb-2"
                      style={{ backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB" }}
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <StarRatingDisplay rating={r.score} starSize={12} />
                        <InterRegular className="text-xs text-secondaryText">
                          {r.created_at
                            ? new Date(r.created_at).toLocaleDateString()
                            : ""}
                        </InterRegular>
                      </View>
                      {r.comment ? (
                        <InterRegular className="text-sm">{r.comment}</InterRegular>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default UserProfile;
