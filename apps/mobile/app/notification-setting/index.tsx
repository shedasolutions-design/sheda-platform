
import React from "react";
import { View, SafeAreaView, TouchableOpacity, Switch } from "react-native";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import AuthGuard from "@/components/AuthGuard";
import { useNotifications, NotificationPreferences } from "@/contexts/NotificationContext";

type PreferenceKey = keyof NotificationPreferences;

interface NotificationItem {
  id: PreferenceKey;
  title: string;
  description: string;
}

const notificationList: NotificationItem[] = [
  {
    id: "allowMessages",
    title: "Allow Messages",
    description: "Receive in-app chat messages from buyers and sellers",
  },
  {
    id: "pushNotifications",
    title: "Push notifications",
    description: "Get notified about bids, payments, and transaction updates",
  },
  {
    id: "emailNotifications",
    title: "Email notifications",
    description: "Receive transaction summaries and updates via email",
  },
  {
    id: "smsNotifications",
    title: "SMS notifications",
    description: "Get critical alerts via text message",
  },
];

const NotificationSetting = () => {
  const { preferences, updatePreference } = useNotifications();

  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ paddingVertical: 20 }}
        >
          {/* Header */}
          <View className="flex-row items-center gap-4 ml-5">
            <BackBtn />
            <InterSemiBold className="text-lg/5">Notification settings</InterSemiBold>
          </View>

          {/* Notification List */}
          <View className="mt-5">
            {notificationList.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => updatePreference(item.id, !preferences[item.id])}
                className="flex-row items-center justify-between px-5 py-4 border-b border-[#0000001A]"
              >
                <View className="flex-1 mr-4">
                  <InterRegular className="text-base text-primaryText">
                    {item.title}
                  </InterRegular>
                  <InterRegular className="text-xs text-secondaryText mt-1">
                    {item.description}
                  </InterRegular>
                </View>

                <Switch
                  trackColor={{ false: "#E5E5E5", true: "#C1272D" }}
                  thumbColor={"white"}
                  ios_backgroundColor="#E5E5E5"
                  value={preferences[item.id]}
                  onValueChange={(value) => updatePreference(item.id, value)}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default NotificationSetting;