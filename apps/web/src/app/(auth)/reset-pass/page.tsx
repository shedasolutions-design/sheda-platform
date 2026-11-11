"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FeedbackModal from "@/components/ui/FeedbackModal";
import BackLink from "@/components/ui/BackLink";
import { useAuth } from "@/hooks/useShedaApi";
import { useFeedback } from "@/hooks/useFeedback";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const isSubmitting = useRef(false);
  const { feedback, show, hide, isConnectionError } = useFeedback();

  useEffect(() => {
    if (!error) return;
    isSubmitting.current = false;
    const e = error.toLowerCase();
    if (/network|connect|timeout/.test(e)) {
      show(
        "error",
        "Connection Error",
        "Unable to connect to the server. Please check your connection and try again."
      );
    } else if (e.includes("expired") || e.includes("invalid")) {
      show("error", "Session Expired", "Your reset session has expired. Please request a new code.");
    } else {
      show("error", "Reset Failed", error);
    }
    clearError();
  }, [error, clearError, show]);

  const validate = (): boolean => {
    let ok = true;
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      ok = false;
    } else if (!/[A-Z]/.test(password)) {
      setPasswordError("Password must contain at least one uppercase letter.");
      ok = false;
    } else if (!/[0-9]/.test(password)) {
      setPasswordError("Password must contain at least one number.");
      ok = false;
    } else {
      setPasswordError("");
    }
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      ok = false;
    } else {
      setConfirmError("");
    }
    return ok;
  };

  const handleSubmit = useCallback(async () => {
    if (isSubmitting.current || !validate()) return;
    isSubmitting.current = true;
    try {
      await resetPassword(password);
      show("success", "Password Changed!", "Your password has been reset successfully.");
      setTimeout(() => {
        hide();
        router.push("/pass-changed");
      }, 800);
    } catch (err) {
      console.error("Password reset failed:", err);
    } finally {
      isSubmitting.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, confirmPassword, resetPassword, show, hide, router]);

  const showLoading = isLoading && isSubmitting.current;

  return (
    <>
      <FeedbackModal
        isVisible={feedback.visible || showLoading}
        type={showLoading ? "loading" : feedback.type}
        title={showLoading ? "Resetting Password" : feedback.title}
        message={showLoading ? "Updating your password…" : feedback.message}
        onClose={!showLoading ? hide : undefined}
        showRetry={isConnectionError}
        retryAction={() => {
          hide();
          handleSubmit();
        }}
      />

      <BackLink fallback="/login" />
      <h1 className="mt-6 text-2xl font-bold">Reset password</h1>
      <p className="mt-2 text-secondaryText">Create a strong new password for your account.</p>

      <form
        className="mt-8 flex flex-col gap-5"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <TextField
          label="New password"
          isPassword
          placeholder="at least 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError("");
          }}
          error={passwordError}
        />
        <TextField
          label="Confirm password"
          isPassword
          placeholder="repeat password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (confirmError) setConfirmError("");
          }}
          error={confirmError}
        />
        <Button type="submit" full disabled={showLoading}>
          {showLoading ? "Resetting…" : "Reset password"}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link href="/login" className="hover:underline">
          Remember password?
        </Link>
      </p>
    </>
  );
}
