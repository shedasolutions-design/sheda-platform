import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import InterBold from "@/components/Text/InterBold";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import { View, Keyboard } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import InterMedium from "@/components/Text/InterMedium";
import { OtpInput } from "react-native-otp-entry";
import styles from "./style";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useShedaApi";
import FeedbackModal from "@/components/common/FeedbackModal";

const RESEND_COOLDOWN = 30; // seconds

const Otp = () => {
  const { email, returnTo } = useLocalSearchParams();
  const [otp, setOtp] = useState("");
  const { verifyOtp, sendOtp, isLoading, error, clearError } = useAuth();
  const isSubmitting = useRef(false);

  // ── Countdown timer state ──
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);

  // ── FeedbackModal state ──
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  // ── Start countdown on mount ──
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ── Handle API errors ──
  useEffect(() => {
    if (error) {
      isSubmitting.current = false;
      const errLower = error.toLowerCase();

      let title = "Verification Failed";
      let message = error;

      if (
        errLower.includes("network") ||
        errLower.includes("connect") ||
        errLower.includes("fetch")
      ) {
        title = "Connection Error";
        message =
          "Cannot connect to the server. Please check your internet connection and try again.";
      } else if (errLower.includes("cors") || errLower.includes("configuration")) {
        title = "Server Error";
        message = "Server is not configured properly. Please contact support.";
      } else if (
        errLower.includes("invalid") ||
        errLower.includes("incorrect") ||
        errLower.includes("wrong")
      ) {
        title = "Invalid Code";
        message = "The code you entered is incorrect. Please check and try again.";
      } else if (errLower.includes("expired")) {
        title = "Code Expired";
        message = "This code has expired. Please request a new one.";
      }

      setFeedback({
        visible: true,
        type: "error",
        title,
        message,
      });

      clearError();
    }
  }, [error, clearError]);

  // ── Submit OTP ──
  const handleSubmitOtp = useCallback(async () => {
    if (isSubmitting.current) return;

    if (!otp || otp.length !== 4) {
      setFeedback({
        visible: true,
        type: "warning",
        title: "Incomplete Code",
        message: "Please enter the full 4-digit code sent to your email.",
      });
      return;
    }

    isSubmitting.current = true;
    Keyboard.dismiss();

    try {
      await verifyOtp(email as string, otp);

      if (returnTo === "wallet-setup") {
        setFeedback({
          visible: true,
          type: "success",
          title: "Email Verified!",
          message: "Redirecting to wallet setup…",
        });
        setTimeout(() => {
          setFeedback((prev) => ({ ...prev, visible: false }));
          router.replace({
            pathname: "/wallet-setup",
            params: { email: email as string },
          });
        }, 800);
      } else {
        router.push({
          pathname: "/(auth)/reset-pass",
          params: { otpCode: otp },
        });
      }

      setOtp("");
    } catch (err: any) {
      console.error("OTP verification failed:", err);
      // Error is handled by the useEffect above via the error state
    } finally {
      isSubmitting.current = false;
    }
  }, [otp, email, returnTo, verifyOtp]);

  // ── Resend OTP ──
  const handleResendOtp = useCallback(async () => {
    if (!canResend) return;

    try {
      setCanResend(false);
      setCountdown(RESEND_COOLDOWN);

      // Restart countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      await sendOtp(email as string);

      setFeedback({
        visible: true,
        type: "success",
        title: "Code Sent!",
        message: "A new verification code has been sent to your email.",
      });
    } catch (err) {
      console.error("Failed to resend OTP:", err);
      setCanResend(true);
    }
  }, [canResend, email, sendOtp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const showLoading = isLoading && isSubmitting.current;

  return (
    <View className="container max-w-2xl mx-auto flex-1 bg-white" style={{ padding: 20 }}>
      <FeedbackModal
        isVisible={feedback.visible || showLoading}
        type={showLoading ? "loading" : feedback.type}
        title={showLoading ? "Verifying" : feedback.title}
        message={showLoading ? "Checking your code…" : feedback.message}
        onClose={
          !showLoading
            ? () => setFeedback((prev) => ({ ...prev, visible: false }))
            : undefined
        }
        showRetry={
          feedback.type === "error" &&
          (feedback.message?.toLowerCase().includes("connect") ||
            feedback.message?.toLowerCase().includes("network") ||
            false)
        }
        retryAction={() => {
          setFeedback((prev) => ({ ...prev, visible: false }));
          handleSubmitOtp();
        }}
      />

      <View className="pt-2">
        <BackBtn />
      </View>

      <View>
        <InterBold className="text-2xl lg:text-4xl mt-16">
          Please check your email
        </InterBold>
      </View>

      <View className="mt-8">
        <View className="flex flex-row gap-1 mb-4 flex-wrap">
          <InterRegular className="">We've sent a code to</InterRegular>
          <InterMedium>{email}</InterMedium>
        </View>

        <OtpInput
          numberOfDigits={4}
          type="numeric"
          focusColor="#C1272D"
          onFilled={(text) => setOtp(text)}
          textInputProps={{
            accessibilityLabel: "One-Time Password",
          }}
          theme={{
            containerStyle: styles.container,
            pinCodeContainerStyle: styles.pinCodeContainer,
            filledPinCodeContainerStyle: styles.filledPinCodeContainer,
          }}
        />

        <Button
          className="rounded-lg my-4"
          onPress={handleSubmitOtp}
          disabled={showLoading || otp.length !== 4}
        >
          <InterSemiBold className="text-background text-base">
            {showLoading ? "Verifying…" : "Verify"}
          </InterSemiBold>
        </Button>

        <View className="flex-row items-center justify-center gap-2 mt-10">
          {canResend ? (
            <Button
              color="transparent"
              onPress={handleResendOtp}
              className="px-4"
            >
              <InterBold className="text-primary">Send code again</InterBold>
            </Button>
          ) : (
            <View className="flex-row items-center gap-2">
              <InterRegular className="text-secondaryText">
                Resend code in
              </InterRegular>
              <InterSemiBold className="text-primary">
                {formatTime(countdown)}
              </InterSemiBold>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default Otp;
