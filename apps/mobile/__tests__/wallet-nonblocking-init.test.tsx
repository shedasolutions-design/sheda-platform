// @ts-nocheck — Test file with Jest mocks
//
// Guards two acceptance criteria that are easy to regress silently:
//
//   1. COLD START. Phase A (a single local metadata read) settles and reports
//      the stored wallet WITHOUT waiting on Phase B's RPC work. The old code
//      wrapped both phases in one `loading` flag that screens bound straight to
//      `disabled`, so Create Wallet / Sign In were dead for the length of an
//      Auth0 session check plus an RPC probe.
//
//   3. FASTAUTH DORMANCY. With FEATURE_FAST_AUTH false, nothing in the default
//
// The Phase B mocks below never resolve on their own — each test resolves them
// by hand. If Phase A ever starts awaiting Phase B again, these tests hang and
// then fail, which is the point.

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
      mockSecureStore.delete(`pk_${k}`);
      return Promise.resolve();
    }),
    migrateLegacyPlaintext: jest.fn(() =>
      Promise.resolve({ migratedKeys: [], failedKeys: [], ranAt: 0 })
    ),
    hasPin: jest.fn(() => Promise.resolve(false)),
  },
}));

// Phase B's RPC work, held open deliberately.
let resolveImport: (v: any) => void;
let resolveConnect: (v: any) => void;
const mockImportWallet = jest.fn(
  () => new Promise((res) => (resolveImport = res))
);
const mockConnectWallet = jest.fn(
  () => new Promise((res) => (resolveConnect = res))
);

jest.mock("@/services/nearWallet", () => ({
  __esModule: true,
  default: {
    importWallet: (...a: any[]) => mockImportWallet(...a),
    connectWallet: (...a: any[]) => mockConnectWallet(...a),
    getCurrentNetwork: jest.fn(() => "testnet"),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

const mockUseApi = jest.fn();
jest.mock("@/contexts/ApiContext", () => ({ useApi: () => mockUseApi() }));


jest.mock("@/components/common/PinPromptModal", () => "PinPromptModal");

import { WALLET_EPOCH } from "@/config/walletConfig";

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

beforeEach(() => {
  mockAsyncStore.clear();
  mockSecureStore.clear();
  mockUseApi.mockReset();
  mockImportWallet.mockClear();
  mockConnectWallet.mockClear();
  mockUseApi.mockReturnValue({
    user: { email: "alice@test.com" },
    isInitializing: false,
  });
});

describe("cold start (acceptance criterion 1)", () => {
  it("reports the stored wallet from local metadata before any RPC resolves", async () => {
    mockAsyncStore.set(
      META_KEY,
      JSON.stringify({
        accountId: "alice.shedauser.testnet",
        publicKey: "ed25519:stored",
        authMethod: "seed",
        epoch: WALLET_EPOCH,
        network: "testnet",
      })
    );
    mockSecureStore.set("pk_current_account_alice@test.com", "alice.shedauser.testnet");
    mockSecureStore.set("seed_alice.shedauser.testnet", "seed words here");

    await act(async () => {
      TestRenderer.create(renderTree());
    });

    // Phase B is still in flight — neither promise has been resolved.
    expect(latest.readiness).toBe("metadata");
    expect(latest.hasLocalWallet).toBe(true);
    expect(latest.localWalletMetadata.accountId).toBe("alice.shedauser.testnet");
    // ...and the account is already on screen, so the dashboard renders real
    // content rather than an empty state.
    expect(latest.walletState.isConnected).toBe(true);
    expect(latest.walletState.account.accountId).toBe("alice.shedauser.testnet");
  });

  it("does not report ready until Phase B finishes, then fills in the balance", async () => {
    mockAsyncStore.set(
      META_KEY,
      JSON.stringify({
        accountId: "alice.shedauser.testnet",
        authMethod: "seed",
        epoch: WALLET_EPOCH,
      })
    );
    mockSecureStore.set("pk_current_account_alice@test.com", "alice.shedauser.testnet");
    mockSecureStore.set("seed_alice.shedauser.testnet", "seed words here");

    await act(async () => {
      TestRenderer.create(renderTree());
    });
    expect(latest.readiness).toBe("metadata");

    await act(async () => {
      resolveImport({ accountId: "alice.shedauser.testnet", isCreated: true });
      await Promise.resolve();
      resolveConnect({
        accountId: "alice.shedauser.testnet",
        publicKey: "ed25519:verified",
        balance: "5000000000000000000000000",
        isCreated: true,
      });
    });

    expect(latest.readiness).toBe("ready");
    expect(latest.walletState.account.balance).toBe("5000000000000000000000000");
    expect(latest.walletState.account.publicKey).toBe("ed25519:verified");
  });

  it("keeps showing the known wallet when Phase B fails", async () => {
    mockAsyncStore.set(
      META_KEY,
      JSON.stringify({
        accountId: "alice.shedauser.testnet",
        authMethod: "seed",
        epoch: WALLET_EPOCH,
      })
    );
    mockSecureStore.set("pk_current_account_alice@test.com", "alice.shedauser.testnet");
    mockSecureStore.set("seed_alice.shedauser.testnet", "seed words here");

    await act(async () => {
      TestRenderer.create(renderTree());
    });

    await act(async () => {
      // A dead RPC endpoint is not evidence the wallet stopped existing.
      resolveImport(Promise.reject(new Error("ERR_RPC_TIMEOUT")));
      await Promise.resolve();
    });

    expect(latest.hasLocalWallet).toBe(true);
    expect(latest.localWalletMetadata.accountId).toBe("alice.shedauser.testnet");
  });

  it("settles quickly with no wallet on a fresh install", async () => {
    await act(async () => {
      TestRenderer.create(renderTree());
    });

    expect(latest.hasLocalWallet).toBe(false);
    expect(latest.localWalletMetadata).toBeNull();
    // Nothing about an empty device should leave the UI in limbo.
    expect(latest.readiness === "metadata" || latest.readiness === "ready").toBe(
      true
    );
  });
});

