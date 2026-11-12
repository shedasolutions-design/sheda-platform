/**
 * NotificationContext
 *
 * Fetches notifications from the backend (GET /api/v1/notifications),
 * marks as read via backend (POST /api/v1/notifications/{id}/read),
 * and fires transaction updates (POST /api/v1/notifications/transaction-update).
 * Also listens to WebSocket messages for real-time delivery and
 * caches locally with AsyncStorage for fast first-render.
 */

import React, {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useEffect,
    useRef,
} from "react";
import AsyncStorage from "@/lib/storage";
import { useApi } from "./ApiContext";
import { BackendNotification } from "../services/api";

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
    | "bid_placed"
    | "bid_accepted"
    | "bid_rejected"
    | "bid_cancelled"
    | "payment_committed"
    | "appointment_booked"
    | "appointment_accepted"
    | "appointment_rejected"
    | "docs_released"
    | "docs_confirmed"
    | "payment_released"
    | "transaction_completed"
    | "dispute_raised"
    | "general";

export interface NotificationPreferences {
    allowMessages: boolean;
    pushNotifications: boolean;
    emailNotifications: boolean;
    smsNotifications: boolean;
}

export interface AppNotification {
    id: string;
    /** Backend notification ID (if fetched from server) */
    backendId?: number;
    type: NotificationType;
    title: string;
    message: string;
    route?: string;
    routeParams?: Record<string, string>;
    read: boolean;
    createdAt: string;
}

// ============================================================================
// Notification route mapping & display metadata
// ============================================================================

const NOTIFICATION_ROUTES: Record<NotificationType, string> = {
    bid_placed: "/(tabs)/history",
    bid_accepted: "/(tabs)/history",
    bid_rejected: "/(tabs)/history",
    bid_cancelled: "/(tabs)/history",
    payment_committed: "/(tabs)/history",
    appointment_booked: "/(tabs)/history",
    appointment_accepted: "/(tabs)/history",
    appointment_rejected: "/(tabs)/history",
    docs_released: "/(tabs)/history",
    docs_confirmed: "/(tabs)/history",
    payment_released: "/(tabs)/history",
    transaction_completed: "/(tabs)/history",
    dispute_raised: "/(tabs)/history",
    general: "/(tabs)/home",
};

export const NOTIFICATION_META: Record<
    NotificationType,
    { icon: string; color: string; bgColor: string }
> = {
    bid_placed: { icon: "💰", color: "#92400E", bgColor: "#FEF3C7" },
    bid_accepted: { icon: "✅", color: "#166534", bgColor: "#DCFCE7" },
    bid_rejected: { icon: "❌", color: "#991B1B", bgColor: "#FEE2E2" },
    bid_cancelled: { icon: "🚫", color: "#6B7280", bgColor: "#F3F4F6" },
    payment_committed: { icon: "💳", color: "#1E40AF", bgColor: "#DBEAFE" },
    appointment_booked: { icon: "📅", color: "#0369A1", bgColor: "#E0F2FE" },
    appointment_accepted: { icon: "🤝", color: "#166534", bgColor: "#DCFCE7" },
    appointment_rejected: { icon: "📅", color: "#991B1B", bgColor: "#FEE2E2" },
    docs_released: { icon: "📄", color: "#3730A3", bgColor: "#E0E7FF" },
    docs_confirmed: { icon: "✅", color: "#065F46", bgColor: "#D1FAE5" },
    payment_released: { icon: "💸", color: "#155E75", bgColor: "#CFFAFE" },
    transaction_completed: { icon: "🎉", color: "#065F46", bgColor: "#D1FAE5" },
    dispute_raised: { icon: "⚠️", color: "#991B1B", bgColor: "#FEE2E2" },
    general: { icon: "🔔", color: "#6B7280", bgColor: "#F3F4F6" },
};

// ============================================================================
// State & Reducer
// ============================================================================

interface NotificationState {
    notifications: AppNotification[];
    unreadCount: number;
    loading: boolean;
}

type NotificationAction =
    | { type: "SET_NOTIFICATIONS"; payload: AppNotification[] }
    | { type: "ADD_NOTIFICATION"; payload: AppNotification }
    | { type: "MARK_AS_READ"; payload: string }
    | { type: "MARK_ALL_READ" }
    | { type: "CLEAR_ALL" }
    | { type: "SET_LOADING"; payload: boolean };

function notificationReducer(
    state: NotificationState,
    action: NotificationAction
): NotificationState {
    switch (action.type) {
        case "SET_NOTIFICATIONS":
            return {
                ...state,
                notifications: action.payload,
                unreadCount: action.payload.filter((n) => !n.read).length,
                loading: false,
            };
        case "ADD_NOTIFICATION": {
            // Avoid duplicates by backendId
            if (
                action.payload.backendId &&
                state.notifications.some(
                    (n) => n.backendId === action.payload.backendId
                )
            ) {
                return state;
            }
            const updated = [action.payload, ...state.notifications].slice(0, 100);
            return {
                ...state,
                notifications: updated,
                unreadCount: updated.filter((n) => !n.read).length,
            };
        }
        case "MARK_AS_READ": {
            const updated = state.notifications.map((n) =>
                n.id === action.payload ? { ...n, read: true } : n
            );
            return {
                ...state,
                notifications: updated,
                unreadCount: updated.filter((n) => !n.read).length,
            };
        }
        case "MARK_ALL_READ": {
            const updated = state.notifications.map((n) => ({ ...n, read: true }));
            return { ...state, notifications: updated, unreadCount: 0 };
        }
        case "CLEAR_ALL":
            return { ...state, notifications: [], unreadCount: 0 };
        case "SET_LOADING":
            return { ...state, loading: action.payload };
        default:
            return state;
    }
}

// ============================================================================
// Context Interface
// ============================================================================

interface NotificationContextType extends NotificationState {
    addNotification: (
        type: NotificationType,
        title: string,
        message: string,
        route?: string,
        routeParams?: Record<string, string>
    ) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    refreshNotifications: () => Promise<void>;
    preferences: NotificationPreferences;
    updatePreference: (key: keyof NotificationPreferences, value: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
    undefined
);

// ============================================================================
// Storage helpers
// ============================================================================

const STORAGE_KEY = "app_notifications";
const PREFS_STORAGE_KEY = "notification_preferences";

const DEFAULT_PREFERENCES: NotificationPreferences = {
    allowMessages: true,
    pushNotifications: true,
    emailNotifications: true,
    smsNotifications: true,
};

async function savePreferences(prefs: NotificationPreferences) {
    try {
        await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch (err) {
        console.warn("Failed to save notification preferences:", err);
    }
}

async function loadPreferences(): Promise<NotificationPreferences> {
    try {
        const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
        return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
    } catch {
        return DEFAULT_PREFERENCES;
    }
}

async function cacheNotifications(notifications: AppNotification[]) {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (err) {
        console.warn("Failed to cache notifications:", err);
    }
}

async function loadCachedNotifications(): Promise<AppNotification[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// ============================================================================
// Convert backend notification to app notification
// ============================================================================

function mapBackendNotification(bn: BackendNotification): AppNotification {
    // Map backend event name to app notification type
    const eventToType: Record<string, NotificationType> = {
        bid_accepted: "bid_accepted",
        bid_rejected: "bid_rejected",
        docs_released: "docs_released",
        docs_confirmed: "docs_confirmed",
        payment_released: "payment_released",
        appointment_accepted: "appointment_accepted",
        appointment_rejected: "appointment_rejected",
        transaction_completed: "transaction_completed",
        dispute_raised: "dispute_raised",
    };
    const type = eventToType[bn.event] || "general";

    // Derive title and message from event type since backend sends structured events
    const titleMap: Record<string, string> = {
        bid_accepted: "Bid Accepted",
        bid_rejected: "Bid Rejected",
        docs_released: "Documents Released",
        docs_confirmed: "Documents Confirmed",
        payment_released: "Payment Released",
        appointment_accepted: "Appointment Confirmed",
        appointment_rejected: "Appointment Rejected",
        transaction_completed: "Transaction Complete",
        dispute_raised: "Dispute Raised",
    };

    return {
        id: `backend_${bn.id}`,
        backendId: bn.id,
        type: Object.keys(NOTIFICATION_META).includes(type) ? type : "general",
        title: titleMap[bn.event] || "Notification",
        message: `Transaction ${bn.transaction_id} — ${titleMap[bn.event] || bn.event}`,
        route: NOTIFICATION_ROUTES[type] || NOTIFICATION_ROUTES.general,
        routeParams: bn.metadata_payload as Record<string, string> | undefined,
        read: bn.is_read,
        createdAt: bn.created_at || new Date().toISOString(),
    };
}

// ============================================================================
// Provider
// ============================================================================

export function NotificationProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { wsMessages, getNotifications, markNotificationRead, user } = useApi();
    const userId = user?.id ?? null;
    const [state, dispatch] = useReducer(notificationReducer, {
        notifications: [],
        unreadCount: 0,
        loading: false,
    });
    const [preferences, setPreferences] = React.useState<NotificationPreferences>(DEFAULT_PREFERENCES);

    const processedWsIds = useRef(new Set<string>());

    // Load preferences on mount
    useEffect(() => {
        loadPreferences().then(setPreferences);
    }, []);

    const updatePreference = useCallback(
        (key: keyof NotificationPreferences, value: boolean) => {
            setPreferences((prev) => {
                const updated = { ...prev, [key]: value };
                savePreferences(updated);
                return updated;
            });
        },
        []
    );
    // The user the list was last fetched for. Fetching once on mount ran
    // before sign-in on a fresh visit, got a 401, and never tried again, so
    // a new user saw no server notifications until they reloaded the page.
    const fetchedFor = useRef<number | string | null>(null);

    // ---- Load cached notifications first, then fetch from backend ----

    useEffect(() => {
        // Load cache for instant UI
        loadCachedNotifications().then((cached) => {
            if (cached.length > 0) {
                dispatch({ type: "SET_NOTIFICATIONS", payload: cached });
            }
        });
    }, []);

    // Fetch from backend on mount
    const fetchFromBackend = useCallback(async () => {
        try {
            dispatch({ type: "SET_LOADING", payload: true });
            const response = await getNotifications();
            // getNotifications may return NotificationListResponse or array
            const backendNotifs = Array.isArray(response)
                ? response
                : (response as any)?.data || [];
            if (Array.isArray(backendNotifs)) {
                const mapped = backendNotifs.map(mapBackendNotification);
                // Sort by date (newest first)
                mapped.sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                dispatch({ type: "SET_NOTIFICATIONS", payload: mapped });
                await cacheNotifications(mapped);
            }
        } catch (err) {
            console.warn("Failed to fetch notifications from backend:", err);
            // Keep cached data
        } finally {
            dispatch({ type: "SET_LOADING", payload: false });
        }
    }, [getNotifications]);

    useEffect(() => {
        if (userId == null || fetchedFor.current === userId) return;
        fetchedFor.current = userId;
        fetchFromBackend();
    }, [userId, fetchFromBackend]);

    // ---- Listen for WebSocket messages ----

    useEffect(() => {
        if (!wsMessages || wsMessages.length === 0) return;

        const latest = wsMessages[wsMessages.length - 1];
        if (!latest?.message) return;

        try {
            const data =
                typeof latest.message === "string"
                    ? JSON.parse(latest.message)
                    : latest.message;

            if (!data.type) return;

            const dedupKey = `${data.type}_${data.bidId || ""}_${data.propertyId || ""}_${data.timestamp || ""}`;
            if (processedWsIds.current.has(dedupKey)) return;
            processedWsIds.current.add(dedupKey);

            const typeMap: Record<string, NotificationType> = {
                offer_response:
                    data.status === "accepted" ? "bid_accepted" : "bid_rejected",
                bid_placed: "bid_placed",
                bid_cancelled: "bid_cancelled",
                appointment_booked: "appointment_booked",
                appointment_accepted: "appointment_accepted",
                appointment_rejected: "appointment_rejected",
                docs_released: "docs_released",
                docs_confirmed: "docs_confirmed",
                payment_committed: "payment_committed",
                payment_released: "payment_released",
                transaction_completed: "transaction_completed",
                dispute_raised: "dispute_raised",
            };

            const notifType = typeMap[data.type];
            if (!notifType) return;

            const propertyTitle = data.propertyTitle || "Property";
            const titleMap: Record<NotificationType, string> = {
                bid_placed: "New Bid Received",
                bid_accepted: "Bid Accepted",
                bid_rejected: "Bid Rejected",
                bid_cancelled: "Bid Cancelled",
                payment_committed: "Payment Committed",
                appointment_booked: "Appointment Booked",
                appointment_accepted: "Appointment Confirmed",
                appointment_rejected: "Appointment Rejected",
                docs_released: "Documents Released",
                docs_confirmed: "Documents Confirmed",
                payment_released: "Payment Released",
                transaction_completed: "Transaction Complete",
                dispute_raised: "Dispute Raised",
                general: "Notification",
            };

            const notification: AppNotification = {
                id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: notifType,
                title: titleMap[notifType],
                message: data.message || `${titleMap[notifType]} for "${propertyTitle}"`,
                route: NOTIFICATION_ROUTES[notifType],
                read: false,
                createdAt: data.timestamp || new Date().toISOString(),
            };

            dispatch({ type: "ADD_NOTIFICATION", payload: notification });
        } catch {
            // Not structured — ignore
        }
    }, [wsMessages]);

    // ---- Persist whenever notifications change ----

    useEffect(() => {
        if (state.notifications.length > 0) {
            cacheNotifications(state.notifications);
        }
    }, [state.notifications]);

    // ---- Public methods ----

    const addNotification = useCallback(
        (
            type: NotificationType,
            title: string,
            message: string,
            route?: string,
            routeParams?: Record<string, string>
        ) => {
            // Gate: skip if push notifications are disabled
            if (!preferences.pushNotifications) {
                console.log(`🔕 Notification suppressed (push off): ${title}`);
                return;
            }
            const notification: AppNotification = {
                id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type,
                title,
                message,
                route: route || NOTIFICATION_ROUTES[type],
                routeParams,
                read: false,
                createdAt: new Date().toISOString(),
            };
            dispatch({ type: "ADD_NOTIFICATION", payload: notification });
        },
        [preferences.pushNotifications]
    );

    const markAsRead = useCallback(
        (id: string) => {
            dispatch({ type: "MARK_AS_READ", payload: id });

            // If it has a backend ID, also mark on backend
            const notif = state.notifications.find((n) => n.id === id);
            if (notif?.backendId) {
                markNotificationRead(notif.backendId).catch((err) =>
                    console.warn("Failed to mark notification read on backend:", err)
                );
            }
        },
        [state.notifications, markNotificationRead]
    );

    const markAllAsRead = useCallback(() => {
        dispatch({ type: "MARK_ALL_READ" });

        // Mark all backend notifications as read
        state.notifications
            .filter((n) => !n.read && n.backendId)
            .forEach((n) => {
                markNotificationRead(n.backendId!).catch(() => { });
            });
    }, [state.notifications, markNotificationRead]);

    const clearAll = useCallback(() => {
        dispatch({ type: "CLEAR_ALL" });
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => { });
    }, []);

    const refreshNotifications = useCallback(async () => {
        await fetchFromBackend();
    }, [fetchFromBackend]);

    return (
        <NotificationContext.Provider
            value={{
                ...state,
                addNotification,
                markAsRead,
                markAllAsRead,
                clearAll,
                refreshNotifications,
                preferences,
                updatePreference,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error(
            "useNotifications must be used within a NotificationProvider"
        );
    }
    return context;
}
