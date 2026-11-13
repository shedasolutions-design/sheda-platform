"use client";

/* eslint-disable @next/next/no-img-element -- project photos come from arbitrary hosts */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Stack } from "@/components/collections/nav";
import { ActivityIndicator } from "@/components/collections/rn";
import { C } from "@/components/collections/ui";
import InfoTip from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCollections } from "@/hooks/useCollections";
import { DEFAULT_TOKEN } from "@/config/tokens";
import apiService, { type CollectionProjectSummary } from "@/services/api";
import {
  getShareListings,
  getShareOffers,
  getShareBalance,
  type ShareListing,
  type ShareOffer,
} from "@/services/collections/chain";
import { INFO } from "@/services/collections/copy";

interface Flat {
  vault: string;
  slug: string;
  project: string;
  cover: string | null;
  label: string;
  totalShares: bigint;
  originalPerShare: bigint;
  listings: ShareListing[];
  offers: ShareOffer[];
  mine: bigint;
}

/**
 * Shares other investors are selling, and offers to buy them.
 *
 * Each flat's vault runs its own small market: a buyer pays and the shares
 * move in the same transaction, so neither side can be left short. Rent a
 * seller earned before the sale stays theirs. Sheda takes 2% of each sale
 * from the seller.
 */
export default function Shares() {
  const { walletState } = useWallet();
  const me = walletState.account?.accountId ?? null;
  const { buyShares, postShareOffer, sellToOffer, cancelShareOffer, loading } = useCollections();
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const [flats, setFlats] = useState<Flat[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [offerShares, setOfferShares] = useState("");
  const [offerPrice, setOfferPrice] = useState("");

  const money = (atomic: bigint | string) => {
    const usd = Number(BigInt(atomic)) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };

  const load = useCallback(async () => {
    const r = await apiService.getCollectionProjects({});
    const summaries = r.ok ? (r.data as CollectionProjectSummary[]) : [];
    const details = await Promise.all(summaries.map((p) => apiService.getCollectionProject(p.slug)));
    const out: Flat[] = [];
    for (const d of details) {
      if (!d.ok) continue;
      for (const u of d.data.unit_list) {
        if (!u.vault_account_id) continue;
        const listings = await getShareListings(u.vault_account_id);
        if (listings === null) continue; // a vault without a market yet
        const offers = (await getShareOffers(u.vault_account_id)) ?? [];
        const total = BigInt(u.total_shares || "0");
        out.push({
          vault: u.vault_account_id,
          slug: d.data.slug,
          project: d.data.name,
          cover: d.data.cover_image_url ?? null,
          label: u.label,
          totalShares: total,
          originalPerShare: total > BigInt(0) ? BigInt(u.price_atomic) / total : BigInt(0),
          listings,
          offers,
          mine: me ? BigInt(await getShareBalance(u.vault_account_id, me).catch(() => "0")) : BigInt(0),
        });
      }
    }
    setFlats(out);
  }, [me]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const done = (ok: boolean, okText: string, err?: string) => {
    setNote(ok ? okText : err ?? "That did not go through.");
    if (ok) setTimeout(load, 4000);
  };

  const listings = (flats ?? []).flatMap((f) => f.listings.map((l) => ({ f, l })));

  return (
    <>
      <Stack.Screen options={{ title: "Shares" }} />
      <div className="mx-auto max-w-3xl space-y-5 px-5 pb-10 pt-4">
        <div>
          <h1 className="text-xl font-semibold text-primaryText">Buy from investors</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-secondaryText">
            Shares in finished and rising buildings, sold by the people who hold them.
            <InfoTip label="How buying shares works">
              You pay and the shares move to you in the same transaction. Rent the seller earned before the sale stays
              theirs; rent from then on is yours. Sheda takes 2% of each sale from the seller.
            </InfoTip>
          </p>
        </div>

        {note ? <p className="rounded-xl bg-cardBackground px-3 py-2 text-sm text-primaryText">{note}</p> : null}

        {flats === null ? (
          <div className="flex justify-center py-16">
            <ActivityIndicator color={C.primary} />
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-borderColor px-6 py-10 text-center">
            <p className="font-medium text-primaryText">No shares for sale right now</p>
            <p className="mt-1 text-sm text-secondaryText">
              Holders can sell from Portfolio. You can also post an offer below and wait for a seller.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(({ f, l }) => {
              const key = f.vault + ":" + l.id;
              const n = qty[key] ?? l.shares;
              const nBig = /^\d+$/.test(n) ? BigInt(n) : BigInt(0);
              const capped = nBig > BigInt(l.shares) ? BigInt(l.shares) : nBig;
              const cost = capped * BigInt(l.pricePerShare);
              const pct = f.totalShares > BigInt(0) ? Number((capped * BigInt(10000)) / f.totalShares) / 100 : 0;
              const premium =
                f.originalPerShare > BigInt(0)
                  ? Math.round(((Number(l.pricePerShare) - Number(f.originalPerShare)) / Number(f.originalPerShare)) * 100)
                  : 0;
              return (
                <article key={key} className="rounded-2xl border border-borderColor p-4">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {f.cover ? <img src={f.cover} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/collections/project/${f.slug}`} className="block truncate font-semibold text-primaryText">
                        {f.label}, {f.project}
                      </Link>
                      <p className="text-xs text-secondaryText">
                        {l.shares} shares at {money(l.pricePerShare)} each ·{" "}
                        <span className={premium > 0 ? "text-amber-700" : premium < 0 ? "text-green-700" : ""}>
                          {premium === 0 ? "same as" : `${Math.abs(premium)}% ${premium > 0 ? "above" : "below"}`} the original price
                        </span>
                      </p>
                    </div>
                  </div>
                  {me && l.seller !== me ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={n}
                        onChange={(e) => setQty({ ...qty, [key]: e.target.value.replace(/\D/g, "") })}
                        aria-label="Shares to buy"
                        className="w-24 rounded-xl border border-borderColor px-3 py-2 text-sm"
                      />
                      <span className="text-xs text-secondaryText">shares · {pct}% of the flat</span>
                      <button
                        type="button"
                        disabled={loading || capped === BigInt(0)}
                        onClick={async () => {
                          const r = await buyShares({
                            stablecoin: DEFAULT_TOKEN,
                            vaultId: f.vault,
                            listingId: l.id,
                            shares: capped.toString(),
                            amountAtomic: cost.toString(),
                          });
                          done(r.success, "Bought. The shares are in your Portfolio.", r.error);
                          if (r.success) void apiService.watchCollectionProject(f.slug);
                        }}
                        className="ml-auto rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Buy for {money(cost)}
                      </button>
                    </div>
                  ) : l.seller === me ? (
                    <p className="mt-2 text-xs text-secondaryText">Your listing. Cancel it from Portfolio.</p>
                  ) : (
                    <p className="mt-2 text-xs text-secondaryText">Connect your wallet to buy.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {flats && flats.length > 0 ? (
          <section className="space-y-3">
            <h2 className="inline-flex items-center gap-1 text-base font-semibold text-primaryText">
              Offers to buy
              <InfoTip label="About offers">
                A buyer&apos;s money waits in the flat&apos;s vault at their price. Any holder can sell into it, and the
                buyer can cancel it to get the money back.
              </InfoTip>
            </h2>
            {flats.map((f) => (
              <div key={f.vault} className="rounded-2xl border border-borderColor p-4">
                <p className="font-medium text-primaryText">
                  {f.label}, {f.project}
                </p>
                {f.offers.length === 0 ? <p className="text-xs text-secondaryText">No offers yet.</p> : null}
                {f.offers.map((o) => (
                  <div key={o.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="text-secondaryText">
                      {o.shares} shares at {money(o.pricePerShare)}
                    </span>
                    {me && o.buyer === me ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          const r = await cancelShareOffer(f.vault, o.id);
                          done(r.success, "Offer cancelled. The money is on its way back.", r.error);
                        }}
                        className="text-xs font-medium text-primary"
                      >
                        Cancel my offer
                      </button>
                    ) : f.mine > BigInt(0) ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          const n = (f.mine < BigInt(o.shares) ? f.mine : BigInt(o.shares)).toString();
                          const r = await sellToOffer(f.vault, o.id, n);
                          done(r.success, `Sold ${n} shares. Payment (less 2%) is on its way.`, r.error);
                        }}
                        className="rounded-lg border border-borderColor px-3 py-1 text-xs font-medium"
                      >
                        Sell to this offer
                      </button>
                    ) : null}
                  </div>
                ))}
                {me ? (
                  offerFor === f.vault ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        inputMode="numeric"
                        placeholder="Shares"
                        value={offerShares}
                        onChange={(e) => setOfferShares(e.target.value.replace(/\D/g, ""))}
                        className="w-24 rounded-xl border border-borderColor px-3 py-2 text-sm"
                      />
                      <input
                        inputMode="decimal"
                        placeholder="Price per share (USD)"
                        value={offerPrice}
                        onChange={(e) => setOfferPrice(e.target.value)}
                        className="w-44 rounded-xl border border-borderColor px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={loading || !offerShares || !(Number(offerPrice) > 0)}
                        onClick={async () => {
                          const r = await postShareOffer({
                            stablecoin: DEFAULT_TOKEN,
                            vaultId: f.vault,
                            shares: offerShares,
                            pricePerShare: String(Math.round(Number(offerPrice) * 1_000_000)),
                          });
                          done(r.success, "Offer posted. Your money waits in the vault until a holder sells.", r.error);
                          if (r.success) setOfferFor(null);
                        }}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Post offer
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setOfferFor(f.vault)} className="mt-2 text-xs font-medium text-primary">
                      Make an offer
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <p className="text-xs text-secondaryText">
          {INFO.resale} Prices are set by sellers and buyers, not by Sheda.{" "}
          <Link href="/collections/risks" className="font-medium text-primary">
            Know the risks
          </Link>
        </p>
      </div>
    </>
  );
}
