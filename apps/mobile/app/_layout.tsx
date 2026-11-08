"use client";

// Random values polyfill for crypto libraries - MUST BE FIRST
import "react-native-get-random-values";
import * as ExpoCrypto from "expo-crypto";

// Buffer polyfill for React Native compatibility with crypto libraries
import { Buffer } from "buffer";
global.Buffer = Buffer;

// Additional Node.js polyfills for crypto libraries
global.global = global;
global.process = global.process || { env: {} };

// Ensure crypto and getRandomValues are available on both global and globalThis
// @noble/hashes checks globalThis.crypto, not global.crypto
if (typeof globalThis.crypto === "undefined") {
  (globalThis as any).crypto = {} as any;
}
if (typeof globalThis.crypto.getRandomValues !== "function") {
  (globalThis as any).crypto.getRandomValues = ExpoCrypto.getRandomValues;
}
// Sync global.crypto with globalThis.crypto
if (typeof global.crypto === "undefined") {
  global.crypto = (globalThis as any).crypto;
}

// Suppress MetaMask browser extension errors on web
// MetaMask injects inpage.js into every page and throws when it can't connect
// to its own background service. This is not our code — safe to silence.
import { Platform } from "react-native";
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(event?.reason?.message || event?.reason || "");
    if (
      msg.includes("MetaMask") ||
      msg.includes("inpage.js") ||
      msg.includes("Failed to connect to MetaMask")
    ) {
      event.preventDefault(); // suppress the console error
    }
  });
}

import "./../global.css";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
import { SplashScreen } from "expo-router";
import { ConnectedModeProvider } from "@/contexts/ConnectedModeProvider";
import { WalletProvider } from "@/contexts/WalletContext";
import { ApiProvider } from "@/contexts/ApiContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastProvider } from "@/contexts/ToastContext";
import Toast from "@/components/common/Toast";
import InitialRouter from "@/components/InitialRouter";
import ProfileGate from "@/components/auth/ProfileGate";
import ErrorBoundary from "@/components/ErrorBoundary";
import BlockchainListenerBridge from "@/components/BlockchainListenerBridge";
import { Provider as ReduxProvider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/store";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { API_BASE_URL } from "@/services/api";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, error] = useFonts({
    "Inter-Black": require("../assets/fonts/Inter_24pt-Black.ttf"),
    "Inter-Bold": require("../assets/fonts/Inter_24pt-Bold.ttf"),
    "Inter-ExtraBold": require("../assets/fonts/Inter_24pt-ExtraBold.ttf"),
    "Inter-ExtraLight": require("../assets/fonts/Inter_24pt-ExtraLight.ttf"),
    "Inter-Light": require("../assets/fonts/Inter_24pt-Light.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter_24pt-Medium.ttf"),
    "Inter-Regular": require("../assets/fonts/Inter_24pt-Regular.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter_24pt-SemiBold.ttf"),
    "Inter-Thin": require("../assets/fonts/Inter_24pt-Thin.ttf"),
    "Manrope-Medium": require("../assets/fonts/Manrope-Medium.ttf"),
    "Sora-Bold": require("../assets/fonts/Sora-Bold.ttf"),
    "Sora-Medium": require("../assets/fonts/Sora-Medium.ttf"),
    "SpaceMono-Regular": require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      // Warm up Render backend (eliminates cold start on first real API call)
      fetch(`${API_BASE_URL}/api/v1/health`).catch(() => { });
    }
  }, [fontsLoaded, error]);

  if (!fontsLoaded && !error) {
    return null;
  }

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
                      <InitialRouter />
                      <ProfileGate />
                      <Stack>
                        <Stack.Screen name="index" options={{ headerShown: false }} />
                        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        {/* Collections brings its own stack and its own
                            headers. Without this the root stack adds a
                            second one above them, titled after the folder. */}
                        <Stack.Screen name="collections" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="appointment-booked/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="appointment-successful/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="book-appointment/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="change-password/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen name="chat/index" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="delete-account/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="details/[id]"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="filter/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="notification-setting/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="personal-info/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="profile/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="profile-setting/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="availability/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="user-profile/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="support/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="support-feedback/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="wallet-recovery/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen name="wallet-setup" options={{ headerShown: false }} />
                        {/* New routes for seller document release flow */}
                        <Stack.Screen
                          name="release-document/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="notifications/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="see-all/index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="google-auth"
                          options={{ headerShown: false }}
                        />
                      </Stack>
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
