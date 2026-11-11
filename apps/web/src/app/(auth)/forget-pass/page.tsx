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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const { sendOtp, isLoading, error, clearError } = useAuth();
  const isSubmitting = useRef(false);
  const { feedback, show, hide, isConnectionError } = useFeedback();

  useEffect(() => {
    if (!error) return;
    isSubmitting.current = false;
    const e = error.toLowerCase();
    if (e.includes("not found") || e.includes("no account") || e.includes("user")) {
      show(
        "error",
        "Account Not Found",
        "No account exists with this email address. Please check your email or sign up."
      );
    } else if (/network|connect|timeout/.test(e)) {
      show(
        "error",
        "Connection Error",
        "Unable to connect to the server. Please check your connection and try again."
      );
    } else {
      show("error", "Request Failed", error);
    }
    clearError();
  }, [error, clearError, show]);

  const handleSendCode = useCallback(async () => {
    if (isSubmitting.current) return;
    const trimmed = email.trim();
    if (!trimmed) return setEmailError("Please enter your email address.");
    if (!EMAIL_RE.test(trimmed)) return setEmailError("Please enter a valid email address.");
    setEmailError("");
    isSubmitting.current = true;
    try {
      await sendOtp(trimmed);
      show("success", "Code Sent!", `We've sent a verification code to ${trimmed}`);
      setTimeout(() => {
        hide();
        router.push(`/otp?email=${encodeURIComponent(trimmed)}`);
      }, 800);
    } catch (err) {
      console.error("Failed to send OTP:", err);
    } finally {
      isSubmitting.current = false;
    }
  }, [email, sendOtp, show, hide, router]);

  const showLoading = isLoading && isSubmitting.current;

  return (
    <>
      <FeedbackModal
        isVisible={feedback.visible || showLoading}
        type={showLoading ? "loading" : feedback.type}
        title={showLoading ? "Sending Code" : feedback.title}
        message={showLoading ? "Sending verification code to your email…" : feedback.message}
        onClose={!showLoading ? hide : undefined}
        showRetry={isConnectionError}
        retryAction={() => {
          hide();
          handleSendCode();
        }}
      />

      <BackLink fallback="/login" />
      <h1 className="mt-6 text-2xl font-bold">Forgot password</h1>
      <p className="mt-2 text-secondaryText">
        Enter your email address and we&apos;ll send you a code to reset your password.
      </p>

      <form
        className="mt-8 flex flex-col gap-5"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          handleSendCode();
        }}
      >
        <TextField
          label="Email"
          type="email"
          placeholder="Enter your email address"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          error={emailError}
        />
        <Button type="submit" full disabled={showLoading}>
          {showLoading ? "Sending…" : "Send code"}
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
