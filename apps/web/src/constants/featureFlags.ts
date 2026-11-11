/**
 * Client-side feature flags.
 *
 * These are read from NEXT_PUBLIC_* vars, so they are baked into the bundle
 * at build time — they gate what the app *shows*, not what the server
 * accepts. The authoritative kill switch for the profile chooser is the
 * backend's own NEW_SIGNIN_CHOOSER: turning that off makes the feature inert
 * even for app builds already shipping this flag on.
 */

/** Parse an NEXT_PUBLIC_ flag, treating anything but an explicit "false" as on. */
function flagEnabled(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    return raw.toLowerCase() !== "false" && raw !== "0";
}

/**
 * Show the buyer/seller chooser after sign-in and sign-up.
 *
 * Defaults on. Off, the app never asks and never sends a profile, which is
 * exactly how it behaved before the chooser — the backend then resolves the
 * buyer row as it always did.
 */
export const NEW_SIGNIN_CHOOSER = flagEnabled(
    process.env.NEXT_PUBLIC_NEW_SIGNIN_CHOOSER,
    true
);
