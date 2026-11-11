"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import type { SelectOption } from "@/types/ui";
import { inputClass } from "./TextField";

/** A labelled native select: keyboard, screen readers and phones handled by the browser. */
export default function SelectField({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  error,
  className = "",
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  label?: string;
  options: SelectOption[];
  value: string | number | undefined | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onValueChange(e.target.value)}
          className={`${inputClass} appearance-none pr-10 ${error ? "border-red-500" : ""}`}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={String(o.value)} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondaryText" />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
