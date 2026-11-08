/**
 * ProfileVisibilityCard — Reusable, privacy-safe user profile card
 *
 * Surfaces: Property Details | Chat Header | Transaction/Bid Flow
 *
 * Displays ONLY whitelisted fields via SafeUserProfile:
 *   ✅ Avatar, Name, Location, KYC Status, Presence, Rating
 *   ❌ Phone, Email — NEVER rendered, NEVER in the data
 */
import React from "react";
import { View, Image, StyleSheet } from "react-native";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import { StarRatingDisplay } from "react-native-star-rating-widget";
import { PROFILE } from "@/constants/images-icons";
import { SafeUserProfile, ProfileCardVariant } from "@/types/profile";

interface ProfileVisibilityCardProps {
    profile: SafeUserProfile;
    /** Controls the layout variant */
    variant?: ProfileCardVariant;
    /** Optional extra element rendered on the right (e.g. contact buttons) */
    rightAction?: React.ReactNode;
}

// ── KYC Badge ──
const KycBadge: React.FC<{ status: SafeUserProfile["kycStatus"] }> = ({ status }) => {
    if (status === "verified") {
        return (
            <View style={[styles.badge, styles.badgeVerified]}>
                <InterRegular style={styles.badgeTextVerified}>Verified ✓</InterRegular>
            </View>
        );
    }
    return (
        <View style={[styles.badge, styles.badgeUnverified]}>
            <InterRegular style={styles.badgeTextUnverified}>Unverified</InterRegular>
        </View>
    );
};

// ── Presence Dot ──
const PresenceDot: React.FC<{ isOnline: boolean; size?: number }> = ({ isOnline, size = 10 }) => (
    <View
        style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isOnline ? "#22c55e" : "#9ca3af",
            borderWidth: 2,
            borderColor: "#fff",
        }}
    />
);

// ── Main Component ──
const ProfileVisibilityCard: React.FC<ProfileVisibilityCardProps> = ({
    profile,
    variant = "details",
    rightAction,
}) => {
    const avatarSource = profile.avatarUrl
        ? { uri: profile.avatarUrl }
        : PROFILE;

    const isCompact = variant === "chat";
    const avatarSize = isCompact ? 38 : 44;

    return (
        <View style={[styles.container, isCompact && styles.containerCompact]}>
            <View style={styles.row}>
                {/* Avatar with presence indicator */}
                <View style={styles.avatarWrapper}>
                    <View
                        style={[
                            styles.avatarContainer,
                            {
                                width: avatarSize + 4,
                                height: avatarSize + 4,
                                borderRadius: (avatarSize + 4) / 2,
                                borderColor: profile.isOnline ? "#22c55e" : "#e5e7eb",
                            },
                        ]}
                    >
                        <Image
                            source={avatarSource}
                            style={{
                                width: avatarSize,
                                height: avatarSize,
                                borderRadius: avatarSize / 2,
                            }}
                            resizeMode="cover"
                        />
                    </View>
                    <View style={styles.presenceDotPosition}>
                        <PresenceDot isOnline={profile.isOnline} size={12} />
                    </View>
                </View>

                {/* Info */}
                <View style={styles.infoContainer}>
                    {/* Row 1: Name + KYC */}
                    <View style={styles.nameRow}>
                        <InterMedium
                            style={[styles.name, isCompact && styles.nameCompact]}
                            numberOfLines={1}
                        >
                            {profile.displayName}
                        </InterMedium>
                        {!isCompact && <KycBadge status={profile.kycStatus} />}
                    </View>

                    {/* Row 2: Presence / Last Seen */}
                    <InterRegular style={styles.presence}>
                        {profile.isOnline ? "Active now" : profile.lastSeenLabel}
                    </InterRegular>

                    {/* Row 3: Location + Rating (full variants only) */}
                    {!isCompact && (
                        <View style={styles.metaRow}>
                            <InterRegular style={styles.location} numberOfLines={1}>
                                {profile.location}
                            </InterRegular>
                            <View style={styles.ratingContainer}>
                                {profile.rating > 0 ? (
                                    <>
                                        <StarRatingDisplay rating={profile.rating} starSize={12} />
                                        <InterRegular style={styles.reviewCount}>
                                            ({profile.reviewCount})
                                        </InterRegular>
                                    </>
                                ) : (
                                    <InterRegular style={styles.noRating}>No ratings yet</InterRegular>
                                )}
                            </View>
                        </View>
                    )}

                    {/* KYC badge on compact (below name) */}
                    {isCompact && (
                        <KycBadge status={profile.kycStatus} />
                    )}
                </View>

                {/* Right action slot */}
                {rightAction && <View style={styles.rightAction}>{rightAction}</View>}
            </View>
        </View>
    );
};

// ── Styles ──
const styles = StyleSheet.create({
    container: {
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    containerCompact: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
    },
    avatarWrapper: {
        position: "relative",
        marginRight: 12,
    },
    avatarContainer: {
        borderWidth: 2,
        overflow: "hidden",
        backgroundColor: "#f3f4f6",
    },
    presenceDotPosition: {
        position: "absolute",
        bottom: 0,
        right: 0,
    },
    infoContainer: {
        flex: 1,
        justifyContent: "center",
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    name: {
        fontSize: 14,
        color: "#1a1a1a",
        flexShrink: 1,
    },
    nameCompact: {
        fontSize: 13,
    },
    presence: {
        fontSize: 11,
        color: "#6b7280",
        marginTop: 1,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 4,
    },
    location: {
        fontSize: 11,
        color: "#9ca3af",
        flex: 1,
        marginRight: 8,
    },
    ratingContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
    },
    reviewCount: {
        fontSize: 10,
        color: "#9ca3af",
    },
    noRating: {
        fontSize: 10,
        color: "#d1d5db",
        fontStyle: "italic",
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeVerified: {
        backgroundColor: "#ecfdf5",
    },
    badgeUnverified: {
        backgroundColor: "#fef3c7",
    },
    badgeTextVerified: {
        fontSize: 9,
        color: "#059669",
        fontWeight: "600",
    },
    badgeTextUnverified: {
        fontSize: 9,
        color: "#d97706",
        fontWeight: "600",
    },
    rightAction: {
        marginLeft: 8,
    },
});

export default ProfileVisibilityCard;
