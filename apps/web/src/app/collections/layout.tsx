import { Suspense } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import AppShell from "@/components/AppShell";
import CollectionsHeader from "@/components/collections/CollectionsHeader";
import Spinner from "@/components/ui/Spinner";

// Content waits for the browser to restore the session (local storage).
export const instant = false;

/**
 * Collections screens, reached from the Invest tab. Each screen names itself
 * (Stack.Screen) and the header shows it with a back button.
 */
export default function CollectionsLayout({ children }: LayoutProps<"/collections">) {
  return (
    <AuthGuard requireAuth="optional">
      <AppShell>
        <CollectionsHeader />
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner size={32} />
            </div>
          }
        >
          {children}
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}
