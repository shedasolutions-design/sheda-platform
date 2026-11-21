"use client";

/* eslint-disable @next/next/no-img-element -- project photos come from arbitrary hosts */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { Stack } from "@/components/collections/nav";
import { ActivityIndicator } from "@/components/collections/rn";
import { C } from "@/components/collections/ui";
import InfoTip from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCollections } from "@/hooks/useCollections";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { PROJECT_TYPE_TEXT } from "@/services/collections/copy";
import { listingHref, loadMarket, premiumPct, type MarketFlat } from "@/services/collections/shareMarket";

/**
 * Shares other investors are selling, laid out like the marketplace: a card
 * per listing, each opening a page with the full details before you buy.
 * Below, offers to buy that holders can sell into.
 *
 * Each flat's vault runs its own small market: a buyer pays and the shares
 * move in the same transaction, so neither side can be left short. Rent a
 * seller earned before the sale stays theirs. Sheda takes 2% of each sale
 * from the seller.
 */
export default function Shares() {
  const { walletState } = useWallet();
  const me = walletState.account?.accountId ?? null;
  const { postShareOffer, sellToOffer, cancelShareOffer, loading } = useCollections();
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const [flats, setFlats] = useState<MarketFlat[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [offerShares, setOfferShares] = useState("");
  const [offerPrice, setOfferPrice] = useState("");

  const money = (atomic: bigint | string) => {
    const usd = Number(BigInt(atomic)) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : formatPrice(usd);
  };

  const load = useCallback(async () => {
    setFlats(await loadMarket(me));
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
      <div className="mx-auto max-w-3xl space-y-8 px-5 pb-12 pt-4">
        <div>
          <h1 className="text-2xl font-bold text-primaryText">Buy from investors</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-secondaryText">
            Shares in finished and rising buildings, sold by the people who hold them.
            <InfoTip label="How buying shares works" readMore={{ href: "/help/fees" }}>
              You pay and the shares move to you in the same transaction. Rent the seller earned before the sale stays
              theirs; rent from then on is yours. Sheda takes 2% of each sale from the seller.
            </InfoTip>
          </p>
        </div>

        {note ? <p className="rounded-xl bg-cardBackground px-4 py-3 text-sm text-primaryText">{note}</p> : null}

        {flats === null ? (
          <div className="flex justify-center py-16">
            <ActivityIndicator color={C.primary} />
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-3xl bg-cardBackground px-6 py-12 text-center">
            <Building2 size={28} className="mx-auto text-secondaryText" />
            <p className="mt-3 font-semibold text-primaryText">No shares for sale right now</p>
            <p className="mt-1 text-sm text-secondaryText">
              Holders can sell from Portfolio. You can also post an offer below and wait for a seller.
            </p>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2">
            {listings.map(({ f, l }) => {
              const premium = premiumPct(f, l.pricePerShare);
              const pct = f.totalShares > 0n ? Number((BigInt(l.shares) * 10000n) / f.totalShares) / 100 : 0;
              return (
                <li key={f.vault + ":" + l.id}>
                  <Link href={listingHref(f, l.id)} className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100">
                      {f.cover ? (
                        <img src={f.cover} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-secondaryText">
                          <Building2 size={36} />
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-primaryText shadow-sm">
                        {PROJECT_TYPE_TEXT[f.project.project_type ?? "under_construction"]}
                      </span>
                      {premium !== 0 ? (
                        <span
                          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                            premium < 0 ? "bg-green-50 text-green-800" : "bg-white/95 text-brandInk"
                          }`}
                        >
                          {Math.abs(premium)}% {premium < 0 ? "below" : "above"} original
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <p className="truncate font-semibold text-primaryText">
                        {f.unit.label}, {f.project.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-secondaryText">
                        <MapPin size={13} className="shrink-0" /> {f.project.location}
                      </p>
                      <p className="mt-1 text-sm text-secondaryText">
                        {Number(l.shares).toLocaleString()} shares for sale · {pct}% of the flat
                      </p>
                      <p className="mt-1.5">
                        <span className="text-lg font-bold text-primaryText">{money(l.pricePerShare)}</span>
                        <span className="text-sm text-secondaryText"> a share</span>
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {flats && flats.length > 0 ? (
          <section className="space-y-4">
            <h2 className="inline-flex items-center gap-1 text-xl font-semibold text-primaryText">
              Offers to buy
              <InfoTip label="About offers" readMore={{ href: "/help/fees" }}>
                A buyer&apos;s money waits in the flat&apos;s vault at their price. Any holder can sell into it, and the
                buyer can cancel it to get the money back.
              </InfoTip>
            </h2>
            {flats.map((f) => (
              <div key={f.vault} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <p className="font-semibold text-primaryText">
                  {f.unit.label}, {f.project.name}
                </p>
                {f.offers.length === 0 ? <p className="mt-1 text-sm text-secondaryText">No offers yet.</p> : null}
                {f.offers.map((o) => (
                  <div key={o.id} className="mt-3 flex items-center justify-between gap-2 border-t border-borderColor pt-3 text-sm">
                    <span className="text-secondaryText">
                      {Number(o.shares).toLocaleString()} shares at{" "}
                      <span className="font-semibold text-primaryText">{money(o.pricePerShare)}</span>
                    </span>
                    {me && o.buyer === me ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          const r = await cancelShareOffer(f.vault, o.id);
                          done(r.success, "Offer cancelled. The money is on its way back.", r.error);
                        }}
                        className="text-sm font-semibold text-primary"
                      >
                        Cancel my offer
                      </button>
                    ) : f.mine > 0n ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          const n = (f.mine < BigInt(o.shares) ? f.mine : BigInt(o.shares)).toString();
                          const r = await sellToOffer(f.vault, o.id, n);
                          done(r.success, `Sold ${n} shares. Payment (less 2%) is on its way.`, r.error);
                        }}
                        className="rounded-xl bg-cardBackground px-3 py-1.5 text-sm font-semibold hover:bg-gray-200"
                      >
                        Sell to this offer
                      </button>
                    ) : null}
                  </div>
                ))}
                {me ? (
                  offerFor === f.vault ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <input
                        inputMode="numeric"
                        placeholder="Shares"
                        value={offerShares}
                        onChange={(e) => setOfferShares(e.target.value.replace(/\D/g, ""))}
                        className="w-28 rounded-xl border border-borderColor px-3 py-2.5 text-sm"
                      />
                      <input
                        inputMode="decimal"
                        placeholder="Price per share (USD)"
                        value={offerPrice}
                        onChange={(e) => setOfferPrice(e.target.value)}
                        className="w-48 rounded-xl border border-borderColor px-3 py-2.5 text-sm"
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
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Post offer
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setOfferFor(f.vault)} className="mt-3 text-sm font-semibold text-primary">
                      Make an offer
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <p className="text-sm text-secondaryText">
          Prices are set by sellers and buyers, not by Sheda.{" "}
          <Link href="/help/invest-risks" className="font-semibold text-primaryText underline underline-offset-2">
            Know the risks
          </Link>
        </p>
      </div>
    </>
  );
}
