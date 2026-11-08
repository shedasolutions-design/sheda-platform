import React, { useState } from "react";
import { View, SafeAreaView } from "react-native";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import StyledTextInput from "@/components/input/textInput";
import Button from "@/components/common/Button";
import AuthGuard from "@/components/AuthGuard";
import { useApi } from "@/contexts/ApiContext";
import FeedbackModal from "@/components/common/FeedbackModal";
import { router } from "expo-router";

const ChangePassword = () => {
  const { changePassword } = useApi();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please fill in all password fields.",
        actionLabel: "Ok",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: "New passwords do not match.",
        actionLabel: "Ok",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
      return;
    }

    if (newPassword.length < 8) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: "Password must be at least 8 characters long.",
        actionLabel: "Ok",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
      return;
    }

    setFeedback({
      visible: true,
      type: "loading",
      title: "Resetting Password",
      message: "Please wait while we update your password...",
    });

    try {
      await changePassword(newPassword);
      setFeedback({
        visible: true,
        type: "success",
        title: "Success",
        message: "Your password has been reset successfully.",
        actionLabel: "Great",
        onAction: () => {
          setFeedback(prev => ({ ...prev, visible: false }));
          router.back();
        },
      });
    } catch (error: any) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: error?.message || "Failed to reset password. Please try again.",
        actionLabel: "Ok",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
    }
  };

  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ padding: 20 }}
        >
          <View className="flex-row items-center gap-4">
            <BackBtn />
            <InterSemiBold className="text-lg/5">Change password</InterSemiBold>
          </View>

          <View className="mt-5">
            <View className="mb-5">
              <InterRegular className="text-xs/[150%] mb-1">Old password</InterRegular>
              <StyledTextInput 
                placeholder="Enter old password" 
                isPassword={true} 
                value={oldPassword}
                onChangeText={setOldPassword}
              />
            </View>
            <View className="mb-5">
              <InterRegular className="text-xs/[150%] mb-1">New password</InterRegular>
              <StyledTextInput 
                placeholder="Must be 8 characters" 
                isPassword={true} 
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>
            <View className="mb-5">
              <InterRegular className="text-xs/[150%] mb-1">Confirm new password</InterRegular>
              <StyledTextInput 
                placeholder="Repeat password" 
                isPassword={true} 
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <View>
              <Button className="rounded-lg" onPress={handleResetPassword}>
                <InterSemiBold className="text-white">Reset password</InterSemiBold>
              </Button>
            </View>
          </View>
        </View>

        <FeedbackModal
          isVisible={feedback.visible}
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          onAction={feedback.onAction}
          actionLabel={feedback.actionLabel}
          onClose={() => setFeedback(prev => ({ ...prev, visible: false }))}
        />
      </SafeAreaView>
    </AuthGuard>
  );
};

export default ChangePassword;
