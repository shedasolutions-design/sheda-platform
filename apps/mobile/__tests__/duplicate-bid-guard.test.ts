// @ts-nocheck — Test file with Jest mocks
//
// Bids were being submitted multiple times.
//
// The UI guarded it with React state (`setIsPlacingBid(true)` at the top of the
// handler, and a Confirm button disabled on that flag). State updates are
// asynchronous: a second tap landing in the same tick still sees an enabled
// button and still calls through, and each call is a real ft_transfer_call that
// moves the user's money again.
//
// It is worst on a slow connection — which is exactly when someone taps again.
//
// The service layer is the right place to stop it: a React fix would have to be
// repeated correctly in every caller (property details, the expiry card,
// anything added later), and one missed caller is someone's funds.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

import nearContractService from "@/services/nearContract";

const Svc: any = nearContractService.constructor;
const dedupe = (key: string, op: () => Promise<any>) => Svc.dedupeWrite(key, op);

beforeEach(() => Svc.resetWriteDedupe());

const deferred = () => {
  let resolve: (v: any) => void;
  let reject: (e: any) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve: resolve!, reject: reject! };
};

describe("concurrent identical writes", () => {
  it("runs the operation once and shares the result", async () => {
    const d = deferred();
    const op = jest.fn(() => d.promise);

    // Two taps in the same tick — the exact shape of the bug.
    const first = dedupe("placeBid:alice:7:usdc:100:Purchase", op);
    const second = dedupe("placeBid:alice:7:usdc:100:Purchase", op);

    d.resolve({ success: true, data: 42 });
    const [a, b] = await Promise.all([first, second]);

    // One on-chain transfer, not two.
    expect(op).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ success: true, data: 42 });
    expect(b).toEqual({ success: true, data: 42 });
  });

  it("does not block a different property", async () => {
    const op = jest.fn(() => Promise.resolve({ success: true }));

    await Promise.all([
      dedupe("placeBid:alice:7:usdc:100:Purchase", op),
      dedupe("placeBid:alice:8:usdc:100:Purchase", op),
    ]);

    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not block a raised bid on the same property", async () => {
    const op = jest.fn(() => Promise.resolve({ success: true }));

    await dedupe("placeBid:alice:7:usdc:100:Purchase", op);
    // Raising an offer is legitimate and must go through.
    await dedupe("placeBid:alice:7:usdc:250:Purchase", op);

    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not block a different bidder", async () => {
    const op = jest.fn(() => Promise.resolve({ success: true }));

    await Promise.all([
      dedupe("placeBid:alice:7:usdc:100:Purchase", op),
      dedupe("placeBid:bob:7:usdc:100:Purchase", op),
    ]);

    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe("a repeat just after the first settled", () => {
  it("is refused rather than silently duplicated", async () => {
    const op = jest.fn(() => Promise.resolve({ success: true }));
    await dedupe("placeBid:alice:7:usdc:100:Purchase", op);

    // Covers the window where the transaction resolved but the UI has not
    // caught up — a real gap on a slow render.
    await expect(
      dedupe("placeBid:alice:7:usdc:100:Purchase", op)
    ).rejects.toThrow(/already submitted/i);

    expect(op).toHaveBeenCalledTimes(1);
  });

  it("refuses loudly instead of reporting a second success", async () => {
    // Silently returning the cached result would show a second "Bid placed"
    // confirmation for one transaction, which is its own kind of wrong.
    const op = jest.fn(() => Promise.resolve({ success: true }));
    await dedupe("k", op);

    let error: any;
    await dedupe("k", op).catch((e) => (error = e));
    expect(error).toBeInstanceOf(Error);
    expect(String(error.message)).toMatch(/check your activity/i);
  });
});

describe("failures must not poison the latch", () => {
  it("allows a retry after the attempt failed", async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error("network died"))
      .mockResolvedValueOnce({ success: true });

    await expect(dedupe("k", op)).rejects.toThrow("network died");

    // A failed bid never moved funds, so the user must be able to try again
    // immediately — the duplicate window applies only to successes.
    await expect(dedupe("k", op)).resolves.toEqual({ success: true });
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight entry even when the operation throws", async () => {
    const op = jest.fn(() => Promise.reject(new Error("boom")));
    await expect(dedupe("k", op)).rejects.toThrow("boom");

    const second = jest.fn(() => Promise.resolve("ok"));
    await expect(dedupe("k", second)).resolves.toBe("ok");
  });
});
