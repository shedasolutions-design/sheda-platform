import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UserProfile {
    id: number;
    username: string;
    email: string;
    fullname?: string;
    phone_number?: string;
    avatar_url?: string;
    account_type?: "client" | "agent";
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const initialState: AuthState = {
    token: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setCredentials(
            state,
            action: PayloadAction<{
                token: string;
                refreshToken?: string;
                user: UserProfile;
            }>
        ) {
            state.token = action.payload.token;
            state.refreshToken = action.payload.refreshToken ?? null;
            state.user = action.payload.user;
            state.isAuthenticated = true;
            state.isLoading = false;
        },
        setUser(state, action: PayloadAction<UserProfile>) {
            state.user = action.payload;
        },
        setLoading(state, action: PayloadAction<boolean>) {
            state.isLoading = action.payload;
        },
        clearCredentials(state) {
            state.token = null;
            state.refreshToken = null;
            state.user = null;
            state.isAuthenticated = false;
            state.isLoading = false;
        },
    },
});

export const { setCredentials, setUser, setLoading, clearCredentials } =
    authSlice.actions;
export default authSlice.reducer;
