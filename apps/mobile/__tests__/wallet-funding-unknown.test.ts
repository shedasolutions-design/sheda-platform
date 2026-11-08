// @ts-nocheck — Test file with Jest mocks
//
// "Cannot read the funding balance" must not be treated as "the funding
// account is empty".
//
// Conflating the two is a quiet, expensive bug: a single RPC timeout or 429
// during signup made canSponsor() say no, and creation fell through to a free
// *.testnet name or — worse — an unfunded implicit account the user then had to
// fund themselves. No error was raised anywhere, because falling through is
// exactly what the fallback chain is designed to do. From the outside that
// looks like "creating a wallet is broken", and it correlates with flaky
// networks, which is precisely how it was reported.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/secureStorage", () => ({
  __esModule: true,
  default: {
    saveSeedPhrase: jest.fn(() => Promise.resolve()),
    getSeedPhrase: jest.fn(() => Promise.resolve(null)),
    savePrivateKey: jest.fn(() => Promise.resolve()),
    getPrivateKey: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock("@/services/nearIndexer", () => ({
  NearIndexerService: class {},
}));
jest.mock("@/services/nearContract", () => ({
  __esModule: true,
  default: { initialize: jest.fn(() => Promise.resolve()) },
  AMBIGUOUS_WRITE_ERROR: "AMBIGUOUS_WRITE",
}));

import nearWalletService from "@/services/nearWallet";

const svc: any = nearWalletService;

/** Reaches the private balance/decision helpers directly. */
const canSponsor = (amount: string) => svc.canSponsor(amount);

beforeEach(() => {
  // A funding key must be present, or canSponsor short-circuits to "no"
  // before it ever reads a balance.
  svc.fundingKeys = { testnet: "ed25519:fake-key-for-test", mainnet: null };
  svc.currentNetwork = "testnet";

  // Collapse withRetry to a single attempt. What is under test is the
  // decision — unknown vs empty — not the retry/failover machinery, and the
  // real one rotates endpoints and rebuilds a live provider mid-test, which
  // would put this unit test on the network.
  svc.withRetry = (operation: () => Promise<any>) => operation();
});

describe("canSponsor when the balance cannot be read", () => {
  it('reports "unknown", not "no", on an RPC failure', async () => {
    svc.provider = {
      viewAccount: jest.fn(() => Promise.reject(new Error("ERR_RPC_TIMEOUT"))),
    };

    // The distinction the whole fix rests on. "no" would silently demote the
    // user to an inferior wallet; "unknown" lets createAccount decide.
    await expect(canSponsor("1")).resolves.toBe("unknown");
  });

  it('reports "unknown" when the endpoint rate-limits us', async () => {
    svc.provider = {
      viewAccount: jest.fn(() =>
        Promise.reject(new Error("429 Too Many Requests"))
      ),
    };
    await expect(canSponsor("1")).resolves.toBe("unknown");
  });
});

describe("canSponsor when the balance is readable", () => {
  it('reports "yes" with enough for the deposit plus margin', async () => {
    svc.provider = {
      // 5 NEAR
      viewAccount: jest.fn(() =>
        Promise.resolve({ amount: (5n * 10n ** 24n).toString() })
      ),
    };
    await expect(canSponsor("1")).resolves.toBe("yes");
  });

  it('reports "no" when genuinely short', async () => {
    svc.provider = {
      // 0.5 NEAR — a real, readable shortfall, unlike an unreadable one.
      viewAccount: jest.fn(() =>
        Promise.resolve({ amount: (5n * 10n ** 23n).toString() })
      ),
    };
    await expect(canSponsor("1")).resolves.toBe("no");
  });

  it('reports "no" when the balance is exactly the deposit', async () => {
    // Sending the whole balance would leave nothing for gas and would strand
    // the funding account below its own storage stake.
    svc.provider = {
      viewAccount: jest.fn(() =>
        Promise.resolve({ amount: (1n * 10n ** 24n).toString() })
      ),
    };
    await expect(canSponsor("1")).resolves.toBe("no");
  });
});

describe("canSponsor with no funding key", () => {
  it('reports "no" without touching the network', async () => {
    svc.fundingKeys = { testnet: null, mainnet: null };
    const viewAccount = jest.fn();
    svc.provider = { viewAccount };

    await expect(canSponsor("1")).resolves.toBe("no");
    // No key means no sponsored path regardless of balance; asking the RPC
    // would be a pointless round trip on the signup critical path.
    expect(viewAccount).not.toHaveBeenCalled();
  });
});
