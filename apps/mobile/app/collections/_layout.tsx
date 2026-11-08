import { Stack } from "expo-router";
import { C } from "@/components/collections/ui";

/**
 * Collections lives on a stack pushed from the Invest tab.
 *
 * Keeping it off the tab bar is deliberate. The marketplace has five tabs
 * and real users; a sixth would cost each of them a fifth of their width
 * for a feature nobody has used yet. Everything here is reached from one
 * entry point instead, and the whole folder can be removed without
 * touching a single marketplace screen.
 */
export default function CollectionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.background },
        headerTintColor: C.text,
        headerTitleStyle: { fontFamily: "Inter-SemiBold", fontSize: 15 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: C.background },
      }}
    />
  );
}
