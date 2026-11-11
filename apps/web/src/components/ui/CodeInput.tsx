"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * One box per digit, for email codes and transaction PINs. Typing advances,
 * Backspace steps back, and pasting a whole code fills every box.
 */
export default function CodeInput({
  length,
  value,
  onChange,
  onComplete,
  secure = false,
  autoFocus = false,
  disabled = false,
  label = "Code",
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  secure?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const handleInput = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g, "").slice(-1);
    if (!ch) return;
    const arr = digits.slice();
    arr[i] = ch;
    const clean = set(arr.join(""));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) {
        arr[i] = "";
      } else if (i > 0) {
        arr[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      set(arr.join(""));
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const clean = set(e.clipboardData.getData("text"));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          type={secure ? "password" : "text"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`${label} digit ${i + 1}`}
          className={`h-13 w-12 rounded-lg border text-center text-xl font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 sm:h-14 sm:w-13 ${
            d ? "border-borderColor bg-borderColor/60" : "border-[#E5E5E5] bg-cardBackground"
          }`}
        />
      ))}
    </div>
  );
}
