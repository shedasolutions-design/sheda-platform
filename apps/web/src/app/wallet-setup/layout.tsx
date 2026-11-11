import AuthGuard from "@/components/auth/AuthGuard";

export default function WalletSetupLayout({ children }: LayoutProps<"/wallet-setup">) {
  return (
    <AuthGuard requireAuth>
      <div className="mx-auto min-h-screen w-full max-w-xl px-5 pb-12 pt-6 md:pt-12">{children}</div>
    </AuthGuard>
  );
}
