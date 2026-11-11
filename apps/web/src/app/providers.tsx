"use client";

import "@/lib/polyfills";

import type { ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { store, persistor } from "@/store";
import { queryClient } from "@/lib/queryClient";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ApiProvider } from "@/contexts/ApiContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { WalletProvider } from "@/contexts/WalletContext";
import { ConnectedModeProvider } from "@/contexts/ConnectedModeProvider";
import BlockchainListenerBridge from "@/components/BlockchainListenerBridge";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGate from "@/components/auth/ProfileGate";
import Toast from "@/components/ui/Toast";

/**
 * Everything the app needs on every page, in the same nesting order as the
 * mobile app's root layout. The order matters: WalletProvider reads the API
 * context, and the blockchain bridge needs both wallet and notifications.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <CurrencyProvider>
              <ApiProvider>
                <NotificationProvider>
                  <ToastProvider>
                    <WalletProvider>
                      <BlockchainListenerBridge />
                      <ConnectedModeProvider>
                        <ProfileGate />
                        {children}
                        <Toast />
                      </ConnectedModeProvider>
                    </WalletProvider>
                  </ToastProvider>
                </NotificationProvider>
              </ApiProvider>
            </CurrencyProvider>
          </ErrorBoundary>
        </QueryClientProvider>
      </PersistGate>
    </ReduxProvider>
  );
}
