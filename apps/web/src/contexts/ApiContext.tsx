import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "@/lib/appState";
import type { FilterValues } from "@/utilities/searchFilters";
import AsyncStorage from "@/lib/storage";
import { getRememberedProfile } from "@/utilities/profileStorage";
import apiService, {
  UserShow,
  Token,
  UserCreate,
  UserUpdate,
  PropertyShow,
  PropertyBase,
  PropertyUpdate,
  AppointmentSchema,
  AppointmentShow,
  AccountInfoBase,
  AccountInfoShow,
  AgentAvailabilitySchema,
  AvailabilityShow,
  ContractCreate,
  ContractResponse,
  PropertyFeed,
  AgentFeed,
  ChatMessageSchema,
  ConversationSchema,
  FileShow,
  IPFSResponse,
  TransactionFeedItem,
  TransactionListResponse,
  DocumentUploadResult,
  TransactionNotificationPayload,
  WalletUserInfo,
  BackendNotification,
  NotificationListResponse,
  TransactionUpdatePayload,
  RegisterDevicePayload,
  RatingCreate,
  RatingShow,
  SocialLoginRequest,
  KycStartParams,
  KycStartResponse,
  KycStatusResponse,
  KycVerifiedResponse,
  PropertySearchParams,
  PropertySearchResult,
  MintedPropertyCreate,
  MintedPropertyShow,
  MintedPropertyLinkResponse,
  API_BASE_URL,
} from "../services/api";
import {
  getUserFriendlyError,
  categorizeError,
  logError,
  shouldRetry as shouldRetryError
} from "../utilities/errorUtils";
import { clearAllCachedLists } from "../services/listCache";

// State interface
interface ApiState {
  // Authentication
  isAuthenticated: boolean;
  token: string | null;
  user: UserShow | null;

  // Loading states
  isLoading: boolean;
  isInitializing: boolean;

  // Data states
  properties: PropertyShow[];
  myListings: PropertyShow[];
  appointments: AppointmentShow[];
  paymentInfo: AccountInfoShow[];
  schedule: AvailabilityShow[];
  chatHistory: ChatMessageSchema[];

  // Pagination
  propertyFeed: PropertyFeed | null;

  // Categories
  selectedCategory: string;
  // What the filter screen last applied, or null for "no filters". Held here
  // beside the category and the search query because the screen that sets it
  // navigates away immediately — it has nowhere of its own to keep it.
  activeFilters: Partial<FilterValues> | null;

  // Search and Favorites
  searchQuery: string;
  favorites: number[];

  // WebSocket
  wsMessages: ChatMessageSchema[];
  wsStatus: "connecting" | "connected" | "disconnected" | "error";

  /**
   * Bumped whenever conversation read-state changes (currently by
   * markMessagesAsRead). Consumers that derive an unread count watch this so
   * the Inbox badge clears the moment a chat is opened, instead of lagging
   * behind by a poll interval.
   */
  conversationsVersion: number;

  // Cache (Short-term memory)
  propertyCache: Record<number, PropertyShow>;
  agentCache: Record<number, AgentFeed>;

  // Error handling
  error: string | null;
}

// Action types
type ApiAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_INITIALIZING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_TOKEN"; payload: string | null }
  | { type: "SET_USER"; payload: UserShow | null }
  | { type: "SET_AUTHENTICATED"; payload: boolean }
  | { type: "SET_PROPERTIES"; payload: PropertyShow[] }
  | { type: "SET_MY_LISTINGS"; payload: PropertyShow[] }
  | { type: "SET_APPOINTMENTS"; payload: AppointmentShow[] }
  | { type: "SET_PAYMENT_INFO"; payload: AccountInfoShow[] }
  | { type: "SET_SCHEDULE"; payload: AvailabilityShow[] }
  | { type: "SET_CHAT_HISTORY"; payload: ChatMessageSchema[] }
  | { type: "ADD_WS_MESSAGE"; payload: ChatMessageSchema }
  | { type: "SET_WS_STATUS"; payload: "connecting" | "connected" | "disconnected" | "error" }
  | { type: "CLEAR_WS_MESSAGES" }
  | { type: "BUMP_CONVERSATIONS_VERSION" }
  | { type: "SET_PROPERTY_FEED"; payload: PropertyFeed }
  | { type: "SET_SELECTED_CATEGORY"; payload: string }
  | { type: "SET_ACTIVE_FILTERS"; payload: Partial<FilterValues> | null }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_FAVORITES"; payload: number[] }
  | { type: "TOGGLE_FAVORITE"; payload: number }
  | { type: "ADD_PROPERTY"; payload: PropertyShow }
  | { type: "UPDATE_PROPERTY"; payload: PropertyShow }
  | { type: "DELETE_PROPERTY"; payload: number }
  | { type: "CACHE_PROPERTY"; payload: PropertyShow }
  | { type: "CACHE_AGENT"; payload: AgentFeed & { id: number } }
  | { type: "ADD_APPOINTMENT"; payload: AppointmentShow }
  | { type: "UPDATE_APPOINTMENT"; payload: AppointmentShow }
  | { type: "DELETE_APPOINTMENT"; payload: number }
  | { type: "ADD_PAYMENT_INFO"; payload: AccountInfoShow }
  | { type: "UPDATE_PAYMENT_INFO"; payload: AccountInfoShow }
  | { type: "DELETE_PAYMENT_INFO"; payload: number }
  | { type: "ADD_AVAILABILITY"; payload: AvailabilityShow }
  | { type: "UPDATE_AVAILABILITY"; payload: AvailabilityShow }
  | { type: "DELETE_AVAILABILITY"; payload: number }
  | { type: "RESET_STATE" };

// Initial state
const initialState: ApiState = {
  isAuthenticated: false,
  token: null,
  user: null,
  isLoading: false,
  isInitializing: true,
  properties: [],
  myListings: [],
  appointments: [],
  paymentInfo: [],
  schedule: [],
  chatHistory: [],
  wsMessages: [],
  wsStatus: "disconnected",
  conversationsVersion: 0,
  propertyFeed: null,
  selectedCategory: "All",
  activeFilters: null,
  searchQuery: "",
  favorites: [],
  propertyCache: {},
  agentCache: {},
  error: null,
};

// Reducer
function apiReducer(state: ApiState, action: ApiAction): ApiState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_INITIALIZING":
      return { ...state, isInitializing: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_TOKEN":
      if (!action.payload) {
        return {
          ...state,
          token: null,
          user: null,
          isAuthenticated: false,
          propertyCache: {},
          agentCache: {}
        };
      }
      return { ...state, token: action.payload };
    case "SET_USER":
      return { ...state, user: action.payload };
    case "SET_AUTHENTICATED":
      return { ...state, isAuthenticated: action.payload };
    case "SET_PROPERTIES":
      return { ...state, properties: action.payload };
    case "SET_MY_LISTINGS":
      return { ...state, myListings: action.payload };
    case "SET_APPOINTMENTS":
      return { ...state, appointments: action.payload };
    case "SET_PAYMENT_INFO":
      return { ...state, paymentInfo: action.payload };
    case "SET_SCHEDULE":
      return { ...state, schedule: action.payload };
    case "SET_CHAT_HISTORY":
      return { ...state, chatHistory: action.payload };
    case "ADD_WS_MESSAGE":
      // Improved deduplication: check message, sender, and a small time window (5s)
      // to handle client-side vs server-side timestamp differences
      const exists = state.wsMessages.some(m =>
        m.message === action.payload.message &&
        m.sender_id === action.payload.sender_id &&
        Math.abs(new Date(m.timestamp || 0).getTime() - new Date(action.payload.timestamp || 0).getTime()) < 5000
      );
      if (exists) return state;
      // wsMessages is a live-delta buffer, not the source of truth (chat
      // screens merge it with the real persisted history from
      // getMessageHistory) — safe to cap so a long session doesn't grow this
      // unbounded, now that the socket stays connected for the whole app
      // session instead of just while a chat screen happens to be open.
      return {
        ...state,
        wsMessages: [...state.wsMessages, action.payload].slice(-200),
      };
    case "SET_WS_STATUS":
      return { ...state, wsStatus: action.payload };
    case "CLEAR_WS_MESSAGES":
      return { ...state, wsMessages: [] };
    case "BUMP_CONVERSATIONS_VERSION":
      return { ...state, conversationsVersion: state.conversationsVersion + 1 };
    case "SET_PROPERTY_FEED":
      return { ...state, propertyFeed: action.payload };
    case "SET_SELECTED_CATEGORY":
      return { ...state, selectedCategory: action.payload };
    case "SET_ACTIVE_FILTERS":
      return { ...state, activeFilters: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "SET_FAVORITES":
      return { ...state, favorites: action.payload };
    case "TOGGLE_FAVORITE":
      const isFavorite = state.favorites.includes(action.payload);
      const newFavorites = isFavorite
        ? state.favorites.filter((id) => id !== action.payload)
        : [...state.favorites, action.payload];
      return { ...state, favorites: newFavorites };
    case "ADD_PROPERTY":
      if (!action.payload) return state;
      return {
        ...state,
        properties: [action.payload, ...state.properties],
        myListings: [action.payload, ...state.myListings],
      };
    case "UPDATE_PROPERTY":
      return {
        ...state,
        properties: state.properties.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
        myListings: state.myListings.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case "DELETE_PROPERTY":
      return {
        ...state,
        properties: state.properties.filter((p) => p.id !== action.payload),
        myListings: state.myListings.filter((p) => p.id !== action.payload),
        propertyCache: { ...state.propertyCache, [action.payload]: undefined as any }
      };
    case "CACHE_PROPERTY":
      return {
        ...state,
        propertyCache: { ...state.propertyCache, [action.payload.id]: action.payload }
      };
    case "CACHE_AGENT":
      return {
        ...state,
        agentCache: { ...state.agentCache, [action.payload.id]: action.payload }
      };
    case "ADD_APPOINTMENT":
      return {
        ...state,
        appointments: [...state.appointments, action.payload],
      };
    case "UPDATE_APPOINTMENT":
      return {
        ...state,
        appointments: state.appointments.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case "DELETE_APPOINTMENT":
      return {
        ...state,
        appointments: state.appointments.filter((a) => a.id !== action.payload),
      };
    case "ADD_PAYMENT_INFO":
      return { ...state, paymentInfo: [...state.paymentInfo, action.payload] };
    case "UPDATE_PAYMENT_INFO":
      return {
        ...state,
        paymentInfo: state.paymentInfo.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case "DELETE_PAYMENT_INFO":
      return {
        ...state,
        paymentInfo: state.paymentInfo.filter((p) => p.id !== action.payload),
      };
    case "ADD_AVAILABILITY":
      return { ...state, schedule: [...state.schedule, action.payload] };
    case "UPDATE_AVAILABILITY":
      return {
        ...state,
        schedule: state.schedule.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case "DELETE_AVAILABILITY":
      return {
        ...state,
        schedule: state.schedule.filter((a) => a.id !== action.payload),
      };
    case "RESET_STATE":
      return { ...initialState, isInitializing: false };
    default:
      return state;
  }
}

// Context interface
interface ApiContextType extends ApiState {
  // Authentication methods
  signup: (userData: UserCreate) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: (options?: { loading?: boolean }) => Promise<void>;
  verifyAccount: () => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string | number) => Promise<void>;
  refreshToken: () => Promise<void>;
  switchAccount: (accountType: "client" | "agent") => Promise<void>;

  // User methods
  getMe: (options?: RequestInit & { timeout?: number; silent?: boolean }) => Promise<UserShow | null>;
  updateMe: (userData: UserUpdate) => Promise<void>;
  deleteAccount: () => Promise<void>;

  // Property methods
  getProperties: (limit?: number, cursor?: number, options?: RequestInit & { timeout?: number, silent?: boolean }) => Promise<void>;
  getMyListings: (options?: RequestInit & { timeout?: number; silent?: boolean }) => Promise<void>;
  listProperty: (propertyData: PropertyBase) => Promise<PropertyShow | null>;
  updateProperty: (
    propertyId: number,
    propertyData: PropertyUpdate
  ) => Promise<void>;
  deleteProperty: (propertyId: number) => Promise<void>;
  getAgentProfile: (agentId: number, options?: { silent?: boolean; forceRefresh?: boolean }) => Promise<AgentFeed>;
  getPropertyById: (propertyId: number, options?: RequestInit & { timeout?: number; silent?: boolean; forceRefresh?: boolean }) => Promise<PropertyShow>;

  // Appointment methods
  bookAppointment: (appointmentData: AppointmentSchema) => Promise<void>;
  cancelAppointment: (appointmentId: number) => Promise<void>;

  // Payment methods
  createPaymentInfo: (accountInfo: AccountInfoBase) => Promise<void>;
  getPaymentInfo: (userId?: number) => Promise<void>;
  updatePaymentInfo: (
    accountInfoId: number,
    accountInfo: AccountInfoBase
  ) => Promise<void>;
  deleteAccountInfo: (accountInfoId: number) => Promise<void>;

  // Schedule methods
  createAvailableTime: (availability: AgentAvailabilitySchema) => Promise<void>;
  getSchedule: () => Promise<AvailabilityShow[]>;
  updateSchedule: (
    scheduleId: number,
    availability: AgentAvailabilitySchema
  ) => Promise<void>;
  deleteSchedule: (scheduleId: number) => Promise<void>;

  // Contract methods
  createContract: (contractData: ContractCreate) => Promise<ContractResponse>;
  confirmPayment: (contractId: number) => Promise<void>;
  approvePayment: (contractId: number) => Promise<void>;

  // Chat methods
  getChatHistory: () => Promise<void>;
  getConversations: () => Promise<any[]>;
  getMessageHistory: (receiverId: number) => Promise<ChatMessageSchema[]>;
  sendMessage: (messageData: ChatMessageSchema) => Promise<void>;
  markMessagesAsRead: (senderId: number) => Promise<void>;
  getUnreadCount: () => Promise<{ count: number }>;

  // WebSocket Chat
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  sendWsMessage: (messageData: ChatMessageSchema) => boolean;
  clearWsMessages: () => void;

  // Media methods
  uploadFile: (type: "profile" | "property", file: any) => Promise<FileShow>;
  getFiles: (type: "profile" | "property") => Promise<FileShow[]>;

  // Transaction lifecycle methods
  getTransactions: (status?: "ongoing" | "completed" | "cancelled") => Promise<TransactionFeedItem[]>;
  uploadTransactionDocuments: (bidId: number, images: Array<{ uri: string; fileName?: string; mimeType?: string }>, description?: string) => Promise<DocumentUploadResult>;
  sendTransactionNotification: (payload: TransactionNotificationPayload) => Promise<void>;
  getUserByWallet: (walletId: string) => Promise<WalletUserInfo>;
  registerWallet: (walletId: string) => Promise<void>;

  // Notification API
  getNotifications: () => Promise<BackendNotification[]>;
  sendTransactionUpdate: (payload: TransactionUpdatePayload) => Promise<void>;
  markNotificationRead: (notificationId: number) => Promise<void>;
  registerNotificationDevice: (payload: RegisterDevicePayload) => Promise<void>;

  // Rating API
  createRating: (payload: RatingCreate) => Promise<RatingShow>;
  getPropertyRatings: (propertyId: number) => Promise<RatingShow[]>;
  getUserRatings: (rateeId: number) => Promise<RatingShow[]>;

  // Social Login
  socialLogin: (payload: SocialLoginRequest) => Promise<{ isNewUser: boolean }>;

  // Forgot Password
  forgotPassword: (email: string) => Promise<void>;
  verifyForgotPassword: (email: string, otp: string) => Promise<void>;

  // Get User By ID
  getUserById: (userId: number) => Promise<UserShow>;

  // Confirm Appointment (agent)
  confirmAppointment: (appointmentId: number) => Promise<void>;

  // KYC
  startKycVerification: (params: KycStartParams) => Promise<KycStartResponse>;
  getKycStatus: (verificationId: string) => Promise<KycStatusResponse>;
  isUserVerified: (userId: number) => Promise<KycVerifiedResponse>;

  // Advanced Search
  searchProperties: (params: PropertySearchParams) => Promise<PropertySearchResult>;

  // IPFS Upload
  uploadToIpfs: (files: any[]) => Promise<IPFSResponse[]>;

  // Minted Properties
  registerMintedProperty: (data: MintedPropertyCreate) => Promise<MintedPropertyShow>;
  createListingFromMinted: (mintedId: number, propertyData: PropertyBase) => Promise<MintedPropertyLinkResponse>;

  // Utility methods
  setSelectedCategory: (category: string) => void;
  setActiveFilters: (filters: Partial<FilterValues> | null) => void;
  setSearchQuery: (query: string) => void;
  toggleFavorite: (propertyId: number) => Promise<void>;
  clearError: () => void;
}

// Create context
const ApiContext = createContext<ApiContextType | undefined>(undefined);

// Provider component
interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const [state, dispatch] = useReducer(apiReducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);

  // Set right before an intentional close (logout, explicit disconnectWebSocket
  // call) so onclose can tell "we did this on purpose" apart from a dropped
  // connection — previously nothing distinguished the two, so the socket
  // simply died on any network blip, backend restart, or idle-connection
  // drop (Render/Cloudflare both silently close idle WS connections) and
  // never came back until the user happened to re-enter the chat screen.
  const manualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // WebSocket Chat methods
  const connectWebSocket = useCallback(() => {
    clearReconnectTimer();

    if (!state.user?.id) {
      console.log("⚠️ WebSocket: No user ID available for connection");
      return;
    }

    // If already connecting or open, don't start a new one
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log("⚠️ WebSocket: Already connecting or connected");
      return;
    }

    manualDisconnectRef.current = false;
    dispatch({ type: "SET_WS_STATUS", payload: "connecting" });

    if (!state.token) {
      console.log("⚠️ WebSocket: No token available for authentication");
      dispatch({ type: "SET_WS_STATUS", payload: "error" });
      return;
    }

    // This now runs automatically for the whole authenticated session
    // (previously only reachable by manually opening the chat screen), so a
    // misconfigured/missing API_BASE_URL is no longer a narrow edge case —
    // let it fail as a clear, recoverable "error" status instead of an
    // uncaught TypeError thrown out of a useEffect.
    if (!API_BASE_URL) {
      console.error("⚠️ WebSocket: API_BASE_URL is not configured, cannot connect");
      dispatch({ type: "SET_WS_STATUS", payload: "error" });
      return;
    }
    console.log("🔑 WebSocket: Attempting connection with token:", state.token.substring(0, 10) + "...")

    const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/chat/${state.user.id}?token=${encodeURIComponent(state.token)}`;
    console.log(`🔌 WebSocket: Attempting connection to: ${wsUrl.split('token=')[0]}token=***`);

    // Some backends expect the token in the protocol if query param fails or alongside it
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("✅ WebSocket: Connected");
      reconnectAttemptsRef.current = 0;
      dispatch({ type: "SET_WS_STATUS", payload: "connected" });
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📥 WebSocket: Message received:", data);

        if (data.message) {
          // Wrap in ChatMessageSchema format if needed
          const formattedMsg: ChatMessageSchema = {
            sender_id: data.sender_info?.id || data.sender_id,
            receiver_id: data.receiver_id,
            message: data.message,
            timestamp: data.created_at || data.timestamp || new Date().toISOString(),
            property_id: data.property_id
          };
          dispatch({ type: "ADD_WS_MESSAGE", payload: formattedMsg });
        }
      } catch (err) {
        console.error("❌ WebSocket: Failed to parse message:", err);
      }
    };

    socket.onerror = (error) => {
      console.error("❌ WebSocket: Error:", error);
      dispatch({ type: "SET_WS_STATUS", payload: "error" });
    };

    socket.onclose = (event) => {
      console.log("🔌 WebSocket: Disconnected", event.reason);
      dispatch({ type: "SET_WS_STATUS", payload: "disconnected" });
      wsRef.current = null;

      if (manualDisconnectRef.current) {
        return;
      }

      // Exponential backoff with jitter, capped at 30s — same shape as
      // config/walletConfig.ts's getRetryDelay, tuned for a connection retry
      // instead of a single RPC call (starts faster, same cap).
      const attempt = reconnectAttemptsRef.current;
      reconnectAttemptsRef.current = attempt + 1;
      const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.max(500, baseDelay + jitter);

      console.log(`🔁 WebSocket: Reconnecting in ${Math.round(delay)}ms (attempt ${attempt + 1})`);
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };

    wsRef.current = socket;
  }, [state.user?.id, state.token, clearReconnectTimer]);

  const disconnectWebSocket = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    if (wsRef.current) {
      console.log("🔌 WebSocket: Manually disconnecting");
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearReconnectTimer]);

  const sendWsMessage = useCallback((messageData: ChatMessageSchema) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("📤 WebSocket: Sending message:", messageData);
      wsRef.current.send(JSON.stringify(messageData));

      // Also add to local wsMessages for immediate UI update
      dispatch({
        type: "ADD_WS_MESSAGE",
        payload: { ...messageData, timestamp: new Date().toISOString() }
      });
      return true;
    } else {
      console.warn("⚠️ WebSocket: Cannot send message, not connected");
      return false;
    }
  }, []);

  const clearWsMessages = useCallback(() => {
    dispatch({ type: "CLEAR_WS_MESSAGES" });
  }, []);

  // Connect for the whole authenticated session, not just while a chat
  // screen happens to be mounted — that scoping (the previous behavior) is
  // why messages/notifications only arrived in real time while the user was
  // actively inside one specific conversation. Every other screen (Inbox
  // list, Home, Activities) had no live socket at all and was silently
  // relying on polling fallbacks.
  useEffect(() => {
    if (state.user?.id && state.token) {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.user?.id, state.token]);

  // Mobile OS can suspend/kill a backgrounded socket outright; when the app
  // returns to the foreground, verify the connection actually survived and
  // reconnect if not — don't wait for the next user-initiated action to
  // discover it's dead.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (
        nextState === "active" &&
        state.user?.id &&
        state.token &&
        wsRef.current?.readyState !== WebSocket.OPEN &&
        wsRef.current?.readyState !== WebSocket.CONNECTING
      ) {
        console.log("📱 WebSocket: App foregrounded, verifying connection");
        connectWebSocket();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [state.user?.id, state.token, connectWebSocket]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      // Without this, onclose still sees manualDisconnectRef as false and
      // schedules a reconnect via setTimeout — which then fires after the
      // provider is already gone, dispatching into a stale closure. ApiProvider
      // normally mounts once for the app's lifetime, so this is mostly a
      // safety net for remounts (Fast Refresh, tests), but a dangling timer
      // outliving its component is a real leak either way.
      manualDisconnectRef.current = true;
      clearReconnectTimer();
      if (wsRef.current) {
        console.log("🔌 WebSocket: Cleaning up on unmount");
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimer]);

  // Initialize app
  useEffect(() => {
    const controller = new AbortController();
    initializeApp(controller.signal);
    return () => controller.abort();
  }, []);

  const initializeApp = async (signal?: AbortSignal) => {
    try {
      dispatch({ type: "SET_INITIALIZING", payload: true });
      console.log("🔄 Initializing app...");

      // Check for existing token and user data
      const [token, userDataString, favoritesString] = await Promise.all([
        AsyncStorage.getItem("auth_token"),
        AsyncStorage.getItem("user_data"),
        AsyncStorage.getItem("user_favorites"),
      ]);

      if (favoritesString) {
        dispatch({ type: "SET_FAVORITES", payload: JSON.parse(favoritesString) });
      }

      console.log("📱 Stored data found:", {
        hasToken: !!token,
        hasUserData: !!userDataString,
        favoritesCount: favoritesString ? JSON.parse(favoritesString).length : 0,
      });

      if (token && userDataString) {
        try {
          console.log("🔐 Attempting auto-login with stored data...");

          // Set token in API service
          await apiService.setToken(token);

          // Parse user data
          const userData = JSON.parse(userDataString);
          console.log("👤 Stored user data:", userData);

          // Verify token is still valid by making a test API call
          const user = await apiCall(
            () => apiService.getMe({ signal, silent: true }),
            undefined,
            { silent: true }
          );

          // If request was aborted (e.g. component unmounted), bail out silently
          if (signal?.aborted) {
            console.log("⏹️ Init aborted, skipping state updates");
            return;
          }
          console.log("✅ Token is valid, user data:", user);

          // If successful, set authentication state
          dispatch({ type: "SET_TOKEN", payload: token });
          dispatch({ type: "SET_USER", payload: user });
          dispatch({ type: "SET_AUTHENTICATED", payload: true });

          // Update stored user data with fresh data from API
          await AsyncStorage.setItem("user_data", JSON.stringify(user));
          console.log("💾 Updated stored user data");
        } catch (error: any) {
          // If aborted, bail out silently — don't clear auth data
          if (signal?.aborted || error?.name === "AbortError" || error?.message?.includes("canceled") || error?.message?.includes("aborted")) {
            console.log("⏹️ Init request was canceled, skipping cleanup");
            return;
          }
          // Couldn't reach the server at all (offline, a dropped connection,
          // a request cut off by navigation). That says nothing about the
          // token, so keep the stored session instead of signing the user
          // out; the next request that reaches the server settles it.
          const msg = String(error?.message ?? error ?? "");
          const unreachable =
            error?.name === "TypeError" ||
            /failed to fetch|networkerror|network request failed|load failed|timed? ?out|unreachable/i.test(msg);
          if (unreachable) {
            let storedUser: any = null;
            try {
              storedUser = JSON.parse(userDataString);
            } catch {
              // Unreadable stored profile: fall through to a clean sign-out.
            }
            if (storedUser) {
              console.warn("Couldn't reach the server to check the session; keeping it:", msg);
              dispatch({ type: "SET_TOKEN", payload: token });
              dispatch({ type: "SET_USER", payload: storedUser });
              dispatch({ type: "SET_AUTHENTICATED", payload: true });
              return;
            }
          }
          // Token might be expired, clear everything
          console.log(
            "❌ Token expired or invalid, clearing auth data:",
            error
          );
          await AsyncStorage.multiRemove(["auth_token", "user_data"]);
          await apiService.clearToken();
          dispatch({ type: "SET_TOKEN", payload: null });
          dispatch({ type: "SET_USER", payload: null });
          dispatch({ type: "SET_AUTHENTICATED", payload: false });
        }
      } else {
        // No stored data, ensure clean state
        console.log("📱 No stored authentication data found");
        dispatch({ type: "SET_TOKEN", payload: null });
        dispatch({ type: "SET_USER", payload: null });
        dispatch({ type: "SET_AUTHENTICATED", payload: false });
      }
    } catch (error) {
      console.error("❌ Failed to initialize app:", error);
      dispatch({ type: "SET_ERROR", payload: "Failed to initialize app" });
    } finally {
      dispatch({ type: "SET_INITIALIZING", payload: false });
      console.log("✅ App initialization completed");
    }
  };

  // Wrapper for API calls with error handling
  const apiCall = useCallback(
    async (
      apiMethod: () => Promise<any>,
      successAction?: (data: any) => void,
      options: { silent?: boolean; loading?: boolean } = { loading: true }
    ) => {
      // Silent calls (background refreshes, auto-login checks) must not flip the
      // global isLoading flag — it's read directly by unrelated screens (e.g. the
      // login/signup submit buttons), so a silent fetch elsewhere would falsely
      // show them as "submitting". Only show loading when explicitly requested.
      const showLoading = options.loading === true || (options.loading === undefined && !options.silent);
      try {
        if (showLoading) {
          dispatch({ type: "SET_LOADING", payload: true });
        }
        if (!options.silent) {
          dispatch({ type: "SET_ERROR", payload: null });
        }

        const result = await apiMethod();

        // If the service returns our ApiResponse<T> shape, unwrap it
        if (result && typeof result === "object" && "ok" in result) {
          if (result.ok) {
            if (successAction) successAction(result.data);
            return result.data;
          }

          // Handle canceled requests specially — skip error dispatch entirely
          if (result.canceled) {
            console.log("⏹️ Request was canceled, skipping error handling");
            throw new Error("Request canceled");
          }

          const errorDetail = result.error?.detail;
          let errMsg = "Request failed";

          if (Array.isArray(errorDetail) && errorDetail.length > 0) {
            errMsg = errorDetail
              .map((e: any) => {
                if (typeof e === "string") return e;
                if (e.msg) {
                  const field =
                    e.loc && Array.isArray(e.loc)
                      ? e.loc[e.loc.length - 1]
                      : "";
                  return field ? `${field}: ${e.msg}` : e.msg;
                }
                return JSON.stringify(e);
              })
              .join(", ");
          } else if (errorDetail && typeof errorDetail === "object" && errorDetail.msg) {
            errMsg = errorDetail.msg;
          } else if (typeof errorDetail === "string") {
            errMsg = errorDetail;
          } else if (typeof result.error === "string") {
            errMsg = result.error;
          } else if (result.error?.message) {
            errMsg = result.error.message;
          } else if (result.error?.error) {
            errMsg = result.error.error;
          }

          // Log the error with context
          if (!options.silent) {
            logError(errMsg, 'ApiContext');

            // Use user-friendly error message
            const userFriendlyMessage = getUserFriendlyError(errMsg);
            dispatch({ type: "SET_ERROR", payload: userFriendlyMessage });
            console.error("API Call Failed (api response):", result.error);
          }
          throw new Error(String(errMsg));
        }

        // Otherwise assume it's direct data
        if (successAction) successAction(result);
        return result;
      } catch (error: any) {
        const isCanceled = error?.name === "AbortError" || error?.message === "Request canceled" || error?.message === "Request aborted";
        if (!options.silent && !isCanceled) {
          // Log the error
          logError(error, 'ApiContext');

          // Get user-friendly message
          const userFriendlyMessage = getUserFriendlyError(error);

          console.error("API Call Threw:", error);
          dispatch({ type: "SET_ERROR", payload: userFriendlyMessage });
        }
        throw error;
      } finally {
        if (showLoading) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
    },
    [dispatch]
  );
  // const apiCall = async (
  //   apiMethod: () => Promise<any>,
  //   successAction?: (data: any) => void
  // ): Promise<any> => {
  //   try {
  //     dispatch({ type: "SET_LOADING", payload: true });
  //     dispatch({ type: "SET_ERROR", payload: null });

  //     const result = await apiMethod();

  //     if (successAction) {
  //       successAction(result);
  //     }

  //     return result;
  //   } catch (error) {
  //     const errorMessage =
  //       error instanceof Error ? error.message : "An error occurred";
  //     dispatch({ type: "SET_ERROR", payload: errorMessage });
  //     throw error;
  //   } finally {
  //     dispatch({ type: "SET_LOADING", payload: false });
  //   }
  // };

  // User methods (defined first to avoid hoisting issues)
  const getMe = useCallback(
    async (options?: RequestInit & { timeout?: number; silent?: boolean }) => {
      const silent = options?.silent;
      const user = await apiCall(() => apiService.getMe(options), undefined, { silent });
      if (!user) return null;

      dispatch({ type: "SET_USER", payload: user });

      // Save user data to AsyncStorage
      await AsyncStorage.setItem("user_data", JSON.stringify(user));
      return user;
    },
    [apiCall, dispatch]
  );

  // Authentication methods
  const signup = useCallback(async (userData: UserCreate) => {
    console.log("🚀 Starting signup process...", userData);

    // Get the signup response which should include user data and token
    const signupResponse = await apiCall(() => apiService.signup(userData));
    console.log("✅ Signup response:", signupResponse);

    // Handle the new response structure: { token: { access_token }, user_data: {...} }
    const accessToken = signupResponse?.token?.access_token;
    if (accessToken) {
      await apiService.setToken(accessToken);
      await AsyncStorage.setItem("auth_token", accessToken);
      console.log("💾 Token saved to AsyncStorage");

      dispatch({ type: "SET_TOKEN", payload: accessToken });
      dispatch({ type: "SET_AUTHENTICATED", payload: true });

      // Set user data from the response
      if (signupResponse?.user_data) {
        dispatch({ type: "SET_USER", payload: signupResponse.user_data });
        await AsyncStorage.setItem(
          "user_data",
          JSON.stringify(signupResponse.user_data)
        );
        console.log(
          "💾 User data saved to AsyncStorage:",
          signupResponse.user_data
        );
      }
    }

    console.log("✅ Signup completed successfully (OTP verification disabled)");
  }, [apiCall, dispatch]);

  const login = useCallback(async (identifier: string, password: string) => {
    console.log("🔐 Starting login process...", { identifier });

    try {
      // A remembered choice lets the server resolve the right row on the
      // first request. Without it login resolves buyer and the chooser
      // switches afterwards — correct, but a second round trip that a
      // returning seller shouldn't have to pay on every sign-in.
      const rememberedProfile = await getRememberedProfile();
      const result = await apiCall(() =>
        apiService.login(identifier, password, rememberedProfile ?? undefined)
      );
      console.log("✅ Login API response received");

      if (!result) {
        throw new Error("No response from login service");
      }

      const token = result.access_token;
      if (!token) {
        throw new Error("No access token in response");
      }

      // Set token first
      await apiService.setToken(token);
      await AsyncStorage.setItem("auth_token", token);
      console.log("💾 Token saved to AsyncStorage");

      dispatch({ type: "SET_TOKEN", payload: token });

      // Fetch user data before marking as authenticated
      try {
        console.log("📡 Fetching user data...");
        await getMe();

        // Only mark as authenticated after successfully fetching user data
        dispatch({ type: "SET_AUTHENTICATED", payload: true });
        console.log("✅ Login completed successfully");
      } catch (userError: any) {
        console.error("❌ Failed to get user data:", userError);

        // Rollback authentication
        await apiService.setToken("");
        await AsyncStorage.removeItem("auth_token");
        dispatch({ type: "SET_TOKEN", payload: null });
        dispatch({ type: "SET_AUTHENTICATED", payload: false });

        throw new Error("Failed to verify user session. Please try again.");
      }
    } catch (error: any) {
      console.error("❌ Login failed:", error);

      // Set user-friendly error messages
      let errorMessage = "Login failed. Please try again.";

      if (error.message?.includes("Network") || error.message?.includes("fetch")) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        errorMessage = "Incorrect username or password.";
      } else if (error.message?.includes("404") || error.message?.includes("Not Found")) {
        errorMessage = "Account not found. Please check your credentials or sign up.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      dispatch({ type: "SET_ERROR", payload: errorMessage });
      throw error;
    }
  }, [apiCall, dispatch, getMe]);

  const logout = useCallback(async (options?: { loading?: boolean }) => {
    console.log("🚪 Starting logout process...");

    // Disconnect WebSocket first
    disconnectWebSocket();

    try {
      // Use the provided loading option or default to true
      await apiCall(() => apiService.logout(), undefined, { loading: options?.loading ?? true });
      console.log("✅ Logout API call successful");
    } catch (error) {
      console.log(
        "⚠️ Logout API call failed, but continuing with local cleanup:",
        error
      );
    }

    // Clear AsyncStorage
    await AsyncStorage.multiRemove(["auth_token", "user_data"]);
    console.log("🗑️ Cleared AsyncStorage data");

    // Drop primed Inbox/Activity lists too — they're account-scoped, but a
    // shared device shouldn't leave one user's conversations and deals on
    // disk for the next person who signs in.
    await clearAllCachedLists();
    console.log("🗑️ Cleared cached lists");

    await apiService.clearToken();
    console.log("🗑️ Cleared API service token");

    dispatch({ type: "RESET_STATE" });
    console.log("🔄 Reset application state");
    console.log("✅ Logout completed successfully");
  }, [apiCall, dispatch]);

  // Requires the current password (POST /auth/change-password), so an open
  // session alone cannot be used to lock the owner out. The response carries
  // a fresh token, which replaces the old one.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const token = await apiCall(() => apiService.changePassword(currentPassword, newPassword));
    if (token?.access_token) {
      await apiService.setToken(token.access_token);
      dispatch({ type: "SET_TOKEN", payload: token.access_token });
    }
  }, [apiCall, dispatch]);

  const verifyAccount = useCallback(async () => {
    const token = await apiCall(() => apiService.verifyAccount());
    if (!token) return;
    await apiService.setToken(token.access_token);
    dispatch({ type: "SET_TOKEN", payload: token.access_token });
    dispatch({ type: "SET_AUTHENTICATED", payload: true });
  }, [apiCall, dispatch]);

  const resetPassword = useCallback(async (password: string) => {
    console.log("🔐 Starting password reset...");

    const token = await apiCall(() => apiService.resetPassword(password));
    if (!token) return;
    console.log("✅ Password reset successful, token received:", token);

    await apiService.setToken(token.access_token);
    console.log("🔑 Token set in API service");

    // Save token to AsyncStorage
    await AsyncStorage.setItem("auth_token", token.access_token);
    console.log("💾 Token saved to AsyncStorage");

    dispatch({ type: "SET_TOKEN", payload: token.access_token });
    dispatch({ type: "SET_AUTHENTICATED", payload: true });

    // Get user data
    try {
      await getMe();
      console.log("✅ User data retrieved successfully");
    } catch (error) {
      console.error("❌ Failed to get user data after password reset:", error);
      // Don't fail the password reset if getMe fails
    }
  }, [apiCall, dispatch, getMe]);

  const sendOtp = useCallback((email: string) => apiCall(() => apiService.sendOtp(email)), [apiCall]);

  const verifyOtp = useCallback(async (email: string, otp: string | number) => {
    console.log("🔐 Starting OTP verification...", { email, otp });

    const token = await apiCall(() => apiService.verifyOtp(email, otp));
    if (!token) return;
    console.log("✅ OTP verification successful, token received:", token);

    await apiService.setToken(token.access_token);
    console.log("🔑 Token set in API service");

    // Save token to AsyncStorage
    await AsyncStorage.setItem("auth_token", token.access_token);
    console.log("💾 Token saved to AsyncStorage");

    dispatch({ type: "SET_TOKEN", payload: token.access_token });
    dispatch({ type: "SET_AUTHENTICATED", payload: true });
    console.log("✅ Authentication state updated");

    // Get user data
    try {
      await getMe();
      console.log("✅ User data retrieved successfully");
    } catch (error) {
      console.error(
        "❌ Failed to get user data after OTP verification:",
        error
      );
      // Don't fail the OTP verification if getMe fails
    }
  }, [apiCall, dispatch, getMe]);

  const refreshToken = useCallback(async () => {
    const token = await apiCall(() => apiService.refreshToken());
    if (!token) return;
    await apiService.setToken(token.access_token);
    dispatch({ type: "SET_TOKEN", payload: token.access_token });
  }, [apiCall, dispatch]);

  const switchAccount = useCallback(async (accountType: "client" | "agent") => {
    const token = await apiCall(() => apiService.switchAccount(accountType));
    if (!token) return;
    await apiService.setToken(token.access_token);
    await AsyncStorage.setItem("auth_token", token.access_token);
    dispatch({ type: "SET_TOKEN", payload: token.access_token });

    // Refresh user data
    await getMe();
  }, [apiCall, dispatch, getMe]);

  const updateMe = useCallback(async (userData: UserUpdate) => {
    // ──────────────────────────────────────────────────────────────────
    // Step 1: Update the CURRENT profile (the one for the active token)
    // ──────────────────────────────────────────────────────────────────
    await apiCall(() => apiService.updateMe(userData));

    // ──────────────────────────────────────────────────────────────────
    // Step 2: Optimistic UI update — show changes immediately
    // ──────────────────────────────────────────────────────────────────
    if (state.user) {
      // Cache-bust profile image so <Image> re-fetches the new asset
      const updatedFields = { ...userData };
      if (updatedFields.avatar_url && !updatedFields.avatar_url.includes("?t=")) {
        updatedFields.avatar_url = `${updatedFields.avatar_url}?t=${Date.now()}`;
      }

      const optimisticUser = { ...state.user, ...updatedFields };
      dispatch({ type: "SET_USER", payload: optimisticUser });
      await AsyncStorage.setItem("user_data", JSON.stringify(optimisticUser));
      console.log("✅ updateMe: Optimistically updated user state");

      // Clear the in-memory agent cache for this user
      // so ProfileVisibilityCard / details page won't show stale data
      if (state.user.id && state.agentCache[state.user.id]) {
        dispatch({
          type: "CACHE_AGENT",
          payload: {
            ...state.agentCache[state.user.id],
            id: state.user.id,
            fullname: updatedFields.fullname ?? state.agentCache[state.user.id]?.fullname,
            username: updatedFields.username ?? state.agentCache[state.user.id]?.username,
            avatar_url: updatedFields.avatar_url ?? state.agentCache[state.user.id]?.avatar_url,
            agency_name: updatedFields.agency_name ?? state.agentCache[state.user.id]?.agency_name,
            location: updatedFields.location ?? state.agentCache[state.user.id]?.location,
          } as any,
        });
      }

      // Also purge the AsyncStorage agent cache (used by details/[id].tsx)
      // so navigating to property details shows fresh data immediately
      try {
        await AsyncStorage.removeItem(`agent_cache_${state.user.id}`);
      } catch { /* non-critical */ }
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 3: DUAL-SYNC — push shared fields to the OTHER profile
    //
    // Shared fields that must stay in sync across buyer↔seller:
    //   fullname, avatar_url, phone_number, email, location, agency_name
    //
    // NOT synced (independent per mode):
    //   kyc_status, account_type, rating
    // ──────────────────────────────────────────────────────────────────
    const SHARED_KEYS: (keyof UserUpdate)[] = [
      "fullname", "avatar_url", "phone_number", "email",
      "location", "agency_name", "username",
    ];

    // Check if we actually changed any shared field
    const sharedUpdate: Partial<UserUpdate> = {};
    for (const key of SHARED_KEYS) {
      if (userData[key] !== undefined) {
        (sharedUpdate as any)[key] = userData[key];
      }
    }

    const hasSharedChanges = Object.keys(sharedUpdate).length > 0;

    if (hasSharedChanges) {
      // Determine the OTHER account type
      const currentType = state.user?.account_type;
      const otherType: "client" | "agent" = currentType === "agent" ? "client" : "agent";

      try {
        console.log(`🔄 Dual-sync: Pushing shared fields to ${otherType} profile...`);

        // Switch to the other profile — returns a new token
        const otherToken = await apiCall(
          () => apiService.switchAccount(otherType),
          undefined,
          { silent: true }
        );

        if (otherToken?.access_token) {
          // Temporarily use the other profile's token
          await apiService.setToken(otherToken.access_token);

          // Push shared fields to the other profile
          // Set the correct account_type for the OTHER profile
          await apiCall(
            () => apiService.updateMe({ ...sharedUpdate, account_type: otherType }),
            undefined,
            { silent: true }
          );
          console.log(`✅ Dual-sync: ${otherType} profile updated`);

          // Switch BACK to the original profile
          const originalType: "client" | "agent" = currentType === "agent" ? "agent" : "client";
          const originalToken = await apiCall(
            () => apiService.switchAccount(originalType),
            undefined,
            { silent: true }
          );

          if (originalToken?.access_token) {
            await apiService.setToken(originalToken.access_token);
            await AsyncStorage.setItem("auth_token", originalToken.access_token);
            dispatch({ type: "SET_TOKEN", payload: originalToken.access_token });
            console.log(`✅ Dual-sync: Restored original ${originalType} token`);
          }
        }
      } catch (syncError) {
        // Dual-sync is best-effort — don't fail the main update if sync fails
        console.warn("⚠️ Dual-sync to other profile failed (non-critical):", syncError);

        // Restore the original token from AsyncStorage in case it was lost
        const savedToken = await AsyncStorage.getItem("auth_token");
        if (savedToken) {
          await apiService.setToken(savedToken);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 4: Full refresh from the server for consistency
    // ──────────────────────────────────────────────────────────────────
    await getMe({ silent: true }).catch(() => { });
  }, [apiCall, getMe, state.user, state.agentCache, dispatch]);

  const deleteAccount = useCallback(async () => {
    console.log("🗑️ Starting account deletion...");

    // Disconnect WebSocket first
    disconnectWebSocket();

    try {
      await apiCall(() => apiService.deleteAccount());
      console.log("✅ Account deletion API call successful");
    } catch (error) {
      console.log("⚠️ Account deletion API call failed, but proceeding with local cleanup", error);
    }

    // Clear AsyncStorage
    await AsyncStorage.multiRemove(["auth_token", "user_data"]);
    await apiService.clearToken();
    dispatch({ type: "RESET_STATE" });
    console.log("✅ Account deletion and cleanup completed");
  }, [apiCall, dispatch]);

  // Property methods
  const getProperties = useCallback(async (limit = 20, cursor = 1, options?: RequestInit & { timeout?: number, silent?: boolean }) => {
    try {
      const silent = options?.silent;
      const feed = await apiCall(() => apiService.getProperties(limit, cursor, options), undefined, { silent });
      // Only update state if we have valid data
      if (feed && feed.data) {
        dispatch({ type: "SET_PROPERTY_FEED", payload: feed });
        dispatch({ type: "SET_PROPERTIES", payload: feed.data.filter((p: any) => p !== null) });
      }
    } catch (err) {
      // apiCall already sets error → safe to ignore
      console.log("getProperties failed, error already handled");
    }
  }, [apiCall, dispatch]);

  const getMyListings = useCallback(async (options?: RequestInit & { timeout?: number; silent?: boolean }) => {
    try {
      const silent = options?.silent;
      const listings = await apiCall(() => apiService.getMyListings(options), undefined, { silent });
      if (listings && Array.isArray(listings)) {
        dispatch({ type: "SET_MY_LISTINGS", payload: listings.filter((p: any) => p !== null) });
      }
    } catch (err) {
      console.log("getMyListings failed, error already handled");
    }
  }, [apiCall, dispatch]);

  // const listProperty = useCallback(async (propertyData: PropertyBase) => {
  //   dispatch({ type: "SET_LOADING", payload: true });
  //   dispatch({ type: "SET_ERROR", payload: null });

  //   console.log("🚀 Submitting property data:", JSON.stringify(propertyData, null, 2));

  //   try {
  //     const result = await apiService.listProperty(propertyData);

  //     if (result.ok) {
  //       console.log("✅ Property listed successfully:", result.data);
  //       dispatch({ type: "ADD_PROPERTY", payload: result.data });
  //     } else {
  //       console.error("❌ API returned error object:", result.error);
  //       const errorDetail = result.error?.detail;
  //       let errMsg = "Failed to list property";

  //       // Handle validation errors (422 Unprocessable Entity)
  //       if (Array.isArray(errorDetail) && errorDetail.length > 0) {
  //         errMsg = errorDetail.map((e: any) => {
  //           if (e.msg && e.loc) {
  //             const field = e.loc[e.loc.length - 1];
  //             return `${field}: ${e.msg}`;
  //           }
  //           return e.msg || e.message || JSON.stringify(e);
  //         }).join("; ");
  //       } else if (typeof result.error === "string") {
  //         errMsg = result.error;
  //       } else if (result.error?.detail && typeof result.error.detail === "string") {
  //         errMsg = result.error.detail;
  //       } else if (result.error?.message) {
  //         errMsg = result.error.message;
  //       } else if (result.error?.error) {
  //         errMsg = result.error.error;
  //       } else if (typeof result.error === "object") {
  //         errMsg = JSON.stringify(result.error);
  //       }

  //       console.error("❌ Final extracted error message:", errMsg);
  //       dispatch({ type: "SET_ERROR", payload: errMsg });
  //       throw new Error(errMsg);
  //     }
  //   } catch (error: any) {
  //     const message = error?.message || (typeof error === 'string' ? error : "An unexpected error occurred while listing the property");
  //     console.error("❌ Exception during listing:", message);
  //     console.error("❌ Stack trace:", error?.stack);
  //     dispatch({ type: "SET_ERROR", payload: String(message) });
  //     throw error instanceof Error ? error : new Error(String(message));
  //   } finally {
  //     dispatch({ type: "SET_LOADING", payload: false });
  //   }
  // }, [dispatch]);

  const listProperty = useCallback(async (propertyData: PropertyBase): Promise<PropertyShow | null> => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    console.log("🚀 Submitting property data:", JSON.stringify(propertyData, null, 2));

    try {
      const result = await apiService.listProperty(propertyData);

      console.log("Full API Result:", result);

      if (result.ok) {
        console.log("✅ Property listed successfully:", result.data);
        dispatch({ type: "ADD_PROPERTY", payload: result.data });
        return result.data; // Return the created property
      } else {
        console.error("❌ API returned error object:", result.error);

        let errMsg = "Failed to list property";
        const errorDetail = result.error?.detail ?? result.error;

        if (Array.isArray(errorDetail) && errorDetail.length > 0) {
          // Improved handling for standard FastAPI/Pydantic validation errors
          errMsg = errorDetail
            .map((e: any) => {
              if (e.msg) {
                const field = e.loc && Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "unknown";
                return `${field}: ${e.msg}`;
              }
              return JSON.stringify(e);
            })
            .join("; ");
        } else if (typeof errorDetail === "string") {
          errMsg = errorDetail;
        } else if (typeof errorDetail === "object") {
          errMsg = JSON.stringify(errorDetail);
        }

        console.error("❌ Final extracted error message:", errMsg);
        dispatch({ type: "SET_ERROR", payload: errMsg });
        throw new Error(errMsg);
      }
    } catch (error: any) {
      // This now only catches real exceptions (network, parsing, etc.)
      const message =
        error?.message ||
        (typeof error === "string" ? error : "An unexpected error occurred while listing the property");
      console.error("❌ Exception during listing:", message);
      console.error("❌ Stack trace:", error?.stack);
      dispatch({ type: "SET_ERROR", payload: String(message) });
      throw error instanceof Error ? error : new Error(String(message));
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [dispatch]);

  const updateProperty = useCallback(async (
    propertyId: number,
    propertyData: PropertyUpdate
  ) => {
    const property = await apiCall(() =>
      apiService.updateProperty(propertyId, propertyData)
    );
    dispatch({ type: "UPDATE_PROPERTY", payload: property });
  }, [apiCall, dispatch]);

  const deleteProperty = useCallback(async (propertyId: number) => {
    await apiCall(() => apiService.deleteProperty(propertyId));
    dispatch({ type: "DELETE_PROPERTY", payload: propertyId });
  }, [apiCall, dispatch]);

  const getAgentProfile = useCallback(async (agentId: number, options?: { silent?: boolean; forceRefresh?: boolean }) => {
    // Check cache first
    if (!options?.forceRefresh && state.agentCache[agentId]) {
      console.log(`🧠 Cache hit for agent profile: ${agentId}`);
      return state.agentCache[agentId];
    }

    const agentData = await apiCall(() => apiService.getAgentProfile(agentId, options), undefined, options);

    if (agentData) {
      dispatch({ type: "CACHE_AGENT", payload: { ...agentData, id: agentId } });
    }

    return agentData;
  }, [apiCall, state.agentCache, dispatch]);

  const getPropertyById = useCallback(async (propertyId: number, options?: RequestInit & { timeout?: number; forceRefresh?: boolean }) => {
    // Check cache first
    if (!options?.forceRefresh && state.propertyCache[propertyId]) {
      console.log(`🧠 Cache hit for property details: ${propertyId}`);
      return state.propertyCache[propertyId];
    }

    console.log("🌐 Fetching property directly by ID:", propertyId);
    const propertyData = await apiCall(() => apiService.getPropertyById(propertyId, options));

    if (propertyData) {
      dispatch({ type: "CACHE_PROPERTY", payload: propertyData });
    }

    return propertyData;
  }, [apiCall, state.propertyCache, dispatch]);

  // Appointment methods
  const bookAppointment = useCallback(async (appointmentData: AppointmentSchema) => {
    const appointment = await apiCall(() =>
      apiService.bookAppointment(appointmentData)
    );
    dispatch({ type: "ADD_APPOINTMENT", payload: appointment });
  }, [apiCall, dispatch]);

  const cancelAppointment = useCallback(async (appointmentId: number) => {
    await apiCall(() => apiService.cancelAppointment(appointmentId));
    dispatch({ type: "DELETE_APPOINTMENT", payload: appointmentId });
  }, [apiCall, dispatch]);

  // Payment methods
  const createPaymentInfo = useCallback(async (accountInfo: AccountInfoBase) => {
    const paymentInfo = await apiCall(() =>
      apiService.createPaymentInfo(accountInfo)
    );
    dispatch({ type: "ADD_PAYMENT_INFO", payload: paymentInfo });
  }, [apiCall, dispatch]);

  const getPaymentInfo = useCallback(async (userId?: number) => {
    const paymentInfo = await apiCall(() => apiService.getPaymentInfo(userId));
    dispatch({ type: "SET_PAYMENT_INFO", payload: paymentInfo });
  }, [apiCall, dispatch]);

  const updatePaymentInfo = useCallback(async (
    accountInfoId: number,
    accountInfo: AccountInfoBase
  ) => {
    const paymentInfo = await apiCall(() =>
      apiService.updatePaymentInfo(accountInfoId, accountInfo)
    );
    dispatch({ type: "UPDATE_PAYMENT_INFO", payload: paymentInfo });
  }, [apiCall, dispatch]);

  const deleteAccountInfo = useCallback(async (accountInfoId: number) => {
    await apiCall(() => apiService.deleteAccountInfo(accountInfoId));
    dispatch({ type: "DELETE_PAYMENT_INFO", payload: accountInfoId });
  }, [apiCall, dispatch]);

  // Schedule methods
  const createAvailableTime = useCallback(async (availability: AgentAvailabilitySchema) => {
    const newAvailability = await apiCall(() =>
      apiService.createAvailableTime(availability)
    );
    dispatch({ type: "ADD_AVAILABILITY", payload: newAvailability });
  }, [apiCall, dispatch]);

  const getSchedule = useCallback(async () => {
    const schedule = await apiCall(() => apiService.getSchedule());
    dispatch({ type: "SET_SCHEDULE", payload: schedule });
    return (schedule ?? []) as AvailabilityShow[];
  }, [apiCall, dispatch]);

  const updateSchedule = useCallback(async (
    scheduleId: number,
    availability: AgentAvailabilitySchema
  ) => {
    const updatedAvailability = await apiCall(() =>
      apiService.updateSchedule(scheduleId, availability)
    );
    dispatch({ type: "UPDATE_AVAILABILITY", payload: updatedAvailability });
  }, [apiCall, dispatch]);

  const deleteSchedule = useCallback(async (scheduleId: number) => {
    await apiCall(() => apiService.deleteSchedule(scheduleId));
    dispatch({ type: "DELETE_AVAILABILITY", payload: scheduleId });
  }, [apiCall, dispatch]);

  // Contract methods
  const createContract = useCallback(async (contractData: ContractCreate) => {
    return await apiCall(() => apiService.createContract(contractData));
  }, [apiCall]);

  const confirmPayment = useCallback(async (contractId: number) => {
    await apiCall(() => apiService.confirmPayment(contractId));
  }, [apiCall]);

  const approvePayment = useCallback(async (contractId: number) => {
    await apiCall(() => apiService.approvePayment(contractId));
  }, [apiCall]);

  // Chat methods
  const getChatHistory = useCallback(async () => {
    const chatHistory = await apiCall(() => apiService.getChatHistory());
    dispatch({ type: "SET_CHAT_HISTORY", payload: chatHistory || [] });
  }, [apiCall, dispatch]);

  const getConversations = useCallback(async () => {
    return await apiCall(() => apiService.getConversations());
  }, [apiCall]);

  const getMessageHistory = useCallback(async (receiverId: number) => {
    return await apiCall(() => apiService.getMessageHistory(receiverId));
  }, [apiCall]);

  const sendMessage = useCallback(async (messageData: ChatMessageSchema) => {
    await apiCall(() => apiService.sendMessage(messageData));
    await getChatHistory();
  }, [apiCall, getChatHistory]);

  const markMessagesAsRead = useCallback(async (senderId: number) => {
    // Silent: this is a background side effect of opening a chat, so it must
    // not flip the global isLoading flag or surface an error banner.
    await apiCall(
      () => apiService.markMessagesAsRead(senderId),
      undefined,
      { silent: true }
    );
    // Tell unread-count consumers (the Inbox tab badge) to re-read
    // immediately rather than waiting out their poll interval — without this
    // the badge kept showing a stale count after the user had already read
    // the messages.
    dispatch({ type: "BUMP_CONVERSATIONS_VERSION" });
  }, [apiCall]);

  const getUnreadCount = useCallback(async () => {
    return await apiCall(() => apiService.getUnreadCount());
  }, [apiCall]);

  // Media methods
  const uploadFile = useCallback(async (type: "profile" | "property", file: any) => {
    return await apiCall(() => apiService.uploadFile(type, file));
  }, [apiCall]);

  const getFiles = useCallback(async (type: "profile" | "property") => {
    return await apiCall(() => apiService.getFiles(type));
  }, [apiCall]);

  // Transaction lifecycle methods
  const getTransactions = useCallback(async (status?: "ongoing" | "completed" | "cancelled") => {
    return await apiCall(() => apiService.getTransactions(status));
  }, [apiCall]);

  const uploadTransactionDocuments = useCallback(async (
    bidId: number,
    images: Array<{ uri: string; fileName?: string; mimeType?: string }>,
    description?: string
  ) => {
    return await apiCall(() => apiService.uploadTransactionDocuments(bidId, images, description));
  }, [apiCall]);

  const sendTransactionNotification = useCallback(async (payload: TransactionNotificationPayload) => {
    return await apiCall(() => apiService.sendTransactionNotification(payload));
  }, [apiCall]);

  const getUserByWallet = useCallback(async (walletId: string) => {
    return await apiCall(() => apiService.getUserByWallet(walletId));
  }, [apiCall]);

  const registerWallet = useCallback(async (walletId: string) => {
    return await apiCall(() => apiService.registerWallet(walletId));
  }, [apiCall]);

  // ---- Notification API ----
  const getNotifications = useCallback(async () => {
    return await apiCall(() => apiService.getNotifications());
  }, [apiCall]);

  const sendTransactionUpdate = useCallback(async (payload: TransactionUpdatePayload) => {
    return await apiCall(() => apiService.sendTransactionUpdate(payload));
  }, [apiCall]);

  const markNotificationRead = useCallback(async (notificationId: number) => {
    return await apiCall(() => apiService.markNotificationRead(notificationId));
  }, [apiCall]);

  const registerNotificationDevice = useCallback(async (payload: RegisterDevicePayload) => {
    return await apiCall(() => apiService.registerNotificationDevice(payload));
  }, [apiCall]);

  // ---- Rating API ----
  const createRating = useCallback(async (payload: RatingCreate) => {
    return await apiCall(() => apiService.createRating(payload));
  }, [apiCall]);

  const getPropertyRatings = useCallback(async (propertyId: number) => {
    return await apiCall(() => apiService.getPropertyRatings(propertyId));
  }, [apiCall]);

  const getUserRatings = useCallback(async (rateeId: number) => {
    return await apiCall(() => apiService.getUserRatings(rateeId));
  }, [apiCall]);

  // ---- Social Login ----
  const socialLogin = useCallback(async (payload: SocialLoginRequest) => {
    console.log("🔐 Starting social login...");
    const result = await apiCall(() => apiService.socialLogin(payload));
    if (!result) throw new Error("No response from social login");

    const accessToken = result?.token?.access_token;
    if (accessToken) {
      await apiService.setToken(accessToken);
      await AsyncStorage.setItem("auth_token", accessToken);
      dispatch({ type: "SET_TOKEN", payload: accessToken });
      dispatch({ type: "SET_AUTHENTICATED", payload: true });

      if (result?.user_data) {
        dispatch({ type: "SET_USER", payload: result.user_data });
        await AsyncStorage.setItem("user_data", JSON.stringify(result.user_data));
      } else {
        await getMe();
      }
    }
    console.log("✅ Social login completed successfully");
    // Older backends do not send this. `false` is the safe default: it means
    // "don't auto-create a wallet", which for a returning user is correct.
    return { isNewUser: result?.is_new_user === true };
  }, [apiCall, dispatch, getMe]);

  // ---- Forgot Password ----
  const forgotPassword = useCallback(async (email: string) => {
    await apiCall(() => apiService.forgotPassword(email));
  }, [apiCall]);

  const verifyForgotPassword = useCallback(async (email: string, otp: string) => {
    const token = await apiCall(() => apiService.verifyForgotPassword(email, otp));
    if (token?.access_token) {
      await apiService.setToken(token.access_token);
      await AsyncStorage.setItem("auth_token", token.access_token);
      dispatch({ type: "SET_TOKEN", payload: token.access_token });
      dispatch({ type: "SET_AUTHENTICATED", payload: true });
      await getMe({ silent: true }).catch(() => {});
    }
  }, [apiCall, dispatch, getMe]);

  // ---- Get User By ID ----
  const getUserById = useCallback(async (userId: number) => {
    return await apiCall(() => apiService.getUserById(userId));
  }, [apiCall]);

  // ---- Confirm Appointment ----
  const confirmAppointment = useCallback(async (appointmentId: number) => {
    await apiCall(() => apiService.confirmAppointment(appointmentId));
    // Optimistically update appointment status
    dispatch({
      type: "UPDATE_APPOINTMENT",
      payload: {
        ...(state.appointments.find(a => a.id === appointmentId) || {} as any),
        id: appointmentId,
        status: "confirmed" as const,
      },
    });
  }, [apiCall, dispatch, state.appointments]);

  // ---- KYC ----
  const startKycVerification = useCallback(async (params: KycStartParams) => {
    return await apiCall(() => apiService.startKycVerification(params));
  }, [apiCall]);

  const getKycStatus = useCallback(async (verificationId: string) => {
    return await apiCall(() => apiService.getKycStatus(verificationId));
  }, [apiCall]);

  const isUserVerified = useCallback(async (userId: number) => {
    return await apiCall(() => apiService.isUserVerified(userId));
  }, [apiCall]);

  // ---- Advanced Search ----
  const searchProperties = useCallback(async (params: PropertySearchParams) => {
    return await apiCall(() => apiService.searchProperties(params));
  }, [apiCall]);

  // ---- IPFS Upload ----
  const uploadToIpfs = useCallback(async (files: any[]) => {
    return await apiCall(() => apiService.uploadToIpfs(files));
  }, [apiCall]);

  // ---- Minted Properties ----
  const registerMintedProperty = useCallback(async (data: MintedPropertyCreate) => {
    return await apiCall(() => apiService.registerMintedProperty(data));
  }, [apiCall]);

  const createListingFromMinted = useCallback(async (mintedId: number, propertyData: PropertyBase) => {
    const result = await apiCall(() => apiService.createListingFromMinted(mintedId, propertyData));
    if (result?.property) {
      dispatch({ type: "ADD_PROPERTY", payload: result.property });
    }
    return result;
  }, [apiCall, dispatch]);

  // Utility methods
  const setActiveFilters = useCallback((filters: Partial<FilterValues> | null) => {
    dispatch({ type: "SET_ACTIVE_FILTERS", payload: filters });
  }, []);

  const setSelectedCategory = useCallback((category: string) => {
    dispatch({ type: "SET_SELECTED_CATEGORY", payload: category });
  }, [dispatch]);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH_QUERY", payload: query });
  }, [dispatch]);

  const toggleFavorite = useCallback(async (propertyId: number) => {
    const isFavorite = state.favorites.includes(propertyId);
    const newFavorites = isFavorite
      ? state.favorites.filter((id) => id !== propertyId)
      : [...state.favorites, propertyId];

    dispatch({ type: "SET_FAVORITES", payload: newFavorites });
    await AsyncStorage.setItem("user_favorites", JSON.stringify(newFavorites));
  }, [state.favorites, dispatch]);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, [dispatch]);

  const contextValue: ApiContextType = useMemo(() => ({
    ...state,
    isLoading: state.isLoading,
    isInitializing: state.isInitializing,
    signup,
    login,
    logout,
    verifyAccount,
    resetPassword,
    changePassword,
    sendOtp,
    verifyOtp,
    refreshToken,
    switchAccount,
    getMe,
    updateMe,
    deleteAccount,
    getProperties,
    getMyListings,
    listProperty,
    updateProperty,
    deleteProperty,
    getAgentProfile,
    getPropertyById,
    bookAppointment,
    cancelAppointment,
    createPaymentInfo,
    getPaymentInfo,
    updatePaymentInfo,
    deleteAccountInfo,
    createAvailableTime,
    getSchedule,
    updateSchedule,
    deleteSchedule,
    createContract,
    confirmPayment,
    approvePayment,
    getChatHistory,
    getConversations,
    getMessageHistory,
    sendMessage,
    markMessagesAsRead,
    getUnreadCount,
    connectWebSocket,
    disconnectWebSocket,
    sendWsMessage,
    clearWsMessages,
    uploadFile,
    getFiles,
    getTransactions,
    uploadTransactionDocuments,
    sendTransactionNotification,
    getUserByWallet,
    registerWallet,
    getNotifications,
    sendTransactionUpdate,
    markNotificationRead,
    registerNotificationDevice,
    createRating,
    getPropertyRatings,
    getUserRatings,
    socialLogin,
    forgotPassword,
    verifyForgotPassword,
    getUserById,
    confirmAppointment,
    startKycVerification,
    getKycStatus,
    isUserVerified,
    searchProperties,
    uploadToIpfs,
    registerMintedProperty,
    createListingFromMinted,
    setSelectedCategory,
    setActiveFilters,
    setSearchQuery,
    toggleFavorite,
    clearError,
  }), [
    state,
    signup,
    login,
    logout,
    verifyAccount,
    resetPassword,
    changePassword,
    sendOtp,
    verifyOtp,
    refreshToken,
    switchAccount,
    getMe,
    updateMe,
    deleteAccount,
    getProperties,
    getMyListings,
    listProperty,
    updateProperty,
    deleteProperty,
    getAgentProfile,
    getPropertyById,
    bookAppointment,
    cancelAppointment,
    createPaymentInfo,
    getPaymentInfo,
    updatePaymentInfo,
    deleteAccountInfo,
    createAvailableTime,
    getSchedule,
    updateSchedule,
    deleteSchedule,
    createContract,
    confirmPayment,
    approvePayment,
    getChatHistory,
    getConversations,
    getMessageHistory,
    sendMessage,
    markMessagesAsRead,
    getUnreadCount,
    connectWebSocket,
    disconnectWebSocket,
    sendWsMessage,
    clearWsMessages,
    uploadFile,
    getFiles,
    getTransactions,
    uploadTransactionDocuments,
    sendTransactionNotification,
    getUserByWallet,
    registerWallet,
    getNotifications,
    sendTransactionUpdate,
    markNotificationRead,
    registerNotificationDevice,
    createRating,
    getPropertyRatings,
    getUserRatings,
    socialLogin,
    forgotPassword,
    verifyForgotPassword,
    getUserById,
    confirmAppointment,
    startKycVerification,
    getKycStatus,
    isUserVerified,
    searchProperties,
    uploadToIpfs,
    registerMintedProperty,
    createListingFromMinted,
    setSelectedCategory,
    setActiveFilters,
    setSearchQuery,
    toggleFavorite,
    clearError,
  ]);

  return (
    <ApiContext.Provider value={contextValue}>{children}</ApiContext.Provider>
  );
}

// Custom hook to use the API context
export function useApi() {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error("useApi must be used within an ApiProvider");
  }
  return context;
}
