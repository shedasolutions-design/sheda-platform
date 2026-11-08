// ============================================================================
// Wallet Crypto — client-side encryption for cloud backups
// ============================================================================
// Everything here runs on the DEVICE. Plaintext seed phrases and private keys
// never cross this boundary outward: services/cloudBackup.ts only ever accepts
// an EncryptedEnvelope produced by encryptSecret() below.
//
// WHY PURE-JS CRYPTO INSTEAD OF WebCrypto:
// The objective is a wallet that behaves identically on Expo and on web.
// crypto.subtle exists in browsers but NOT in React Native's Hermes runtime
// (Expo ships expo-crypto, which offers random bytes and digests — no AES, no
// PBKDF2). Branching on platform would mean two different cipher stacks, and a
// backup written on one could silently fail to open on the other. @noble/ciphers
// and @noble/hashes are audited, dependency-free, and byte-identical on both,
// so a blob encrypted on Android opens on web and vice versa.
// ============================================================================

import { gcm } from "@noble/ciphers/aes";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import * as Crypto from "expo-crypto";

/** Bumped only when the envelope format changes in a non-readable way. */
export const ENVELOPE_VERSION = 1;

/**
 * PBKDF2 work factor. OWASP's 2023 guidance for PBKDF2-HMAC-SHA256 is 600k,
 * but that assumes native crypto. In pure JS on a mid-range Android this runs
 * several times slower, and a 20-second backup button is a feature nobody
 * uses — which is its own security outcome. 210k is the OWASP floor for this
 * construction and lands around 1-3s on device. The count is stored IN the
 * envelope, so raising it later does not break existing backups: old blobs
 * decrypt with the iteration count they were written with.
 */
export const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const NONCE_BYTES = 12; // 96-bit, the GCM standard
const KEY_BYTES = 32; // AES-256

export interface EncryptedEnvelope {
  /** Envelope format version — see ENVELOPE_VERSION. */
  v: number;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  /** Iterations actually used for THIS blob. */
  iters: number;
  /** base64 */
  salt: string;
  /** base64 — unique per encryption, never reused. */
  nonce: string;
  /** base64 ciphertext with the GCM tag appended. */
  ct: string;
  /** ms epoch, informational only (shown in the restore picker). */
  createdAt: number;
}

// ── base64 (no Buffer / atob dependency) ───────────────────────────────────
// Deliberately self-contained: these run inside services that unit tests import
// directly, without app/_layout.tsx's Buffer polyfill having been installed.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 63];
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = B64.indexOf(clean[i + 2]);
    const c3 = B64.indexOf(clean[i + 3]);
    out[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[p++] = ((c2 & 3) << 6) | c3;
  }
  return out.subarray(0, p);
}

const utf8 = {
  encode: (s: string): Uint8Array => {
    // TextEncoder is present in Hermes and browsers alike; the manual path is
    // a fallback for minimal runtimes (and some bare Jest environments).
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    const bytes: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0) as number;
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000)
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else
        bytes.push(
          0xf0 | (c >> 18),
          0x80 | ((c >> 12) & 63),
          0x80 | ((c >> 6) & 63),
          0x80 | (c & 63)
        );
    }
    return new Uint8Array(bytes);
  },
  decode: (b: Uint8Array): string => {
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(b);
    return String.fromCharCode(...Array.from(b));
  },
};

/** Overwrites a buffer in place. Best-effort — JS gives no real guarantee. */
export function wipe(bytes: Uint8Array | null | undefined): void {
  if (bytes) bytes.fill(0);
}

// ── Key derivation ─────────────────────────────────────────────────────────

/**
 * Derives a 256-bit KEK from the user's recovery passphrase.
 *
 * pbkdf2Async (not the sync variant) is used on purpose: it awaits between
 * blocks, which keeps the JS thread responsive. The sync version freezes the
 * UI — including the spinner meant to indicate progress — for the full
 * derivation.
 */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  if (!passphrase) throw new Error("A recovery passphrase is required.");
  return pbkdf2Async(sha256, utf8.encode(passphrase.normalize("NFKC")), salt, {
    c: iterations,
    dkLen: KEY_BYTES,
  });
}

/**
 * Header bytes bound into GCM as additional authenticated data.
 *
 * Without this, the header fields sit outside the authentication tag and an
 * attacker who can write to the backup store could rewrite `iters` down to 1
 * and hand the blob back. The tag check would still pass on the ciphertext
 * while the KDF cost collapsed. Binding them makes any header edit a decrypt
 * failure instead.
 */
function headerAad(env: Omit<EncryptedEnvelope, "ct">): Uint8Array {
  return utf8.encode(
    `${env.v}|${env.alg}|${env.kdf}|${env.iters}|${env.salt}|${env.nonce}|${env.createdAt}`
  );
}

// ── Encrypt / decrypt ──────────────────────────────────────────────────────

/**
 * Encrypts a secret (seed phrase or private key) under a passphrase-derived
 * key. Returns a self-describing envelope safe to hand to cloud storage.
 *
 * @param plaintext the secret. NEVER logged, by this function or its callers.
 */
export async function encryptSecret(
  plaintext: string,
  passphrase: string,
  opts: { iterations?: number; createdAt?: number } = {}
): Promise<EncryptedEnvelope> {
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const salt = await Crypto.getRandomBytesAsync(SALT_BYTES);
  const nonce = await Crypto.getRandomBytesAsync(NONCE_BYTES);

  const header: Omit<EncryptedEnvelope, "ct"> = {
    v: ENVELOPE_VERSION,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iters: iterations,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    // Injectable so tests are deterministic; defaults to now.
    createdAt: opts.createdAt ?? Date.now(),
  };

  const kek = await deriveKek(passphrase, salt, iterations);
  const pt = utf8.encode(plaintext);
  try {
    const ct = gcm(kek, nonce, headerAad(header)).encrypt(pt);
    return { ...header, ct: bytesToBase64(ct) };
  } finally {
    // Drop the key and the plaintext copy as soon as the cipher is done.
    wipe(kek);
    wipe(pt);
  }
}

/**
 * Reverses encryptSecret(). Throws a user-readable error on a wrong
 * passphrase — a GCM tag failure is indistinguishable from corruption, so the
 * message names the overwhelmingly likelier cause without ruling out the other.
 */
export async function decryptSecret(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<string> {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Backup is unreadable (missing envelope).");
  }
  if (envelope.v > ENVELOPE_VERSION) {
    throw new Error(
      `This backup was written by a newer version of the app (format v${envelope.v}). Update Sheda and try again.`
    );
  }
  if (envelope.alg !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA256") {
    throw new Error("Backup uses an unsupported encryption format.");
  }

  const salt = base64ToBytes(envelope.salt);
  const nonce = base64ToBytes(envelope.nonce);
  const ct = base64ToBytes(envelope.ct);
  const { ct: _ct, ...header } = envelope;

  const kek = await deriveKek(passphrase, salt, envelope.iters);
  try {
    const pt = gcm(kek, nonce, headerAad(header)).decrypt(ct);
    const out = utf8.decode(pt);
    wipe(pt);
    return out;
  } catch {
    throw new Error(
      "Could not unlock this backup. Check your recovery passphrase and try again."
    );
  } finally {
    wipe(kek);
  }
}

// ── Passphrase strength ────────────────────────────────────────────────────

export interface PassphraseCheck {
  ok: boolean;
  /** 0-4, for a strength meter. */
  score: number;
  /** Present when ok is false — shown verbatim to the user. */
  problem?: string;
}

/** Minimum length. Shorter than this is not worth encrypting behind. */
export const MIN_PASSPHRASE_LENGTH = 10;

/**
 * A deliberately modest check. This passphrase is the ONLY thing standing
 * between a stolen Firestore document and the user's funds, but rejecting
 * strong passphrases for lacking a punctuation mark pushes people toward
 * "Password1!" — so the hard gate is length plus a not-obviously-terrible
 * check, and the score exists to nudge rather than block.
 */
export function checkPassphrase(passphrase: string): PassphraseCheck {
  const p = passphrase ?? "";
  if (p.length < MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      score: 0,
      problem: `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    };
  }
  if (/^(.)\1+$/.test(p)) {
    return {
      ok: false,
      score: 0,
      problem: "Use more than one repeated character.",
    };
  }
  const COMMON = [
    "password",
    "12345678",
    "qwertyuiop",
    "letmein",
    "iloveyou",
    "administrator",
    "sheda",
    "seedphrase",
    "walletwallet",
  ];
  const lower = p.toLowerCase();
  if (COMMON.some((c) => lower === c || lower.startsWith(c))) {
    return {
      ok: false,
      score: 0,
      problem: "That passphrase is too easy to guess.",
    };
  }

  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return { ok: true, score: Math.min(4, score) };
}
