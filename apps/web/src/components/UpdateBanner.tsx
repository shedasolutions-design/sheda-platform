"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/** The build this page was loaded from (stamped by next.config.ts). */
const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "";
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * "A new version is available" when the site has been updated since this
 * tab loaded.
 *
 * Phones keep a tab open for days, still running the code it first loaded.
 * A tester hit an error that had already been fixed: her tab simply had
 * the old version. This checks the live build every few minutes and when
 * the tab comes back into view, and offers a one-tap refresh. It never
 * reloads on its own, so nothing half-typed is lost.
 */
export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!LOADED_BUILD) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (alive && build && build !== LOADED_BUILD) setStale(true);
      } catch {
        /* offline: try again next time */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const id = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    const first = setTimeout(check, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 bg-primaryText px-4 py-2.5 text-sm text-white">
      <span>A new version of Sheda is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primaryText"
      >
        <RefreshCw size={14} /> Refresh
      </button>
    </div>
  );
}
