// @ts-nocheck — Test file with Jest mocks
//
// A signed transaction must never be re-sent after an ambiguous failure.
//
// account.functionCall()/sendMoney() build and sign a NEW transaction with a
// fresh nonce on every invocation, so they are not idempotent. A timeout, 429,
// dropped socket or CORS-masked response means the *reply* was lost — it is
// never evidence that the transaction failed to execute. Retrying one of those
// submits a second real transaction.
//
// That is what charged users more than once per bid: ft_transfer_call ran
// on-chain, the response didn't come back, withRetry re-signed and sent it
// again, and the caller surfaced the last attempt's error — so funds moved
// repeatedly while the UI reported failure. Every state-changing call had the
// same exposure, including withdrawals in nearWallet.
jest.mock("@react-native-async-storage/async-storage", () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiRemove: jest.fn(() => Promise.resolve()),
}));

import { NearContractService, AMBIGUOUS_WRITE_ERROR } from "@/services/nearContract";
import { resetRpcHealth } from "@/services/rpcHealth";

const NETWORK_ERRORS = [
    "Failed to fetch",
    "429 Too Many Requests",
    "request timed out",
    "socket hang up",
    "blocked by CORS policy",
    "503 Service Unavailable",
];

/** Reach the private withRetry directly — the policy is what's under test. */
function callWithRetry(service, operation, kind) {
    return service.withRetry(operation, "test_op", kind);
}

describe("signed writes are never re-sent", () => {
    let service;

    beforeEach(() => {
        resetRpcHealth();
        service = new NearContractService();
        // Pre-set a provider so withRetry's endpoint rotation has something to
        // swap out without probing the network.
        service.provider = {};
        jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each(NETWORK_ERRORS)(
        "submits a write exactly once when the response is lost (%s)",
        async (message) => {
            const operation = jest.fn().mockRejectedValue(new Error(message));

            await expect(
                callWithRetry(service, operation, "write")
            ).rejects.toThrow(AMBIGUOUS_WRITE_ERROR);

            expect(operation).toHaveBeenCalledTimes(1);
        }
    );

    it("tells the user to check before retrying, rather than reporting failure", async () => {
        const operation = jest.fn().mockRejectedValue(new Error("Failed to fetch"));

        await expect(
            callWithRetry(service, operation, "write")
        ).rejects.toThrow(/check your transaction history/i);
    });

    it("still retries reads, which are idempotent", async () => {
        const operation = jest
            .fn()
            .mockRejectedValueOnce(new Error("Failed to fetch"))
            .mockResolvedValue("ok");

        await expect(callWithRetry(service, operation, "read")).resolves.toBe("ok");
        expect(operation.mock.calls.length).toBeGreaterThan(1);
    });

    it("defaults to the read policy when no kind is given", async () => {
        const operation = jest
            .fn()
            .mockRejectedValueOnce(new Error("Failed to fetch"))
            .mockResolvedValue("ok");

        await expect(service.withRetry(operation, "test_op")).resolves.toBe("ok");
        expect(operation.mock.calls.length).toBeGreaterThan(1);
    });

    it("surfaces a contract rejection as-is, without the ambiguity warning", async () => {
        // The contract answered — the transaction definitively did not take
        // effect, so telling the user it might have would be wrong.
        const operation = jest
            .fn()
            .mockRejectedValue(new Error("Smart contract panicked: bid too low"));

        await expect(callWithRetry(service, operation, "write")).rejects.toThrow(
            /bid too low/
        );
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("lets a write that succeeds through untouched", async () => {
        const operation = jest.fn().mockResolvedValue({ transaction: { hash: "abc" } });

        await expect(callWithRetry(service, operation, "write")).resolves.toEqual({
            transaction: { hash: "abc" },
        });
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
