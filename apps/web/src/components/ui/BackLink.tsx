"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** A standalone back button for screens without a header bar. */
export default function BackLink({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() =>
        window.history.length > 1 ? router.back() : router.replace(fallback)
      }
      className="-ml-2 rounded-lg p-2 hover:bg-cardBackground"
    >
      <ChevronLeft size={24} />
    </button>
  );
}
