import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "../contexts/ApiContext";
import { useWallet } from "../contexts/WalletContext";
import {
  UserCreate,
  UserUpdate,
  PropertyBase,
  PropertyUpdate,
  AppointmentSchema,
  AccountInfoBase,
  AgentAvailabilitySchema,
  ContractCreate,
  PropertyShow,
  AppointmentShow,
  AccountInfoShow,
  AvailabilityShow,
  ContractResponse,
  AgentFeed,
  FileShow,
} from "../services/api";

// Hook return types
interface UseAuthReturn {
  isAuthenticated: boolean;
  user: any;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  signup: (userData: UserCreate) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: (options?: { loading?: boolean }) => Promise<void>;
  verifyAccount: () => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string | number) => Promise<void>;
  refreshToken: () => Promise<void>;
  switchAccount: (accountType: "client" | "agent") => Promise<void>;
  getMe: () => Promise<any>;
  updateMe: (userData: UserUpdate) => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

interface UsePropertiesReturn {
  properties: PropertyShow[];
  myListings: PropertyShow[];
  propertyFeed: any;
  isLoading: boolean;
  error: string | null;
  getProperties: (limit?: number, cursor?: number) => Promise<void>;
  getMyListings: () => Promise<void>;
  listProperty: (propertyData: PropertyBase) => Promise<PropertyShow | null>;
  updateProperty: (
    propertyId: number,
    propertyData: PropertyUpdate
  ) => Promise<void>;
  deleteProperty: (propertyId: number) => Promise<void>;
  getAgentProfile: (agentId: number) => Promise<AgentFeed>;
  clearError: () => void;
}

interface UseAppointmentsReturn {
  appointments: AppointmentShow[];
  isLoading: boolean;
  error: string | null;
  bookAppointment: (appointmentData: AppointmentSchema) => Promise<void>;
  cancelAppointment: (appointmentId: number) => Promise<void>;
  clearError: () => void;
}

interface UsePaymentReturn {
  paymentInfo: AccountInfoShow[];
  isLoading: boolean;
  error: string | null;
  createPaymentInfo: (accountInfo: AccountInfoBase) => Promise<void>;
  getPaymentInfo: (userId?: number) => Promise<void>;
  updatePaymentInfo: (
    accountInfoId: number,
    accountInfo: AccountInfoBase
  ) => Promise<void>;
  deleteAccountInfo: (accountInfoId: number) => Promise<void>;
  clearError: () => void;
}

interface UseScheduleReturn {
  schedule: AvailabilityShow[];
  isLoading: boolean;
  error: string | null;
  createAvailableTime: (availability: AgentAvailabilitySchema) => Promise<void>;
  getSchedule: () => Promise<void>;
  updateSchedule: (
    scheduleId: number,
    availability: AgentAvailabilitySchema
  ) => Promise<void>;
  clearError: () => void;
}

interface UseContractsReturn {
  isLoading: boolean;
  error: string | null;
  createContract: (contractData: ContractCreate) => Promise<ContractResponse>;
  confirmPayment: (contractId: number) => Promise<void>;
  approvePayment: (contractId: number) => Promise<void>;
  clearError: () => void;
}

interface UseMediaReturn {
  isLoading: boolean;
  error: string | null;
  uploadFile: (type: "profile" | "property", file: any) => Promise<FileShow>;
  getFiles: (type: "profile" | "property") => Promise<FileShow[]>;
  clearError: () => void;
}

interface UseChatReturn {
  chatHistory: any[];
  isLoading: boolean;
  error: string | null;
  getChatHistory: () => Promise<void>;
  clearError: () => void;
}

// Authentication hook
export function useAuth(): UseAuthReturn {
  const api = useApi();
  const { signOut: disconnectWallet } = useWallet();
  const signup = useCallback((userData: UserCreate) => api.signup(userData), [api.signup]);
  const login = useCallback((identifier: string, password: string) => api.login(identifier, password), [api.login]);
  // Disconnect the wallet BEFORE clearing the Sheda session — signOut()
  // reads userEmail (from ApiContext) to know which account's wallet
  // pointer to clear, so it needs to run while that's still populated.
  const logout = useCallback(async (options?: { loading?: boolean }) => {
    await disconnectWallet().catch((err) => {
      console.warn("useAuth: Wallet disconnect during logout failed:", err);
    });
    await api.logout(options);
  }, [api.logout, disconnectWallet]);
  const verifyAccount = useCallback(() => api.verifyAccount(), [api.verifyAccount]);
  const resetPassword = useCallback((password: string) => api.resetPassword(password), [api.resetPassword]);
  const sendOtp = useCallback((email: string) => api.sendOtp(email), [api.sendOtp]);
  const verifyOtp = useCallback((email: string, otp: string | number) => api.verifyOtp(email, otp), [api.verifyOtp]);
  const refreshToken = useCallback(() => api.refreshToken(), [api.refreshToken]);
  const switchAccount = useCallback((accountType: "client" | "agent") => api.switchAccount(accountType), [api.switchAccount]);
  const getMe = useCallback(() => api.getMe(), [api.getMe]);
  const updateMe = useCallback((userData: UserUpdate) => api.updateMe(userData), [api.updateMe]);
  const deleteAccount = useCallback(() => api.deleteAccount(), [api.deleteAccount]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    isAuthenticated: api.isAuthenticated,
    user: api.user,
    isLoading: api.isLoading,
    isInitializing: api.isInitializing,
    error: api.error,
    signup,
    login,
    logout,
    verifyAccount,
    resetPassword,
    sendOtp,
    verifyOtp,
    refreshToken,
    switchAccount,
    getMe,
    updateMe,
    deleteAccount,
    clearError,
  };
}

// Properties hook
export function useProperties(): UsePropertiesReturn {
  const api = useApi();
  const getProperties = useCallback((limit?: number, cursor?: number, options?: RequestInit & { timeout?: number }) => api.getProperties(limit, cursor, options), [api.getProperties]);
  const getMyListings = useCallback((options?: RequestInit & { timeout?: number }) => api.getMyListings(options), [api.getMyListings]);
  const listProperty = useCallback((propertyData: PropertyBase) => api.listProperty(propertyData), [api.listProperty]);
  const updateProperty = useCallback((propertyId: number, propertyData: PropertyUpdate) => api.updateProperty(propertyId, propertyData), [api.updateProperty]);
  const deleteProperty = useCallback((propertyId: number) => api.deleteProperty(propertyId), [api.deleteProperty]);
  const getAgentProfile = useCallback((agentId: number) => api.getAgentProfile(agentId), [api.getAgentProfile]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    properties: api.properties,
    myListings: api.myListings,
    propertyFeed: api.propertyFeed,
    isLoading: api.isLoading,
    error: api.error,
    getProperties,
    getMyListings,
    listProperty,
    updateProperty,
    deleteProperty,
    getAgentProfile,
    clearError,
  };
}

// Appointments hook
export function useAppointments(): UseAppointmentsReturn {
  const api = useApi();
  const bookAppointment = useCallback((appointmentData: AppointmentSchema) => api.bookAppointment(appointmentData), [api.bookAppointment]);
  const cancelAppointment = useCallback((appointmentId: number) => api.cancelAppointment(appointmentId), [api.cancelAppointment]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    appointments: api.appointments,
    isLoading: api.isLoading,
    error: api.error,
    bookAppointment,
    cancelAppointment,
    clearError,
  };
}

// Payment hook
export function usePayment(): UsePaymentReturn {
  const api = useApi();
  const createPaymentInfo = useCallback((accountInfo: AccountInfoBase) => api.createPaymentInfo(accountInfo), [api.createPaymentInfo]);
  const getPaymentInfo = useCallback((userId?: number) => api.getPaymentInfo(userId), [api.getPaymentInfo]);
  const updatePaymentInfo = useCallback((accountInfoId: number, accountInfo: AccountInfoBase) => api.updatePaymentInfo(accountInfoId, accountInfo), [api.updatePaymentInfo]);
  const deleteAccountInfo = useCallback((accountInfoId: number) => api.deleteAccountInfo(accountInfoId), [api.deleteAccountInfo]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    paymentInfo: api.paymentInfo,
    isLoading: api.isLoading,
    error: api.error,
    createPaymentInfo,
    getPaymentInfo,
    updatePaymentInfo,
    deleteAccountInfo,
    clearError,
  };
}

// Schedule hook
export function useSchedule(): UseScheduleReturn {
  const api = useApi();
  const createAvailableTime = useCallback((availability: AgentAvailabilitySchema) => api.createAvailableTime(availability), [api.createAvailableTime]);
  const getSchedule = useCallback(() => api.getSchedule(), [api.getSchedule]);
  const updateSchedule = useCallback((scheduleId: number, availability: AgentAvailabilitySchema) => api.updateSchedule(scheduleId, availability), [api.updateSchedule]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    schedule: api.schedule,
    isLoading: api.isLoading,
    error: api.error,
    createAvailableTime,
    getSchedule,
    updateSchedule,
    clearError,
  };
}

// Contracts hook
export function useContracts(): UseContractsReturn {
  const api = useApi();
  const createContract = useCallback((contractData: ContractCreate) => api.createContract(contractData), [api.createContract]);
  const confirmPayment = useCallback((contractId: number) => api.confirmPayment(contractId), [api.confirmPayment]);
  const approvePayment = useCallback((contractId: number) => api.approvePayment(contractId), [api.approvePayment]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    isLoading: api.isLoading,
    error: api.error,
    createContract,
    confirmPayment,
    approvePayment,
    clearError,
  };
}

// Media hook
export function useMedia(): UseMediaReturn {
  const api = useApi();
  const uploadFile = useCallback((type: "profile" | "property", file: any) => api.uploadFile(type, file), [api.uploadFile]);
  const getFiles = useCallback((type: "profile" | "property") => api.getFiles(type), [api.getFiles]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    isLoading: api.isLoading,
    error: api.error,
    uploadFile,
    getFiles,
    clearError,
  };
}

// Chat hook
export function useChat(): UseChatReturn {
  const api = useApi();
  const getChatHistory = useCallback(() => api.getChatHistory(), [api.getChatHistory]);
  const clearError = useCallback(() => api.clearError(), [api.clearError]);

  return {
    chatHistory: api.chatHistory,
    isLoading: api.isLoading,
    error: api.error,
    getChatHistory,
    clearError,
  };
}

// Advanced hooks with additional features

// Hook for optimistic updates
export function useOptimisticUpdate<T>(
  initialData: T[],
  updateFn: (id: number, data: Partial<T>) => Promise<void>,
  deleteFn: (id: number) => Promise<void>
) {
  const [data, setData] = useState<T[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optimisticUpdate = useCallback(
    async (id: number, updates: Partial<T>) => {
      setIsLoading(true);
      setError(null);

      // Optimistic update
      setData((prev) =>
        prev.map((item) =>
          (item as any).id === id ? { ...item, ...updates } : item
        )
      );

      try {
        await updateFn(id, updates);
      } catch (err) {
        // Revert on error
        setData(initialData);
        setError(err instanceof Error ? err.message : "Update failed");
      } finally {
        setIsLoading(false);
      }
    },
    [initialData, updateFn]
  );

  const optimisticDelete = useCallback(
    async (id: number) => {
      setIsLoading(true);
      setError(null);

      // Optimistic delete
      const originalData = [...data];
      setData((prev) => prev.filter((item) => (item as any).id !== id));

      try {
        await deleteFn(id);
      } catch (err) {
        // Revert on error
        setData(originalData);
        setError(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setIsLoading(false);
      }
    },
    [data, deleteFn]
  );

  return {
    data,
    setData,
    isLoading,
    error,
    optimisticUpdate,
    optimisticDelete,
  };
}

// Hook for pagination
export function usePagination<T>(
  fetchFn: (
    limit: number,
    cursor: number
  ) => Promise<{ data: T[]; next_cursor?: number }>,
  initialLimit: number = 20
) {
  const [data, setData] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFn(initialLimit, 1);
      setData(result.data);
      setNextCursor(result.next_cursor || null);
      setHasMore(!!result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, initialLimit, isLoading]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;

    setIsLoadingMore(true);
    setError(null);

    try {
      const result = await fetchFn(initialLimit, nextCursor);
      setData((prev) => [...prev, ...result.data]);
      setNextCursor(result.next_cursor || null);
      setHasMore(!!result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more data");
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchFn, initialLimit, isLoadingMore, hasMore, nextCursor]);

  const refresh = useCallback(async () => {
    setData([]);
    setNextCursor(1);
    setHasMore(true);
    await loadInitial();
  }, [loadInitial]);

  return {
    data,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadInitial,
    loadMore,
    refresh,
  };
}

// Hook for real-time data with polling
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number = 30000, // 30 seconds
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, isLoading]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchData();

    // Set up polling
    intervalRef.current = setInterval(fetchData, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, interval, enabled]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      intervalRef.current = setInterval(fetchData, interval);
    }
  }, [fetchData, interval]);

  return {
    data,
    isLoading,
    error,
    fetchData,
    stopPolling,
    startPolling,
  };
}

// Hook for form submission with validation
export function useFormSubmit<T>(
  submitFn: (data: T) => Promise<void>,
  onSuccess?: () => void,
  onError?: (error: string) => void
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: T) => {
      setIsSubmitting(true);
      setError(null);

      try {
        await submitFn(data);
        onSuccess?.();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Submission failed";
        setError(errorMessage);
        onError?.(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitFn, onSuccess, onError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isSubmitting,
    error,
    submit,
    clearError,

  };
}

// Hook for search with debouncing
export function useSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  debounceMs: number = 500
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        const searchResults = await searchFn(searchQuery);
        setResults(searchResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setIsSearching(false);
      }
    },
    [searchFn]
  );

  const handleSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for debounced search
      timeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, debounceMs);
    },
    [performSearch, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    query,
    results,
    isSearching,
    error,
    handleSearch,
    setQuery,
  };
}

// Hook for file upload with progress
export function useFileUpload(
  uploadFn: (file: any) => Promise<FileShow>,
  onProgress?: (progress: number) => void
) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileShow | null>(null);

  const upload = useCallback(
    async (file: any) => {
      setIsUploading(true);
      setProgress(0);
      setError(null);
      setUploadedFile(null);

      try {
        const result = await uploadFn(file);
        setUploadedFile(result);
        setProgress(100);
        onProgress?.(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFn, onProgress]
  );

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setUploadedFile(null);
  }, []);

  return {
    isUploading,
    progress,
    error,
    uploadedFile,
    upload,
    reset,
  };
}
