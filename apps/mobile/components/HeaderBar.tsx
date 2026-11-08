import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import Icon from "./common/Icon";
import { PROFILE, SEARCH, SETTING, NOTIFICATION } from "@/assets/icons";
import { useApi } from "@/contexts/ApiContext";
import { useNotifications } from "@/contexts/NotificationContext";
import InterSemiBold from "./Text/InterSemiBold";

const HeaderBar = () => {
  const { searchQuery, setSearchQuery } = useApi();
  const { unreadCount } = useNotifications();

  return (
    <View style={styles.container}>
      {/* Profile */}
      <TouchableOpacity
        onPress={() => router.push("/profile")}
        className="w-12 h-full items-center justify-center border border-borderColor rounded-lg"
        accessibilityLabel="Go to profile"
      >
        <View pointerEvents="none">
          <Icon icon={PROFILE} width={12} height={18} />
        </View>
      </TouchableOpacity>

      {/* Search Bar */}
      <View className="border border-borderColor h-full rounded-lg flex-1 justify-center relative">
        <TextInput
          placeholder="Search Property..."
          className="pl-10 h-full"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View className="absolute left-2">
          <Icon icon={SEARCH} width={18} height={18} />
        </View>
      </View>

      {/* Notification Bell */}
      <TouchableOpacity
        onPress={() => router.push("/notifications" as any)}
        className="w-12 h-full items-center justify-center border border-borderColor rounded-lg"
        accessibilityLabel="View notifications"
      >
        <View pointerEvents="none">
          <Icon icon={NOTIFICATION} width={18} height={18} />
        </View>
        {/* Badge */}
        {unreadCount > 0 && (
          <View
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#C1272D",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: "#FFFFFF",
            }}
          >
            <InterSemiBold
              style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 13 }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </InterSemiBold>
          </View>
        )}
      </TouchableOpacity>

      {/* Filter */}
      <TouchableOpacity
        onPress={() => router.push("/filter")}
        className="w-12 h-full items-center justify-center border border-borderColor rounded-lg"
        accessibilityLabel="Filter properties"
      >
        <View pointerEvents="none">
          <Icon icon={SETTING} width={16} height={16} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 48,
    gap: 8,
  },
});

export default HeaderBar;
