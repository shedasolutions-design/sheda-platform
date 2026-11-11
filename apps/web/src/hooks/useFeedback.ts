import { useCallback, useState } from "react";
import type { FeedbackType } from "@/components/ui/FeedbackModal";

export interface FeedbackState {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
}

/** State for a FeedbackModal: show(type, title, message) and hide(). */
export function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackState>({
    visible: false,
    type: "info",
    title: "",
  });
  const show = useCallback((type: FeedbackType, title: string, message?: string) => {
    setFeedback({ visible: true, type, title, message });
  }, []);
  const hide = useCallback(() => setFeedback((f) => ({ ...f, visible: false })), []);
  const isConnectionError =
    feedback.type === "error" && /connect|network/i.test(feedback.message ?? "");
  return { feedback, show, hide, isConnectionError };
}
