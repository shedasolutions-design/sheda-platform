"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useShedaApi";
import { Splash } from "@/components/ui/Spinner";

/**
 * Gates a subtree on the session.
 *
 *   requireAuth = true        signed-in users only; others go to `redirectTo`
 *   requireAuth = false       signed-out users only (login, signup); others go home
 *   requireAuth = "optional"  everyone, once the session has been restored
 *
 * The session lives in the browser (the token is in local storage), so the
 * server cannot know it at render time. Until the client has restored it this
 * shows the splash, the same as the mobile app's launch screen.
 */
export default function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = "/login",
}: {
  children: ReactNode;
  requireAuth?: boolean | "optional";
  redirectTo?: string;
}) {
  const { isAuthenticated, isInitializing } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isInitializing) return;
    const inWalletFlow =
      pathname.includes("wallet-setup") || pathname.includes("wallet-recovery");

    if (requireAuth === true && !isAuthenticated) {
      const next = encodeURIComponent(pathname);
      router.replace(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}next=${next}`);
    } else if (requireAuth === false && isAuthenticated && !inWalletFlow) {
      router.replace("/home");
    }
  }, [isAuthenticated, isInitializing, requireAuth, redirectTo, pathname, router]);

  if (isInitializing) return <Splash />;

  const shouldRender =
    requireAuth === "optional" ||
    (requireAuth === true && isAuthenticated) ||
    (requireAuth === false && !isAuthenticated);

  return shouldRender ? <>{children}</> : <Splash />;
}
