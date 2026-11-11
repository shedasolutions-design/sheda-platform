import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface WalletState {
    isConnected: boolean;
    accountId: string | null;
    balance: string | null;
    network: "testnet" | "mainnet";
}

const initialState: WalletState = {
    isConnected: false,
    accountId: null,
    balance: null,
    network: "testnet",
};

const walletSlice = createSlice({
    name: "wallet",
    initialState,
    reducers: {
        setWallet(
            state,
            action: PayloadAction<{
                accountId: string;
                balance?: string;
                network?: "testnet" | "mainnet";
            }>
        ) {
            state.isConnected = true;
            state.accountId = action.payload.accountId;
            state.balance = action.payload.balance ?? null;
            state.network = action.payload.network ?? "testnet";
        },
        updateBalance(state, action: PayloadAction<string>) {
            state.balance = action.payload;
        },
        setNetwork(state, action: PayloadAction<"testnet" | "mainnet">) {
            state.network = action.payload;
        },
        clearWallet(state) {
            state.isConnected = false;
            state.accountId = null;
            state.balance = null;
        },
    },
});

export const { setWallet, updateBalance, setNetwork, clearWallet } =
    walletSlice.actions;
export default walletSlice.reducer;
