"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import InfoTip from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCollections } from "@/hooks/useCollections";
import apiService, { type CollectionProjectSummary } from "@/services/api";
import { getRoundPosition, type RoundPosition } from "@/services/collections/chain";

interface Row {
  project: CollectionProjectSummary;
  pos: RoundPosition;
}

/**
 * Every round this person has money in that is not finished with them yet.
 *
 * Before this, money in a round that was still filling showed up nowhere:
 * Portfolio only listed shares already received. Someone in a round that
 * missed its deadline had no way to find out, let alone take their money
 * back. The contract always allowed it (anyone may close an expired round,
 * then each investor withdraws in full); this puts the button where people
 * look.
 */
export default function RoundsYouAreIn({ accountId }: { accountId: string | null }) {
  const { closeRaise, refundFailedRaise } = useCollections();
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);

  const money = (atomic: bigint) => {
    const usd = Number(atomic) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };

  const load = useCallback(async () => {
    if (!accountId) {
      setRows([]);
      return;
    }
    const r = await apiService.getCollectionProjects({});
    const projects = r.ok ? (r.data as CollectionProjectSummary[]) : [];
    setNow(Date.now());
    const found = await Promise.all(
      projects.map(async (project) => {
        try {
          const pos = await getRoundPosition(project.slug, accountId);
          return pos ? { project, pos } : null;
        } catch {
          return null;
        }
      })
    );
    // Only rounds that still need something from, or say something to, the
    // investor: filling, missed, refundable, stopped, or shares to collect.
    setRows(
      found.filter((x): x is Row => {
        if (!x) return false;
        const s = x.pos.status;
        if (s === "Failed") return !x.pos.refunded;
        if (s === "Open" || s === "Stalled") return true;
        return x.pos.sharesOwed > BigInt(0);
      })
    );
  }, [accountId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!rows || rows.length === 0) return null;

  const getMoneyBack = async (row: Row) => {
    const slug = row.project.slug;
    setBusy(slug);
    setNote({ ...note, [slug]: "" });
    // An expired round has to be closed before refunds open. Anyone may
    // close it; doing both here saves the investor a step they would not
    // know to take.
    if (row.pos.status === "Open") {
      const closed = await closeRaise(slug);
      if (!closed.success) {
        setBusy(null);
        setNote({ ...note, [slug]: closed.error ?? "The round could not be closed. Try again." });
        return;
      }
    }
    const r = await refundFailedRaise(slug);
    setBusy(null);
    setNote({
      ...note,
      [slug]: r.success ? "Sent. Your money arrives in your wallet in a few seconds." : r.error ?? "That did not go through.",
    });
    if (r.success) setTimeout(load, 4000);
  };

  return (
    <section className="space-y-3">
      <h2 className="inline-flex items-center gap-1 text-base font-semibold text-primaryText">
        Rounds you&apos;re in
        <InfoTip label="About rounds">
          Money you put into a round stays in the raise contract, not with the builder. If the round does not fill
          by its deadline, you take back everything you put in. Once it fills, you collect your shares here.
        </InfoTip>
      </h2>
      {rows.map((row) => {
        const { project, pos } = row;
        const expired = pos.status === "Open" && now >= pos.deadlineMs && pos.raised < pos.target;
        const pct = pos.target > BigInt(0) ? Math.min(100, Number((pos.raised * BigInt(100)) / pos.target)) : 0;
        const daysLeft = Math.max(0, Math.ceil((pos.deadlineMs - now) / 86_400_000));
        const canRefund = expired || (pos.status === "Failed" && !pos.refunded);

        const state = canRefund
          ? { text: "Did not fill in time", cls: "bg-amber-50 text-amber-800" }
          : pos.status === "Open"
            ? { text: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, cls: "bg-primaryLight text-primary" }
            : pos.status === "Stalled"
              ? { text: "Building stopped", cls: "bg-red-50 text-red-700" }
              : { text: "Filled: shares ready", cls: "bg-green-50 text-green-700" };

        return (
          <article key={project.id} className="rounded-2xl border border-borderColor bg-white p-4">
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                {project.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-primaryText">{project.name}</p>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${state.cls}`}>
                    {pos.status === "Open" && !expired ? <Clock size={11} /> : null}
                    {state.text}
                  </span>
                </div>
                <p className="text-xs text-secondaryText">You put in {money(pos.committed)}</p>
                {pos.status === "Open" ? (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${expired ? "bg-gray-300" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-secondaryText">{pct}% filled</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {canRefund ? (
                <button
                  type="button"
                  disabled={busy === project.slug}
                  onClick={() => getMoneyBack(row)}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy === project.slug ? "Sending…" : "Get my money back"}
                </button>
              ) : null}
              <Link
                href={`/collections/project/${project.slug}`}
                className="flex flex-1 items-center justify-center rounded-xl border border-borderColor py-2.5 text-sm font-medium text-primaryText"
              >
                {pos.status === "Stalled"
                  ? "See what you can reclaim"
                  : pos.sharesOwed > BigInt(0)
                    ? "Collect my shares"
                    : "View round"}
              </Link>
            </div>
            {note[project.slug] ? <p className="mt-2 text-xs text-secondaryText">{note[project.slug]}</p> : null}
          </article>
        );
      })}
    </section>
  );
}
