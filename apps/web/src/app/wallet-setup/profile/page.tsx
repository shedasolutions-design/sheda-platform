"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import LocationField from "@/components/ui/LocationField";
import UsernameField, { type UsernameStatus } from "@/components/common/UsernameField";
import { useApi } from "@/contexts/ApiContext";

const NEXT = "/wallet-setup/provision";

/**
 * "Complete your profile", straight after a new account confirms its email.
 *
 * Everything is optional: Skip goes on to wallet setup with the email and
 * password alone. Typing a full name fills in a free username made from it,
 * which can be kept, swapped for a suggestion, or typed over.
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, updateMe } = useApi();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const update: Record<string, unknown> = { account_type: user?.account_type || "client" };
    if (fullName.trim()) update.fullname = fullName.trim();
    if (username.trim()) {
      if (usernameStatus === "checking") return setError("Hold on, still checking that username.");
      if (usernameStatus === "bad") return setError("Pick a username that's free, or clear the box.");
      update.username = username.trim();
    }
    if (phone.trim()) {
      const formatted = `+${phone.trim().replace(/^\+/, "").replace(/\D/g, "")}`;
      if (formatted.length < 11 || formatted.length > 16) {
        return setError("Phone number must include the country code, e.g. +23480…");
      }
      update.phone_number = formatted;
    }
    if (location.trim()) update.location = location.trim();
    if (Object.keys(update).length === 1) return router.replace(NEXT);

    setSaving(true);
    try {
      await updateMe(update as never);
      router.replace(NEXT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold">Complete your profile</h1>
      <p className="mt-2 text-secondaryText">
        Help buyers, sellers and agents know who they&apos;re dealing with. All of this is optional, and you can change
        it later under Personal info.
      </p>

      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField
          label="Full name"
          placeholder="e.g. Ada Obi"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <UsernameField value={username} onChange={setUsername} name={fullName} onStatus={setUsernameStatus} />
        <TextField
          label="Phone number (optional)"
          type="tel"
          placeholder="+234…"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <LocationField label="Country or city (optional)" value={location} onChange={setLocation} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" full loading={saving}>
          Continue
        </Button>
        <button
          type="button"
          onClick={() => router.replace(NEXT)}
          disabled={saving}
          className="text-center text-sm text-secondaryText underline hover:text-primaryText"
        >
          Skip for now
        </button>
      </form>
    </>
  );
}
