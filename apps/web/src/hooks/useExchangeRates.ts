import { useState, useEffect, useCallback } from "react";
import { fetchExchangeRates } from "@/services/priceService";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface UseExchangeRatesResult {
  ngnPerUsd: number | null;
  ngnPerNear: number | null;
  nearUsd: number | null;
  usdtUsd: number | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
  refresh: () => Promise<void>;
}

export function useExchangeRates(): UseExchangeRatesResult {
  const [rates, setRates] = useState<{
    ngnPerUsd: number | null;
    ngnPerNear: number | null;
    nearUsd: number | null;
    usdtUsd: number | null;
    lastUpdated: number;
  }>({
    ngnPerUsd: null,
    ngnPerNear: null,
    nearUsd: null,
    usdtUsd: null,
    lastUpdated: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchExchangeRates();
      setRates({
        ngnPerUsd: result.ngnPerUsd,
        ngnPerNear: result.ngnPerNear,
        nearUsd: result.nearUsd,
        usdtUsd: result.usdtUsd,
        lastUpdated: result.lastUpdated,
      });
    } catch (err: any) {
      setError(err.message || "Failed to fetch exchange rates");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { ...rates, isLoading, error, refresh };
}
