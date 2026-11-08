// @ts-nocheck — Test file with Jest mocks
//
// The wallet's Assets tab primes itself from this cache so it has something on
// screen the moment the wallet mounts, the way Tokens and Transactions already
// do. Two things have to hold for that to be safe:
//
//  1. It must be scoped strictly per account+network. A cached property
//     portfolio leaking across accounts is the same class of bug as the
//     wallet-key leak in wallet-account-scoping.test.tsx.
//  2. It must never throw. It's display priming — a missing, corrupt or
//     unwritable entry costs a slower load, and nothing more.
const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
    getItem: jest.fn((k: string) => Promise.resolve(mockStore.get(k) ?? null)),
    setItem: jest.fn((k: string, v: string) => {
        mockStore.set(k, v);
        return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
        mockStore.delete(k);
        return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve([...mockStore.keys()])),
    multiRemove: jest.fn((keys: string[]) => {
        keys.forEach((k) => mockStore.delete(k));
        return Promise.resolve();
    }),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    readCachedAssets,
    writeCachedAssets,
    clearCachedAssets,
} from "@/services/assetCache";

const ALICE = "alice.sheda.testnet";
const BOB = "bob.sheda.testnet";
const asset = (id: string) => ({ id, name: id, status: "Ongoing", image: null });

beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
});

describe("assetCache", () => {
    it("round-trips a list for one account", async () => {
        await writeCachedAssets(ALICE, "testnet", [asset("prop-1")]);
        const cached = await readCachedAssets(ALICE, "testnet");
        expect(cached.map((a) => a.id)).toEqual(["prop-1"]);
    });

    it("never serves one account's properties to another", async () => {
        await writeCachedAssets(ALICE, "testnet", [asset("prop-1")]);
        expect(await readCachedAssets(BOB, "testnet")).toBeNull();
    });

    it("keeps testnet and mainnet portfolios apart", async () => {
        await writeCachedAssets(ALICE, "testnet", [asset("prop-1")]);
        expect(await readCachedAssets(ALICE, "mainnet")).toBeNull();
    });

    it("returns null rather than throwing on a corrupt entry", async () => {
        mockStore.set("@sheda_assets_testnet_" + ALICE, "{not json");
        expect(await readCachedAssets(ALICE, "testnet")).toBeNull();
    });

    it("returns null when storage itself fails", async () => {
        AsyncStorage.getItem.mockRejectedValueOnce(new Error("storage unavailable"));
        expect(await readCachedAssets(ALICE, "testnet")).toBeNull();
    });

    it("swallows a failed write — priming is never worth an error", async () => {
        AsyncStorage.setItem.mockRejectedValueOnce(new Error("quota exceeded"));
        await expect(
            writeCachedAssets(ALICE, "testnet", [asset("prop-1")])
        ).resolves.toBeUndefined();
    });

    it("clears one account without touching another", async () => {
        await writeCachedAssets(ALICE, "testnet", [asset("prop-1")]);
        await writeCachedAssets(BOB, "testnet", [asset("prop-2")]);

        await clearCachedAssets(ALICE, "testnet");

        expect(await readCachedAssets(ALICE, "testnet")).toBeNull();
        expect(await readCachedAssets(BOB, "testnet")).not.toBeNull();
    });

    it("clears every account when given no account", async () => {
        await writeCachedAssets(ALICE, "testnet", [asset("prop-1")]);
        await writeCachedAssets(BOB, "mainnet", [asset("prop-2")]);

        await clearCachedAssets();

        expect(await readCachedAssets(ALICE, "testnet")).toBeNull();
        expect(await readCachedAssets(BOB, "mainnet")).toBeNull();
    });

    it("ignores an empty account id instead of writing a shared key", async () => {
        // A global fallback key is exactly how the wallet-key leak happened.
        await writeCachedAssets("", "testnet", [asset("prop-1")]);
        expect(mockStore.size).toBe(0);
        expect(await readCachedAssets("", "testnet")).toBeNull();
    });
});
