// ============================================================================
// Firebase Configuration — SINGLE SOURCE OF TRUTH for encrypted wallet backup
// ============================================================================
// Used ONLY by services/cloudBackup.ts, to store the client-side-encrypted
// wallet envelope against the user's Firebase UID. Firebase never sees a seed
// phrase: the blob is AES-256-GCM ciphertext before it is handed over, and the
// key is derived from a passphrase that is never transmitted.
//
// These values are public by design. A Firebase web API key is an project
// identifier, not a credential — it authorises nothing on its own. Access is
// enforced entirely by the Firestore security rules (see NEAR_WALLET_README.md),
// which restrict every document to request.auth.uid. That is why they carry the
// NEXT_PUBLIC_ prefix and are safe to inline into the bundle.
//
// SETUP: see "Cloud backup setup" in NEAR_WALLET_README.md.
// ============================================================================

export const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
export const FIREBASE_AUTH_DOMAIN =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
export const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
export const FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";

/**
 * True when enough config is present to attempt a backup. Checked before any
 * UI offers the feature, so an unconfigured build shows nothing rather than a
 * button that fails on tap.
 */
export const isFirebaseConfigured = (): boolean =>
  Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID);

/** Identity Toolkit — exchanges a Google id_token for a Firebase session. */
export const IDENTITY_TOOLKIT_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp";

/** Secure Token service — refreshes an expired Firebase ID token. */
export const SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

/** Firestore REST root for this project's default database. */
export const firestoreDocumentsUrl = (): string =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Collection path holding one user's backups.
 *
 * Shape: walletBackups/{uid}/items/{accountId}
 *
 * Keying the item document by accountId (rather than an auto-ID) means a
 * re-backup of the same wallet overwrites in place instead of accumulating a
 * new copy of the same seed on every save.
 */
export const backupCollectionPath = (uid: string): string =>
  `walletBackups/${uid}/items`;
