"use client";

import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Spinner from "./Spinner";

export type FeedbackType = "success" | "error" | "info" | "loading";

/**
 * The status dialog the mobile screens used for "Signing in", "Welcome back",
 * "Connection error" and the like. Same props, so ported screens read the same.
 */
export default function FeedbackModal({
  isVisible,
  type,
  title,
  message,
  onClose,
  showRetry,
  retryAction,
}: {
  isVisible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  onClose?: () => void;
  showRetry?: boolean;
  retryAction?: () => void;
}) {
  const icon =
    type === "loading" ? (
      <Spinner size={40} />
    ) : type === "success" ? (
      <CheckCircle2 size={44} className="text-green-600" />
    ) : type === "error" ? (
      <AlertCircle size={44} className="text-primary" />
    ) : (
      <Info size={44} className="text-secondaryText" />
    );

  return (
    <Modal open={isVisible} onClose={type === "loading" ? undefined : onClose} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">{icon}</div>
        <h2 className="mb-1 text-lg font-semibold">{title}</h2>
        {message && <p className="text-sm text-secondaryText">{message}</p>}
        {type !== "loading" && (
          <div className="mt-6 flex w-full flex-col gap-2">
            {showRetry && retryAction && (
              <Button full onClick={retryAction}>
                Try again
              </Button>
            )}
            {onClose && (
              <Button full variant={showRetry ? "outline" : "primary"} onClick={onClose}>
                {type === "error" ? "Close" : "OK"}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
