import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import InterBold from "@/components/Text/InterBold";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import StyledTextInput from "@/components/input/textInput";
import { View, ScrollView, Keyboard, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useShedaApi";
import FeedbackModal from "@/components/common/FeedbackModal";

const ResetPass = () => {
  const { otpCode } = useLocalSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const { resetPassword, isLoading, error, clearError } = useAuth();
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

      let title = "Reset Failed";
      let message = error;

      if (
        errLower.includes("network") ||
        errLower.includes("connect") ||
        errLower.includes("timeout")
      ) {
        title = "Connection Error";
        message = "Unable to connect to the server. Please check your connection and try again.";
      } else if (errLower.includes("expired") || errLower.includes("invalid")) {
        title = "Session Expired";
        message = "Your reset session has expired. Please request a new code.";
      }

      setFeedback({ visible: true, type: "error", title, message });
      clearError();
    }
  }, [error, clearError]);

  const validate = (): boolean => {
    let valid = true;

    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else if (!/[A-Z]/.test(password)) {
      setPasswordError("Password must contain at least one uppercase letter.");
      valid = false;
    } else if (!/[0-9]/.test(password)) {
      setPasswordError("Password must contain at least one number.");
      valid = false;
    } else {
      setPasswordError("");
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmError("");
    }

    return valid;
  };

  const handlePassChanged = useCallback(async () => {
    if (isSubmitting.current) return;
    if (!validate()) return;

    isSubmitting.current = true;
    Keyboard.dismiss();

    try {
      await resetPassword(password);

      setFeedback({
        visible: true,
        type: "success",
        title: "Password Changed!",
        message: "Your password has been reset successfully.",
      });

      setTimeout(() => {
        setFeedback((prev) => ({ ...prev, visible: false }));
        router.push({
          pathname: "/(auth)/pass-changed",
        });
      }, 800);
    } catch (err) {
      console.error("Password reset failed:", err);
      // Error handled by useEffect above
    } finally {
      isSubmitting.current = false;
    }
  }, [password, confirmPassword, resetPassword]);

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
          title={showLoading ? "Resetting Password" : feedback.title}
          message={
            showLoading ? "Updating your password…" : feedback.message
          }
          onClose={
            !showLoading
              ? () => setFeedback((prev) => ({ ...prev, visible: false }))
              : undefined
          }
          showRetry={feedback.type === "error" && (feedback.message?.toLowerCase().includes("connect") || feedback.message?.toLowerCase().includes("network") || false)}
          retryAction={() => {
            setFeedback((prev) => ({ ...prev, visible: false }));
            handlePassChanged();
          }}
        />

        <View className="pt-2">
          <BackBtn />
        </View>

        <View>
          <InterBold className="text-2xl lg:text-4xl mt-16">
            Reset password
          </InterBold>
          <InterRegular className="text-secondaryText text-sm mt-2">
            Create a strong new password for your account.
          </InterRegular>
        </View>

        <View className="mt-8">
          {/* Password input */}
          <View>
            <InterRegular className="py-1">New password</InterRegular>
            <StyledTextInput
              isPassword={true}
              placeholder="must be 8 characters"
              value={password}
              onChangeText={(text: string) => {
                setPassword(text);
                if (passwordError) setPasswordError("");
              }}
              autoComplete="new-password"
            />
            {passwordError ? (
              <InterRegular className="text-red-500 text-xs mt-1">
                {passwordError}
              </InterRegular>
            ) : null}
          </View>

          {/* Confirm Password input */}
          <View className="my-4">
            <InterRegular className="py-1">Confirm new Password</InterRegular>
            <StyledTextInput
              isPassword={true}
              placeholder="repeat password"
              value={confirmPassword}
              onChangeText={(text: string) => {
                setConfirmPassword(text);
                if (confirmError) setConfirmError("");
              }}
              autoComplete="new-password"
            />
            {confirmError ? (
              <InterRegular className="text-red-500 text-xs mt-1">
                {confirmError}
              </InterRegular>
            ) : null}
          </View>

          <Button
            className="rounded-lg my-4"
            onPress={handlePassChanged}
            disabled={showLoading}
          >
            <InterSemiBold className="text-background text-base">
              {showLoading ? "Resetting…" : "Reset password"}
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

export default ResetPass;
