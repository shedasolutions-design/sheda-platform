// ============================================================================
// Cloud Backup — encrypted wallet backup to Firebase (Auth + Firestore)
// ============================================================================
// SECURITY BOUNDARY. Read this before changing anything in this file:
//
//   * Every function here takes or returns an EncryptedEnvelope — NEVER a seed
//     phrase, private key, or passphrase. Encryption happens in
//     services/walletCrypto.ts, on the device, before a single byte reaches
//     this module. If you find yourself adding a `plaintext` or `passphrase`
//     parameter to a function below, the layering has gone wrong.
//   * Nothing here logs an envelope. Ciphertext is not a secret, but logging it
//     puts a complete offline-crackable target into log aggregators, which is a
//     meaningfully worse position than not doing that.
//
// WHY THE REST API AND NOT THE `firebase` NPM PACKAGE:
// The objective is behaviour that is identical on Expo and web. The Firebase JS
// SDK carries a browser-oriented transport that needs extra setup under Hermes,
// pulls in a large dependency, and gives us nothing here — this module needs
// exactly three HTTP calls (token exchange, document write, document list).
// Plain fetch against the documented REST endpoints is the same code on both
// platforms with no dependency at all. Security rules apply to REST identically.
// ============================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import secureStorage from "./secureStorage";
import {
  FIREBASE_API_KEY,
  IDENTITY_TOOLKIT_URL,
  SECURE_TOKEN_URL,
  backupCollectionPath,
  firestoreDocumentsUrl,
  isFirebaseConfigured,
} from "@/config/firebase";
import type { EncryptedEnvelope } from "@/services/walletCrypto";

export interface BackupMetadata {
  accountId: string;
  publicKey?: string;
  network?: "testnet" | "mainnet";
  /** Which secret the envelope holds — restore needs to know how to import it. */
  secretKind: "seedPhrase" | "privateKey";
  /** Free-text, e.g. "Pixel 8" — shown in the restore picker. */
  deviceLabel?: string;
}

export interface BackupRecord extends BackupMetadata {
  envelope: EncryptedEnvelope;
  updatedAt: number;
}

export interface FirebaseSession {
  idToken: string;
  refreshToken: string;
  uid: string;
  email?: string;
  /** ms epoch at which idToken stops being accepted. */
  expiresAt: number;
}

/** Non-secret session cache. The refresh token IS sensitive — see note below. */
const SESSION_KEY = "sheda.wallet.fb.session.v1";

// The refresh token is a bearer credential for the user's backup collection, so
// it goes in the platform secure store on native rather than AsyncStorage. On
// web there is no equivalent, so the session is held in memory only and the
// user re-authenticates with Google each session — a deliberate trade: a
// long-lived refresh token in web storage is exactly the thing an XSS would
// reach for, and re-tapping Google sign-in is a mild cost by comparison.
let memorySession: FirebaseSession | null = null;

export class CloudBackupNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloud backup isn't configured for this build (missing Firebase settings)."
    );
    this.name = "CloudBackupNotConfiguredError";
  }
}

function assertConfigured(): void {
  if (!isFirebaseConfigured()) throw new CloudBackupNotConfiguredError();
}

/** Surfaces the Google/Firebase error `message` rather than a bare status code. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || body?.error?.status || fallback;
  } catch {
    return fallback;
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────

/**
 * Exchanges a Google id_token (from hooks/useGoogleAuth) for a Firebase
 * session. This is the same Google account the user already signed into Sheda
 * with, so backup/restore needs no second identity.
 */
export async function signInWithGoogleIdToken(
  googleIdToken: string
): Promise<FirebaseSession> {
  assertConfigured();

  const res = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${googleIdToken}&providerId=google.com`,
      // Identity Toolkit requires a requestUri; for non-browser clients any
      // stable value is accepted and it is not used for redirects.
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });

  if (!res.ok) {
    throw new Error(
      await readError(res, "Google sign-in for backup failed. Please try again.")
    );
  }

  const body = await res.json();
  const session: FirebaseSession = {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    uid: body.localId,
    email: body.email,
    expiresAt: Date.now() + Number(body.expiresIn ?? 3600) * 1000,
  };
  await persistSession(session);
  return session;
}

async function persistSession(session: FirebaseSession): Promise<void> {
  memorySession = session;
  if (Platform.OS === "web") return; // memory only, by design (see above)
  try {
    await secureStorage.savePrivateKey(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    // A session we cannot cache costs one extra Google tap next launch; it is
    // not worth failing the backup that just succeeded.
    console.warn("CloudBackup: could not cache backup session:", error);
  }
}

/** Returns a cached session if one is still usable, else null. */
export async function getCachedSession(): Promise<FirebaseSession | null> {
  if (memorySession) return refreshIfNeeded(memorySession);
  if (Platform.OS === "web") return null;
  try {
    const raw = await secureStorage.getPrivateKey(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as FirebaseSession;
    memorySession = session;
    return refreshIfNeeded(session);
  } catch {
    return null;
  }
}

/** Refreshes with a 60s margin so a call cannot expire mid-flight. */
async function refreshIfNeeded(
  session: FirebaseSession
): Promise<FirebaseSession | null> {
  if (session.expiresAt - 60_000 > Date.now()) return session;
  try {
    const res = await fetch(`${SECURE_TOKEN_URL}?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(
        session.refreshToken
      )}`,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const next: FirebaseSession = {
      ...session,
      idToken: body.id_token,
      refreshToken: body.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
    };
    await persistSession(next);
    return next;
  } catch {
    return null;
  }
}

export async function signOutBackup(): Promise<void> {
  memorySession = null;
  try {
    if (Platform.OS === "web") return;
    await secureStorage.deletePrivateKey(SESSION_KEY);
  } catch {
    // Nothing cached — already in the desired state.
  }
}

// ── Firestore value encoding ───────────────────────────────────────────────
// Firestore's REST API uses a typed-value wire format
// ({stringValue}/{integerValue}/...) rather than plain JSON.

type FsValue = Record<string, unknown>;

function toFs(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFs) } };
  }
  return { mapValue: { fields: toFsFields(value as Record<string, unknown>) } };
}

function toFsFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = toFs(v);
  }
  return out;
}

function fromFs(value: FsValue): unknown {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("arrayValue" in value) {
    const arr = (value.arrayValue as { values?: FsValue[] })?.values ?? [];
    return arr.map(fromFs);
  }
  if ("mapValue" in value) {
    return fromFsFields(
      (value.mapValue as { fields?: Record<string, FsValue> })?.fields ?? {}
    );
  }
  return null;
}

function fromFsFields(
  fields: Record<string, FsValue>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFs(v);
  return out;
}

// ── Backup / restore ───────────────────────────────────────────────────────

/**
 * Uploads one encrypted wallet envelope.
 *
 * The document ID is the accountId, so backing the same wallet up twice
 * replaces the record rather than piling up copies of the same seed.
 *
 * @param envelope ciphertext ONLY — produced by walletCrypto.encryptSecret().
 */
export async function backupWallet(
  envelope: EncryptedEnvelope,
  metadata: BackupMetadata,
  session?: FirebaseSession | null
): Promise<BackupRecord> {
  assertConfigured();
  const active = session ?? (await getCachedSession());
  if (!active) {
    throw new Error("Sign in with Google to back up your wallet.");
  }
  if (!envelope?.ct) {
    throw new Error("Refusing to upload an empty backup envelope.");
  }

  const record: BackupRecord = {
    ...metadata,
    envelope,
    updatedAt: Date.now(),
  };

  const url =
    `${firestoreDocumentsUrl()}/${backupCollectionPath(active.uid)}/` +
    encodeURIComponent(metadata.accountId);

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${active.idToken}`,
    },
    body: JSON.stringify({ fields: toFsFields(record as any) }),
  });

  if (!res.ok) {
    throw new Error(
      await readError(res, "Could not save your backup. Please try again.")
    );
  }

  // Deliberately logs the account and nothing else — no envelope, no size.
  console.log(`CloudBackup: backup stored for ${metadata.accountId}`);
  return record;
}

/** Lists this user's backups, newest first. Envelopes come back encrypted. */
export async function listBackups(
  session?: FirebaseSession | null
): Promise<BackupRecord[]> {
  assertConfigured();
  const active = session ?? (await getCachedSession());
  if (!active) return [];

  const url = `${firestoreDocumentsUrl()}/${backupCollectionPath(active.uid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${active.idToken}` },
  });

  // An empty collection 404s on Firestore REST — that is "no backups yet",
  // not an error worth showing the user.
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(await readError(res, "Could not load your backups."));
  }

  const body = await res.json();
  const docs: { fields?: Record<string, FsValue> }[] = body?.documents ?? [];
  return docs
    .map((d) => fromFsFields(d.fields ?? {}) as unknown as BackupRecord)
    .filter((r) => r?.accountId && r?.envelope?.ct)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/**
 * Fetches one backup for local decryption.
 *
 * Returns the envelope still encrypted — decryption happens on the device, in
 * walletCrypto.decryptSecret(), with a passphrase this module never sees.
 */
export async function restoreBackup(
  accountId: string,
  session?: FirebaseSession | null
): Promise<BackupRecord | null> {
  assertConfigured();
  const active = session ?? (await getCachedSession());
  if (!active) {
    throw new Error("Sign in with Google to restore your wallet.");
  }

  const url =
    `${firestoreDocumentsUrl()}/${backupCollectionPath(active.uid)}/` +
    encodeURIComponent(accountId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${active.idToken}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readError(res, "Could not load that backup."));
  }

  const body = await res.json();
  const record = fromFsFields(body?.fields ?? {}) as unknown as BackupRecord;
  return record?.envelope?.ct ? record : null;
}

/** Deletes one backup. Used by the "remove backup" affordance. */
export async function deleteBackup(
  accountId: string,
  session?: FirebaseSession | null
): Promise<void> {
  assertConfigured();
  const active = session ?? (await getCachedSession());
  if (!active) throw new Error("Sign in with Google first.");

  const url =
    `${firestoreDocumentsUrl()}/${backupCollectionPath(active.uid)}/` +
    encodeURIComponent(accountId);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${active.idToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(await readError(res, "Could not delete that backup."));
  }
}

/** Test seam — resets module state between cases. */
export const __resetForTests = (): void => {
  memorySession = null;
};

/** Exported for the "you have a backup" hint without a network round-trip. */
export const BACKUP_HINT_KEY = "sheda.wallet.backup.hint.v1";

/** Remembers, locally, that this user has a backup — drives the restore prompt. */
export async function setLocalBackupHint(
  userEmail: string,
  value: boolean
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${BACKUP_HINT_KEY}.${userEmail}`,
      value ? "1" : "0"
    );
  } catch {
    // A missing hint only costs a redundant prompt; never fail a backup for it.
  }
}

export async function getLocalBackupHint(userEmail: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${BACKUP_HINT_KEY}.${userEmail}`)) === "1";
  } catch {
    return false;
  }
}
