"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { PropertySkeletonList } from "@/components/property/HouseCard";
import { EmptyState } from "@/components/ui/States";
import Button from "@/components/ui/Button";
import OngoingCard from "./OngoingCard";
import ActiveCard from "./ActiveCard";
import ExpireCard from "./ExpireCard";
import CancelledCard from "./CancelledCard";
import type { useTransactions } from "@/hooks/useTransactions";
import { useExpirationChecker } from "@/hooks/useExpirationChecker";

const TABS = ["Ongoing", "Active", "Cancelled", "Expired"] as const;
type Tab = (typeof TABS)[number];

/**
 * Ongoing / Active / Cancelled / Expired deals, each with its own card: a
 * live bid, a closed agreement still running, and a dead bid have different
 * actions. Shared by the buyer's History and the seller's Activities.
 */
export default function DealTabs({ deals }: { deals: ReturnType<typeof useTransactions> }) {
  const [tab, setTab] = useState<Tab>("Ongoing");
  const { ongoing, completed, expired, cancelled, loading, error, refresh, updatePhase } = deals;
  useExpirationChecker(useMemo(() => [...completed, ...expired], [completed, expired]));

  // Deals move while you look at them; poll every minute while the page is open.
  useEffect(() => {
    const id = setInterval(() => refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const lists: Record<Tab, typeof ongoing> = { Ongoing: ongoing, Active: completed, Cancelled: cancelled, Expired: expired };
  const current = lists[tab];
  const Card = tab === "Active" ? ActiveCard : tab === "Expired" ? ExpireCard : tab === "Cancelled" ? CancelledCard : OngoingCard;

  return (
    <>
      <div className="mt-2 grid grid-cols-4 gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-2 py-2.5 text-sm ${tab === t ? "bg-primary text-white" : "bg-primaryLight text-secondaryText hover:bg-active"}`}
          >
            {t}
            {lists[t].length > 0 ? ` (${lists[t].length})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {/* A partial failure still has rows worth showing: warn above them. */}
        {error && current.length > 0 && (
          <p className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
            <button type="button" onClick={refresh} className="ml-2 underline">
              Retry
            </button>
          </p>
        )}
        {error && current.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <p className="mb-3 text-center text-red-500">{error}</p>
            <Button onClick={refresh}>Retry</Button>
          </div>
        ) : loading && current.length === 0 ? (
          <PropertySkeletonList count={3} />
        ) : current.length === 0 ? (
          <EmptyState
            icon={<History size={40} />}
            title={`No ${tab.toLowerCase()} transactions`}
            message="Deals you take part in show up here."
            action={
              <Link href="/home" className="text-sm font-medium text-primary hover:underline">
                Browse properties
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {current.map((tx) => (
              <li key={tx.key}>
                <Card transaction={tx} onPhaseUpdate={updatePhase} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
