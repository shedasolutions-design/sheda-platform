/**
 * Profile Sanitizer — Data-layer privacy enforcement
 *
 * Converts raw API user/agent data into a SafeUserProfile,
 * stripping phone numbers, email addresses, and any other
 * private fields at the data layer — never relying on UI conditionals.
 */
import { SafeUserProfile } from "@/types/profile";
import { AgentFeed } from "@/services/api";
import getFullImageUrl from "@/utilities/imageUrl";

/** Returns true if a string looks like an email address */
const looksLikeEmail = (s?: string): boolean =>
    !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Pick the best display name, skipping anything that looks like an email.
 * Falls back to "User" — never an empty slot.
 */
const resolveDisplayName = (data: {
    fullname?: string | null;
    username?: string | null;
    agency_name?: string | null;
    email?: string | null;
}): string => {
    if (data.fullname && !looksLikeEmail(data.fullname)) return data.fullname;
    if (data.username && !looksLikeEmail(data.username)) return data.username;
    if (data.agency_name && !looksLikeEmail(data.agency_name)) return data.agency_name;
    // Last resort: use the part before @ from their email
    if (data.email && data.email.includes('@')) return data.email.split('@')[0];
    return "User";
};

/**
 * Format a date string into a human-readable "last seen" label.
 */
const formatLastSeen = (dateString?: string): { label: string; isOnline: boolean } => {
    if (!dateString) return { label: "Offline", isOnline: false };
    try {
        const lastSeen = new Date(dateString);
        const now = new Date();
        const diffInMs = now.getTime() - lastSeen.getTime();
        const diffInMins = Math.floor(diffInMs / (1000 * 60));
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInMins < 5) return { label: "Active now", isOnline: true };
        if (diffInMins < 60) return { label: `${diffInMins}m ago`, isOnline: false };
        if (diffInHours < 24) return { label: `${diffInHours}h ago`, isOnline: false };
        return { label: lastSeen.toLocaleDateString(), isOnline: false };
    } catch {
        return { label: "Offline", isOnline: false };
    }
};

/**
 * Sanitize raw AgentFeed into a SafeUserProfile.
 * ❌ All private fields (phone, email) are stripped here — not in the UI.
 */
export function sanitizeAgentProfile(
    agent: AgentFeed,
    role: SafeUserProfile["role"] = "agent",
    reviewCount: number = 0,
): SafeUserProfile {
    const { label, isOnline } = formatLastSeen(agent.last_seen ?? undefined);
    const avatarRaw = getFullImageUrl(agent.avatar_url ?? undefined) ?? null;

    return {
        displayName: resolveDisplayName(agent),
        avatarUrl: avatarRaw || null,
        location: agent.location?.trim() || "Location not provided",
        kycStatus: (["verified", "pending", "rejected"].includes(agent.kyc_status ?? "")
            ? agent.kyc_status
            : "unknown") as SafeUserProfile["kycStatus"],
        isOnline,
        lastSeenLabel: label,
        rating: agent.rating ?? 0,
        reviewCount,
        role,
        // phone_number  → STRIPPED
        // email         → STRIPPED
    };
}

/**
 * Build a SafeUserProfile from minimal data (e.g. when only basic info is available).
 * All missing fields get graceful fallbacks.
 */
export function buildSafeProfile(data: {
    displayName?: string;
    avatarUrl?: string | null;
    location?: string;
    kycStatus?: string;
    isOnline?: boolean;
    lastSeenLabel?: string;
    rating?: number;
    reviewCount?: number;
    role?: SafeUserProfile["role"];
}): SafeUserProfile {
    return {
        displayName: data.displayName || "User",
        avatarUrl: data.avatarUrl ?? null,
        location: data.location?.trim() || "Location not provided",
        kycStatus: (["verified", "pending", "rejected"].includes(data.kycStatus || "")
            ? data.kycStatus
            : "unknown") as SafeUserProfile["kycStatus"],
        isOnline: data.isOnline ?? false,
        lastSeenLabel: data.lastSeenLabel || "Offline",
        rating: data.rating ?? 0,
        reviewCount: data.reviewCount ?? 0,
        role: data.role || "other",
    };
}
