import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { needsAction } from "@/types/transaction";
import { feedItemToTransaction } from "@/hooks/useTransactions";
import type { TransactionFeedItem } from "@/services/api";

const POLL_INTERVAL_MS = 60_000;

/**
 * Count of ongoing deals where the current user has a required next step
 * waiting on them — backs the badge on the Activities/History tab.
 *
 * Deliberately does NOT use the full useTransactions() hook here: that hook
 * does a real on-chain RPC fetch cycle (bids, owned properties, a bid read
 * per owned property) on every mount, and the tab layout stays mounted for
 * the whole session — a second independent copy of that running purely for
 * a nav badge would double the app's baseline RPC load for no real benefit.
 * A nav badge is a hint, not a source of truth, so the backend's own
 * transaction mirror (a single lightweight HTTP call, no RPC) is enough.
 */
export function useUnattendedCount(): number {
  const { walletState } = useWallet();
  const { getTransactions } = useApi();
  const [count, setCount] = useState(0);

  const accountId = walletState.account?.accountId;

  const refresh = useCallback(async () => {
    if (!accountId) {
      setCount(0);
      return;
    }
    try {
      const response = await getTransactions();
      const feedItems: TransactionFeedItem[] = Array.isArray(response)
        ? response
        : (response as any)?.data || [];
      const total = feedItems.filter((item) =>
        needsAction(feedItemToTransaction(item, accountId))
      ).length;
      setCount(total);
    } catch {
      // Non-fatal — badge just keeps its last known value.
    }
  }, [accountId, getTransactions]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return count;
}

export default useUnattendedCount;
