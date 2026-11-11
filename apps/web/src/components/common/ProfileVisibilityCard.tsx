import type { ReactNode } from "react";
import type { ProfileCardVariant, SafeUserProfile } from "@/types/profile";
import Stars from "./Stars";

/**
 * Privacy-safe profile card for property details, chat headers and deals.
 *
 * Renders only the whitelisted fields of SafeUserProfile: avatar, name,
 * location, KYC status, presence and rating. Phone and email are never in the
 * data, so they cannot be rendered by mistake.
 */
export default function ProfileVisibilityCard({
  profile,
  variant = "details",
  rightAction,
}: {
  profile: SafeUserProfile;
  variant?: ProfileCardVariant;
  rightAction?: ReactNode;
}) {
  const compact = variant === "chat";
  const size = compact ? 38 : 44;

  const kyc =
    profile.kycStatus === "verified" ? (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        Verified ✓
      </span>
    ) : (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">Unverified</span>
    );

  return (
    <div className={`flex items-center gap-3 ${compact ? "px-3 py-2" : "px-5 py-4"}`}>
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profile.avatarUrl || "/images/profile-image.png"}
          alt=""
          width={size}
          height={size}
          className={`rounded-full border-2 object-cover ${profile.isOnline ? "border-green-500" : "border-gray-200"}`}
          style={{ width: size + 4, height: size + 4 }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/images/profile-image.png";
          }}
        />
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
            profile.isOnline ? "bg-green-500" : "bg-gray-400"
          }`}
          aria-label={profile.isOnline ? "Online" : "Offline"}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate font-medium ${compact ? "text-sm" : "text-[15px]"}`}>{profile.displayName}</p>
          {!compact && kyc}
        </div>
        <p className="text-xs text-secondaryText">{profile.isOnline ? "Active now" : profile.lastSeenLabel}</p>
        {!compact ? (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-secondaryText">
            {profile.location && <span className="truncate">{profile.location}</span>}
            {profile.rating > 0 ? (
              <span className="flex items-center gap-1">
                <Stars rating={profile.rating} size={12} />({profile.reviewCount})
              </span>
            ) : (
              <span className="text-gray-400">No ratings yet</span>
            )}
          </div>
        ) : (
          <div className="mt-0.5">{kyc}</div>
        )}
      </div>

      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </div>
  );
}
