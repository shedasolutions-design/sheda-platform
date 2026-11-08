import { Tabs } from "expo-router";
import AntDesign from "@expo/vector-icons/AntDesign";
import Octicons from "@expo/vector-icons/Octicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMode } from "@/contexts/ModeContext";
import { Image } from "react-native";
import AuthGuard from "@/components/AuthGuard";
import useUnreadMessagesCount from "@/hooks/useUnreadMessagesCount";
import useUnattendedCount from "@/hooks/useUnattendedCount";

// react-navigation's tabBarBadge only accepts a value or undefined — passing
// 0 renders an empty "0" badge instead of hiding it.
function badgeOrUndefined(count: number): number | undefined {
  return count > 0 ? count : undefined;
}

export default function TabLayout() {
  const { isSeller } = useMode();
  const unreadMessages = useUnreadMessagesCount();
  const unattendedCount = useUnattendedCount();

  return (
    <AuthGuard requireAuth="optional">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#C1272D",
          tabBarInactiveTintColor: "#000000",
          tabBarLabelPosition: "below-icon",
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopWidth: 3,
            borderTopColor: "#e0e0e0",
            height: 60,
            justifyContent: "center",
          },
          tabBarLabelStyle: {
            fontFamily: "Manrope-Medium",
            fontSize: 12,
            marginBottom: 5,
            alignItems: "center",
            justifyContent: "center",
          },
        }}
      >
        <Tabs.Screen
          name="home/index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size, focused }) => (
              <AntDesign
                name="home"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="saved/index"
          options={{
            href: isSeller ? null : "/(tabs)/saved",
            title: "Saved",
            tabBarIcon: ({ color, size, focused }) => (
              <AntDesign
                name="heart"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="activity/index"
          options={{
            href: isSeller ? "/(tabs)/activity" : null,
            title: "Activities",
            tabBarBadge: badgeOrUndefined(unattendedCount),
            tabBarIcon: ({ color, size, focused }) => (
              <Image
                source={require("@/assets/images/activity-icon.png")}
                style={{
                  width: 35,
                  height: 35,
                  tintColor: focused ? "#C1272D" : "black",
                }}
                resizeMode="contain"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="history/index"
          options={{
            href: isSeller ? null : "/(tabs)/history",
            title: "History",
            tabBarBadge: badgeOrUndefined(unattendedCount),
            tabBarIcon: ({ color, size, focused }) => (
              <Octicons
                name="history"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="list/index"
          options={{
            href: isSeller ? "/(tabs)/list" : null,
            title: "List",
            tabBarIcon: ({ color, size, focused }) => (
              <Image
                source={require("@/assets/images/list-icon.png")}
                style={{
                  width: 35,
                  height: 35,
                  tintColor: focused ? "#C1272D" : "black",
                }}
                resizeMode="contain"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="inbox/index"
          options={{
            title: "Inbox",
            tabBarBadge: badgeOrUndefined(unreadMessages),
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons
                name="comment-text-outline"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
        {/* Collections. One tab for both sides: the screen behind it reads
            the same buyer/seller mode the rest of the bar does, so a buyer
            sees raises to back and a seller sees their own. Everything past
            it is pushed, which is what keeps this bar at six. */}
        <Tabs.Screen
          name="invest/index"
          options={{
            title: "Invest",
            tabBarIcon: ({ focused }) => (
              <MaterialCommunityIcons
                name="office-building-outline"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="wallet/index"
          options={{
            title: "Portfolio",
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons
                name="wallet-outline"
                size={24}
                color={focused ? "#C1272D" : "black"}
              />
            ),
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
