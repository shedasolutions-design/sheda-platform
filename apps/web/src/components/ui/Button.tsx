"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "./Spinner";

type Variant = "primary" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-[#a82227] disabled:bg-primary/50",
  outline:
    "border border-borderColor bg-white text-primaryText hover:bg-cardBackground disabled:opacity-50",
  ghost: "bg-transparent text-primaryText hover:bg-cardBackground disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  full = false,
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={18} className={variant === "primary" ? "text-white" : ""} />}
      {children}
    </button>
  );
}

/** A link styled as a button, for navigation that should open in a new tab or be crawlable. */
export function ButtonLink({
  href,
  variant = "primary",
  full = false,
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTS[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {children}
    </Link>
  );
}
