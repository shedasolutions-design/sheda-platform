"use client";

import { useCallback, useRef, useState } from "react";
import { router, usePathname } from "expo-router";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { NEW_SIGNIN_CHOOSER } from "@/constants/featureFlags";
import ProfileChooser, { type Profile } from "./ProfileChooser";

/**
 * Decides when the profile chooser appears, for every entry point at once.
 *
 * Mounted at the root rather than inside the login screen deliberately.
 * There are four ways into an authenticated session — password login, signup,
 * Google, and an already-restored session on launch — and wiring the chooser
 * into each would be four chances for them to drift. Watching `isAuthenticated`
 * from the root covers all four with one rule, and gives the "show it once to
 * people already signed in" behaviour for free.
 */

/** Flows that own the whole screen and must not be redirected out of. */
const PROTECTED_FLOWS = ["wallet-setup", "wallet-recovery"];

const DESTINATIONS: Record<Profile, string> = {
    buyer: "/(tabs)/home",
    seller: "/(tabs)/activity",
};

const ProfileGate = () => {
    const { isAuthenticated } = useApi();
    const { setModeExplicitly, rememberChoice, hasRememberedChoice, mode, isLoading } =
        useMode();
    const pathname = usePathname();

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Once answered, stay answered for this launch even without "remember" —
    // otherwise declining to be remembered would mean being asked on every
    // screen that re-renders the root.
    const answeredThisSession = useRef(false);

    const visible =
        NEW_SIGNIN_CHOOSER &&
        isAuthenticated &&
        // undefined means storage hasn't been read yet; showing now would
        // flash the chooser at someone who already chose.
        hasRememberedChoice === false &&
        !isLoading &&
        !answeredThisSession.current;

    const handleConfirm = useCallback(
        async (profile: Profile, remember: boolean) => {
            setSubmitting(true);
            setError(null);
            try {
                // Point the token at the matching row first. If this fails the
                // chooser stays up: landing someone in a profile the server
                // disagrees with is the exact failure this feature exists to
                // prevent.
                await setModeExplicitly(profile);
                await rememberChoice(remember);
                answeredThisSession.current = true;

                // Signup routes into wallet setup, which owns its own flow —
                // yanking them to a tab root mid-setup would lose that.
                const inProtectedFlow = PROTECTED_FLOWS.some((flow) =>
                    pathname?.includes(flow)
                );
                if (!inProtectedFlow) {
                    router.replace(DESTINATIONS[profile] as never);
                }
            } catch (err: any) {
                setError(
                    err?.message ||
                    "Couldn't switch profile. Check your connection and try again."
                );
            } finally {
                setSubmitting(false);
            }
        },
        [setModeExplicitly, rememberChoice, pathname]
    );

    if (!visible) return null;

    return (
        <ProfileChooser
            visible
            // Someone already signed in when this shipped has a real mode
            // already; presenting it unselected would imply we'd forgotten.
            initialProfile={hasRememberedChoice === false && mode ? mode : undefined}
            submitting={submitting}
            error={error}
            onConfirm={handleConfirm}
        />
    );
};

export default ProfileGate;
