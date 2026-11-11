"use client";

import { useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";

/** Copy text to the clipboard and confirm it with a short toast. */
export function useCopy() {
  const { showLoading, updateToast } = useToast();
  return useCallback(
    async (text: string, label = "Text") => {
      const id = showLoading("Copying…");
      try {
        await navigator.clipboard.writeText(text);
        updateToast(id, { type: "success", message: `${label} copied` });
      } catch {
        updateToast(id, { type: "error", message: "Couldn't copy. Select the text and copy it instead." });
      }
    },
    [showLoading, updateToast]
  );
}
