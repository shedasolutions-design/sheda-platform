// @ts-nocheck — Test file with Jest mocks
//
// Guards the request-volume fixes for the 429 / "blocked by CORS policy"
// storm against the shared public testnet RPC.
//
// Two behaviours caused it:
//   1. initialize() tore down the provider and re-ran a status() health-check
//      POST on every call. Callers invoke it before essentially every read, so
//      each logical read cost two requests — and the probe always restarted at
//      endpoint[0], undoing any rotation away from a throttled endpoint.
//   2. Reads arrive in bursts (useTransactions fans out per owned property,
//      the wallet resolves a property per bid, both screens poll while mounted
//      behind each other), and every one of those was a separate request.
import nearContractService, { NearContractService } from "@/services/nearContract";
import { resetRpcHealth } from "@/services/rpcHealth";

// Count every RPC round-trip the service makes.
const mockStatus = jest.fn(() => Promise.resolve({ sync_info: {} }));
const mockQuery = jest.fn(() =>
  Promise.resolve({ result: Array.from(Buffer.from(JSON.stringify({ id: 1 }))) })
);

jest.mock("@near-js/providers", () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    status: (...args) => mockStatus(...args),
    query: (...args) => mockQuery(...args),
  })),
}));

beforeEach(async () => {
  mockStatus.mockClear();
  mockQuery.mockClear();
  resetRpcHealth();
  NearContractService.clearViewCache();
  // Force a fresh probe so each test starts from a known state.
  (nearContractService as any).provider = null;
  (nearContractService as any).initPromise = null;
});

describe("initialize()", () => {
  it("probes once, then stays quiet no matter how often it is called", async () => {
    await nearContractService.initialize("testnet");
    expect(mockStatus).toHaveBeenCalledTimes(1);

    // Every read site calls initialize() first; none of them should re-probe.
    for (let i = 0; i < 10; i++) {
      await nearContractService.initialize("testnet");
    }
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it("shares a single probe between concurrent callers", async () => {
    // Screens routinely kick off several reads in parallel on mount.
    await Promise.all([
      nearContractService.initialize("testnet"),
      nearContractService.initialize("testnet"),
      nearContractService.initialize("testnet"),
    ]);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });
});

describe("view call de-duplication", () => {
  it("issues one request for identical concurrent reads", async () => {
    await nearContractService.initialize("testnet");
    mockQuery.mockClear();

    // The shape of useTransactions' fan-out: the same property resolved from
    // several bids at once.
    await Promise.all([
      nearContractService.getPropertyById(7),
      nearContractService.getPropertyById(7),
      nearContractService.getPropertyById(7),
      nearContractService.getPropertyById(7),
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("still issues a request per distinct property", async () => {
    await nearContractService.initialize("testnet");
    mockQuery.mockClear();

    await Promise.all([
      nearContractService.getPropertyById(1),
      nearContractService.getPropertyById(2),
      nearContractService.getPropertyById(3),
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("reuses a just-completed read across screens", async () => {
    // The wallet tab and the history tab both ask for the owner's properties
    // on mount; the second one should not repeat the request.
    await nearContractService.initialize("testnet");
    mockQuery.mockClear();

    await nearContractService.getMyProperties("alice.testnet");
    await nearContractService.getMyProperties("alice.testnet");

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("does not let one account's result answer for another", async () => {
    await nearContractService.initialize("testnet");
    mockQuery.mockClear();

    await nearContractService.getMyProperties("alice.testnet");
    await nearContractService.getMyProperties("bob.testnet");

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("goes back to the network once the cache is cleared", async () => {
    await nearContractService.initialize("testnet");
    mockQuery.mockClear();

    await nearContractService.getMyProperties("alice.testnet");
    NearContractService.clearViewCache();
    await nearContractService.getMyProperties("alice.testnet");

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("end-to-end request budget", () => {
  it("keeps a mount-time burst to one request per distinct read", async () => {
    // Before: 1 status probe per initialize() + 1 query each, with duplicates
    // repeated in full. This is the shape that produced the 429 cascade.
    await nearContractService.initialize("testnet");
    mockStatus.mockClear();
    mockQuery.mockClear();

    await Promise.all([
      nearContractService.initialize("testnet"),
      nearContractService.getMyProperties("alice.testnet"),
      nearContractService.getBidsForProperty(1),
      nearContractService.getBidsForProperty(1),
      nearContractService.getPropertyById(1),
      nearContractService.getPropertyById(1),
      nearContractService.getPropertyById(2),
    ]);

    expect(mockStatus).toHaveBeenCalledTimes(0);
    // getMyProperties, getBidsForProperty(1), getPropertyById(1), getPropertyById(2)
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });
});
