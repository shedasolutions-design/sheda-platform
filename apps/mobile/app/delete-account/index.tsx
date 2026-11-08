import React, { useState } from "react";
import { View, SafeAreaView, TextInput } from "react-native";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import AuthGuard from "@/components/AuthGuard";
import { useApi } from "@/contexts/ApiContext";
import FeedbackModal from "@/components/common/FeedbackModal";

const DeleteAccount = () => {
  const { deleteAccount } = useApi();
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
    actionColor?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const handleDeletePress = () => {
    setFeedback({
      visible: true,
      type: "warning",
      title: "Delete Account",
      message: "Are you sure you want to delete your account? This action cannot be undone.",
      actionLabel: "Delete",
      actionColor: "#EF4444",
      onAction: confirmDelete,
    });
  };

  const confirmDelete = async () => {
    setFeedback({
      visible: true,
      type: "loading",
      title: "Deleting Account",
      message: "Please wait while we process your request...",
    });

    try {
      await deleteAccount();
      // On success, the app state will reset and AuthGuard will redirect to login
    } catch (error: any) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: error?.message || "Failed to delete account. Please try again.",
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
            <InterSemiBold className="text-lg/5">Delete account</InterSemiBold>
          </View>

          <View className="mt-10">
            <View>
              <InterSemiBold className="text-xs/5 mb-5">
                It's sad to see you go.
              </InterSemiBold>

              <InterRegular className="text-xs/5">
                You will not be able to access this account anymore if you proceed
                and it cannot be restored.
              </InterRegular>
            </View>

            <View className="border border-borderColor rounded-lg h-[141] mt-5 mb-3">
              <TextInput
                placeholder="Tell us why you're leaving"
                multiline
                value={reason}
                onChangeText={setReason}
                style={{
                  padding: 10,
                  fontSize: 12,
                  lineHeight: 20,
                  color: "#000000BF",
                }}
              />
            </View>

            <View>
              <Button className="rounded-lg" onPress={handleDeletePress}>
                <InterSemiBold className="text-white">
                  Delete my account
                </InterSemiBold>
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
          actionColor={feedback.actionColor}
          onClose={() => setFeedback(prev => ({ ...prev, visible: false }))}
        />
      </SafeAreaView>
    </AuthGuard>
  );
};

export default DeleteAccount;
