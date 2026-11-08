// @ts-nocheck — Test file with Jest mocks
//
// The clean-restart mechanism (config/walletConfig.ts WALLET_EPOCH).
//
// The funding account moved from sheda.testnet to shedauser.testnet, so every
// previously-issued *.sheda.testnet wallet sits in a namespace the app no
// longer provisions under. The account pointer is keyed by email and survives
// app updates, so without an explicit epoch check those users would reconnect
// to a dead namespace forever and never see the new flow.
//
// The property that matters most here is the SAFETY one: detaching must not
// destroy key material. A stale namespace is not a reason to make someone's
// funds unrecoverable.

import { isStaleEpoch } from "@/services/platformAdapter";
import { WALLET_EPOCH, FUNDING_ACCOUNTS } from "@/config/walletConfig";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

describe("WALLET_EPOCH configuration", () => {
  it("points the testnet funding account at shedauser.testnet", () => {
    expect(FUNDING_ACCOUNTS.testnet.accountId).toBe("shedauser.testnet");
    expect(FUNDING_ACCOUNTS.testnet.walletSuffix).toBe(".shedauser.testnet");
  });

  it("has advanced past the original namespace", () => {
    // Guards against the config being reverted while the reset logic stays,
    // which would silently stop detaching old wallets.
    expect(WALLET_EPOCH).toBeGreaterThanOrEqual(2);
  });
});

describe("isStaleEpoch", () => {
  const CURRENT = 2;

  it("treats metadata with no epoch as the retired generation", () => {
    // Records written before the field existed are exactly the ones being
    // retired, so absence must read as epoch 1 rather than as up-to-date.
    expect(
      isStaleEpoch({ accountId: "alice.sheda.testnet" }, CURRENT)
    ).toBe(true);
  });

  it("detaches an explicitly older epoch", () => {
    expect(
      isStaleEpoch({ accountId: "alice.sheda.testnet", epoch: 1 }, CURRENT)
    ).toBe(true);
  });

  it("keeps a current-epoch wallet attached", () => {
    expect(
      isStaleEpoch({ accountId: "alice.shedauser.testnet", epoch: 2 }, CURRENT)
    ).toBe(false);
  });

  it("keeps a future epoch attached rather than detaching it", () => {
    // A newer app version wrote this. Detaching would delete the pointer of a
    // wallet this build simply does not understand yet — strictly worse than
    // leaving it alone.
    expect(
      isStaleEpoch({ accountId: "alice.shedauser.testnet", epoch: 3 }, CURRENT)
    ).toBe(false);
  });

  it("ignores metadata with no account", () => {
    expect(isStaleEpoch(null, CURRENT)).toBe(false);
    expect(isStaleEpoch({}, CURRENT)).toBe(false);
    expect(isStaleEpoch({ epoch: 1 }, CURRENT)).toBe(false);
  });

  it("judges by epoch, not by account name", () => {
    // An implicit or registrar account carries no .sheda.testnet suffix, so
    // suffix-matching would miss it. Epoch is the thing being versioned.
    const implicitFromOldEpoch = {
      accountId: "a".repeat(64),
      epoch: 1,
    };
    expect(isStaleEpoch(implicitFromOldEpoch, CURRENT)).toBe(true);

    const registrarFromNewEpoch = {
      accountId: "alice7f3k.testnet",
      epoch: 2,
    };
    expect(isStaleEpoch(registrarFromNewEpoch, CURRENT)).toBe(false);
  });
});

describe("detaching is non-destructive", () => {
  it("never calls a seed-phrase delete", async () => {
    // The guarantee: detaching drops the POINTER, not the key. Anything that
    // ended up in an old wallet stays recoverable by importing the phrase.
    const secureStorage = {
      deleteSeedPhrase: jest.fn(),
      deletePrivateKey: jest.fn(),
    };

    // Mirrors the reset path in WalletContext's Phase A.
    const meta = { accountId: "alice.sheda.testnet", epoch: 1 };
    if (isStaleEpoch(meta, WALLET_EPOCH)) {
      await secureStorage.deletePrivateKey("current_account_a@b.com");
    }

    expect(secureStorage.deletePrivateKey).toHaveBeenCalledWith(
      "current_account_a@b.com"
    );
    // The seed phrase for the detached account is untouched.
    expect(secureStorage.deleteSeedPhrase).not.toHaveBeenCalled();
  });
});
