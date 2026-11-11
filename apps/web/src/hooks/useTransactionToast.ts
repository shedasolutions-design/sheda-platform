import { useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useNotifications, NotificationType } from "@/contexts/NotificationContext";
import { notifyIfBackgrounded } from "@/services/localNotifications";

interface RunOptions<T> {
  loadingMessage: string;
  successMessage: string | ((result: T) => string);
  /** Defaults to the thrown error's message, or a generic fallback. */
  errorMessage?: string | ((error: any) => string);
  /** Also records the outcome in the notification inbox (contexts/NotificationContext.tsx). */
  notification?: {
    type: NotificationType;
    title: string;
    /** Defaults to the resolved successMessage. */
    message?: string;
  };
  action: () => Promise<T>;
}

/**
 * Wraps a user-initiated blockchain transaction with a non-blocking toast
 * (contexts/ToastContext.tsx) that survives the caller navigating away —
 * it's owned by the app-root provider, not the screen — plus an inbox
 * notification and, if the app isn't foregrounded when the action resolves,
 * a local OS notification (services/localNotifications.ts).
 *
 * Rethrows on failure so each call site's existing catch/finally (resetting
 * local isSubmitting flags, closing modals, etc.) keeps working unchanged.
 */
export function useTransactionToast() {
  const { showLoading, updateToast } = useToast();
  const { addNotification } = useNotifications();

  const run = useCallback(
    async <T,>(options: RunOptions<T>): Promise<T> => {
      const { loadingMessage, successMessage, errorMessage, notification, action } = options;
      const toastId = showLoading(loadingMessage);

      try {
        const result = await action();
        const finalMessage =
          typeof successMessage === "function" ? successMessage(result) : successMessage;

        updateToast(toastId, { type: "success", message: finalMessage });

        if (notification) {
          addNotification(notification.type, notification.title, notification.message ?? finalMessage);
        }
        notifyIfBackgrounded(notification?.title ?? "Done", finalMessage).catch(() => {});

        return result;
      } catch (error: any) {
        const finalError =
          typeof errorMessage === "function"
            ? errorMessage(error)
            : errorMessage ?? error?.message ?? "Something went wrong. Please try again.";

        updateToast(toastId, { type: "error", message: finalError });
        notifyIfBackgrounded("Action Failed", finalError).catch(() => {});

        throw error;
      }
    },
    [showLoading, updateToast, addNotification]
  );

  return { run };
}
