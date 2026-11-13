"use client";

import { useCallback, useEffect, useState } from "react";
import InfoTip from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCollections } from "@/hooks/useCollections";
import apiService, { type CollectionProfile } from "@/services/api";
import {
  getLockedShares,
  getManagerVoteSupport,
  getShareListings,
  getVaultManagerVote,
  type ShareListing,
} from "@/services/collections/chain";

/**
 * What a holder can do with their shares in a v5 vault: sell some, cancel
 * a listing, and vote to replace the manager. Renders nothing for a vault
 * without a market (v4), so older flats keep the card they had.
 */
export default function HoldingActions({
  vaultId,
  accountId,
  balance,
  supply,
  manager,
  onChanged,
}: {
  vaultId: string;
  accountId: string;
  balance: string;
  supply: string;
  manager: string;
  onChanged: () => void;
}) {
  const { listShares, cancelShareListing, voteVaultManager, applyVaultManagerVote, loading } = useCollections();
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const [listings, setListings] = useState<ShareListing[] | null>(null);
  const [locked, setLocked] = useState<bigint>(BigInt(0));
  const [panel, setPanel] = useState<"sell" | "manager" | null>(null);
  const [n, setN] = useState("");
  const [price, setPrice] = useState("");
  const [managers, setManagers] = useState<CollectionProfile[]>([]);
  const [myVote, setMyVote] = useState<{ manager: string; fee_bps: number } | null>(null);
  const [support, setSupport] = useState<bigint>(BigInt(0));
  const [note, setNote] = useState<string | null>(null);

  const money = (atomic: bigint) => {
    const usd = Number(atomic) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };

  const load = useCallback(async () => {
    const l = await getShareListings(vaultId);
    setListings(l);
    if (l === null) return;
    setLocked(await getLockedShares(vaultId, accountId));
    const v = await getVaultManagerVote(vaultId, accountId);
    setMyVote(v);
    setSupport(v ? await getManagerVoteSupport(vaultId, v.manager, v.fee_bps) : BigInt(0));
  }, [vaultId, accountId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (panel !== "manager" || managers.length) return;
    apiService.getCollectionDirectory("manager", { silent: true }).then((r) => {
      if (r.ok) setManagers(r.data.map((d) => d.profile).filter((p) => p.near_account_id && p.fee_bps != null));
    });
  }, [panel, managers.length]);

  if (listings === null) return null;

  const free = BigInt(balance || "0") - locked;
  const mine = listings.filter((l) => l.seller === accountId);
  const total = BigInt(supply || "0");
  const supportPct = total > BigInt(0) ? Number((support * BigInt(10000)) / total) / 100 : 0;
  const after = (ok: boolean, text: string, err?: string) => {
    setNote(ok ? text : err ?? "That did not go through.");
    if (ok) {
      setPanel(null);
      setTimeout(() => {
        load();
        onChanged();
      }, 3000);
    }
  };

  return (
    <div className="space-y-2 border-t border-borderColor pt-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPanel(panel === "sell" ? null : "sell")}
          className="flex-1 rounded-xl border border-borderColor py-2 text-sm font-medium text-primaryText"
        >
          Sell shares
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "manager" ? null : "manager")}
          className="flex-1 rounded-xl border border-borderColor py-2 text-sm font-medium text-primaryText"
        >
          Change manager
        </button>
      </div>

      {mine.map((l) => (
        <div key={l.id} className="flex items-center justify-between rounded-lg bg-cardBackground px-3 py-2 text-xs">
          <span>
            Listed: {l.shares} at {money(BigInt(l.pricePerShare))} each
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              const r = await cancelShareListing(vaultId, l.id);
              after(r.success, "Listing cancelled.", r.error);
            }}
            className="font-medium text-primary"
          >
            Cancel
          </button>
        </div>
      ))}

      {panel === "sell" ? (
        <div className="space-y-2 rounded-xl bg-cardBackground p-3">
          <p className="inline-flex items-center gap-1 text-xs text-secondaryText">
            {free.toString()} shares free to sell
            <InfoTip label="About selling">
              Listed shares stay yours and keep earning rent until someone buys them. You are paid the moment they do,
              less Sheda&apos;s 2%. You can cancel any time before.
            </InfoTip>
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              placeholder="Shares"
              value={n}
              onChange={(e) => setN(e.target.value.replace(/\D/g, ""))}
              className="w-24 rounded-xl border border-borderColor px-3 py-2 text-sm"
            />
            <input
              inputMode="decimal"
              placeholder="Price per share (USD)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-borderColor px-3 py-2 text-sm"
            />
          </div>
          {n && Number(price) > 0 ? (
            <p className="text-xs text-secondaryText">
              You receive {money((BigInt(n) * BigInt(Math.round(Number(price) * 1_000_000)) * BigInt(98)) / BigInt(100))} if all
              sell (after 2%).
            </p>
          ) : null}
          <button
            type="button"
            disabled={loading || !n || BigInt(n) > free || !(Number(price) > 0)}
            onClick={async () => {
              const r = await listShares(vaultId, n, String(Math.round(Number(price) * 1_000_000)));
              after(r.success, "Listed. Buyers see it in Shares.", r.error);
            }}
            className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            List for sale
          </button>
        </div>
      ) : null}

      {panel === "manager" ? (
        <div className="space-y-2 rounded-xl bg-cardBackground p-3">
          <p className="inline-flex items-center gap-1 text-xs text-secondaryText">
            Current manager: {manager}
            <InfoTip label="About changing the manager">
              Vote for another manager on Sheda at their fee. When holders of more than half of this flat&apos;s shares vote
              for the same manager and fee, anyone can apply the change. The outgoing manager is paid what they earned.
            </InfoTip>
          </p>
          {myVote ? (
            <p className="text-xs text-primaryText">
              Your vote: {myVote.manager} at {myVote.fee_bps / 100}% · {supportPct}% of shares agree
            </p>
          ) : null}
          {myVote && supportPct > 50 && myVote.manager !== manager ? (
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                const r = await applyVaultManagerVote(vaultId, myVote.manager, myVote.fee_bps);
                after(r.success, "Done. The new manager now runs this flat.", r.error);
              }}
              className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Apply the change
            </button>
          ) : null}
          {managers.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={loading}
              onClick={async () => {
                const r = await voteVaultManager(vaultId, m.near_account_id as string, m.fee_bps as number);
                after(r.success, `You voted for ${m.display_name}.`, r.error);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-borderColor bg-white px-3 py-2 text-left text-sm"
            >
              <span>{m.display_name}</span>
              <span className="text-xs text-secondaryText">{(m.fee_bps ?? 0) / 100}% of rent</span>
            </button>
          ))}
          {managers.length === 0 ? <p className="text-xs text-secondaryText">Loading managers…</p> : null}
        </div>
      ) : null}

      {note ? <p className="text-xs text-secondaryText">{note}</p> : null}
    </div>
  );
}
