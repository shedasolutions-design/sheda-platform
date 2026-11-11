"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A dialog built on the native <dialog> element, so focus trapping, Escape and
 * the backdrop come from the browser rather than from hand-written code.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  /** Omit to make the dialog impossible to dismiss (e.g. while a write is in flight). */
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const canClose = dismissible && !!onClose;
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (canClose) onClose?.();
      }}
      onClick={(e) => {
        if (canClose && e.target === ref.current) onClose?.();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-2xl bg-white p-0 text-primaryText shadow-xl backdrop:bg-black/40`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          {(title || canClose) && (
            <div className="mb-4 flex items-start justify-between gap-4">
              {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-m-1 rounded-lg p-1 text-secondaryText hover:bg-cardBackground hover:text-primaryText"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
