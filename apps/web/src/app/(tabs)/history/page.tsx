"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import DealTabs from "@/components/history/TransactionList";
import { useMode } from "@/contexts/ModeContext";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import { useTransactions } from "@/hooks/useTransactions";

/** The buyer's deals. Sellers see the same list, with stats, on Activities. */
function History() {
  const router = useRouter();
  const { isSeller, isLoading } = useMode();
  const { getMe, registerWallet } = useApi();
  const { walletState } = useWallet();
  const deals = useTransactions();

  useEffect(() => {
    if (!isLoading && isSeller) router.replace("/activity");
  }, [isLoading, isSeller, router]);

  useEffect(() => {
    getMe({ silent: true });
  }, [getMe]);

  // The backend links deals to people through their wallet.
  useEffect(() => {
    const id = walletState.account?.accountId;
    if (id) registerWallet(id).catch(() => {});
  }, [walletState.account?.accountId, registerWallet]);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-10 pt-5">
      <h1 className="mb-3 text-lg font-semibold">Transaction History</h1>
      <DealTabs deals={deals} />
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AuthGuard requireAuth>
      <History />
    </AuthGuard>
  );
}
