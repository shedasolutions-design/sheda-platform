import { configureStore, combineReducers } from "@reduxjs/toolkit";
import {
    persistStore,
    persistReducer,
    FLUSH,
    REHYDRATE,
    PAUSE,
    PERSIST,
    PURGE,
    REGISTER,
} from "redux-persist";
import AsyncStorage from "@/lib/storage";
import authReducer from "./slices/authSlice";
import walletReducer from "./slices/walletSlice";
import transactionReducer from "./slices/transactionSlice";
import propertiesReducer from "./slices/propertiesSlice";
import notificationsReducer from "./slices/notificationsSlice";

const persistConfig = {
    key: "sheda-root",
    storage: AsyncStorage,
    whitelist: ["auth", "wallet", "notifications"], // only persist these slices
};

const rootReducer = combineReducers({
    auth: authReducer,
    wallet: walletReducer,
    transactions: transactionReducer,
    properties: propertiesReducer,
    notifications: notificationsReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // redux-persist dispatches non-serializable actions
                ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
            },
        }),
});

export const persistor = persistStore(store);

// Infer types from the store itself
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
