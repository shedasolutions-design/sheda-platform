import { useCallback, useEffect, useState } from "react";
import api from "@/services/api";
import type { AppointmentStageShow } from "@/services/api";
import { buildDealTimeline, DealTimeline } from "@/utilities/dealTimeline";
import { BidStatus } from "@/types/contract";

// The timeline logic itself lives in utilities/dealTimeline so it can be
// tested without pulling the api service — and AsyncStorage with it — into
// Jest. Re-exported here so callers have a single import.
export * from "@/utilities/dealTimeline";

export function useDealTimeline(
  bidId: number | null | undefined,
  bidStatus: BidStatus | string
): DealTimeline & { refresh: () => Promise<void> } {
  const [stage, setStage] = useState<AppointmentStageShow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (bidId == null) {
      setStage(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAppointmentStage(bidId);
      // No viewing booked yet is a normal state, not a failure — the deal
      // simply hasn't reached that step, and the endpoint 404s. Surfacing it
      // as an error would put a red banner on every freshly accepted bid.
      setStage(response.ok ? response.data : null);
    } catch (e: any) {
      setStage(null);
      setError(e?.message ?? "Couldn't load the appointment stage.");
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...buildDealTimeline(bidStatus, stage),
    loading,
    error,
    refresh: load,
  };
}
