/**
 * Last-known Assets tab contents, persisted per account.
 *
 * The Tokens and Transactions tabs both have something to show the moment the
 * wallet mounts — token balances are a single fast RPC read, and the indexer
 * keeps a transaction cache in AsyncStorage. Assets had neither: rebuilding it
 * costs two contract reads plus a property lookup per open bid, so the tab sat
 * empty (or on "Loading properties...") for as long as that took on every
 * single visit, and showed nothing at all when a read failed.
 *
 * This is display priming, not a source of truth. The live read starts in the
 * same breath as the hydrate and overwrites whatever lands here, so the cache
 * is only ever what the user is looking at for the second or two before real
 * chain data arrives — the same trade the transaction cache already makes.
 *
 * Scoped by account AND network, with no device-global fallback key: a stale
 * entry must never be able to show one account's property portfolio to
 * another. See __tests__/wallet-account-scoping.test.tsx for the leak that
 * convention exists to prevent.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Asset } from "@/types/wallet";

const PREFIX = "@sheda_assets_";

export interface CachedAssets {
    assets: Asset[];
    savedAt: number;
}

function cacheKey(accountId: string, network: string): string {
    return `${PREFIX}${network}_${accountId}`;
}

/**
 * Read the last-known asset list for this account, or null when there isn't
 * one (or it can't be parsed — a bad cache entry is never worth an error).
 */
export async function readCachedAssets(
    accountId: string,
    network: string
): Promise<Asset[] | null> {
    if (!accountId) return null;
    try {
        const raw = await AsyncStorage.getItem(cacheKey(accountId, network));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedAssets;
        return Array.isArray(parsed?.assets) ? parsed.assets : null;
    } catch (error) {
        console.warn("assetCache: failed to read cached assets:", error);
        return null;
    }
}

/** Persist the asset list currently on screen for this account. */
export async function writeCachedAssets(
    accountId: string,
    network: string,
    assets: Asset[]
): Promise<void> {
    if (!accountId) return;
    try {
        const payload: CachedAssets = { assets, savedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey(accountId, network), JSON.stringify(payload));
    } catch (error) {
        // Priming only — failing to persist costs a slower next load, nothing more.
        console.warn("assetCache: failed to cache assets:", error);
    }
}

/** Drop the cached list for one account, or every account when none is given. */
export async function clearCachedAssets(
    accountId?: string,
    network?: string
): Promise<void> {
    try {
        if (accountId && network) {
            await AsyncStorage.removeItem(cacheKey(accountId, network));
            return;
        }
        const keys = await AsyncStorage.getAllKeys();
        const assetKeys = keys.filter((k) => k.startsWith(PREFIX));
        if (assetKeys.length > 0) await AsyncStorage.multiRemove(assetKeys);
    } catch (error) {
        console.warn("assetCache: failed to clear cached assets:", error);
    }
}
