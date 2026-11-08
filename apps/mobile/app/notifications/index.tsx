import React from "react";
import {
    SafeAreaView,
    View,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useMode } from "@/contexts/ModeContext";
import {
    transactionsRouteFor,
    isTransactionsRoute,
} from "@/utilities/transactionsRoute";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
    useNotifications,
    AppNotification,
    NOTIFICATION_META,
} from "@/contexts/NotificationContext";

// ---- Relative time helper ----
function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.max(0, now - then);

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

// ---- Notification Card ----
const NotificationCard = ({
    notification,
    onPress,
}: {
    notification: AppNotification;
    onPress: () => void;
}) => {
    const meta = NOTIFICATION_META[notification.type];

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            style={{
                flexDirection: "row",
                padding: 14,
                borderRadius: 12,
                backgroundColor: notification.read ? "#FFFFFF" : meta.bgColor,
                borderWidth: 1,
                borderColor: notification.read ? "#F3F4F6" : meta.bgColor,
                marginBottom: 10,
            }}
        >
            {/* Icon */}
            <View
                style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: notification.read ? "#F3F4F6" : "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                }}
            >
                <InterSemiBold style={{ fontSize: 18 }}>{meta.icon}</InterSemiBold>
            </View>

            {/* Content */}
            <View style={{ flex: 1 }}>
                <View
                    style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 2,
                    }}
                >
                    <InterSemiBold
                        style={{
                            fontSize: 13,
                            color: notification.read ? "#6B7280" : "#1F2937",
                            flex: 1,
                        }}
                        numberOfLines={1}
                    >
                        {notification.title}
                    </InterSemiBold>
                    <InterRegular
                        style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}
                    >
                        {timeAgo(notification.createdAt)}
                    </InterRegular>
                </View>
                <InterRegular
                    style={{
                        fontSize: 12,
                        color: notification.read ? "#9CA3AF" : "#4B5563",
                        lineHeight: 18,
                    }}
                    numberOfLines={2}
                >
                    {notification.message}
                </InterRegular>

                {/* Unread dot */}
                {!notification.read && (
                    <View
                        style={{
                            position: "absolute",
                            top: 2,
                            right: 0,
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: "#C1272D",
                        }}
                    />
                )}
            </View>
        </TouchableOpacity>
    );
};

// ---- Main Page ----
const NotificationsPage = () => {
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll, refreshNotifications } =
        useNotifications();
    const { isSeller } = useMode();
    const [refreshing, setRefreshing] = React.useState(false);

    const handleNotificationPress = (notification: AppNotification) => {
        markAsRead(notification.id);

        if (!notification.route) return;

        // Transaction notifications are stored with a placeholder route: the
        // role that matters is the reader's, and it isn't known when the
        // notification is created. bid_placed is read by the seller while
        // bid_accepted is read by the buyer, and the same account can switch
        // modes in between — so resolve it here, on open.
        const route = isTransactionsRoute(notification.route)
            ? transactionsRouteFor(isSeller)
            : notification.route;

        router.push({
            pathname: route as any,
            params: notification.routeParams || {},
        });
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await refreshNotifications();
        setRefreshing(false);
    };

    // RefreshControl does nothing on web; this restores the pull gesture and
    // also refreshes on return — notifications arrive while the user is away,
    // which is precisely when this screen goes stale.
    usePullToRefresh(onRefresh);

    return (
        <SafeAreaView
            className="container flex-1 max-w-2xl mx-auto"
            style={{ padding: 20 }}
        >
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row gap-4 items-center">
                    <BackBtn />
                    <InterSemiBold className="text-base/5">Notifications</InterSemiBold>
                </View>

                {unreadCount > 0 && (
                    <TouchableOpacity onPress={markAllAsRead} activeOpacity={0.7}>
                        <InterMedium style={{ fontSize: 13, color: "#C1272D" }}>
                            Mark all read
                        </InterMedium>
                    </TouchableOpacity>
                )}
            </View>

            {/* Unread count badge */}
            {unreadCount > 0 && (
                <View
                    style={{
                        backgroundColor: "#FEF2F2",
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 16,
                        borderWidth: 1,
                        borderColor: "#FECACA",
                    }}
                >
                    <InterMedium style={{ fontSize: 12, color: "#991B1B", textAlign: "center" }}>
                        You have {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
                    </InterMedium>
                </View>
            )}

            <ScrollView
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {notifications.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 60 }}>
                        <InterSemiBold style={{ fontSize: 40, marginBottom: 12 }}>
                            🔔
                        </InterSemiBold>
                        <InterSemiBold
                            style={{ fontSize: 16, color: "#374151", marginBottom: 6 }}
                        >
                            No notifications yet
                        </InterSemiBold>
                        <InterRegular
                            style={{
                                fontSize: 13,
                                color: "#9CA3AF",
                                textAlign: "center",
                                paddingHorizontal: 40,
                            }}
                        >
                            You'll see notifications here when there are updates on your bids,
                            appointments, and transactions.
                        </InterRegular>
                    </View>
                ) : (
                    notifications.map((notif) => (
                        <NotificationCard
                            key={notif.id}
                            notification={notif}
                            onPress={() => handleNotificationPress(notif)}
                        />
                    ))
                )}
            </ScrollView>

            {/* Clear all button (only if there are notifications) */}
            {notifications.length > 5 && (
                <TouchableOpacity
                    onPress={clearAll}
                    activeOpacity={0.7}
                    style={{
                        alignItems: "center",
                        paddingVertical: 12,
                    }}
                >
                    <InterRegular style={{ fontSize: 13, color: "#9CA3AF" }}>
                        Clear all notifications
                    </InterRegular>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
};

export default NotificationsPage;
