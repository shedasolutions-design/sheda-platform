"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import GoogleButton, { Divider } from "@/components/auth/GoogleButton";
import { useAuth } from "@/hooks/useShedaApi";
import { useApi } from "@/contexts/ApiContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { useWallet } from "@/contexts/WalletContext";
import { safeNextPath } from "@/lib/navigation";

const loginSchema = z.object({
  identifier: z.string().min(3, { message: "Please enter a valid email, phone, or username." }),
  password: z.string().min(5, { message: "Password must be at least 5 characters." }),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface ModalState {
  isVisible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, clearError, isAuthenticated } = useAuth();
  const { socialLogin } = useApi();
  const { signInWithGoogle } = useGoogleAuth();
  const { hasLocalWallet } = useWallet();
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const isSubmitting = useRef(false);
  const [modal, setModal] = useState<ModalState>({ isVisible: false, type: "info", title: "" });

  const showModal = useCallback((type: FeedbackType, title: string, message?: string) => {
    setModal({ isVisible: true, type, title, message });
  }, []);
  const hideModal = useCallback(() => setModal((m) => ({ ...m, isVisible: false })), []);

  const {
    register,
    handleSubmit,
    setError: setFormError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  useEffect(() => {
    clearError();
    setHasAttemptedLogin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Successful sign-in: a user without a wallet on this browser sets one up first.
  useEffect(() => {
    if (isAuthenticated && hasAttemptedLogin) {
      isSubmitting.current = false;
      showModal("success", "Welcome Back!", "Login successful. Redirecting…");
      const timer = setTimeout(() => {
        hideModal();
        router.replace(hasLocalWallet ? safeNextPath("/home") : "/wallet-setup");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAttemptedLogin, hasLocalWallet, router, showModal, hideModal]);

  // Map backend errors onto the field they are about, or a dialog if neither.
  useEffect(() => {
    if (!error || !hasAttemptedLogin) return;
    isSubmitting.current = false;
    const e = error.toLowerCase();
    if (e.includes("password") || e.includes("incorrect") || e.includes("wrong")) {
      setFormError("password", { type: "manual", message: error });
    } else if (e.includes("not found") || e.includes("no account") || e.includes("user")) {
      setFormError("identifier", { type: "manual", message: error });
    } else if (
      e.includes("network") ||
      e.includes("connect") ||
      e.includes("timeout") ||
      e.includes("server")
    ) {
      showModal("error", "Connection Error", error);
    } else {
      showModal("error", "Login Failed", error);
    }
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const onSubmit = useCallback(
    (data: LoginFormData) => {
      if (isSubmitting.current) return; // no double submit
      isSubmitting.current = true;
      clearErrors();
      setHasAttemptedLogin(true);
      login(data.identifier, data.password);
    },
    [login, clearErrors]
  );

  const handleGoogleSignIn = useCallback(async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    clearErrors();
    try {
      const idToken = await signInWithGoogle();
      setHasAttemptedLogin(true);
      await socialLogin({ token: idToken, provider: "google" });
    } catch (err: any) {
      showModal("error", "Google Sign-In Failed", err?.message || "Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isGoogleLoading, signInWithGoogle, socialLogin, clearErrors, showModal]);

  const showLoading = isLoading && hasAttemptedLogin && isSubmitting.current;
  const isConnectionError =
    modal.type === "error" && /connect|network/i.test(modal.message ?? "");

  return (
    <>
      <FeedbackModal
        isVisible={modal.isVisible || showLoading}
        type={showLoading ? "loading" : modal.type}
        title={showLoading ? "Signing In" : modal.title}
        message={showLoading ? "Verifying your credentials…" : modal.message}
        onClose={!showLoading ? hideModal : undefined}
        showRetry={isConnectionError}
        retryAction={() => {
          hideModal();
          handleSubmit(onSubmit)();
        }}
      />

      <h1 className="text-2xl font-bold lg:text-4xl">Log in</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-4" noValidate>
        <TextField
          label="Email, Phone or Username"
          placeholder="Email, Phone or Username"
          autoComplete="username"
          autoCapitalize="none"
          error={errors.identifier?.message}
          {...register("identifier", { onChange: () => clearErrors("identifier") })}
        />
        <div>
          <TextField
            label="Password"
            placeholder="********"
            isPassword
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password", { onChange: () => clearErrors("password") })}
          />
          <div className="mt-2 text-right">
            <Link href="/forget-pass" className="text-sm hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        {errors.root && <p className="text-center text-sm text-red-500">{errors.root.message}</p>}

        <Button type="submit" full disabled={showLoading}>
          {showLoading ? "Signing in…" : "Log in"}
        </Button>
      </form>

      <Divider text="Or login with" />
      <GoogleButton onPress={handleGoogleSignIn} loading={isGoogleLoading} />

      <p className="mt-6 text-center">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-bold hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
