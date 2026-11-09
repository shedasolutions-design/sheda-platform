import { useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS, TYPE } from "@/constants/theme";
import { RoleContext, previewBuilder, type Role } from "@/services/role";
import "../global.css";

// Held open until Inter is in memory, so the first frame is not the system
// font being swapped out underneath the reader.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The four weights components/Text.tsx exposes, under the same family
  // names the rental app registers. A screen moved between the two apps
  // keeps its typography; a name that does not resolve falls back to the
  // platform serif, which is how this was missed until it reached a browser.
  const [fontsLoaded, fontError] = useFonts({
    "Inter-Regular": require("../assets/fonts/Inter_24pt-Regular.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter_24pt-Medium.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter_24pt-SemiBold.ttf"),
    "Inter-Bold": require("../assets/fonts/Inter_24pt-Bold.ttf"),
  });

  const [role, setRole] = useState<Role>("buyer");
  const roleState = useMemo(
    () => ({ role, setRole, actingAs: role === "builder" ? previewBuilder() : null }),
    [role]
  );

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // On a font failure the app still renders. Wrong type is a blemish; a
  // blank screen is a product that does not open.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <RoleContext.Provider value={roleState}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.background },
            headerTintColor: COLORS.primaryText,
            headerTitleStyle: { fontFamily: "Inter-SemiBold", fontSize: TYPE.heading.fontSize },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: COLORS.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="project/[id]/index" options={{ title: "Project" }} />
          <Stack.Screen name="project/[id]/units" options={{ title: "Choose a unit" }} />
          <Stack.Screen name="person/[id]" options={{ title: "Profile" }} />
        </Stack>
      </RoleContext.Provider>
    </SafeAreaProvider>
  );
}
