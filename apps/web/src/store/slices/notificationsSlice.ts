import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface NotificationItem {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: string;
    isRead: boolean;
    metadata?: Record<string, any>;
}

interface NotificationsState {
    items: NotificationItem[];
    unreadCount: number;
}

const initialState: NotificationsState = {
    items: [],
    unreadCount: 0,
};

const notificationsSlice = createSlice({
    name: "notifications",
    initialState,
    reducers: {
        addNotification(state, action: PayloadAction<Omit<NotificationItem, "id" | "isRead" | "timestamp">>) {
            const notification: NotificationItem = {
                ...action.payload,
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                isRead: false,
                timestamp: new Date().toISOString(),
            };
            state.items.unshift(notification);
            state.unreadCount += 1;
            // Cap at 100 notifications
            if (state.items.length > 100) {
                state.items = state.items.slice(0, 100);
            }
        },
        markRead(state, action: PayloadAction<string>) {
            const item = state.items.find((n) => n.id === action.payload);
            if (item && !item.isRead) {
                item.isRead = true;
                state.unreadCount = Math.max(0, state.unreadCount - 1);
            }
        },
        markAllRead(state) {
            state.items.forEach((n) => (n.isRead = true));
            state.unreadCount = 0;
        },
        setNotifications(state, action: PayloadAction<NotificationItem[]>) {
            state.items = action.payload;
            state.unreadCount = action.payload.filter((n) => !n.isRead).length;
        },
        clearNotifications(state) {
            state.items = [];
            state.unreadCount = 0;
        },
    },
});

export const {
    addNotification,
    markRead,
    markAllRead,
    setNotifications,
    clearNotifications,
} = notificationsSlice.actions;
export default notificationsSlice.reducer;
