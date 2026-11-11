"use client";

import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import Spinner from "./Spinner";

/** The single non-blocking toast for on-chain actions (see ToastContext). */
export default function Toast() {
  const { toast, dismissToast } = useToast();
  if (!toast) return null;

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className="fixed inset-x-4 bottom-20 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-xl bg-primaryText px-4 py-3 text-sm text-white shadow-lg md:bottom-6"
    >
      <span className="mt-0.5 shrink-0">
        {toast.type === "loading" ? (
          <Spinner size={18} className="text-white" />
        ) : toast.type === "success" ? (
          <CheckCircle2 size={18} className="text-green-400" />
        ) : (
          <AlertCircle size={18} className="text-red-400" />
        )}
      </span>
      <p className="flex-1">{toast.message}</p>
      {toast.type !== "loading" && (
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
