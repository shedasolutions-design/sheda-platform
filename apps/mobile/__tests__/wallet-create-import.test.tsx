// @ts-nocheck — Test file with Jest mocks
//
// Unit coverage for createWallet() and importWallet() as they behave through
// WalletContext, including the Phase A metadata record that each must leave
// behind. That record is what makes the NEXT cold start fast: without it, the
// app falls back to reading the biometric-gated Keychain pointer just to learn
// its own accountId (see services/platformAdapter.ts).

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";

jest.mock("@/config/featureFlags", () => ({
  FEATURE_FAST_AUTH: false,
  FEATURE_CLOUD_BACKUP: true,
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
  multiRemove: jest.fn(() => Promise.resolve()),
}));

const mockSecureStore = new Map<string, string>();
jest.mock("@/services/secureStorage", () => ({
  __esModule: true,
  default: {
    saveSeedPhrase: jest.fn((a: string, s: string) => {
      mockSecureStore.set(`seed_${a}`, s);
      return Promise.resolve();
    }),
    getSeedPhrase: jest.fn((a: string) =>
      Promise.resolve(mockSecureStore.get(`seed_${a}`) ?? null)
    ),
    deleteSeedPhrase: jest.fn(() => Promise.resolve()),
    savePrivateKey: jest.fn((k: string, v: string) => {
      mockSecureStore.set(`pk_${k}`, v);
      return Promise.resolve();
    }),
    getPrivateKey: jest.fn((k: string) =>
      Promise.resolve(mockSecureStore.get(`pk_${k}`) ?? null)
    ),
    deletePrivateKey: jest.fn((k: string) => {
      mockSecureStore.delete(k);
      return Promise.resolve();
    }),
    migrateLegacyPlaintext: jest.fn(() =>
      Promise.resolve({ migratedKeys: [], failedKeys: [], ranAt: 0 })
    ),
    hasPin: jest.fn(() => Promise.resolve(false)),
  },
}));

const SEED =
  "witch collapse practice feed shame open despair creek road again ice least";

const mockCreateWallet = jest.fn();
const mockImportWallet = jest.fn();
const mockImportByPrivateKey = jest.fn();
const mockConnectWallet = jest.fn();

jest.mock("@/services/nearWallet", () => ({
  __esModule: true,
  default: {
    createWallet: (...a: any[]) => mockCreateWallet(...a),
    importWallet: (...a: any[]) => mockImportWallet(...a),
    importWalletByPrivateKey: (...a: any[]) => mockImportByPrivateKey(...a),
    connectWallet: (...a: any[]) => mockConnectWallet(...a),
    getCurrentNetwork: jest.fn(() => "testnet"),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

const mockUseApi = jest.fn();
jest.mock("@/contexts/ApiContext", () => ({ useApi: () => mockUseApi() }));
jest.mock("@/components/common/PinPromptModal", () => "PinPromptModal");

const META_KEY = "sheda.wallet.meta.v1.alice@test.com";

let latest: any;
function Harness() {
  latest = useWallet();
  return null;
}
const renderTree = () => (
  <WalletProvider>
    <Harness />
  </WalletProvider>
);

async function mount() {
  await act(async () => {
    TestRenderer.create(renderTree());
  });
}

beforeEach(() => {
  mockAsyncStore.clear();
  mockSecureStore.clear();
  jest.clearAllMocks();
  mockUseApi.mockReturnValue({
    user: { email: "alice@test.com" },
    isInitializing: false,
  });
  mockCreateWallet.mockResolvedValue({
    accountId: "alice.sheda.testnet",
    seedPhrase: SEED,
    publicKey: "ed25519:created",
    isCreated: true,
    airdropFailed: false,
  });
  mockImportWallet.mockResolvedValue({
    accountId: "alice.sheda.testnet",
    publicKey: "ed25519:imported",
    isCreated: true,
  });
  mockImportByPrivateKey.mockResolvedValue({
    accountId: "alice.sheda.testnet",
    publicKey: "ed25519:imported-pk",
    isCreated: true,
  });
  mockConnectWallet.mockResolvedValue({
    accountId: "alice.sheda.testnet",
    publicKey: "ed25519:connected",
    balance: "1000000000000000000000000",
    isCreated: true,
  });
});

describe("createWallet", () => {
  it("returns the new account and its seed phrase", async () => {
    await mount();

    let result: any;
    await act(async () => {
      result = await latest.createWallet("alice@test.com");
    });

    expect(mockCreateWallet).toHaveBeenCalledWith(
      "alice@test.com",
      expect.anything()
    );
    expect(result.accountId).toBe("alice.sheda.testnet");
    expect(result.seedPhrase).toBe(SEED);
  });

  it("persists the seed and the Phase A metadata via saveWalletState", async () => {
    await mount();

    await act(async () => {
      await latest.createWallet("alice@test.com");
      await latest.saveWalletState(
        "alice.sheda.testnet",
        SEED,
        "alice@test.com"
      );
    });

    // Secret in secure storage...
    expect(mockSecureStore.get("seed_alice.sheda.testnet")).toBe(SEED);
    // ...pointer scoped to this user...
    expect(mockSecureStore.get("pk_current_account_alice@test.com")).toBe(
      "alice.sheda.testnet"
    );
    // ...and the fast, non-secret metadata the next cold start reads.
    const meta = JSON.parse(mockAsyncStore.get(META_KEY));
    expect(meta.accountId).toBe("alice.sheda.testnet");
    expect(meta.authMethod).toBe("seed");
    expect(latest.hasLocalWallet).toBe(true);
  });

  it("keeps the seed phrase out of the metadata record", async () => {
    await mount();
    await act(async () => {
      await latest.saveWalletState(
        "alice.sheda.testnet",
        SEED,
        "alice@test.com"
      );
    });

    // Metadata is deliberately NOT a secret store — it is read without
    // biometrics and, on web, lives in localStorage.
    const meta = mockAsyncStore.get(META_KEY);
    expect(meta).not.toContain(SEED);

    // Word-BOUNDARY matches, not substrings: the record legitimately contains
    // "alice.sheda.testnet", and a plain substring check would flag the "ice"
    // inside "alice" as a leak.
    for (const word of SEED.split(" ")) {
      expect(meta).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it("surfaces a creation failure as an error rather than a silent no-op", async () => {
    mockCreateWallet.mockRejectedValue(new Error("ERR_ACCOUNT_EXISTS"));
    await mount();

    await expect(
      act(async () => {
        await latest.createWallet("alice@test.com");
      })
    ).rejects.toThrow(/ERR_ACCOUNT_EXISTS/);
  });

  it("refuses to persist a wallet with no signed-in user to scope it to", async () => {
    await mount();

    // A device-global pointer is how one user's wallet leaks to the next.
    await expect(
      latest.saveWalletState("alice.sheda.testnet", SEED, undefined)
    ).rejects.toThrow(/scoped per account/i);
  });
});

describe("importWallet", () => {
  it("imports from a seed phrase and connects the account", async () => {
    await mount();

    let account: any;
    await act(async () => {
      account = await latest.importWallet(SEED, "alice.sheda.testnet");
    });

    // The third argument is the signed-in user's email — import is scoped per
    // Sheda account, never device-global.
    expect(mockImportWallet).toHaveBeenCalledWith(
      SEED,
      "alice.sheda.testnet",
      "alice@test.com"
    );
    expect(account.isCreated).toBe(true);
    expect(latest.walletState.isConnected).toBe(true);
    expect(latest.walletState.account.accountId).toBe("alice.sheda.testnet");
  });

  it("imports from a private key", async () => {
    await mount();

    let account: any;
    await act(async () => {
      account = await latest.importWalletByPrivateKey(
        "ed25519:3D4YudUahN1nawWogh8pAKSj92sHbqeZeAF5gvfCYqUJ",
        "alice.sheda.testnet"
      );
    });

    expect(mockImportByPrivateKey).toHaveBeenCalled();
    expect(account.isCreated).toBe(true);
  });

  it("reports an unusable seed phrase as an error", async () => {
    mockImportWallet.mockRejectedValue(new Error("ERR_INVALID_SEED_PHRASE"));
    await mount();

    await expect(
      act(async () => {
        await latest.importWallet("not a real seed", "alice.sheda.testnet");
      })
    ).rejects.toThrow(/ERR_INVALID_SEED_PHRASE/);
    expect(latest.walletState.isConnected).toBe(false);
  });

  it("round-trips: an imported wallet is found by Phase A on the next launch", async () => {
    await mount();
    await act(async () => {
      await latest.importWallet(SEED, "alice.sheda.testnet");
      await latest.saveWalletState(
        "alice.sheda.testnet",
        SEED,
        "alice@test.com"
      );
    });

    // Fresh provider, same storage — this is the cold-start path.
    let second: any;
    function SecondHarness() {
      second = useWallet();
      return null;
    }
    await act(async () => {
      TestRenderer.create(
        <WalletProvider>
          <SecondHarness />
        </WalletProvider>
      );
    });

    expect(second.hasLocalWallet).toBe(true);
    expect(second.localWalletMetadata.accountId).toBe("alice.sheda.testnet");
  });
});
