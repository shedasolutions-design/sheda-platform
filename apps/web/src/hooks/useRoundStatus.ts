"use client";

import { useEffect, useState } from "react";
import { getRaiseChainState } from "@/services/collections/chain";

/**
 * A round's status as the blockchain has it, deadline included, in the
 * backend's lower-case words ("open", "funded", "failed"...). Starts as the
 * backend's status and is corrected once the chain answers, so a round past
 * its deadline stops offering Invest now.
 */
export function useRoundStatus(slug: string | undefined, backendStatus: string | undefined): string | undefined {
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    getRaiseChainState(slug)
      .then((s) => {
        if (alive && s) setLive(s.status.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);
  // The backend knows states the raise contract doesn't (building, stalled).
  if (live && backendStatus === "open") return live;
  return backendStatus;
}
