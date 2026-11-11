"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import Avatar from "@/components/common/Avatar";
import Stars from "@/components/common/Stars";
import { useApi } from "@/contexts/ApiContext";
import type { RatingShow, UserShow } from "@/services/api";
import { getQueryParam } from "@/lib/navigation";

/**
 * Profile of the other party in a conversation or deal.
 *
 * Phone and email are shown only when the two of you have an appointment
 * together, in either direction: then you genuinely need to reach each other.
 * Anyone you merely happen to view keeps their contact details private.
 */
function UserProfile() {
  const { getUserById, getUserRatings, user } = useApi();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [fallbackName, setFallbackName] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserShow | null>(null);
  const [ratings, setRatings] = useState<RatingShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = Number(getQueryParam("userId"));
    setTargetId(Number.isFinite(id) && id > 0 ? id : null);
    setFallbackName(getQueryParam("name"));
    if (!(Number.isFinite(id) && id > 0)) setLoading(false);
  }, []);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    Promise.allSettled([getUserById(targetId), getUserRatings(targetId)]).then(([p, r]) => {
      if (cancelled) return;
      if (p.status === "fulfilled" && p.value) setProfile(p.value);
      if (r.status === "fulfilled" && Array.isArray(r.value)) setRatings(r.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [targetId, getUserById, getUserRatings]);

  const isCounterparty = useMemo(
    () =>
      !!targetId &&
      !!user?.appointments?.some((a) => Number(a.agent_id) === targetId || Number(a.client_id) === targetId),
    [targetId, user?.appointments]
  );
  const average = ratings.length ? ratings.reduce((s, r) => s + (r.score || 0), 0) / ratings.length : 0;
  const name = profile?.fullname || profile?.username || fallbackName || "User";
  const kyc =
    profile?.kyc_status === "verified"
      ? ["Verified", "bg-green-100 text-green-800"]
      : profile?.kyc_status === "pending"
        ? ["Verification pending", "bg-amber-100 text-amber-800"]
        : profile?.kyc_status === "rejected"
          ? ["Not verified", "bg-red-100 text-red-800"]
          : ["Not verified", "bg-gray-100 text-gray-500"];

  return (
    <>
      <PageHeader title="Profile" />
      {loading ? (
        <LoadingState />
      ) : !profile ? (
        <p className="px-6 py-20 text-center text-secondaryText">We couldn&apos;t load this profile. Please try again.</p>
      ) : (
        <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
          <div className="mb-5 flex flex-col items-center text-center">
            <Avatar url={profile.avatar_url} name={name} />
            <h2 className="mt-3 text-xl font-semibold">{name}</h2>
            {profile.agency_name && <p className="mt-1 text-sm text-secondaryText">{profile.agency_name}</p>}
            <span className={`mt-2 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${kyc[1]}`}>{kyc[0]}</span>
          </div>

          <Card title="Rating">
            <div className="flex items-center gap-2 text-sm text-secondaryText">
              <Stars rating={average} size={16} />
              {ratings.length ? `${average.toFixed(1)} (${ratings.length})` : "No ratings yet"}
            </div>
          </Card>
          <Card title="Location">
            <p className="text-sm text-secondaryText">{profile.location?.trim() || "Not provided"}</p>
          </Card>
          <Card title="Contact">
            {isCounterparty ? (
              profile.phone_number || profile.email ? (
                <div className="flex flex-col gap-1 text-sm">
                  {profile.phone_number && (
                    <a href={`tel:${profile.phone_number}`} className="text-primary hover:underline">
                      {profile.phone_number}
                    </a>
                  )}
                  {profile.email && (
                    <a href={`mailto:${profile.email}`} className="text-primary hover:underline">
                      {profile.email}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-secondaryText">They haven&apos;t added contact details.</p>
              )
            ) : (
              <p className="text-sm text-secondaryText">
                Contact details are shared once you have a viewing booked together. Until then, use chat.
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 rounded-xl border border-borderColor p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

export default function UserProfilePage() {
  return (
    <AuthGuard requireAuth>
      <UserProfile />
    </AuthGuard>
  );
}
