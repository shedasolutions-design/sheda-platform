"use client";

import Link from "next/link";
import { useCurrency } from "@/contexts/CurrencyContext";
import InfoTip from "@/components/ui/InfoTip";
import { perPeriod, rentRangeOf, yearlyRentFor } from "@/services/collections/rent";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "@/components/collections/rn";
import { Stack } from "@/components/collections/nav";
import { C, CollectionsButton, Empty, Note, Screen } from "@/components/collections/ui";
import { useCollections } from "@/hooks/useCollections";
import { custodyState, type Holding } from "@/services/collections/chain";
import { bpsToPercent, formatWithSymbol, ownershipBps } from "@/services/collections/money";
import apiService, { type CollectionProjectSummary } from "@/services/api";

/**
 * What you hold, and what is waiting for you.
 *
 * Vacancy is shown as plainly as income. A unit earning nothing this
 * month is the thing a holder most needs to know and the thing a
 * portfolio screen most often hides behind a total.
 *
 * Which vaults to read comes from the backend rather than from a list
 * kept here: it knows every raise, and a hardcoded list would silently
 * stop including units bought after it was written.
 */
export default function Holdings() {
  const { getHoldings, claim, syncIncome, connected, accountId, loading, error } = useCollections();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  // Which building and flat each vault belongs to, for the photo, the name
  // and what the shares cost.
  const [meta, setMeta] = useState<Record<string, VaultMeta>>({});

  const load = useCallback(async () => {
    if (!connected) {
      setHoldings([]);
      return;
    }
    // Vaults are per flat. This read the project-level vault, which is
    // empty for any raise with units, so no holder ever saw their shares or
    // their rent ("You do not hold any units yet").
    const projects = await apiService.getCollectionProjects({});
    const summaries = projects.ok ? (projects.data as CollectionProjectSummary[]) : [];
    const details = await Promise.all(summaries.map((p) => apiService.getCollectionProject(p.slug)));
    const found: Record<string, VaultMeta> = {};
    details.forEach((d, i) => {
      if (!d.ok) return;
      const summary = summaries[i];
      const base = {
        slug: summary.slug,
        project: summary.name,
        cover: summary.cover_image_url ?? null,
        location: summary.location,
      };
      if (summary.vault_account_id) found[summary.vault_account_id] = base;
      d.data.unit_list.forEach((u) => {
        if (!u.vault_account_id) return;
        found[u.vault_account_id] = {
          ...base,
          unit: u.label,
          priceAtomic: u.price_atomic,
          totalShares: u.total_shares,
          rentMin: u.rent_min_atomic ?? undefined,
          rentMax: u.rent_max_atomic ?? undefined,
        };
      });
    });
    setMeta(found);

    const vaults = Array.from(
      new Set(
        [
          ...summaries.map((p) => p.vault_account_id),
          ...details.flatMap((d) => (d.ok ? d.data.unit_list.map((u) => u.vault_account_id) : [])),
        ].filter((v): v is string => Boolean(v))
      )
    );

    if (vaults.length === 0) {
      setHoldings([]);
      setFailed([]);
      return;
    }

    const result = await getHoldings(vaults);
    if (result) {
      setHoldings(result.holdings);
      setFailed(result.failed);
    }
  }, [connected, getHoldings]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const total = (holdings ?? []).reduce((sum, h) => sum + BigInt(h.claimable || "0"), 0n);
  const earning = (holdings ?? []).filter((h) => BigInt(h.claimable || "0") > 0n).length;
  const token = holdings?.[0]?.info.stablecoin;
  // What the shares cost: shares held times the flat's price per share.
  const invested = (holdings ?? []).reduce((sum, h) => sum + costOf(h, meta[h.vaultId]), 0n);
  const money = useMoney();

  // A vault counts rent only once it has synced the money that arrived.
  // The call existed with no button, so rent paid into a vault could never
  // be claimed. Claim syncs first; "Check for new rent" does it on its own.
  const onSync = async (vaultId: string) => {
    setClaiming(vaultId);
    await syncIncome(vaultId);
    setClaiming(null);
    load();
  };

  const onClaim = async (vaultId: string) => {
    setClaiming(vaultId);
    await syncIncome(vaultId).catch(() => null);
    const result = await claim(vaultId);
    setClaiming(null);
    if (result.success) load();
  };

  return (
    <>
      <Stack.Screen options={{ title: "Portfolio" }} />
      <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primary} />}>
        <div className="rounded-2xl bg-gray-100 px-5 py-7 text-center">
          <p className="text-xs text-secondaryText">Invested</p>
          <p className="mt-1 text-3xl font-bold text-primaryText">{money(invested)}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-primaryText">
            <span className={`h-2 w-2 rounded-full ${total > 0n ? "bg-green-500" : "bg-gray-300"}`} />
            {holdings === null
              ? "Reading your vaults"
              : `${formatWithSymbol(total.toString(), token)} rent ready to claim · ${earning} of ${holdings.length} earning`}
          </p>
        </div>

        {!connected ? (
          <Empty
            title="Connect a wallet to see your portfolio"
            body="Your shares, the rent they have earned and anything ready to claim will show here. Browsing buildings needs no wallet."
          />
        ) : null}

        {error ? <Note tone="critical">{error}</Note> : null}

        {failed.length > 0 ? (
          <Note>
            {failed.length} {failed.length === 1 ? "flat" : "flats"} could not be loaded. Your shares are safe;
            refresh to try again.
          </Note>
        ) : null}

        {connected && holdings === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : connected && holdings && holdings.length === 0 ? (
          <Empty
            title="You do not own any shares yet"
            body="Invest in a building and your share of its rent will appear here once it is let."
          />
        ) : (
          <div className="space-y-4">
            {(holdings ?? []).map((h) => (
              <HoldingCard
                key={h.vaultId}
                holding={h}
                meta={meta[h.vaultId]}
                busy={claiming === h.vaultId}
                onClaim={() => onClaim(h.vaultId)}
                onSync={() => onSync(h.vaultId)}
              />
            ))}
          </div>
        )}

        {accountId ? (
          <p className="text-center text-[11px] text-secondaryText" title={accountId}>
            Wallet {accountId.length > 24 ? `${accountId.slice(0, 8)}…${accountId.slice(-6)}` : accountId}
          </p>
        ) : null}
      </Screen>
    </>
  );
}

interface VaultMeta {
  slug: string;
  project: string;
  cover: string | null;
  location: string;
  unit?: string;
  priceAtomic?: string;
  totalShares?: string;
  rentMin?: string;
  rentMax?: string;
}

/** USDC atomic units (6 decimals) shown in the person's chosen currency, as on Invest. */
function useMoney() {
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  return (atomic: bigint) => {
    const usd = Number(atomic) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };
}

function costOf(h: Holding, m?: VaultMeta): bigint {
  if (!m?.priceAtomic || !m.totalShares) return 0n;
  const total = BigInt(m.totalShares);
  if (total <= 0n) return 0n;
  return (BigInt(h.balance || "0") * BigInt(m.priceAtomic)) / total;
}

function HoldingCard({
  holding,
  meta,
  busy,
  onClaim,
  onSync,
}: {
  holding: Holding;
  meta?: VaultMeta;
  busy: boolean;
  onClaim: () => void;
  onSync: () => void;
}) {
  const { info, balance, claimable } = holding;
  const state = custodyState(info.custody);
  const share = ownershipBps(balance, info.total_supply);
  const paying = BigInt(claimable || "0") > 0n;
  const cost = costOf(holding, meta);
  const money = useMoney();
  // The builder's expected rent, as this holder's cut a month after the
  // vault's own fees. Not shown once redeemed: nothing more will be paid.
  const range = meta ? rentRangeOf({ rent_min_atomic: meta.rentMin, rent_max_atomic: meta.rentMax }) : null;
  const supply = BigInt(info.total_supply || "0") > 0n ? BigInt(info.total_supply) : BigInt(meta?.totalShares || "0");
  const possible =
    range && state !== "redeemed"
      ? perPeriod(
          yearlyRentFor(BigInt(balance || "0"), supply, range, info.manager_bps + info.reserve_bps + info.platform_bps),
          "month"
        )
      : null;

  const status =
    state === "awaiting"
      ? { label: "Still being built", cls: "bg-amber-50 text-amber-700" }
      : state === "redeemed"
        ? { label: "Redeemed", cls: "bg-gray-100 text-secondaryText" }
        : paying
          ? { label: "Earning", cls: "bg-green-50 text-green-700" }
          : { label: "No rent yet this period", cls: "bg-amber-50 text-amber-700" };

  const title = meta?.unit ? `${meta.unit}, ${meta.project}` : (meta?.project ?? info.name);

  return (
    <article className="overflow-hidden rounded-2xl border border-borderColor bg-white shadow-sm">
      <div className="relative aspect-[16/9] bg-gray-100">
        {meta?.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.cover} alt="" className="h-full w-full object-cover" />
        ) : null}
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-medium ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-primaryText">{title}</h2>
            {meta?.location ? <p className="text-xs text-secondaryText">{meta.location}</p> : null}
          </div>
          {cost > 0n ? (
            <p className="shrink-0 text-right font-semibold text-primaryText">{money(cost)}</p>
          ) : null}
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-secondaryText">Ownership</dt>
            <dd className="font-medium text-primaryText">
              {bpsToPercent(share)} <span className="font-normal text-secondaryText">({balance} shares)</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-secondaryText">Rent ready to claim</dt>
            <dd className={`font-medium ${paying ? "text-green-700" : "text-primaryText"}`}>
              {formatWithSymbol(claimable, info.stablecoin)}
            </dd>
          </div>
          {possible ? (
            <div className="flex justify-between gap-3">
              <dt className="inline-flex items-center gap-1 text-secondaryText">
                Possible rent
                <InfoTip label="About possible rent">
                  Your share of the builder&apos;s expected rent, after the vault&apos;s fees. Starts once the flat is
                  finished and let. An estimate, not a promise.
                </InfoTip>
              </dt>
              <dd className="font-medium text-primaryText">
                {money(possible.min)} – {money(possible.max)} a month
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-secondaryText">Managed by</dt>
            <dd className="truncate font-medium text-primaryText">{info.manager}</dd>
          </div>
        </dl>

        <div className="flex gap-2">
          {paying ? (
            <div className="flex-1">
              <CollectionsButton label="Claim rent" loading={busy} onPress={onClaim} />
            </div>
          ) : state !== "redeemed" ? (
            <div className="flex-1">
              <CollectionsButton label="Check for rent" variant="quiet" loading={busy} onPress={onSync} />
            </div>
          ) : null}
          {meta?.slug ? (
            <Link
              href={`/collections/project/${meta.slug}`}
              className="flex flex-1 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-[#a82227]"
            >
              View details
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
