import AuthGuard from "@/components/auth/AuthGuard";
import AppShell from "@/components/AppShell";

// Content waits for the browser to restore the session (it lives in local
// storage), so there is nothing for instant-navigation validation to check.
export const instant = false;

// Browsing is open to everyone, as on mobile; individual actions ask for a
// session when they need one.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard requireAuth="optional">
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
