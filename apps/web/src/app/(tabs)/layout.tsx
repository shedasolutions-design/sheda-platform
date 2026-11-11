import AuthGuard from "@/components/auth/AuthGuard";
import AppShell from "@/components/AppShell";

// Browsing is open to everyone, as on mobile; individual actions ask for a
// session when they need one.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard requireAuth="optional">
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
