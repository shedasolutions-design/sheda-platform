"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import CodeInput from "@/components/ui/CodeInput";
import FeedbackModal from "@/components/ui/FeedbackModal";
import BackLink from "@/components/ui/BackLink";
import { useWallet } from "@/contexts/WalletContext";
import { useAuth } from "@/hooks/useShedaApi";
import { useFeedback } from "@/hooks/useFeedback";
import { getQueryParam, safeNextPath } from "@/lib/navigation";

const RESEND_COOLDOWN = 30; // seconds

const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

type Flow = "reset" | "signup" | "device";

/**
 * Email code entry. Three flows land here:
 *   ?email=...                          password reset, continues to /reset-pass
 *   ?email=...&returnTo=wallet-setup     confirming the email right after sign-up
 *   ?mode=device&challenge=...&hint=...  signing in on a device the account hasn't used
 */
export default function OtpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [flow, setFlow] = useState<Flow>("reset");
  const [challenge, setChallenge] = useState("");
  const [hint, setHint] = useState("");
  const [otp, setOtp] = useState("");
  const {
    sendOtp,
    forgotPassword,
    verifyForgotPassword,
    confirmEmail,
    completeDeviceSignIn,
    resendDeviceCode,
    isLoading,
    error,
    clearError,
  } = useAuth();
  const { hasLocalWallet } = useWallet();
  const isSubmitting = useRef(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const { feedback, show, hide, isConnectionError } = useFeedback();

  useEffect(() => {
    setEmail(getQueryParam("email") ?? "");
    setChallenge(getQueryParam("challenge") ?? "");
    setHint(getQueryParam("hint") ?? "");
    setFlow(
      getQueryParam("mode") === "device" ? "device" : getQueryParam("returnTo") === "wallet-setup" ? "signup" : "reset"
    );
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
    } else if (e.includes("too many") || e.includes("sign in again")) {
      show("error", "Please sign in again", error);
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
        if (flow === "device") {
          await completeDeviceSignIn(challenge, code);
          show("success", "Welcome Back!", "This device is now remembered. Redirecting…");
          setTimeout(() => {
            hide();
            router.replace(hasLocalWallet ? safeNextPath("/home") : "/wallet-setup");
          }, 800);
        } else if (flow === "signup") {
          await confirmEmail(code);
          show("success", "Email Verified!", "Next, a few optional details…");
          setTimeout(() => {
            hide();
            router.replace("/wallet-setup/profile");
          }, 800);
        } else {
          // Password reset happens signed out, so it has its own routes.
          await verifyForgotPassword(email, code);
          // The verified code is held by the API client; reset needs only the new password.
          router.push("/reset-pass");
        }
        setOtp("");
      } catch (err) {
        console.error("Code verification failed:", err);
      } finally {
        isSubmitting.current = false;
      }
    },
    [otp, flow, challenge, email, completeDeviceSignIn, confirmEmail, verifyForgotPassword, hasLocalWallet, show, hide, router]
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0) return;
    setCountdown(RESEND_COOLDOWN);
    try {
      if (flow === "device") await resendDeviceCode(challenge);
      else if (flow === "signup") await sendOtp(email);
      else await forgotPassword(email);
      show("success", "Code Sent!", "A new code has been sent to your email.");
    } catch (err) {
      console.error("Failed to resend code:", err);
      setCountdown(0);
    }
  }, [countdown, flow, challenge, email, sendOtp, forgotPassword, resendDeviceCode, show]);

  const showLoading = isLoading && isSubmitting.current;
  const sentTo = flow === "device" ? hint : email;

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

      {flow !== "signup" ? <BackLink fallback={flow === "device" ? "/login" : "/forget-pass"} /> : null}
      <h1 className="mt-6 text-2xl font-bold">
        {flow === "device" ? "Confirm it's you" : flow === "signup" ? "Verify your email" : "Please check your email"}
      </h1>
      <p className="mt-2 text-secondaryText">
        {flow === "device" ? "This device is new to your account. " : null}
        We&apos;ve sent a 4-digit code to <span className="font-medium text-primaryText">{sentTo || "your email"}</span>
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

      {flow === "signup" ? (
        // A slow or missing email must not strand a new account. The next
        // sign-in on a new device asks for a code anyway, which verifies it.
        <p className="mt-6 text-center text-xs text-secondaryText">
          Can&apos;t find it? Check spam, or{" "}
          <Link href="/wallet-setup/profile" replace className="font-medium underline">
            verify later
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
