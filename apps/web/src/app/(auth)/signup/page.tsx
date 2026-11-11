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
import nearWalletService from "@/services/nearWallet";

const signupSchema = z
  .object({
    email: z.string().email({ message: "Please enter a valid email address." }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." })
      .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
      .regex(/[0-9]/, { message: "Password must contain at least one number." }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

interface ModalState {
  isVisible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const { signup, isLoading, error, clearError, isAuthenticated } = useAuth();
  const { socialLogin } = useApi();
  const { signInWithGoogle } = useGoogleAuth();
  const [hasAttemptedSignup, setHasAttemptedSignup] = useState(false);
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
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  // Already signed in when the page opened: nothing to do here.
  useEffect(() => {
    if (isAuthenticated && !hasAttemptedSignup && !isSubmitting.current) router.replace("/home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    clearError();
    setHasAttemptedSignup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new account goes straight to automatic wallet provisioning. The
  // provision page owns the creation work and sends the user on to Home.
  useEffect(() => {
    if (isAuthenticated && hasAttemptedSignup) {
      isSubmitting.current = false;
      showModal("success", "Account Created!", "Setting up your wallet…");
      const timer = setTimeout(() => {
        hideModal();
        router.replace("/wallet-setup/provision");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAttemptedSignup, router, showModal, hideModal]);

  useEffect(() => {
    if (!error || !hasAttemptedSignup) return;
    isSubmitting.current = false;
    const e = error.toLowerCase();
    if (/already|exists|registered|duplicate/.test(e)) {
      setFormError("email", {
        type: "manual",
        message: "This email is already registered. Try signing in instead.",
      });
    } else if (e.includes("email") || e.includes("invalid")) {
      setFormError("email", { type: "manual", message: error });
    } else if (e.includes("password")) {
      setFormError("password", { type: "manual", message: error });
    } else if (/network|connect|timeout|server/.test(e)) {
      showModal("error", "Connection Error", error);
    } else {
      showModal("error", "Signup Failed", error);
    }
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const onSubmit = useCallback(
    (data: SignupFormData) => {
      if (isSubmitting.current) return;
      // The backend wants the wallet id the user will get, derived from the email.
      const nearAccountId = nearWalletService.getPreviewAccountId(data.email);
      if (!nearAccountId) {
        setFormError("email", {
          type: "manual",
          message: "Couldn't derive a wallet id from this email. Try a different one.",
        });
        return;
      }
      isSubmitting.current = true;
      clearErrors();
      setHasAttemptedSignup(true);
      signup({
        email: data.email,
        password: data.password,
        username: data.email,
        near_account_id: nearAccountId,
      });
    },
    [signup, clearErrors, setFormError]
  );

  const handleGoogleSignIn = useCallback(async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    clearErrors();
    try {
      const idToken = await signInWithGoogle();
      setHasAttemptedSignup(true);
      await socialLogin({ token: idToken, provider: "google" });
    } catch (err: any) {
      showModal("error", "Google Sign-In Failed", err?.message || "Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isGoogleLoading, signInWithGoogle, socialLogin, clearErrors, showModal]);

  const showLoading = isLoading && hasAttemptedSignup && isSubmitting.current;
  const isConnectionError =
    modal.type === "error" && /connect|network/i.test(modal.message ?? "");

  return (
    <>
      <FeedbackModal
        isVisible={modal.isVisible || showLoading}
        type={showLoading ? "loading" : modal.type}
        title={showLoading ? "Creating Account" : modal.title}
        message={showLoading ? "Setting up your account…" : modal.message}
        onClose={!showLoading ? hideModal : undefined}
        showRetry={isConnectionError}
        retryAction={() => {
          hideModal();
          handleSubmit(onSubmit)();
        }}
      />

      <h1 className="text-2xl font-bold lg:text-4xl">Sign up</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          placeholder="example@email.com"
          autoComplete="email"
          autoCapitalize="none"
          error={errors.email?.message}
          {...register("email", { onChange: () => clearErrors("email") })}
        />
        <TextField
          label="Create a password"
          placeholder="at least 8 characters"
          isPassword
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password", { onChange: () => clearErrors("password") })}
        />
        <TextField
          label="Confirm Password"
          placeholder="repeat password"
          isPassword
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword", { onChange: () => clearErrors("confirmPassword") })}
        />

        <Button type="submit" full disabled={showLoading} className="mt-2">
          {showLoading ? "Creating account…" : "Sign up"}
        </Button>
      </form>

      <Divider text="Or register with" />
      <GoogleButton onPress={handleGoogleSignIn} loading={isGoogleLoading} />

      <p className="mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="font-bold hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
