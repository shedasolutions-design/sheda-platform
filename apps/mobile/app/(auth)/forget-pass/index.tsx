import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import InterBold from "@/components/Text/InterBold";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import StyledTextInput from "@/components/input/textInput";
import { View, ScrollView, Keyboard } from "react-native";
import { router } from "expo-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useShedaApi";
import FeedbackModal from "@/components/common/FeedbackModal";
import { TouchableOpacity } from "react-native";

const ForgetPassword = () => {
  const [useremail, setUserEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const { sendOtp, isLoading, error, clearError } = useAuth();
  const isSubmitting = useRef(false);

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

  // ── Handle API errors ──
  useEffect(() => {
    if (error) {
      isSubmitting.current = false;
      const errLower = error.toLowerCase();

      let title = "Request Failed";
      let message = error;

      if (
        errLower.includes("not found") ||
        errLower.includes("no account") ||
        errLower.includes("user")
      ) {
        title = "Account Not Found";
        message = "No account exists with this email address. Please check your email or sign up.";
      } else if (
        errLower.includes("network") ||
        errLower.includes("connect") ||
        errLower.includes("timeout")
      ) {
        title = "Connection Error";
        message = "Unable to connect to the server. Please check your connection and try again.";
      }

      setFeedback({ visible: true, type: "error", title, message });
      clearError();
    }
  }, [error, clearError]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setEmailError("Please enter your email address.");
      return false;
    }
    if (!emailRegex.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError("");
    return true;
  };

  const handleSendCode = useCallback(async () => {
    if (isSubmitting.current) return;

    if (!validateEmail(useremail)) return;

    isSubmitting.current = true;
    Keyboard.dismiss();

    try {
      await sendOtp(useremail.trim());

      setFeedback({
        visible: true,
        type: "success",
        title: "Code Sent!",
        message: `We've sent a verification code to ${useremail.trim()}`,
      });

      setTimeout(() => {
        setFeedback((prev) => ({ ...prev, visible: false }));
        router.push({
          pathname: "/(auth)/otp",
          params: { email: useremail.trim() },
        });
      }, 800);
    } catch (err) {
      console.error("Failed to send OTP:", err);
      // Error handled by useEffect above
    } finally {
      isSubmitting.current = false;
    }
  }, [useremail, sendOtp]);

  const showLoading = isLoading && isSubmitting.current;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="container max-w-2xl mx-auto" style={{ padding: 20 }}>
        <FeedbackModal
          isVisible={feedback.visible || showLoading}
          type={showLoading ? "loading" : feedback.type}
          title={showLoading ? "Sending Code" : feedback.title}
          message={showLoading ? "Sending verification code to your email…" : feedback.message}
          onClose={
            !showLoading
              ? () => setFeedback((prev) => ({ ...prev, visible: false }))
              : undefined
          }
          showRetry={feedback.type === "error" && (feedback.message?.toLowerCase().includes("connect") || feedback.message?.toLowerCase().includes("network") || false)}
          retryAction={() => {
            setFeedback((prev) => ({ ...prev, visible: false }));
            handleSendCode();
          }}
        />

        <View className="pt-2">
          <BackBtn />
        </View>

        <View>
          <InterBold className="text-2xl lg:text-4xl mt-16">
            Forgot password
          </InterBold>
          <InterRegular className="text-secondaryText text-sm mt-2">
            Enter your email address and we'll send you a code to reset your password.
          </InterRegular>
        </View>

        <View className="mt-8">
          <View>
            <InterRegular className="py-1">Email address</InterRegular>
            <StyledTextInput
              placeholder="Enter your email address"
              value={useremail}
              onChangeText={(text: string) => {
                setUserEmail(text);
                if (emailError) setEmailError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            {emailError ? (
              <InterRegular className="text-red-500 text-xs mt-1">
                {emailError}
              </InterRegular>
            ) : null}
          </View>

          <Button
            className="rounded-lg my-4"
            onPress={handleSendCode}
            disabled={showLoading}
          >
            <InterSemiBold className="text-background text-base">
              {showLoading ? "Sending…" : "Send code"}
            </InterSemiBold>
          </Button>

          <TouchableOpacity 
            onPress={() => router.push("/(auth)/login")}
            className="flex-row justify-center items-center mt-4"
          >
            <InterRegular>Remember password?</InterRegular>
            <InterBold className="text-primary ml-1"> Log in</InterBold>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default ForgetPassword;
