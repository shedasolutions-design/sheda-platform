// @ts-nocheck — Test file with Jest mocks
//
// Acceptance criterion 4: legacy plaintext keys are migrated into encrypted
// storage on first run, safely and without logging secrets.
//
// The migration exists because web and Expo Go previously wrote seed phrases
// and private keys to AsyncStorage verbatim — on web that is localStorage,
// readable by any script on the origin. Shipping the encrypted store without
// this would leave the old plaintext sitting there forever.

// Expo installs `fetch` as a LAZY global getter. Anything that so much as
// reads global.fetch causes it to load ExpoFetchModule -> expo-modules-core ->
// react-native-css-interop, which calls Appearance.getColorScheme() and dies
// against the stubbed react-native below. Assigning fetch up front replaces the
// getter so it never fires. Nothing in this suite makes a network call.
global.fetch = jest.fn(() =>
  Promise.reject(new Error("no network in this suite"))
) as any;

jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
  NativeModules: {},
  // css-interop reads this at import time if it ever does get loaded.
  Appearance: {
    getColorScheme: () => "light",
    addChangeListener: () => ({ remove() {} }),
  },
}));

jest.mock("react-native-keychain", () => ({
  ACCESS_CONTROL: { BIOMETRY_ANY_OR_DEVICE_PASSCODE: "bio" },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "unlocked" },
  SECURITY_LEVEL: { SECURE_HARDWARE: "hw" },
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
  getSupportedBiometryType: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn(() => Promise.resolve("hash")),
  getRandomBytesAsync: jest.fn((n: number) =>
    Promise.resolve(new Uint8Array(n))
  ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const mockAsyncStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) =>
    Promise.resolve(mockAsyncStore.get(k) ?? null)
  ),
  setItem: jest.fn((k: string, v: string) => {
    mockAsyncStore.set(k, v);
    return Promise.resolve();
  }),
  removeItem: jest.fn((k: string) => {
    mockAsyncStore.delete(k);
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve([...mockAsyncStore.keys()])),
  multiRemove: jest.fn((keys: string[]) => {
    keys.forEach((k) => mockAsyncStore.delete(k));
    return Promise.resolve();
  }),
}));

// Stands in for IndexedDB + the non-extractable CryptoKey.
const mockEncryptedStore = new Map<string, string>();
let mockFailWrite: string | null = null;
jest.mock("@/services/webSecretStore", () => ({
  webAvailable: () => true,
  webSecretStore: {
    available: () => true,
    set: jest.fn((k: string, v: string) => {
      if (mockFailWrite === k) return Promise.reject(new Error("quota"));
      mockEncryptedStore.set(k, v);
      return Promise.resolve();
    }),
    get: jest.fn((k: string) =>
      Promise.resolve(mockEncryptedStore.get(k) ?? null)
    ),
    remove: jest.fn((k: string) => {
      mockEncryptedStore.delete(k);
      return Promise.resolve();
    }),
  },
}));

const SEED = "witch collapse practice feed shame open despair creek road";
const PRIVATE_KEY = "ed25519:3D4YudUahN1nawWogh8pAKSj92sHbqeZeAF5gvfCYqUJ";

// Required once, not re-required per test. jest.resetModules() would be the
// obvious way to get a fresh singleton, but under jest-expo it re-triggers
// Expo's lazy `fetch` global, which pulls in the native module graph and blows
// up in a suite that mocks react-native down to just Platform. __resetForTests
// clears the same per-process state without that side effect.
const secureStorageModule = require("@/services/secureStorage");
const secureStorage = secureStorageModule.default;

beforeEach(() => {
  mockAsyncStore.clear();
  mockEncryptedStore.clear();
  mockFailWrite = null;
  secureStorageModule.__resetForTests();
});

describe("legacy plaintext migration", () => {
  it("moves plaintext secrets into encrypted storage and erases the originals", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);
    mockAsyncStore.set("private_key_bob.sheda.testnet", PRIVATE_KEY);

    const report = await secureStorage.migrateLegacyPlaintext();

    expect(report.migratedKeys).toHaveLength(2);
    expect(report.failedKeys).toHaveLength(0);

    // Now encrypted...
    expect(mockEncryptedStore.get("seed_phrase_alice.sheda.testnet")).toBe(SEED);
    expect(mockEncryptedStore.get("private_key_bob.sheda.testnet")).toBe(
      PRIVATE_KEY
    );
    // ...and gone from plaintext.
    expect(mockAsyncStore.has("seed_phrase_alice.sheda.testnet")).toBe(false);
    expect(mockAsyncStore.has("private_key_bob.sheda.testnet")).toBe(false);
  });

  it("keeps the wallet readable across the migration", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);

    // Readable before (from the legacy location, via the fallback path)...
    await expect(
      secureStorage.getSeedPhrase("alice.sheda.testnet")
    ).resolves.toBe(SEED);

    await secureStorage.migrateLegacyPlaintext();

    // ...and after, now from the encrypted store. A migration that loses the
    // user's only key is worse than the plaintext it replaced.
    await expect(
      secureStorage.getSeedPhrase("alice.sheda.testnet")
    ).resolves.toBe(SEED);
  });

  it("leaves the plaintext in place when the encrypted write fails", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);
    mockFailWrite = "seed_phrase_alice.sheda.testnet";

    const report = await secureStorage.migrateLegacyPlaintext();

    expect(report.migratedKeys).toHaveLength(0);
    expect(report.failedKeys).toEqual(["seed_phrase_alice.sheda.testnet"]);
    // Copy-verify-then-delete: nothing is destroyed until the copy is proven.
    expect(mockAsyncStore.get("seed_phrase_alice.sheda.testnet")).toBe(SEED);
  });

  it("is idempotent and memoised per process", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);

    const first = await secureStorage.migrateLegacyPlaintext();
    const second = await secureStorage.migrateLegacyPlaintext();

    expect(first.migratedKeys).toHaveLength(1);
    // Same memoised report, not a second sweep.
    expect(second).toBe(first);
  });

  it("does nothing when there is nothing to migrate", async () => {
    const report = await secureStorage.migrateLegacyPlaintext();
    expect(report.migratedKeys).toHaveLength(0);
    expect(report.failedKeys).toHaveLength(0);
  });

  it("never writes a secret to the console", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);
    mockAsyncStore.set("private_key_bob.sheda.testnet", PRIVATE_KEY);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const report = await secureStorage.migrateLegacyPlaintext();

    const logged = JSON.stringify([
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      report,
    ]);
    expect(logged).not.toContain(SEED);
    expect(logged).not.toContain(PRIVATE_KEY);
    // Key NAMES are fine and are what makes the migration auditable.
    expect(logged).toContain("seed_phrase_alice.sheda.testnet");

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("web secrets are encrypted at rest", () => {
  it("writes new seed phrases to the encrypted store, not to AsyncStorage", async () => {
    await secureStorage.saveSeedPhrase("carol.sheda.testnet", SEED);

    expect(mockEncryptedStore.get("seed_phrase_carol.sheda.testnet")).toBe(SEED);
    // The regression this guards: a plaintext copy in localStorage.
    expect(mockAsyncStore.has("seed_phrase_carol.sheda.testnet")).toBe(false);
    expect(JSON.stringify([...mockAsyncStore.values()])).not.toContain(SEED);
  });

  it("deletes both the encrypted and any pre-migration copy", async () => {
    mockAsyncStore.set("seed_phrase_dave.sheda.testnet", SEED);
    mockEncryptedStore.set("seed_phrase_dave.sheda.testnet", SEED);

    await secureStorage.deleteSeedPhrase("dave.sheda.testnet");

    expect(mockEncryptedStore.has("seed_phrase_dave.sheda.testnet")).toBe(false);
    expect(mockAsyncStore.has("seed_phrase_dave.sheda.testnet")).toBe(false);
  });
});

describe("clearAllData scoping", () => {
  it("removes only this service's keys, not the whole app", async () => {
    mockAsyncStore.set("seed_phrase_alice.sheda.testnet", SEED);
    mockAsyncStore.set("private_key_alice.sheda.testnet", PRIVATE_KEY);
    mockAsyncStore.set("tx_pin_alice.sheda.testnet", "{}");
    // Unrelated app state that the old AsyncStorage.clear() destroyed.
    mockAsyncStore.set("cached_listings", "[...]");
    mockAsyncStore.set("notification_prefs", "{}");

    await secureStorage.clearAllData();

    expect(mockAsyncStore.has("seed_phrase_alice.sheda.testnet")).toBe(false);
    expect(mockAsyncStore.has("private_key_alice.sheda.testnet")).toBe(false);
    expect(mockAsyncStore.has("tx_pin_alice.sheda.testnet")).toBe(false);
    expect(mockAsyncStore.get("cached_listings")).toBe("[...]");
    expect(mockAsyncStore.get("notification_prefs")).toBe("{}");
  });
});
