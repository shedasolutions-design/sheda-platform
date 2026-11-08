import { View, Image, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useCallback } from "react";
import InterSemiBold from "@/components/Text/InterSemiBold";
import BackBtn from "@/components/common/BackBtn";
import InterMedium from "@/components/Text/InterMedium";
import Icon from "@/components/common/Icon";
import { PROFILETICK, CHEVRONRIGHT } from "@/assets/icons";
import Button from "@/components/common/Button";
import InterRegular from "@/components/Text/InterRegular";
import { getProfileList } from "@/unit/profile/profileList";
import { useMode } from "@/contexts/ModeContext";
import { useAuth } from "@/hooks/useShedaApi";
import { useApi } from "@/contexts/ApiContext";
import { router, useFocusEffect } from "expo-router";
import FeedbackModal from "@/components/common/FeedbackModal";
import AuthGuard from "@/components/AuthGuard";
import getFullImageUrl from "@/utilities/imageUrl";

const Profile = () => {
  const { toggleMode, isSeller } = useMode();
  const { logout } = useAuth();
  const { user, getMe, isLoading: isProfileLoading } = useApi();
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

  // Refresh user profile data every time the screen comes into focus
  // This ensures edits from personal-info are reflected immediately,
  // and mode switches show the correct data.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      console.log("🔄 Profile: Fetching fresh user data on focus");
      getMe({ signal: controller.signal, silent: true }).catch(() => { });
      return () => controller.abort();
    }, [getMe])
  );

  // Diagnostic: log user state after every change
  useEffect(() => {
    console.log("👤 Profile: user state updated:", {
      id: user?.id,
      fullname: user?.fullname,
      username: user?.username,
      avatar_url: user?.avatar_url,
      avatar_url_full: user?.avatar_url ? getFullImageUrl(user.avatar_url) : null,
      location: user?.location,
      account_type: user?.account_type,
    });
  }, [user]);

  const handleToggleMode = () => {
    setFeedback({
      visible: true,
      type: "warning",
      title: "Switch View",
      message: `Switch to the ${isSeller ? "buying" : "selling"} view?`,
      actionLabel: "Switch",
      onAction: confirmSwitch,
    });
  };

  const confirmSwitch = async () => {
    const targetMode = isSeller ? "buyer" : "seller";

    setFeedback({
      visible: true,
      type: "loading",
      title: "Switching Mode",
      message: "Please wait a moment...",
    });

    try {
      // toggleMode handles both the UI switch and the backend switchAccount call
      console.log(`🔄 Switching to ${targetMode} view...`);
      await toggleMode();

      setFeedback({
        visible: true,
        type: "success",
        title: "Success",
        message: `Switched to ${targetMode} view.`,
        actionLabel: "Great",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
    } catch (error: any) {
      console.error("❌ Switch account failed:", error);
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: error?.message || `Failed to switch to ${targetMode} view.`,
        actionLabel: "Try Again",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
    }
  };

  const handleLogout = () => {
    setFeedback({
      visible: true,
      type: "warning",
      title: "Logout",
      message: "Are you sure you want to logout?",
      actionLabel: "Logout",
      actionColor: "#EF4444",
      onAction: async () => {
        setFeedback({
          visible: true,
          type: "loading",
          title: "Logging out...",
          message: "Please wait while we log you out.",
        });
        try {
          await logout({ loading: false });
        } catch (error: any) {
          console.error("Logout failed:", error);
          setFeedback({
            visible: true,
            type: "error",
            title: "Error",
            message: error?.message || "Failed to logout. Please try again.",
            actionLabel: "Ok",
            onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
          });
        }
      },
    });
  };

  const closeFeedback = () => {
    setFeedback(prev => ({ ...prev, visible: false }));
  };

  const profileList = getProfileList(handleLogout, isSeller);

  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ paddingVertical: 20 }}
        >
          <View className="flex-row items-center gap-4 ml-5">
            <BackBtn />
            <InterSemiBold className="text-lg/5">My Profile</InterSemiBold>
          </View>

          <View className="my-3">
            <View className="px-5 my-2.5 items-center">
              {/* Profile Avatar */}
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#E5E7EB",
                  backgroundColor: "#DC2626",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {user?.avatar_url ? (
                  <Image
                    source={{ uri: getFullImageUrl(user.avatar_url) }}
                    key={user.avatar_url}
                    style={{ width: 88, height: 88 }}
                    resizeMode="cover"
                  />
                ) : (
                  <InterSemiBold style={{ color: "#fff", fontSize: 32 }}>
                    {(user?.fullname || user?.username || "U").charAt(0).toUpperCase()}
                  </InterSemiBold>
                )}
              </View>

              {/* Name + Verified Badge */}
              <View style={{ marginTop: 16, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <InterSemiBold style={{ fontSize: 20, color: "#111827" }}>
                    {isProfileLoading
                      ? "Loading..."
                      : user?.fullname || user?.username || "Set your name"}
                  </InterSemiBold>
                  {user?.verified && (
                    <Icon icon={PROFILETICK} width={16} height={16} />
                  )}
                </View>

                {/* Mode Badge + Location */}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                  <View
                    style={{
                      backgroundColor: isSeller ? "#FEF3C7" : "#DBEAFE",
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: 12,
                    }}
                  >
                    <InterRegular style={{ fontSize: 11, color: isSeller ? "#92400E" : "#1E40AF" }}>
                      {isSeller ? "Selling" : "Buying"}
                    </InterRegular>
                  </View>
                  {user?.location ? (
                    <InterRegular style={{ fontSize: 13, color: "#6B7280" }}>
                      {user.location}
                    </InterRegular>
                  ) : null}
                </View>

                {/* Edit Profile Link */}
                <TouchableOpacity
                  onPress={() => router.push("/personal-info")}
                  style={{
                    marginTop: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <InterRegular style={{ fontSize: 13, color: "#374151" }}>
                    Edit Profile
                  </InterRegular>
                </TouchableOpacity>
              </View>

              {/* Switch Mode Button */}
              <View className="mt-4">
                <Button
                  className="rounded-xl"
                  onPress={handleToggleMode}
                  disabled={feedback.type === "loading"}
                >
                  <InterMedium className="text-white">
                    {feedback.type === "loading" && feedback.title === "Switching Mode"
                      ? "Switching..."
                      : isSeller
                        ? "Switch to buying view"
                        : "Switch to selling view"}
                  </InterMedium>
                </Button>
              </View>
            </View>
          </View>

          {/* profile list section */}
          <View>
            {profileList.map((item) => (
              <TouchableOpacity
                onPress={item.onClick}
                key={item.id}
                disabled={feedback.type === "loading" && item.title === "Logout"}
                className="flex-row items-center justify-between px-5 py-5 border-b border-[#0000001A]"
              >
                <View className="flex-row items-center gap-3">
                  <Icon icon={item.icon} width={20} height={20} />
                  <InterMedium className="text-base/[150%]">
                    {feedback.type === "loading" && item.title === "Logout"
                      ? "Logging out..."
                      : item.title}
                  </InterMedium>
                </View>
                {item.chevronRight && (
                  <Icon icon={CHEVRONRIGHT} width={10} height={20} />
                )}
              </TouchableOpacity>
            ))}
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
          onClose={closeFeedback}
        />
      </SafeAreaView>
    </AuthGuard>
  );
};

export default Profile;
