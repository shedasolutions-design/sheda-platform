"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import CodeInput from "@/components/ui/CodeInput";
import FeedbackModal from "@/components/ui/FeedbackModal";
import BackLink from "@/components/ui/BackLink";
import { useAuth } from "@/hooks/useShedaApi";
import { useFeedback } from "@/hooks/useFeedback";
import { getQueryParam } from "@/lib/navigation";

const RESEND_COOLDOWN = 30; // seconds

const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Email code entry. Two flows land here:
 *   ?email=...                       password reset, continues to /reset-pass
 *   ?email=...&returnTo=wallet-setup  email verification before wallet setup
 */
export default function OtpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const { verifyOtp, sendOtp, isLoading, error, clearError } = useAuth();
  const isSubmitting = useRef(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const { feedback, show, hide, isConnectionError } = useFeedback();

  useEffect(() => {
    setEmail(getQueryParam("email") ?? "");
    setReturnTo(getQueryParam("returnTo"));
  }, []);

  // One ticking effect drives both the first cooldown and every resend.
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!error) return;
    isSubmitting.current = false;
    const e = error.toLowerCase();
    if (/network|connect|fetch/.test(e)) {
      show(
        "error",
        "Connection Error",
        "Cannot connect to the server. Please check your internet connection and try again."
      );
    } else if (e.includes("cors") || e.includes("configuration")) {
      show("error", "Server Error", "Server is not configured properly. Please contact support.");
    } else if (/invalid|incorrect|wrong/.test(e)) {
      show("error", "Invalid Code", "The code you entered is incorrect. Please check and try again.");
    } else if (e.includes("expired")) {
      show("error", "Code Expired", "This code has expired. Please request a new one.");
    } else {
      show("error", "Verification Failed", error);
    }
    clearError();
  }, [error, clearError, show]);

  const handleSubmit = useCallback(
    async (code: string = otp) => {
      if (isSubmitting.current) return;
      if (code.length !== 4) {
        show("info", "Incomplete Code", "Please enter the full 4-digit code sent to your email.");
        return;
      }
      isSubmitting.current = true;
      try {
        await verifyOtp(email, code);
        if (returnTo === "wallet-setup") {
          show("success", "Email Verified!", "Redirecting to wallet setup…");
          setTimeout(() => {
            hide();
            router.replace(`/wallet-setup?email=${encodeURIComponent(email)}`);
          }, 800);
        } else {
          // The verified code is held by the API client; reset needs only the new password.
          router.push("/reset-pass");
        }
        setOtp("");
      } catch (err) {
        console.error("OTP verification failed:", err);
      } finally {
        isSubmitting.current = false;
      }
    },
    [otp, email, returnTo, verifyOtp, show, hide, router]
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0) return;
    setCountdown(RESEND_COOLDOWN);
    try {
      await sendOtp(email);
      show("success", "Code Sent!", "A new verification code has been sent to your email.");
    } catch (err) {
      console.error("Failed to resend OTP:", err);
      setCountdown(0);
    }
  }, [countdown, email, sendOtp, show]);

  const showLoading = isLoading && isSubmitting.current;

  return (
    <>
      <FeedbackModal
        isVisible={feedback.visible || showLoading}
        type={showLoading ? "loading" : feedback.type}
        title={showLoading ? "Verifying" : feedback.title}
        message={showLoading ? "Checking your code…" : feedback.message}
        onClose={!showLoading ? hide : undefined}
        showRetry={isConnectionError}
        retryAction={() => {
          hide();
          handleSubmit();
        }}
      />

      <BackLink fallback="/forget-pass" />
      <h1 className="mt-6 text-2xl font-bold">Please check your email</h1>
      <p className="mt-2 text-secondaryText">
        We&apos;ve sent a code to <span className="font-medium text-primaryText">{email}</span>
      </p>

      <div className="my-8">
        <CodeInput
          length={4}
          value={otp}
          onChange={setOtp}
          onComplete={(code) => handleSubmit(code)}
          autoFocus
          label="One-time code"
        />
      </div>

      <Button full onClick={() => handleSubmit()} disabled={showLoading || otp.length !== 4}>
        {showLoading ? "Verifying…" : "Verify"}
      </Button>

      <div className="mt-4 flex justify-center text-sm">
        {countdown <= 0 ? (
          <Button variant="ghost" onClick={handleResend}>
            Send code again
          </Button>
        ) : (
          <p className="text-secondaryText">
            Resend code in <span className="font-semibold text-primaryText">{formatTime(countdown)}</span>
          </p>
        )}
      </div>
    </>
  );
}
