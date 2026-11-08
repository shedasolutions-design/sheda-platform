// ============================================================================
// Platform Adapter — unified wallet storage across Expo and web
// ============================================================================
// Two stores with deliberately different security postures:
//
//   1. METADATA (accountId, publicKey, network, backup flag) — NOT SECRET.
//      Fast, never behind biometrics, readable synchronously after hydrate().
//      This is what Phase A of wallet init reads.
//
//   2. ENCRYPTED BLOB (the seed phrase / private key) — SECRET.
//      Delegated to services/secureStorage.ts, which dispatches to
//      react-native-keychain on native and services/webSecretStore.ts
//      (IndexedDB + a non-extractable AES-GCM key) on web.
//
// WHY METADATA IS SPLIT OUT AT ALL:
// The old code stored the account pointer by calling secureStorage.savePrivateKey
// ("private_key_current_account_<email>"), which on native lands in a Keychain
// entry guarded by BIOMETRY_ANY_OR_DEVICE_PASSCODE. Cold start therefore had to
// clear a Face ID / passcode prompt just to learn which account to show. That
// makes a sub-second first paint impossible by construction. An accountId is a
// public string that appears on the block explorer — gating it behind biometrics
// bought no security and cost the entire startup path.
// ============================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import secureStorage from "./secureStorage";

export interface WalletMetadata {
  accountId: string;
  publicKey?: string;
  network?: "testnet" | "mainnet";
  /** How this wallet was created — drives which signer the UI uses. */
  authMethod?: "seed" | "privateKey";
  /** True once an encrypted cloud backup has been written for this wallet. */
  hasCloudBackup?: boolean;
  /** ms epoch of the last successful cloud backup. */
  lastBackupAt?: number;
  /**
   * The WALLET_EPOCH this wallet was created under (config/walletConfig.ts).
   *
   * Absent means epoch 1 — records written before the field existed. A record
   * older than the current epoch is detached on launch so the user starts
   * fresh; see isStaleEpoch().
   */
  epoch?: number;
}

const isWeb = Platform.OS === "web";

/** Versioned so a future format change can migrate rather than misparse. */
const META_PREFIX = "sheda.wallet.meta.v1.";

const metaKey = (userEmail: string) => `${META_PREFIX}${userEmail}`;

// ── Synchronous metadata cache ─────────────────────────────────────────────
// On web, localStorage is genuinely synchronous, so a sync read is exact.
// On native, AsyncStorage is not — nothing can be truly synchronous there. The
// cache below is primed by hydrateMetadata() (a single AsyncStorage read: no
// network, no biometrics, single-digit ms) and read synchronously afterwards.

const memoryCache = new Map<string, WalletMetadata | null>();
let hydratedFor: string | null = null;

function parseMeta(raw: string | null): WalletMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // A metadata record with no accountId tells us nothing; treat as absent
    // rather than handing the UI a half-populated wallet.
    return parsed && typeof parsed.accountId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Primes the sync cache for a user. Fast and safe to call repeatedly — the
 * result is what getWalletMetadataSync() returns until the next write.
 */
export async function hydrateMetadata(
  userEmail?: string
): Promise<WalletMetadata | null> {
  if (!userEmail) return null;
  const key = metaKey(userEmail);
  try {
    const raw = isWeb
      ? globalThis.localStorage?.getItem(key) ?? null
      : await AsyncStorage.getItem(key);
    const meta = parseMeta(raw);
    memoryCache.set(userEmail, meta);
    hydratedFor = userEmail;
    return meta;
  } catch (error) {
    console.warn("PlatformAdapter: metadata hydrate failed:", error);
    memoryCache.set(userEmail, null);
    return null;
  }
}

/**
 * Reads wallet metadata with zero awaits. Returns null when the cache has not
 * been primed for this user yet — callers must treat null as "not known yet",
 * not as "no wallet", until hydrateMetadata() has resolved.
 */
export function getWalletMetadataSync(
  userEmail?: string
): WalletMetadata | null {
  if (!userEmail) return null;
  if (isWeb && !memoryCache.has(userEmail)) {
    // Web can answer exactly without a prior hydrate.
    try {
      const meta = parseMeta(
        globalThis.localStorage?.getItem(metaKey(userEmail)) ?? null
      );
      memoryCache.set(userEmail, meta);
      return meta;
    } catch {
      return null;
    }
  }
  return memoryCache.get(userEmail) ?? null;
}

/** True once hydrateMetadata() has completed for this user. */
export function isMetadataHydrated(userEmail?: string): boolean {
  if (!userEmail) return true; // nothing to hydrate for a signed-out user
  return isWeb || hydratedFor === userEmail || memoryCache.has(userEmail);
}

export async function setWalletMetadata(
  userEmail: string,
  meta: WalletMetadata
): Promise<void> {
  if (!userEmail) {
    throw new Error(
      "Wallet metadata must be scoped to a signed-in user — refusing to write a device-global record."
    );
  }
  const key = metaKey(userEmail);
  const raw = JSON.stringify(meta);
  if (isWeb) globalThis.localStorage?.setItem(key, raw);
  else await AsyncStorage.setItem(key, raw);
  memoryCache.set(userEmail, meta);
}

/** Shallow-merges into the existing record. */
export async function patchWalletMetadata(
  userEmail: string,
  patch: Partial<WalletMetadata>
): Promise<WalletMetadata | null> {
  const current =
    getWalletMetadataSync(userEmail) ?? (await hydrateMetadata(userEmail));
  if (!current && !patch.accountId) return null;
  const next = { ...(current ?? {}), ...patch } as WalletMetadata;
  await setWalletMetadata(userEmail, next);
  return next;
}

export async function clearWalletMetadata(userEmail?: string): Promise<void> {
  if (!userEmail) return;
  const key = metaKey(userEmail);
  if (isWeb) globalThis.localStorage?.removeItem(key);
  else await AsyncStorage.removeItem(key);
  memoryCache.set(userEmail, null);
}

// ── Encrypted blob API ─────────────────────────────────────────────────────
// Thin platform-neutral names over secureStorage, which owns the actual
// Keychain/IndexedDB dispatch. Callers that only care about "store this secret"
// use these; callers that care about seed-vs-private-key use secureStorage.

export async function setEncryptedWalletBlob(
  accountId: string,
  plaintext: string
): Promise<void> {
  await secureStorage.saveSeedPhrase(accountId, plaintext);
}

export async function getEncryptedWalletBlob(
  accountId: string
): Promise<string | null> {
  return secureStorage.getSeedPhrase(accountId);
}

/** Removes the secret for one account. Does not touch other accounts. */
export async function removeWallet(accountId: string): Promise<void> {
  await secureStorage.deleteSeedPhrase(accountId);
  await secureStorage.deletePrivateKey(accountId);
}

/**
 * True when a stored wallet predates the current WALLET_EPOCH and should be
 * detached rather than reconnected.
 *
 * Metadata with no `epoch` counts as epoch 1: those records were written
 * before the field existed, which is exactly the generation being retired.
 */
export function isStaleEpoch(
  meta: WalletMetadata | null,
  currentEpoch: number
): boolean {
  if (!meta?.accountId) return false;
  return (meta.epoch ?? 1) < currentEpoch;
}

/** Exposed for tests and for the migration's post-conditions. */
export const __internal = { metaKey, parseMeta };
