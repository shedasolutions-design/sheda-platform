import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import { helpHref } from "@/content/help";

/**
 * A short note on a screen, with the full explanation one tap away in the
 * Help Center. Brand colours: "caution" in the soft red, "info" in grey.
 * Keep the text to a sentence; the detail belongs in the article.
 */
export default function Note({
  children,
  tone = "caution",
  help,
  linkText = "Read more",
  className = "",
}: {
  children: ReactNode;
  tone?: "caution" | "info";
  /** Help Center article slug. */
  help?: string;
  linkText?: string;
  className?: string;
}) {
  const caution = tone === "caution";
  const Icon = caution ? AlertCircle : Info;
  return (
    <div
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${
        caution ? "border-brandBorder bg-brandTint text-brandInk" : "border-borderColor bg-cardBackground text-primaryText"
      } ${className}`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${caution ? "text-primary" : "text-secondaryText"}`} aria-hidden="true" />
      <p className="min-w-0 leading-relaxed">
        {children}{" "}
        {help ? (
          <Link href={helpHref(help)} className="whitespace-nowrap font-semibold underline underline-offset-2">
            {linkText}
          </Link>
        ) : null}
      </p>
    </div>
  );
}
