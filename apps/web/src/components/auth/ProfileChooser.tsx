"use client";

import { useState } from "react";
import { Building2, Check, Home } from "lucide-react";
import Button from "@/components/ui/Button";

export type Profile = "buyer" | "seller";

const OPTIONS: { profile: Profile; label: string; blurb: string; icon: typeof Home }[] = [
  { profile: "buyer", label: "Buyer", blurb: "Rent or buy a home, or invest in a new build", icon: Home },
  { profile: "seller", label: "Seller", blurb: "List properties and manage your deals", icon: Building2 },
];

/**
 * Asked once after signing in. Remembered, the answer holds across sign-outs;
 * otherwise until the person signs out. Switching later happens from their
 * profile. A white card on a dimmed page,
 * in Sheda red: the old full-screen purple/blue gradient read as a different
 * product from the rest of the app.
 */
export default function ProfileChooser({
  initialProfile,
  submitting = false,
  error = null,
  onConfirm,
}: {
  initialProfile?: Profile;
  submitting?: boolean;
  error?: string | null;
  onConfirm: (profile: Profile, remember: boolean) => void;
}) {
  const [selected, setSelected] = useState<Profile | null>(initialProfile ?? null);
  const [remember, setRemember] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-chooser-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sheda-logo.png" alt="Sheda" className="mb-5 h-8 w-auto" />
        <h1 id="profile-chooser-title" className="text-xl font-semibold text-primaryText">
          How are you using Sheda?
        </h1>
        <p className="mt-1 text-sm text-secondaryText">You can switch any time from your profile.</p>

        <div className="mt-5 flex flex-col gap-3">
          {OPTIONS.map(({ profile, label, blurb, icon: Icon }) => {
            const active = selected === profile;
            return (
              <button
                key={profile}
                type="button"
                onClick={() => setSelected(profile)}
                aria-pressed={active}
                className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-primary bg-primaryLight ring-1 ring-primary"
                    : "border-borderColor hover:border-primary/50 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    active ? "bg-primary text-white" : "bg-gray-100 text-primaryText"
                  }`}
                >
                  <Icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-primaryText">{label}</span>
                  <span className="block text-sm text-secondaryText">{blurb}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-primary bg-primary text-white" : "border-borderColor"
                  }`}
                  aria-hidden="true"
                >
                  {active && <Check size={13} />}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-primaryText">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            Remember my choice
            <span className="block text-xs text-secondaryText">
              Otherwise we ask once each time you sign in.
            </span>
          </span>
        </label>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Button
          full
          className="mt-6"
          disabled={!selected}
          loading={submitting}
          onClick={() => selected && onConfirm(selected, remember)}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
