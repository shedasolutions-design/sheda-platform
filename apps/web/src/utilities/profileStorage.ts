import AsyncStorage from "@/lib/storage";

export type Profile = "buyer" | "seller";

/** The active profile. Always set — defaults to buyer — so it cannot answer
 *  "has this person chosen yet?" on its own. */
export const MODE_STORAGE_KEY = "app_user_mode";

/** Set only when "Remember on this device" was ticked in the chooser. Its
 *  absence is what makes the chooser appear. */
export const REMEMBERED_CHOICE_KEY = "profile_choice_remembered";

/** Set whenever the chooser is answered, remembered or not, and removed on
 *  sign-out. It is what stops the chooser reappearing on every page load
 *  during one sign-in: the answer used to live only in memory. */
export const ANSWERED_THIS_SIGNIN_KEY = "profile_choice_answered";

/**
 * The profile to sign in as, or null to let the server resolve buyer.
 *
 * Lives here rather than in ModeContext because ApiContext needs it too, and
 * ApiProvider sits *outside* ModeProvider so it cannot read the hook. Two
 * copies of these key names is exactly how a "remembered" choice ends up
 * remembered by one half of the app and not the other.
 *
 * Returns null unless the choice was explicitly remembered: a saved mode on
 * its own is just the last thing the toggle was set to, not a decision to
 * sign in that way.
 */
export async function getRememberedProfile(): Promise<Profile | null> {
    try {
        const [remembered, mode] = await Promise.all([
            AsyncStorage.getItem(REMEMBERED_CHOICE_KEY),
            AsyncStorage.getItem(MODE_STORAGE_KEY),
        ]);
        if (remembered !== "true") return null;
        return mode === "buyer" || mode === "seller" ? mode : null;
    } catch {
        // Unreadable storage means "ask again" — the chooser will handle it.
        return null;
    }
}
