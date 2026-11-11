"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Title bar for pushed screens: a back button, a title, and optional actions.
 * Back goes to the previous page when there is one, otherwise to `fallback`,
 * so a page opened from a shared link still has somewhere to go.
 */
export default function PageHeader({
  title,
  actions,
  fallback = "/home",
  back = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  fallback?: string;
  back?: boolean;
}) {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace(fallback);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-borderColor/60 bg-white/95 px-2 backdrop-blur md:px-4">
      {back && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="rounded-lg p-2 hover:bg-cardBackground"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <h1 className={`flex-1 truncate text-base font-semibold ${back ? "" : "pl-2"}`}>{title}</h1>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
