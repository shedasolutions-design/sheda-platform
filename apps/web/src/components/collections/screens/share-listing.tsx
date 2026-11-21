"use client";

/* eslint-disable @next/next/no-img-element -- project photos come from arbitrary hosts */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, KeyRound, MapPin, Minus, Percent, Plus, ShieldCheck, TrendingUp, UserCog } from "lucide-react";
import { Stack } from "@/components/collections/nav";
import { ActivityIndicator } from "@/components/collections/rn";
import { C } from "@/components/collections/ui";
import ThingsToKnow from "@/components/common/ThingsToKnow";
import { MoreText } from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCollections } from "@/hooks/useCollections";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { getQueryParam } from "@/lib/navigation";
import apiService from "@/services/api";
import { getFlatStage, type FlatStage } from "@/services/collections/chain";
import { PROJECT_TYPE_TEXT } from "@/services/collections/copy";
import { perPeriod, rentRangeOf, yearlyRentFor } from "@/services/collections/rent";
import { loadFlat, premiumPct, type MarketFlat } from "@/services/collections/shareMarket";

const STAGE_TEXT: Record<FlatStage["stage"], string> = {
  building: "Being built",
  with_manager: "Finished, with the manager",
  listed: "Finished, listed for rent",
  rented: "Rented",
  redeemed: "Taken whole by one holder",
};

/**
 * One block of shares for sale, laid out like a property listing: the
 * building and flat, what the shares are worth against the raise, the rent
 * they could earn, who is selling, and how buying works, before Buy.
 */
export default function ShareListing() {
  const { walletState } = useWallet();
  const me = walletState.account?.accountId ?? null;
  const { buyShares, loading } = useCollections();
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const [flat, setFlat] = useState<MarketFlat | null | undefined>(undefined);
  const [stage, setStage] = useState<FlatStage | null>(null);
  const [seller, setSeller] = useState<string | null>(null);
  const [qty, setQty] = useState<bigint>(0n);
  const [note, setNote] = useState<string | null>(null);
  const [ids, setIds] = useState<{ slug: string; vault: string; id: number } | null>(null);

  const money = (atomic: bigint | string) => {
    const usd = Number(BigInt(atomic)) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : formatPrice(usd);
  };

  useEffect(() => {
    const t = setTimeout(() =>
      setIds({ slug: getQueryParam("slug") ?? "", vault: getQueryParam("vault") ?? "", id: Number(getQueryParam("id")) })
    );
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    loadFlat(ids.slug, ids.vault, me).then((f) => alive && setFlat(f));
    getFlatStage(ids.vault)
      .then((s) => alive && setStage(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ids, me]);

  const listing = useMemo(() => flat?.listings.find((l) => l.id === ids?.id) ?? null, [flat, ids]);

  // Start at the whole listing; the seller's name, once known.
  useEffect(() => {
    if (!listing) return;
    const t = setTimeout(() => setQty(BigInt(listing.shares)));
    apiService
      .getUserByWallet(listing.seller)
      .then((r) => setSeller(r.ok && r.data?.name ? r.data.name : null))
      .catch(() => {});
    return () => clearTimeout(t);
  }, [listing]);

  if (!ids || flat === undefined) {
    return (
      <div className="flex justify-center py-20">
        <ActivityIndicator color={C.primary} />
      </div>
    );
  }
  if (!flat || !listing) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <Stack.Screen options={{ title: "Shares" }} />
        <p className="font-semibold">These shares are no longer for sale</p>
        <p className="mt-1 text-sm text-secondaryText">Someone may have bought them, or the seller took them off.</p>
        <Link href="/collections/shares" className="mt-4 inline-block font-semibold text-primary">
          See other shares
        </Link>
      </div>
    );
  }

  const available = BigInt(listing.shares);
  const n = qty > available ? available : qty < 1n ? 1n : qty;
  const cost = n * BigInt(listing.pricePerShare);
  const pct = flat.totalShares > 0n ? Number((n * 10000n) / flat.totalShares) / 100 : 0;
  const premium = premiumPct(flat, listing.pricePerShare);
  const range = rentRangeOf(flat.unit);
  const rent = range ? perPeriod(yearlyRentFor(n, flat.totalShares, range, flat.feeBps), "month") : null;
  const mine = me && listing.seller === me;
  const short = (a: string) => (a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);
  const step = (d: bigint) => setQty((q) => {
    const next = (q > available ? available : q) + d;
    return next < 1n ? 1n : next > available ? available : next;
  });

  return (
    <>
      <Stack.Screen options={{ title: "Shares for sale" }} />
      <div className="mx-auto max-w-3xl pb-36">
        <div className="aspect-[16/10] w-full overflow-hidden bg-gray-100 md:rounded-b-2xl">
          {flat.cover ? (
            <img src={flat.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-secondaryText">
              <Building2 size={44} />
            </div>
          )}
        </div>

        <section className="px-5 pb-2 pt-5">
          <h1 className="text-2xl font-bold leading-tight">
            {flat.unit.label}, {flat.project.name}
          </h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-secondaryText">
            <MapPin size={14} className="shrink-0" /> {flat.project.location}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-cardBackground px-3 py-1">
              {PROJECT_TYPE_TEXT[flat.project.project_type ?? "under_construction"]}
            </span>
            {stage ? <span className="rounded-full bg-cardBackground px-3 py-1">{STAGE_TEXT[stage.stage]}</span> : null}
            {flat.unit.bedrooms ? (
              <span className="rounded-full bg-cardBackground px-3 py-1">
                {flat.unit.bedrooms} bedroom{flat.unit.bedrooms === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-borderColor rounded-2xl bg-white py-4 text-center shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
            <div className="px-2">
              <p className="text-lg font-bold">{money(listing.pricePerShare)}</p>
              <p className="text-xs text-secondaryText">a share</p>
            </div>
            <div className="px-2">
              <p className="text-lg font-bold">{available.toLocaleString()}</p>
              <p className="text-xs text-secondaryText">for sale</p>
            </div>
            <div className="px-2">
              <p className={`text-lg font-bold ${premium < 0 ? "text-green-700" : premium > 0 ? "text-brandInk" : ""}`}>
                {premium === 0 ? "Same" : `${premium > 0 ? "+" : "−"}${Math.abs(premium)}%`}
              </p>
              <p className="text-xs text-secondaryText">vs {money(flat.originalPerShare)} original</p>
            </div>
          </div>
        </section>

        <section className="border-t border-borderColor px-5 py-6">
          <h2 className="mb-1 text-xl font-semibold">How many shares?</h2>
          <p className="text-sm text-secondaryText">
            Buy all {available.toLocaleString()} or part of them. Each share is an equal part of the flat and its rent.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              aria-label="Fewer shares"
              onClick={() => step(-1n)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-borderColor hover:bg-cardBackground"
            >
              <Minus size={18} />
            </button>
            <input
              inputMode="numeric"
              aria-label="Shares to buy"
              value={n.toString()}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setQty(v ? BigInt(v) : 1n);
              }}
              className="w-28 rounded-xl border border-borderColor px-3 py-2.5 text-center text-lg font-semibold"
            />
            <button
              type="button"
              aria-label="More shares"
              onClick={() => step(1n)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-borderColor hover:bg-cardBackground"
            >
              <Plus size={18} />
            </button>
            <button type="button" onClick={() => setQty(available)} className="ml-auto text-sm font-semibold underline underline-offset-4">
              All {available.toLocaleString()}
            </button>
          </div>
          <p className="mt-3 text-sm text-secondaryText">That&apos;s {pct}% of the flat.</p>
        </section>

        <section className="border-t border-borderColor px-5 py-6">
          <h2 className="mb-3 text-xl font-semibold">Rent you could earn</h2>
          {rent ? (
            <div className="rounded-2xl bg-cardBackground p-4">
              <p className="text-2xl font-bold">
                {money(rent.min)} – {money(rent.max)}
                <span className="text-base font-normal text-secondaryText"> a month</span>
              </p>
              <p className="mt-1 text-sm text-secondaryText">
                For {n.toLocaleString()} shares, after the manager&apos;s fee, the repair reserve and Sheda&apos;s 2%. Based on the
                builder&apos;s estimate, and only once the flat is let.{" "}
                <Link href="/help/invest-risks" className="font-semibold text-primaryText underline underline-offset-2">
                  Read more
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-secondaryText">The builder hasn&apos;t given an expected rent for this flat.</p>
          )}
        </section>

        <section className="border-t border-borderColor px-5 py-6">
          <h2 className="mb-3 text-xl font-semibold">Who&apos;s selling</h2>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brandTint font-bold text-primary">
              {(seller || listing.seller).slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{mine ? "You" : seller || "A Sheda investor"}</span>
              <span className="block truncate text-xs text-secondaryText">{short(listing.seller)}</span>
            </span>
          </div>
          <p className="mt-3 text-sm text-secondaryText">
            Rent the seller earned before the sale stays theirs. From the moment you buy, the rent on these shares is yours.
          </p>
        </section>

        {flat.project.description ? (
          <section className="border-t border-borderColor px-5 py-6">
            <h2 className="mb-2 text-xl font-semibold">About the building</h2>
            <MoreText text={flat.project.description} lines={4} className="leading-7 text-primaryText/90" />
            <Link href={`/collections/project/${flat.slug}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
              See the whole project
            </Link>
          </section>
        ) : null}

        {flat.project.manager ? (
          <section className="border-t border-borderColor px-5 py-6">
            <h2 className="mb-3 text-xl font-semibold">Property manager</h2>
            <div className="flex items-center gap-3">
              <UserCog size={24} strokeWidth={1.6} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{flat.project.manager.display_name}</span>
                <span className="block text-sm text-secondaryText">Finds tenants, collects rent and looks after the flat.</span>
              </span>
              {flat.project.manager.fee_bps != null ? (
                <span className="text-right">
                  <span className="block font-bold">{flat.project.manager.fee_bps / 100}%</span>
                  <span className="block text-xs text-secondaryText">of rent</span>
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="border-t border-borderColor px-5 py-6">
          <ThingsToKnow
            items={[
              { Icon: KeyRound, title: "What you own", line: "Shares in this flat, and that share of its rent.", help: "how-a-raise-works" },
              { Icon: ShieldCheck, title: "Paid and moved together", line: "Your payment and the shares move in one transaction.", help: "fees" },
              { Icon: Percent, title: "Fees", line: "Sheda's 2% comes from the seller, not from you.", help: "fees" },
              { Icon: TrendingUp, title: "Risks", line: "Rent is an estimate, and shares can be slow to sell.", help: "invest-risks" },
            ]}
          />
        </div>

        {note ? <p className="mx-5 rounded-xl bg-cardBackground px-4 py-3 text-sm">{note}</p> : null}
      </div>

      {/* Bottom bar, as on a listing: the total and Buy. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-borderColor bg-white p-4 md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold">{money(cost)}</p>
            <p className="text-xs text-secondaryText">
              {n.toLocaleString()} share{n === 1n ? "" : "s"} · {pct}% of the flat
            </p>
          </div>
          {mine ? (
            <p className="text-sm text-secondaryText">Your listing. Cancel it from Portfolio.</p>
          ) : !me ? (
            <Link href="/wallet-setup" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">
              Set up your wallet to buy
            </Link>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                const r = await buyShares({
                  stablecoin: DEFAULT_TOKEN,
                  vaultId: flat.vault,
                  listingId: listing.id,
                  shares: n.toString(),
                  amountAtomic: cost.toString(),
                });
                setNote(r.success ? "Bought. The shares are in your Portfolio." : r.error ?? "That did not go through.");
                if (r.success) {
                  void apiService.watchCollectionProject(flat.slug);
                  setTimeout(() => ids && loadFlat(ids.slug, ids.vault, me).then(setFlat), 4000);
                }
              }}
              className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Buy now
            </button>
          )}
        </div>
      </div>
    </>
  );
}
