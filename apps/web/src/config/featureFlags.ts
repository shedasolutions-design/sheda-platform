// ============================================================================
// Feature Flags — SINGLE SOURCE OF TRUTH
// ============================================================================
// Flags are read from NEXT_PUBLIC_* env vars so they are inlined into the JS
// bundle at build time (Expo replaces `process.env.NEXT_PUBLIC_X` literally).
// That inlining is why every read below must spell the variable out in full
// rather than going through a computed lookup — `process.env[name]` is NOT
// substituted by the Expo bundler and would silently read as undefined.
// ============================================================================

/** Parses the string form an env var arrives in ("true"/"1") into a boolean. */
const isEnabled = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};

/**
 * Encrypted cloud backup of the wallet to Firebase (services/cloudBackup.ts).
 *
 * DEFAULT: true, but the service degrades to a clean "not configured" state
 * when the Firebase env vars are absent (see config/firebase.ts), so leaving
 * this on in a project without Firebase set up costs nothing and shows no
 * broken UI. Set to false to hide backup UI outright.
 */
export const FEATURE_CLOUD_BACKUP = isEnabled(
  process.env.NEXT_PUBLIC_FEATURE_CLOUD_BACKUP,
  true
);
