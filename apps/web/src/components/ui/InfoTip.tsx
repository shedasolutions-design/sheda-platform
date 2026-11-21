"use client";

import Link from "next/link";
import { Info, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small "i" that opens the longer explanation, so screens keep the short
 * version on show and the detail one tap away.
 *
 * It opens as a panel from the bottom of the screen, drawn outside the page.
 * It used to float beside the icon, and near the right edge it ran off the
 * screen and pushed the whole page sideways. Closes on the X, a tap outside,
 * or Escape. `readMore` adds a link to the full article in the Help Center.
 */
export default function InfoTip({
  children,
  label = "More about this",
  title,
  readMore,
}: {
  children: React.ReactNode;
  label?: string;
  /** Heading on the panel; defaults to the label. */
  title?: string;
  /** A Help Center path for the full explanation. */
  readMore?: { href: string; text?: string };
  /** No longer used: the panel always opens from the bottom. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const heading = title || label.replace(/^About /, "").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full align-middle text-secondaryText hover:text-primary"
      >
        <Info size={14} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-black/40"
                onClick={() => setOpen(false)}
              />
              <div
                id={id}
                role="dialog"
                aria-modal="true"
                aria-label={heading}
                className="relative w-full max-w-xl rounded-t-3xl bg-white px-6 pb-8 pt-5 text-left shadow-2xl"
              >
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full p-2 text-secondaryText hover:bg-cardBackground"
                >
                  <X size={18} />
                </button>
                <h2 className="pr-10 text-lg font-semibold text-primaryText">{heading}</h2>
                <div className="mt-2 text-sm font-normal leading-relaxed text-secondaryText">{children}</div>
                {readMore ? (
                  <Link
                    href={readMore.href}
                    onClick={() => setOpen(false)}
                    className="mt-4 inline-block text-sm font-semibold text-primaryText underline underline-offset-4"
                  >
                    {readMore.text || "Read more"}
                  </Link>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
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
