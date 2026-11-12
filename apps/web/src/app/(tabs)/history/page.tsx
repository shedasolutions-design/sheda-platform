"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import DealTabs from "@/components/history/TransactionList";
import { useMode } from "@/contexts/ModeContext";
import { useApi } from "@/contexts/ApiContext";
import { useTransactions } from "@/hooks/useTransactions";

/** The buyer's deals. Sellers see the same list, with stats, on Activities. */
function History() {
  const router = useRouter();
  const { isSeller, isLoading } = useMode();
  const { getMe } = useApi();
  const deals = useTransactions();

  useEffect(() => {
    if (!isLoading && isSeller) router.replace("/activity");
  }, [isLoading, isSeller, router]);

  useEffect(() => {
    getMe({ silent: true });
  }, [getMe]);

  // Wallet registration (how the backend links deals to people) now happens
  // in WalletContext as soon as a wallet connects, on every page.

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
