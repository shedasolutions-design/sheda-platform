"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Spinner from "./Spinner";

export type FeedbackType = "success" | "error" | "info" | "warning" | "loading";

/**
 * The status dialog the mobile screens used for "Signing in", "Welcome back",
 * "Connection error" and the like. Same props, so ported screens read the same.
 *
 * With an `onAction`, the dialog shows that as the main button (labelled
 * `actionLabel`) and the close button as the secondary one.
 */
export default function FeedbackModal({
  isVisible,
  type,
  title,
  message,
  onClose,
  showRetry,
  retryAction,
  onAction,
  actionLabel,
}: {
  isVisible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  onClose?: () => void;
  showRetry?: boolean;
  retryAction?: () => void;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const icon =
    type === "loading" ? (
      <Spinner size={40} />
    ) : type === "success" ? (
      <CheckCircle2 size={44} className="text-green-600" />
    ) : type === "error" ? (
      <AlertCircle size={44} className="text-primary" />
    ) : type === "warning" ? (
      <AlertTriangle size={44} className="text-amber-500" />
    ) : (
      <Info size={44} className="text-secondaryText" />
    );

  const hasPrimary = (showRetry && retryAction) || onAction;

  return (
    <Modal open={isVisible} onClose={type === "loading" ? undefined : onClose} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">{icon}</div>
        <h2 className="mb-1 text-lg font-semibold">{title}</h2>
        {message && <p className="whitespace-pre-line text-sm text-secondaryText">{message}</p>}
        {type !== "loading" && (
          <div className="mt-6 flex w-full flex-col gap-2">
            {showRetry && retryAction && (
              <Button full onClick={retryAction}>
                Try again
              </Button>
            )}
            {onAction && (
              <Button full onClick={onAction}>
                {actionLabel ?? "OK"}
              </Button>
            )}
            {onClose && !(onAction && actionLabel === "OK") && (
              <Button full variant={hasPrimary ? "outline" : "primary"} onClick={onClose}>
                {hasPrimary ? "Cancel" : type === "error" ? "Close" : "OK"}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
