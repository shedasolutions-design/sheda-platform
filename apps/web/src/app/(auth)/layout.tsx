import AuthGuard from "@/components/auth/AuthGuard";

// Signed-out screens. A signed-in visitor is sent home.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard requireAuth={false}>
      <div className="mx-auto min-h-screen w-full max-w-xl px-5 pb-12 pt-10 md:pt-20">
        {children}
      </div>
    </AuthGuard>
  );
}
