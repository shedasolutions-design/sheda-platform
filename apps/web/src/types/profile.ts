/**
 * SafeUserProfile — Privacy-safe user profile DTO
 *
 * This type explicitly whitelists only the fields that are safe to display
 * in the ProfileVisibilityCard component. Any new profile fields must be
 * explicitly added here — the default is PRIVATE.
 *
 * ❌ NEVER include: phone_number, email
 */
export interface SafeUserProfile {
    /** Display name (fullname > username > agency_name > "User") */
    displayName: string;

    /** Profile photo URL (full URL or null for default avatar) */
    avatarUrl: string | null;

    /** City/region from user profile */
    location: string;

    /** KYC verification status — always live, never stale */
    kycStatus: "verified" | "pending" | "rejected" | "unknown";

    /** Online/offline presence */
    isOnline: boolean;

    /** Human-readable last seen label (e.g. "Active now", "5m ago", "Offline") */
    lastSeenLabel: string;

    /** Star rating (0-5) */
    rating: number;

    /** Total number of reviews */
    reviewCount: number;

    /** The role this profile represents relative to the viewer */
    role: "seller" | "buyer" | "agent" | "other";
}

/**
 * Variant controls which surface is rendering the card.
 * Each surface may have a slightly different layout.
 */
export type ProfileCardVariant = "details" | "chat" | "transaction";
