"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { NEW_SIGNIN_CHOOSER } from "@/constants/featureFlags";
import ProfileChooser, { type Profile } from "./ProfileChooser";
import ViewingHoursPrompt from "@/components/seller/ViewingHoursPrompt";

/**
 * Decides when the profile chooser appears, for every entry point at once.
 *
 * Mounted at the root rather than inside the login screen deliberately. There
 * are four ways into an authenticated session (password, signup, Google, and
 * a restored session) and wiring the chooser into each would be four chances
 * for them to drift. Watching `isAuthenticated` from the root covers all four.
 */

/** Flows that own the whole screen and must not be redirected out of. */
const PROTECTED_FLOWS = ["wallet-setup", "wallet-recovery"];

const DESTINATIONS: Record<Profile, string> = {
  buyer: "/home",
  seller: "/activity",
};

export default function ProfileGate() {
  const { isAuthenticated } = useApi();
  const { setModeExplicitly, rememberChoice, hasRememberedChoice, mode, isLoading } = useMode();
  const pathname = usePathname();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const answeredThisSession = useRef(false);

  const visible =
    NEW_SIGNIN_CHOOSER &&
    isAuthenticated &&
    hasRememberedChoice === false &&
    !isLoading &&
    !answered &&
    !answeredThisSession.current;

  const handleConfirm = useCallback(
    async (profile: Profile, remember: boolean) => {
      setSubmitting(true);
      setError(null);
      try {
        await setModeExplicitly(profile);
        await rememberChoice(remember);
        answeredThisSession.current = true;
        setAnswered(true);
        if (!PROTECTED_FLOWS.some((flow) => pathname?.includes(flow))) {
          router.replace(DESTINATIONS[profile]);
        }
      } catch (err: any) {
        setError(err?.message || "Couldn't switch profile. Check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [setModeExplicitly, rememberChoice, pathname, router]
  );

  // The hours prompt waits until the chooser is answered, so the two never stack.
  if (!visible) return <ViewingHoursPrompt />;

  return (
    <ProfileChooser
      initialProfile={mode ?? undefined}
      submitting={submitting}
      error={error}
      onConfirm={handleConfirm}
    />
  );
}
