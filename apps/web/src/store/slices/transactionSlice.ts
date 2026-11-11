import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TransactionPhase } from "@/types/transaction";

interface TransactionLocalState {
    phase: TransactionPhase;
    acceptTxHash?: string;
    escrowReleaseTxHash?: string;
    completeTxHash?: string;
    disputeTxHash?: string;
}

interface TransactionState {
    /** Map of "bidId_propertyId" → local state */
    localState: Record<string, TransactionLocalState>;
}

const initialState: TransactionState = {
    localState: {},
};

const transactionSlice = createSlice({
    name: "transactions",
    initialState,
    reducers: {
        updatePhase(
            state,
            action: PayloadAction<{
                key: string;
                phase: TransactionPhase;
                meta?: Partial<Omit<TransactionLocalState, "phase">>;
            }>
        ) {
            const { key, phase, meta } = action.payload;
            state.localState[key] = {
                ...state.localState[key],
                phase,
                ...meta,
            };
        },
        removeTransaction(state, action: PayloadAction<string>) {
            delete state.localState[action.payload];
        },
        clearTransactions(state) {
            state.localState = {};
        },
    },
});

export const { updatePhase, removeTransaction, clearTransactions } =
    transactionSlice.actions;
export default transactionSlice.reducer;
