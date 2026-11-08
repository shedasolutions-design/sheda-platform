import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Image } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/useShedaApi";

export default function InitialRouter() {
  const { isAuthenticated, isInitializing } = useAuth();
  const hasRouted = useRef(false);

  useEffect(() => {
    // Only run ONCE on initial app load — never re-redirect after that
    if (!isInitializing && !hasRouted.current) {
      hasRouted.current = true;

      if (isAuthenticated) {
        router.replace("/(tabs)/home");
      }
      // If not authenticated, stay on onboarding (index)
    }
  }, [isAuthenticated, isInitializing]);

  if (isInitializing) {
    // Mirrors the native splash screen (same logo/background) so there's no
    // jarring flash to a blank white screen while the auto-login check runs.
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', justifyContent: "center", alignItems: "center", zIndex: 1000 }]}>
        <Image
          source={require("@/assets/images/sheda-splash.png")}
          style={{ width: 200, height: 200, marginBottom: 24 }}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color="#C1272D" />
      </View>
    );
  }

  return null;
}
