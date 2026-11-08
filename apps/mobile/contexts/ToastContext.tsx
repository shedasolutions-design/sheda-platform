import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  ReactNode,
} from "react";

export type ToastType = "loading" | "success" | "error";

export interface ToastState {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: ToastState | null;
  /** Shows a non-blocking loading toast and returns its id, for a later updateToast/dismissToast call. */
  showLoading: (message: string) => string;
  /** Flips an existing toast (by id) to success/error. Auto-dismisses after a few seconds. */
  updateToast: (id: string, update: { type: "success" | "error"; message: string }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

// An on-chain write can run 30s+. If the outcome flashes for 3s the user has
// very likely looked away by the time it lands, and the operation reads as
// "nothing happened" — which is exactly how it was reported. Long enough to be
// seen on glancing back; the banner is also tap-dismissible, so a longer
// window costs nothing.
const AUTO_DISMISS_MS: Record<"success" | "error", number> = {
  success: 6000,
  // Errors stay longer: they usually carry something the user has to act on.
  error: 9000,
};

let idCounter = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Only one toast at a time — track the currently-owning id so a stale
  // updateToast/dismissToast call (from a transaction that finished after
  // a newer one already took over the banner) doesn't clobber the newer one.
  const activeIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const showLoading = useCallback((message: string): string => {
    idCounter += 1;
    const id = `toast_${Date.now()}_${idCounter}`;
    clearDismissTimer();
    activeIdRef.current = id;
    setToast({ id, type: "loading", message });
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    if (activeIdRef.current !== id) return;
    clearDismissTimer();
    activeIdRef.current = null;
    setToast(null);
  }, []);

  const updateToast = useCallback(
    (id: string, update: { type: "success" | "error"; message: string }) => {
      if (activeIdRef.current !== id) return;
      setToast({ id, type: update.type, message: update.message });
      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        if (activeIdRef.current === id) {
          activeIdRef.current = null;
          setToast(null);
        }
      }, AUTO_DISMISS_MS[update.type]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast, showLoading, updateToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
};
