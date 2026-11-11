"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: ReactNode;
  /** Shows a show/hide toggle and starts hidden. */
  isPassword?: boolean;
  /** Rendered inside the field on the left, e.g. a currency symbol or icon. */
  leading?: ReactNode;
}

export const inputClass =
  "w-full rounded-xl border border-borderColor bg-white px-4 py-3 text-base text-primaryText placeholder:text-secondaryText focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-cardBackground";

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, isPassword, leading, className = "", id, type, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm text-primaryText">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-secondaryText">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword ? (visible ? "text" : "password") : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`${inputClass} ${leading ? "pl-10" : ""} ${isPassword ? "pr-12" : ""} ${
            error ? "border-red-500" : ""
          }`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-3 flex items-center px-1 text-secondaryText hover:text-primaryText"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-secondaryText">{hint}</p>
      ) : null}
    </div>
  );
});

export default TextField;
