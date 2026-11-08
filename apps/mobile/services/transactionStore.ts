/**
 * Transaction Store
 *
 * Persists transaction phase data in AsyncStorage.
 * The on-chain BidView doesn't have a "status" field, so we track
 * post-acceptance phases (doc release, confirmation, payment) locally.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    TransactionPhase,
    TransactionLocalState,
    makeTransactionKey,
} from "@/types/transaction";

const STORE_PREFIX = "@sheda_tx_";

/**
 * Get the stored local state for a transaction
 */
export async function getTransactionState(
    bidId: number,
    propertyId: number
): Promise<TransactionLocalState | null> {
    try {
        const key = STORE_PREFIX + makeTransactionKey(bidId, propertyId);
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as TransactionLocalState;
    } catch (error) {
        console.error("TransactionStore: Failed to read state:", error);
        return null;
    }
}

/**
 * Save local state for a transaction
 */
export async function setTransactionState(
    bidId: number,
    propertyId: number,
    state: Partial<TransactionLocalState>
): Promise<void> {
    try {
        const key = STORE_PREFIX + makeTransactionKey(bidId, propertyId);
        const existing = await getTransactionState(bidId, propertyId);
        const updated: TransactionLocalState = {
            phase: state.phase ?? existing?.phase ?? TransactionPhase.BID_PENDING,
            updatedAt: Date.now(),
            documentTokenId: state.documentTokenId ?? existing?.documentTokenId,
            documentMediaUri: state.documentMediaUri ?? existing?.documentMediaUri,
            acceptTxHash: state.acceptTxHash ?? existing?.acceptTxHash,
            docReleaseTxHash: state.docReleaseTxHash ?? existing?.docReleaseTxHash,
            escrowReleaseTxHash:
                state.escrowReleaseTxHash ?? existing?.escrowReleaseTxHash,
        };
        await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
        console.error("TransactionStore: Failed to save state:", error);
    }
}

/**
 * Get all stored transaction states (for bulk loading)
 */
export async function getAllTransactionStates(): Promise<
    Record<string, TransactionLocalState>
> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const txKeys = allKeys.filter((k) => k.startsWith(STORE_PREFIX));
        if (txKeys.length === 0) return {};

        const entries = await AsyncStorage.multiGet(txKeys);
        const result: Record<string, TransactionLocalState> = {};
        for (const [key, value] of entries) {
            if (value) {
                const txKey = key.replace(STORE_PREFIX, "");
                result[txKey] = JSON.parse(value);
            }
        }
        return result;
    } catch (error) {
        console.error("TransactionStore: Failed to read all states:", error);
        return {};
    }
}

/**
 * Remove a transaction's local state
 */
export async function removeTransactionState(
    bidId: number,
    propertyId: number
): Promise<void> {
    try {
        const key = STORE_PREFIX + makeTransactionKey(bidId, propertyId);
        await AsyncStorage.removeItem(key);
    } catch (error) {
        console.error("TransactionStore: Failed to remove state:", error);
    }
}
