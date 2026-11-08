import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Image } from "react-native";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/hooks/useShedaApi";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean | "optional";
  redirectTo?: "/(auth)/login" | "/(auth)/signup" | "/";
}

export default function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = "/(auth)/login",
}: AuthGuardProps) {
  const { isAuthenticated, isInitializing } = useAuth();
  const currentPath = usePathname();

  console.log("🔍 AuthGuard Debug:", {
    isAuthenticated,
    isInitializing,
    requireAuth,
    redirectTo,
  });

  useEffect(() => {
    if (!isInitializing) {
      // Check if current path is wallet-setup related
      const isWalletSetupPage =
        currentPath.includes("wallet-setup") ||
        currentPath.includes("wallet-recovery");

      if (requireAuth === true && !isAuthenticated) {
        // User needs to be authenticated but isn't
        console.log(
          "🔓 AuthGuard: User not authenticated, redirecting to:",
          redirectTo
        );
        router.replace(redirectTo);
      } else if (requireAuth === false && isAuthenticated && !isWalletSetupPage) {
        // User is authenticated but shouldn't be on this page (e.g., login page)
        // Exception: allow access to wallet-setup pages even when authenticated
        console.log("🔐 AuthGuard: User is authenticated, redirecting to home");
        router.replace("/(tabs)/home");
      }
      // If requireAuth === 'optional', we do nothing and just render
    }
  }, [isAuthenticated, isInitializing, requireAuth, redirectTo, currentPath]);

  // Show loading indicator while checking authentication status
  if (isInitializing) {
    console.log("⏳ AuthGuard: Still initializing, showing loading...");
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "white",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          },
        ]}
      >
        <Image
          source={require("@/assets/images/sheda-splash.png")}
          style={{ width: 200, height: 200, marginBottom: 24 }}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color="#C1272D" />
      </View>
    );
  }

  // Check if authentication requirements are met
  const shouldRender =
    requireAuth === "optional" ||
    (requireAuth === true && isAuthenticated) ||
    (requireAuth === false && !isAuthenticated);

  console.log("🎯 AuthGuard render decision:", {
    shouldRender,
    requireAuth,
    isAuthenticated,
  });

  if (shouldRender) {
    console.log("✅ AuthGuard: Rendering children");
    return <>{children}</>;
  } else {
    console.log("❌ AuthGuard: Not rendering children (redirect will happen)");
    return null;
  }
}
