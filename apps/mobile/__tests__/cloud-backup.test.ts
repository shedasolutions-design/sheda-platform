// @ts-nocheck — Test file with Jest mocks
//
// Covers services/cloudBackup.ts against a fake Firestore REST endpoint.
//
// The headline assertion is the security one: across a full
// backup -> list -> restore -> decrypt cycle, no request body ever contains
// the seed phrase. That is acceptance criterion 2's "no unencrypted seed ever
// leaves the device", asserted rather than assumed.

import { encryptSecret, decryptSecret } from "@/services/walletCrypto";

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn((n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (Date.now() + i * 13) % 256;
    return Promise.resolve(out);
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Firebase must look configured for the module to do anything. `configured` is
// a mutable spy rather than a constant so the "not configured" case can be
// exercised without jest.resetModules() — see the note on requiring below.
const mockIsConfigured = jest.fn(() => true);
jest.mock("@/config/firebase", () => ({
  FIREBASE_API_KEY: "test-api-key",
  FIREBASE_PROJECT_ID: "sheda-test",
  IDENTITY_TOOLKIT_URL: "https://identitytoolkit.test/v1/accounts:signInWithIdp",
  SECURE_TOKEN_URL: "https://securetoken.test/v1/token",
  isFirebaseConfigured: () => mockIsConfigured(),
  firestoreDocumentsUrl: () =>
    "https://firestore.test/v1/projects/sheda-test/databases/(default)/documents",
  backupCollectionPath: (uid: string) => `walletBackups/${uid}/items`,
}));

// Native path, so the session is cached through secureStorage rather than
// held in memory only (which is the web behaviour).
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const mockSecureStore = new Map<string, string>();
jest.mock("@/services/secureStorage", () => ({
  __esModule: true,
  default: {
    savePrivateKey: jest.fn((k: string, v: string) => {
      mockSecureStore.set(k, v);
      return Promise.resolve();
    }),
    getPrivateKey: jest.fn((k: string) =>
      Promise.resolve(mockSecureStore.get(k) ?? null)
    ),
    deletePrivateKey: jest.fn((k: string) => {
      mockSecureStore.delete(k);
      return Promise.resolve();
    }),
  },
}));

const SEED =
  "witch collapse practice feed shame open despair creek road again ice least";
const FAST = { iterations: 1000 };

// Every outbound request, so the "no plaintext leaves the device" check can
// look at the whole conversation rather than one call.
let sentRequests: { url: string; init?: any }[] = [];
// Stands in for the Firestore collection.
let fakeDocs: Record<string, any> = {};

/** Firestore REST typed-value encoding, matching what the service emits. */
function toFsFields(obj: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === "string") out[k] = { stringValue: v };
    else if (typeof v === "boolean") out[k] = { booleanValue: v };
    else if (typeof v === "number")
      out[k] = Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    else out[k] = { mapValue: { fields: toFsFields(v) } };
  }
  return out;
}

// Required once, not per test. jest.resetModules() would be the obvious way to
// reset the module's cached session, but under jest-expo it re-triggers Expo's
// lazy `fetch` global, which pulls in the native module graph and fails in a
// suite that mocks react-native down to just Platform. __resetForTests clears
// the same state without that side effect.
const cloudBackup = require("@/services/cloudBackup");

beforeEach(() => {
  sentRequests = [];
  fakeDocs = {};
  mockSecureStore.clear();
  mockIsConfigured.mockReturnValue(true);
  cloudBackup.__resetForTests();

  global.fetch = jest.fn(async (url: string, init?: any) => {
    sentRequests.push({ url, init });

    if (url.includes("signInWithIdp")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          idToken: "fake-firebase-id-token",
          refreshToken: "fake-refresh-token",
          localId: "uid-abc-123",
          email: "tester@example.com",
          expiresIn: "3600",
        }),
      };
    }

    const docId = decodeURIComponent(url.split("/items/")[1] ?? "");

    if (init?.method === "PATCH") {
      fakeDocs[docId] = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => fakeDocs[docId] };
    }

    if (init?.method === "DELETE") {
      delete fakeDocs[docId];
      return { ok: true, status: 200, json: async () => ({}) };
    }

    // GET one document
    if (docId) {
      if (!fakeDocs[docId]) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => fakeDocs[docId] };
    }

    // GET the collection
    const documents = Object.values(fakeDocs);
    if (!documents.length) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ documents }) };
  }) as any;
});

describe("backupWallet / restoreBackup", () => {
  it("round-trips an encrypted wallet through the cloud and back", async () => {

    const session = await cloudBackup.signInWithGoogleIdToken("google-id-token");
    expect(session.uid).toBe("uid-abc-123");

    const envelope = await encryptSecret(SEED, "correct horse battery", FAST);
    await cloudBackup.backupWallet(envelope, {
      accountId: "tester.sheda.testnet",
      publicKey: "ed25519:FakePublicKey",
      network: "testnet",
      secretKind: "seedPhrase",
    });

    const restored = await cloudBackup.restoreBackup("tester.sheda.testnet");
    expect(restored).not.toBeNull();
    expect(restored.accountId).toBe("tester.sheda.testnet");
    expect(restored.secretKind).toBe("seedPhrase");

    // The whole point: the blob that came back still decrypts to the seed.
    await expect(
      decryptSecret(restored.envelope, "correct horse battery")
    ).resolves.toBe(SEED);
  });

  it("never puts the seed phrase or passphrase on the wire", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    const envelope = await encryptSecret(SEED, "correct horse battery", FAST);
    await cloudBackup.backupWallet(envelope, {
      accountId: "tester.sheda.testnet",
      network: "testnet",
      secretKind: "seedPhrase",
    });
    await cloudBackup.listBackups();
    await cloudBackup.restoreBackup("tester.sheda.testnet");

    const wire = JSON.stringify(sentRequests);
    expect(wire).not.toContain(SEED);
    expect(wire).not.toContain("correct horse battery");
    for (const word of SEED.split(" ")) {
      expect(wire).not.toContain(word);
    }
  });

  it("authenticates every Firestore call with the Firebase ID token", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    const envelope = await encryptSecret(SEED, "pass phrase here", FAST);
    await cloudBackup.backupWallet(envelope, {
      accountId: "tester.sheda.testnet",
      secretKind: "seedPhrase",
    });

    // Rules key off request.auth.uid, so an unauthenticated write would be a
    // silently world-readable backup collection.
    const firestoreCalls = sentRequests.filter((r) =>
      r.url.includes("firestore.test")
    );
    expect(firestoreCalls.length).toBeGreaterThan(0);
    for (const call of firestoreCalls) {
      expect(call.init.headers.Authorization).toBe(
        "Bearer fake-firebase-id-token"
      );
    }
  });

  it("scopes the document path to the signed-in UID", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    const envelope = await encryptSecret(SEED, "pass phrase here", FAST);
    await cloudBackup.backupWallet(envelope, {
      accountId: "tester.sheda.testnet",
      secretKind: "seedPhrase",
    });

    const write = sentRequests.find((r) => r.init?.method === "PATCH");
    expect(write.url).toContain("walletBackups/uid-abc-123/items");
  });

  it("re-backing-up the same wallet overwrites instead of duplicating", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    for (const phrase of ["first passphrase", "second passphrase"]) {
      const env = await encryptSecret(SEED, phrase, FAST);
      await cloudBackup.backupWallet(env, {
        accountId: "tester.sheda.testnet",
        secretKind: "seedPhrase",
      });
    }

    const list = await cloudBackup.listBackups();
    expect(list).toHaveLength(1);
    // The surviving copy is the newer one.
    await expect(
      decryptSecret(list[0].envelope, "second passphrase")
    ).resolves.toBe(SEED);
  });

  it("returns an empty list rather than throwing when nothing is backed up", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    // Firestore 404s an empty collection; that is "none yet", not a failure.
    await expect(cloudBackup.listBackups()).resolves.toEqual([]);
    await expect(cloudBackup.restoreBackup("nobody.testnet")).resolves.toBeNull();
  });

  it("refuses to back up without a signed-in backup account", async () => {
    const envelope = await encryptSecret(SEED, "pass phrase here", FAST);

    await expect(
      cloudBackup.backupWallet(envelope, {
        accountId: "tester.sheda.testnet",
        secretKind: "seedPhrase",
      })
    ).rejects.toThrow(/sign in with google/i);
  });

  it("refuses to upload an empty envelope", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");

    await expect(
      cloudBackup.backupWallet({ ct: "" } as any, {
        accountId: "tester.sheda.testnet",
        secretKind: "seedPhrase",
      })
    ).rejects.toThrow(/empty backup/i);
  });

  it("drops the cached session on sign-out", async () => {
    await cloudBackup.signInWithGoogleIdToken("google-id-token");
    expect(await cloudBackup.getCachedSession()).not.toBeNull();

    await cloudBackup.signOutBackup();
    expect(await cloudBackup.getCachedSession()).toBeNull();
  });
});

describe("when Firebase is not configured", () => {
  beforeEach(() => {
    mockIsConfigured.mockReturnValue(false);
  });

  it("reports unavailable instead of attempting a call", async () => {
    // A build without Firebase settings must fail closed and locally — never
    // reach out to a half-configured endpoint.
    await expect(cloudBackup.signInWithGoogleIdToken("token")).rejects.toThrow(
      /isn't configured/i
    );
    await expect(cloudBackup.listBackups()).rejects.toThrow(/isn't configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
