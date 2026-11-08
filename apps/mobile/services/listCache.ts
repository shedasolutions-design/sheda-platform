/**
 * Display priming for list screens (Inbox conversations, Activity/History
 * transactions), persisted per account.
 *
 * Both screens previously rebuilt from scratch on every visit: Inbox waited on
 * a conversations round-trip, and Activity/History waited on a full on-chain
 * bid read plus the backend feed. So navigating away and back always dropped
 * the user on a spinner, even though the data they'd just been looking at was
 * still perfectly good to show while the refresh ran behind it.
 *
 * This is priming, not a source of truth — exactly the trade services/assetCache.ts
 * already makes for the wallet Assets tab. The live fetch starts in the same
 * breath as the hydrate and overwrites whatever came from here.
 *
 * Scoped by account with no device-global fallback key: a stale entry must
 * never be able to show one account's conversations or deals to another.
 * See __tests__/wallet-account-scoping.test.tsx for the leak that convention
 * exists to prevent.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@sheda_list_";

/** How long a primed list is still worth showing before it's just noise. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedList<T> {
    items: T[];
    savedAt: number;
}

function cacheKey(scope: string, ownerId: string | number): string {
    return `${PREFIX}${scope}_${ownerId}`;
}

/**
 * Read the last-known list for this account, or null when there isn't one,
 * it can't be parsed, or it's older than MAX_AGE_MS. A bad or stale cache
 * entry is never worth an error — the caller just shows its loading state.
 */
export async function readCachedList<T>(
    scope: string,
    ownerId: string | number | null | undefined
): Promise<T[] | null> {
    if (ownerId === null || ownerId === undefined || ownerId === "") return null;
    try {
        const raw = await AsyncStorage.getItem(cacheKey(scope, ownerId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedList<T>;
        if (!Array.isArray(parsed?.items)) return null;
        if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > MAX_AGE_MS) {
            return null;
        }
        return parsed.items;
    } catch (error) {
        console.warn(`listCache: failed to read "${scope}":`, error);
        return null;
    }
}

/** Persist the list currently on screen for this account. */
export async function writeCachedList<T>(
    scope: string,
    ownerId: string | number | null | undefined,
    items: T[]
): Promise<void> {
    if (ownerId === null || ownerId === undefined || ownerId === "") return;
    try {
        const payload: CachedList<T> = { items, savedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey(scope, ownerId), JSON.stringify(payload));
    } catch (error) {
        // Priming only — failing to persist costs a slower next load, nothing more.
        console.warn(`listCache: failed to cache "${scope}":`, error);
    }
}

/** Drop every primed list (used on logout, so nothing survives into the next account). */
export async function clearAllCachedLists(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const listKeys = keys.filter((k) => k.startsWith(PREFIX));
        if (listKeys.length > 0) await AsyncStorage.multiRemove(listKeys);
    } catch (error) {
        console.warn("listCache: failed to clear cached lists:", error);
    }
}

export const LIST_CACHE_SCOPES = {
    conversations: "conversations",
    transactions: "transactions",
} as const;
