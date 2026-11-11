import AuthGuard from "@/components/auth/AuthGuard";

// Sign-in screens. Deliberately not "signed-out only": login and signup
// decide where a fresh session goes next (wallet setup or home), and a guard
// here would redirect first and skip that decision. Each screen handles a
// visitor who arrives already signed in.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard requireAuth="optional">
      <div className="mx-auto min-h-screen w-full max-w-xl px-5 pb-12 pt-10 md:pt-20">
        {children}
      </div>
    </AuthGuard>
  );
}
