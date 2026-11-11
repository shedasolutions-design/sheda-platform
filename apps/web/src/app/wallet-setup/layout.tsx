import AuthGuard from "@/components/auth/AuthGuard";

// Content waits for the browser to restore the session (it lives in local
// storage), so there is nothing for instant-navigation validation to check.
export const instant = false;

export default function WalletSetupLayout({ children }: LayoutProps<"/wallet-setup">) {
  return (
    <AuthGuard requireAuth>
      <div className="mx-auto min-h-screen w-full max-w-xl px-5 pb-12 pt-6 md:pt-12">{children}</div>
    </AuthGuard>
  );
}
