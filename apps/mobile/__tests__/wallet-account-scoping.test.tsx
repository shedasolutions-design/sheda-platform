// @ts-nocheck — Test file with Jest mocks
//
// Regression test for a cross-account wallet leak: WalletContext used to
// fall back to a device-global "current_account" storage key whenever a
// per-user lookup missed, which meant switching from one signed-in Sheda
// account to another (or signing out) could silently hand the previous
// account's NEAR wallet — including access to its seed phrase/private key
// via wallet-recovery — to whichever user was now signed in. See
// contexts/WalletContext.tsx's saveAccountPointer/getStoredAccountId.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// In-memory fake of the secure storage layer, namespaced the same way the
// real prefixed keys are, so cross-key collisions would show up here too.
const mockStore = new Map<string, string>();
jest.mock("@/services/secureStorage", () => ({
  __esModule: true,
  default: {
    saveSeedPhrase: jest.fn((accountId: string, seed: string) => {
      mockStore.set(`seed_${accountId}`, seed);
      return Promise.resolve();
    }),
    getSeedPhrase: jest.fn((accountId: string) =>
      Promise.resolve(mockStore.get(`seed_${accountId}`) ?? null)
    ),
    deleteSeedPhrase: jest.fn((accountId: string) => {
      mockStore.delete(`seed_${accountId}`);
      return Promise.resolve();
    }),
    savePrivateKey: jest.fn((key: string, value: string) => {
      mockStore.set(`pk_${key}`, value);
      return Promise.resolve();
    }),
    getPrivateKey: jest.fn((key: string) =>
      Promise.resolve(mockStore.get(`pk_${key}`) ?? null)
    ),
    deletePrivateKey: jest.fn((key: string) => {
      mockStore.delete(`pk_${key}`);
      return Promise.resolve();
    }),
    hasPin: jest.fn(() => Promise.resolve(false)),
    deleteBackupPassphrase: jest.fn(() => Promise.resolve()),
    hasBackupPassphrase: jest.fn(() => Promise.resolve(false)),
    getBackupPassphrase: jest.fn(() => Promise.resolve(null)),
    saveBackupPassphrase: jest.fn(() => Promise.resolve()),
    canUseBiometricUnlock: jest.fn(() => Promise.resolve(false)),
  },
}));

jest.mock("@/services/nearWallet", () => ({
  __esModule: true,
  default: {
    importWallet: jest.fn((seed: string, accountId: string) =>
      Promise.resolve({ accountId, publicKey: "pub", isCreated: true })
    ),
    connectWallet: jest.fn((accountId: string) =>
      Promise.resolve({
        accountId,
        publicKey: "pub",
        balance: "0",
        isCreated: true,
      })
    ),
    getCurrentNetwork: jest.fn(() => "testnet"),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

const mockUseApi = jest.fn();
jest.mock("@/contexts/ApiContext", () => ({
  useApi: () => mockUseApi(),
}));


jest.mock("@/components/common/PinPromptModal", () => "PinPromptModal");

let latest: any;
function Harness() {
  latest = useWallet();
  return null;
}

function renderTree() {
  return (
    <WalletProvider>
      <Harness />
    </WalletProvider>
  );
}

describe("WalletContext account scoping", () => {
  beforeEach(() => {
    mockStore.clear();
    mockUseApi.mockReset();
  });

  it("does not hand alice's stored wallet to bob after an account switch", async () => {
    mockUseApi.mockReturnValue({
      user: { email: "alice@test.com" },
      isInitializing: false,
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(renderTree());
    });

    await act(async () => {
      await latest.saveWalletState(
        "alice.sheda.testnet",
        "seed words here",
        "alice@test.com"
      );
    });

    // Alice signs out, bob signs in — same provider instance, userEmail
    // changes from useApi(), which is exactly what happens in the real app
    // since WalletProvider is mounted once for the whole app lifetime.
    mockUseApi.mockReturnValue({
      user: { email: "bob@test.com" },
      isInitializing: false,
    });
    await act(async () => {
      renderer.update(renderTree());
    });

    expect(latest.walletState.isConnected).toBe(false);
    expect(latest.walletState.account).toBeNull();

    const bobStored = await latest.getStoredAccountId("bob@test.com");
    expect(bobStored).toBeNull();
  });

  it("reconnects the same user's wallet on next launch without prompting", async () => {
    mockUseApi.mockReturnValue({
      user: { email: "alice@test.com" },
      isInitializing: false,
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(renderTree());
    });

    await act(async () => {
      await latest.saveWalletState(
        "alice.sheda.testnet",
        "seed words here",
        "alice@test.com"
      );
    });

    // Simulate the app restarting for the same signed-in user: force the
    // restoration effect to re-run by toggling isInitializing.
    mockUseApi.mockReturnValue({
      user: { email: "alice@test.com" },
      isInitializing: true,
    });
    await act(async () => {
      renderer.update(renderTree());
    });
    mockUseApi.mockReturnValue({
      user: { email: "alice@test.com" },
      isInitializing: false,
    });
    await act(async () => {
      renderer.update(renderTree());
    });

    expect(latest.walletState.isConnected).toBe(true);
    expect(latest.walletState.account?.accountId).toBe("alice.sheda.testnet");
  });

  it("signOut clears the current user's pointer so it does not auto-reconnect next launch", async () => {
    mockUseApi.mockReturnValue({
      user: { email: "alice@test.com" },
      isInitializing: false,
    });

    await act(async () => {
      TestRenderer.create(renderTree());
    });

    await act(async () => {
      await latest.saveWalletState(
        "alice.sheda.testnet",
        "seed words here",
        "alice@test.com"
      );
    });

    await act(async () => {
      await latest.signOut();
    });

    expect(latest.walletState.isConnected).toBe(false);
    const stored = await latest.getStoredAccountId("alice@test.com");
    expect(stored).toBeNull();
  });


  it("saveWalletState refuses to persist without a signed-in user", async () => {
    mockUseApi.mockReturnValue({ user: null, isInitializing: false });

    await act(async () => {
      TestRenderer.create(renderTree());
    });

    await expect(
      latest.saveWalletState("nobody.sheda.testnet", "seed words here", undefined)
    ).rejects.toThrow(/signed-in user/i);
  });
});
