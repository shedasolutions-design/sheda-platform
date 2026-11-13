"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Building2, ClipboardCheck, Store } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import TextField, { inputClass } from "@/components/ui/TextField";
import { useApi } from "@/contexts/ApiContext";
import { useMyCollectionProfiles } from "@/hooks/useCollections";
import apiService, { type CollectionProfile, type CollectionRole } from "@/services/api";

/**
 * Everything professional about a person, in one place.
 *
 * Everyone has a personal profile (name, photo, phone, location) for buying,
 * renting and investing. Selling, building and managing need more: the agency
 * or company name buyers see on listings, and the builder or property manager
 * profile Collections investors rely on. These used to be scattered: the
 * agency name sat in Personal info (and never saved), and the Collections
 * profiles could only be created, from inside the Investing tab, and never
 * edited.
 */
function BusinessProfile() {
  const { user, updateMe, getMe } = useApi();
  const { profiles, reload } = useMyCollectionProfiles();

  const [agency, setAgency] = useState("");
  const [agencySaved, setAgencySaved] = useState<string | null>(null);
  const [savingAgency, setSavingAgency] = useState(false);
  const [agencyError, setAgencyError] = useState<string | null>(null);

  useEffect(() => {
    setAgency(user?.agency_name ?? "");
  }, [user?.agency_name]);

  const saveAgency = async () => {
    setSavingAgency(true);
    setAgencyError(null);
    setAgencySaved(null);
    try {
      await updateMe({ agency_name: agency.trim(), account_type: user?.account_type || "client" } as never);
      await getMe({ silent: true });
      setAgencySaved(agency.trim() ? "Saved. Buyers see it on your listings." : "Removed.");
    } catch (e) {
      setAgencyError(e instanceof Error ? e.message : "That didn't save. Please try again.");
    } finally {
      setSavingAgency(false);
    }
  };

  const builder = profiles?.find((p) => p.role === "builder") ?? null;
  const manager = profiles?.find((p) => p.role === "manager") ?? null;

  return (
    <>
      <PageHeader title="Business profile" fallback="/profile-setting" />
      <div className="mx-auto max-w-2xl space-y-6 px-5 pb-10 pt-4">
        <p className="text-sm text-secondaryText">
          For agents, agencies, builders and property managers. Buying, renting and investing
          only need your{" "}
          <Link href="/personal-info" className="font-medium text-primary">
            personal profile
          </Link>
          .
        </p>

        <section className="rounded-2xl border border-borderColor p-5">
          <SectionTitle icon={<Store size={18} />} title="Agency or company" />
          <p className="mb-3 text-sm text-secondaryText">
            Shown on your listings instead of your personal name. Leave it empty if you sell as
            yourself.
          </p>
          <TextField
            label="Agency or company name"
            placeholder="e.g. Okafor Homes"
            value={agency}
            maxLength={50}
            onChange={(e) => {
              setAgency(e.target.value);
              setAgencySaved(null);
            }}
          />
          {agencyError && <p className="mt-2 text-sm text-red-600">{agencyError}</p>}
          {agencySaved && <p className="mt-2 text-sm text-green-700">{agencySaved}</p>}
          <Button
            className="mt-3"
            onClick={saveAgency}
            loading={savingAgency}
            disabled={agency.trim() === (user?.agency_name ?? "").trim()}
          >
            Save
          </Button>
        </section>

        <section className="rounded-2xl border border-borderColor p-5">
          <SectionTitle icon={<Building2 size={18} />} title="Collections" />
          <p className="mb-4 text-sm text-secondaryText">
            Raise money for a building, or inspect and sign off building phases for investors.
            Your raises and sign-offs live in the{" "}
            <Link href="/collections" className="font-medium text-primary">
              Invest
            </Link>{" "}
            tab.
          </p>
          <div className="space-y-3">
            <RoleCard
              role="builder"
              title="Builder"
              blurb="Raise money from investors for a development, released phase by phase."
              icon={<Building2 size={20} />}
              profile={builder}
              suggestedName={agency.trim() || user?.agency_name || ""}
              onSaved={reload}
            />
            <RoleCard
              role="manager"
              title="Property manager"
              blurb="Inspect and sign off each building phase, then manage the finished flats."
              icon={<ClipboardCheck size={20} />}
              profile={manager}
              suggestedName={agency.trim() || user?.agency_name || ""}
              onSaved={reload}
            />
          </div>
        </section>
      </div>
    </>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-primaryText">
      <span className="text-primary">{icon}</span>
      {title}
    </h2>
  );
}

function RoleCard({
  role,
  title,
  blurb,
  icon,
  profile,
  suggestedName,
  onSaved,
}: {
  role: CollectionRole;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  profile: CollectionProfile | null;
  suggestedName: string;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setName(profile?.display_name ?? "");
    setLocation(profile?.location ?? "");
    setAbout(profile?.about ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const r = await apiService.updateCollectionProfile(profile.id, {
      display_name: name.trim(),
      location: location.trim() || undefined,
      about: about.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setError("That didn't save. Please try again.");
      return;
    }
    setEditing(false);
    await onSaved();
  };

  const setupHref = `/collections/become-builder?${new URLSearchParams({
    role,
    ...(suggestedName ? { name: suggestedName } : {}),
  }).toString()}`;

  return (
    <div className="rounded-xl border border-borderColor p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-primaryText">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-primaryText">
            {title}
            {profile?.kyc_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                <BadgeCheck size={12} /> Verified
              </span>
            )}
            {profile?.suspended && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Suspended</span>
            )}
          </p>
          {profile ? (
            <p className="text-sm text-secondaryText">
              {profile.display_name}
              {profile.location ? ` · ${profile.location}` : ""}
            </p>
          ) : (
            <p className="text-sm text-secondaryText">{blurb}</p>
          )}
        </div>
      </div>

      {editing && profile ? (
        <div className="mt-4 space-y-3">
          <TextField label="Name investors see" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1 block text-primaryText">About</span>
            <textarea className={`${inputClass} min-h-24`} value={about} onChange={(e) => setAbout(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={save} loading={busy} disabled={name.trim().length < 2}>
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {profile ? (
            <>
              <Button variant="outline" onClick={startEdit}>
                Edit
              </Button>
              <Link
                href={`/collections/person/${profile.id}`}
                className="inline-flex items-center rounded-xl border border-borderColor px-4 py-2 text-sm font-medium text-primaryText hover:bg-cardBackground"
              >
                Documents and public page
              </Link>
            </>
          ) : (
            <Link
              href={setupHref}
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[#a82227]"
            >
              Set up {title.toLowerCase()} profile
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function BusinessProfilePage() {
  return (
    <AuthGuard requireAuth>
      <BusinessProfile />
    </AuthGuard>
  );
}
