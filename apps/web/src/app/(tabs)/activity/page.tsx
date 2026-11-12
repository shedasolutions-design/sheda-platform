"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import DonutChart from "@/components/common/DonutChart";
import DealTabs from "@/components/history/TransactionList";
import { useApi } from "@/contexts/ApiContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useMode } from "@/contexts/ModeContext";
import { useTransactions } from "@/hooks/useTransactions";
import { isClosedPhase } from "@/types/transaction";
import { Action } from "@/types/contract";
import { stablecoinUnitsToUsd } from "@/constants/exchangeRates";

/** The seller's dashboard: revenue, properties, and their deals. */
function Activities() {
  const router = useRouter();
  const { isSeller, isLoading } = useMode();
  const { getMe, getSchedule, schedule, myListings, getMyListings } = useApi();
  const { formatPrice } = useCurrency();
  const deals = useTransactions();
  const { transactions, ongoing } = deals;
  const [scheduleChecked, setScheduleChecked] = useState(false);

  useEffect(() => {
    if (!isLoading && !isSeller) router.replace("/saved");
  }, [isLoading, isSeller, router]);
  useEffect(() => {
    getMe({ silent: true });
  }, [getMe]);
  // The seller's listings come from their own endpoint. The profile's
  // `listing` field is not filled in, so the counts below read 0 for a seller
  // with a live listing.
  useEffect(() => {
    getMyListings({ silent: true }).catch(() => {});
  }, [getMyListings]);
  useEffect(() => {
    getSchedule()
      .catch(() => {})
      .finally(() => setScheduleChecked(true));
  }, [getSchedule]);

  // Without published hours, every viewing request is refused.
  const noViewingHours = scheduleChecked && (schedule?.length ?? 0) === 0;

  const properties = useMemo(() => {
    const listing = (myListings ?? []).filter(Boolean);
    const total = listing.length;
    const rented = listing.filter((p) => p.status === "rented").length;
    const vacant = listing.filter((p) => p.status === "available").length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return [
      { label: "Total Homes", value: total, color: "#C1272D", percentage: total > 0 ? 100 : 0 },
      { label: "Rented Homes", value: rented, color: "#00BCD4", percentage: pct(rented) },
      { label: "Vacant homes", value: vacant, color: "#FFC107", percentage: pct(vacant) },
    ];
  }, [myListings]);

  const revenue = useMemo(() => {
    const settled = transactions.filter((t) => t.role === "seller" && isClosedPhase(t));
    const awaiting = ongoing.filter((t) => t.role === "seller" && !isClosedPhase(t));
    const sum = (txs: typeof settled) => txs.reduce((s, t) => s + stablecoinUnitsToUsd(parseInt(t.bid.bid_amount, 10) || 0), 0);
    const total = sum(settled);
    const rent = sum(settled.filter((t) => t.bid.action === Action.Lease));
    const pending = sum(awaiting.filter((t) => t.bid.action === Action.Lease));
    return [
      { label: "Total revenue", value: formatPrice(total), color: "#C1272D", percentage: total > 0 ? 100 : 0 },
      { label: "Rent Collected", value: formatPrice(rent), color: "#00BCD4", percentage: total > 0 ? Math.round((rent / total) * 100) : 0 },
      {
        label: "Pending Rent",
        value: formatPrice(pending),
        color: "#FFC107",
        percentage: rent + pending > 0 ? Math.round((pending / (rent + pending)) * 100) : 0,
      },
    ];
  }, [transactions, ongoing, formatPrice]);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-10 pt-5">
      <h1 className="mb-4 text-lg font-semibold">Activities</h1>

      {noViewingHours && (
        <Link href="/availability" className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100">
          <p className="mb-1 text-sm font-semibold text-amber-900">Set your viewing hours</p>
          <p className="text-sm text-amber-700">
            Buyers can&apos;t book a viewing on your listings until you publish the hours you&apos;re available. Click to set them up.
          </p>
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-borderColor p-4">
          <h2 className="mb-4 text-base font-medium text-secondaryText">Revenue</h2>
          <DonutChart data={revenue} />
        </section>
        <section className="rounded-lg border border-borderColor p-4">
          <h2 className="mb-4 text-base font-medium text-secondaryText">Properties</h2>
          <DonutChart data={properties} />
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-borderColor p-4 md:p-6">
        <h2 className="mb-2 text-lg font-semibold">Transaction History</h2>
        <DealTabs deals={deals} />
      </section>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <AuthGuard requireAuth>
      <Activities />
    </AuthGuard>
  );
}
