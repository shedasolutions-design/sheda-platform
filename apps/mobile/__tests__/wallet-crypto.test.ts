// @ts-nocheck — Test file with Jest mocks
//
// Covers the client-side encryption that stands between a stolen Firestore
// document and a user's funds (services/walletCrypto.ts). The properties
// asserted here are the ones the security requirements actually name:
// AES-256-GCM, a per-backup random nonce, a version/meta tag, and a passphrase
// that is genuinely required to read the plaintext back.

import * as Crypto from "expo-crypto";
import {
  encryptSecret,
  decryptSecret,
  checkPassphrase,
  bytesToBase64,
  base64ToBytes,
  ENVELOPE_VERSION,
  PBKDF2_ITERATIONS,
  MIN_PASSPHRASE_LENGTH,
} from "@/services/walletCrypto";

// Deterministic-but-varying random bytes. A fixed value would hide exactly the
// bug this suite most needs to catch — a reused nonce.
// Must carry the `mock` prefix: jest.mock factories are hoisted, and Jest
// only allows out-of-scope references whose names start with "mock".
let mockRandomCounter = 0;
jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn((n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (mockRandomCounter * 31 + i * 7) % 256;
    mockRandomCounter++;
    return Promise.resolve(out);
  }),
}));

const SEED =
  "witch collapse practice feed shame open despair creek road again ice least";

// PBKDF2 at 210k iterations in pure JS is genuinely slow; these tests use a
// low count so the suite stays fast. The production count is asserted
// separately below so lowering it here cannot mask a weakened default.
const FAST = { iterations: 1000 };

beforeEach(() => {
  mockRandomCounter = 0;
});

describe("envelope format", () => {
  it("produces a versioned AES-256-GCM envelope with a nonce and salt", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);

    expect(env.v).toBe(ENVELOPE_VERSION);
    expect(env.alg).toBe("AES-256-GCM");
    expect(env.kdf).toBe("PBKDF2-SHA256");
    expect(env.iters).toBe(1000);
    expect(typeof env.salt).toBe("string");
    expect(typeof env.nonce).toBe("string");
    expect(typeof env.createdAt).toBe("number");

    // 96-bit nonce, 128-bit salt.
    expect(base64ToBytes(env.nonce)).toHaveLength(12);
    expect(base64ToBytes(env.salt)).toHaveLength(16);
  });

  it("never leaves the plaintext recoverable from the envelope", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    const serialized = JSON.stringify(env);

    expect(serialized).not.toContain(SEED);
    // Not even a single word of the phrase should survive.
    for (const word of SEED.split(" ")) {
      expect(serialized).not.toContain(word);
    }
  });

  it("uses a fresh nonce and salt for every encryption", async () => {
    const a = await encryptSecret(SEED, "correct horse battery", FAST);
    const b = await encryptSecret(SEED, "correct horse battery", FAST);

    // Nonce reuse under the same key is catastrophic for GCM.
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ct).not.toBe(b.ct);
  });

  it("defaults to the OWASP-floor iteration count in production", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(210_000);
  });
});

describe("round trip", () => {
  it("decrypts back to the exact seed phrase", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    await expect(decryptSecret(env, "correct horse battery")).resolves.toBe(SEED);
  });

  it("round-trips a private key and unicode passphrases", async () => {
    const pk = "ed25519:3D4YudUahN1nawWogh8pAKSj92sHbqeZeAF5gvfCYqUJ";
    const env = await encryptSecret(pk, "паролька-Ü-🔐-long", FAST);
    await expect(decryptSecret(env, "паролька-Ü-🔐-long")).resolves.toBe(pk);
  });
});

describe("tamper and passphrase resistance", () => {
  it("rejects the wrong passphrase", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    await expect(decryptSecret(env, "wrong horse battery")).rejects.toThrow(
      /recovery passphrase/i
    );
  });

  it("rejects a modified ciphertext", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    const bytes = base64ToBytes(env.ct);
    bytes[0] ^= 0xff;
    const tampered = { ...env, ct: bytesToBase64(bytes) };

    await expect(decryptSecret(tampered, "correct horse battery")).rejects.toThrow();
  });

  it("rejects a downgraded iteration count", async () => {
    // The header is bound in as GCM additional authenticated data precisely so
    // an attacker with write access to the backup store cannot rewrite `iters`
    // down to 1 and brute-force the passphrase cheaply.
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    const downgraded = { ...env, iters: 1 };

    await expect(decryptSecret(downgraded, "correct horse battery")).rejects.toThrow();
  });

  it("refuses an envelope from a newer format version", async () => {
    const env = await encryptSecret(SEED, "correct horse battery", FAST);
    await expect(
      decryptSecret({ ...env, v: ENVELOPE_VERSION + 1 }, "correct horse battery")
    ).rejects.toThrow(/newer version/i);
  });
});

describe("passphrase strength", () => {
  it("rejects anything shorter than the minimum", () => {
    const result = checkPassphrase("a".repeat(MIN_PASSPHRASE_LENGTH - 1));
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/at least/i);
  });

  it("rejects common and degenerate passphrases", () => {
    expect(checkPassphrase("password123").ok).toBe(false);
    expect(checkPassphrase("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("accepts a reasonable passphrase and scores it", () => {
    const result = checkPassphrase("Tr0ubador&Horse");
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThan(2);
  });
});

describe("base64 helpers", () => {
  it("round-trips arbitrary byte lengths, including padding edges", () => {
    for (const len of [0, 1, 2, 3, 15, 16, 17, 255]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37) % 256;
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
        Array.from(bytes)
      );
    }
  });
});
