import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Auth pages - don't require authentication */}
      <Stack.Screen name="login/index" options={{ headerShown: false }} />
      <Stack.Screen name="signup/index" options={{ headerShown: false }} />
      <Stack.Screen name="forget-pass/index" options={{ headerShown: false }} />
      <Stack.Screen name="otp/index" options={{ headerShown: false }} />
      <Stack.Screen name="pass-changed/index" options={{ headerShown: false }} />
      <Stack.Screen name="reset-pass/index" options={{ headerShown: false }} />
    </Stack>
  );
}
