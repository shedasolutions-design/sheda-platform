"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A small "i" that opens the longer explanation, so screens keep the short
 * version on show and the detail one tap away. Closes on a second tap, a
 * tap elsewhere, or Escape.
 */
export default function InfoTip({
  children,
  label = "More about this",
  align = "left",
}: {
  children: React.ReactNode;
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-secondaryText hover:text-primary"
      >
        <Info size={14} />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-6 z-50 w-64 max-w-[80vw] rounded-xl border border-borderColor bg-white p-3 text-left text-xs font-normal leading-relaxed text-primaryText shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** Long text cut to a few lines, with More / Less. */
export function MoreText({ text, lines = 3, className = "" }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > lines * 60;
  const clamp = lines === 2 ? "line-clamp-2" : lines === 4 ? "line-clamp-4" : "line-clamp-3";
  return (
    <div className={className}>
      <p className={`whitespace-pre-line ${open || !long ? "" : clamp}`}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-primary">
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}
