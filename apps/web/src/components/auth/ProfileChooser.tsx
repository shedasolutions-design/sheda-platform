"use client";

import { useState } from "react";
import { Building2, Home } from "lucide-react";
import Button from "@/components/ui/Button";

export type Profile = "buyer" | "seller";

const OPTIONS: { profile: Profile; label: string; blurb: string; icon: typeof Home }[] = [
  { profile: "buyer", label: "Buyer", blurb: "Rent or buy", icon: Home },
  { profile: "seller", label: "Seller", blurb: "List & manage", icon: Building2 },
];

/**
 * Purple and blue keep the buyer/seller association the deal cards use for
 * their role badges, so the colour means the same thing here as everywhere.
 */
const TINT: Record<Profile, string> = {
  buyer: "from-[#4C1D95] to-[#1E1B4B]",
  seller: "from-[#1E3A8A] to-[#0F172A]",
};

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
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-gradient-to-br p-4 transition-colors duration-300 ${
        TINT[selected ?? "buyer"]
      }`}
    >
      <div className="w-full max-w-md text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sheda-logo2.png" alt="" className="mx-auto mb-6 h-10 w-auto opacity-90" />
        <h1 id="profile-chooser-title" className="text-center text-2xl font-bold">
          How are you using Sheda?
        </h1>
        <p className="mt-2 text-center text-sm text-white/75">
          You can switch any time from your profile.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {OPTIONS.map(({ profile, label, blurb, icon: Icon }) => {
            const active = selected === profile;
            return (
              <button
                key={profile}
                type="button"
                onClick={() => setSelected(profile)}
                aria-pressed={active}
                className={`rounded-2xl border-2 p-5 text-left transition ${
                  active ? "border-white bg-white/15" : "border-white/25 hover:border-white/60"
                }`}
              >
                <Icon size={28} className="mb-3" />
                <p className="text-lg font-semibold">{label}</p>
                <p className="text-sm text-white/75">{blurb}</p>
              </button>
            );
          })}
        </div>

        <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Remember my choice on this device
        </label>

        {error && <p className="mt-4 rounded-lg bg-black/30 px-3 py-2 text-sm">{error}</p>}

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
