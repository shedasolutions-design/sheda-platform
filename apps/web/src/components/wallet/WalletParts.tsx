"use client";

/* eslint-disable @next/next/no-img-element -- token logos and property media come from arbitrary hosts */
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Home, Inbox, Wallet as WalletIcon } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui/States";
import Spinner from "@/components/ui/Spinner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getTokenDisplay } from "@/utilities/tokenLogos";
import { formatRelativeTime } from "@/utilities/formatTimestamp";
import { getMethodLabel } from "@/services/nearIndexer";
import type { Asset, Token, Transaction } from "@/types/wallet";

export const fmtAmount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 });

export function TokenLogo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const d = getTokenDisplay(symbol);
  return d.logoUrl ? (
    <img src={d.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full" />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: d.color }}
    >
      {d.letter}
    </span>
  );
}

const row = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-cardBackground";

export function TokensList({ tokens, onPress }: { tokens: Token[]; onPress: (t: Token) => void }) {
  const { formatPrice } = useCurrency();
  if (tokens.length === 0)
    return (
      <EmptyState
        icon={<WalletIcon size={40} />}
        title="No supported tokens found"
        message="Your wallet doesn't hold any supported tokens yet. They appear here automatically."
      />
    );
  return (
    <ul>
      {tokens.map((t) => (
        <li key={t.id}>
          <button type="button" className={row} onClick={() => onPress(t)}>
            <TokenLogo symbol={t.symbol} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t.symbol}</span>
              <span className="text-xs text-secondaryText">{t.priceAvailable !== false ? formatPrice(t.price) : "Price unavailable"}</span>
            </span>
            <span className="text-right">
              <span className="block font-medium">{fmtAmount(t.amount)}</span>
              {t.priceAvailable !== false && <span className="text-xs text-secondaryText">{formatPrice(t.totalValue)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const statusColor = (s?: string) => (s === "failed" ? "text-red-500" : s === "pending" ? "text-amber-500" : "text-green-600");

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress: (t: Transaction) => void }) {
  const incoming = tx.direction === "incoming";
  return (
    <button type="button" className={row} onClick={() => onPress(tx)}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
        {incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{getMethodLabel(tx.methodName) || tx.type}</span>
        <span className="text-xs text-secondaryText">{formatRelativeTime(tx.timestamp ?? tx.date)}</span>
      </span>
      <span className="text-right">
        <span className={`block font-medium ${incoming ? "text-green-600" : "text-red-600"}`}>
          {incoming ? "+" : "-"}
          {tx.amount} {tx.currency}
        </span>
        <span className={`text-xs capitalize ${statusColor(tx.status)}`}>{tx.status || "completed"}</span>
      </span>
    </button>
  );
}

export function TransactionsList({
  transactions,
  loading,
  error,
  onRetry,
  onPress,
}: {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPress: (t: Transaction) => void;
}) {
  if (error && transactions.length === 0) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && transactions.length === 0)
    return (
      <div className="flex justify-center py-10">
        <Spinner size={32} />
      </div>
    );
  if (transactions.length === 0)
    return <EmptyState icon={<Inbox size={40} />} title="No transactions yet" message="Sends, receipts and contract calls show up here." />;
  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</p>}
      <ul>
        {transactions.map((tx) => (
          <li key={tx.id}>
            <TransactionRow tx={tx} onPress={onPress} />
          </li>
        ))}
      </ul>
    </>
  );
}

const stateColor: Record<string, string> = {
  listed: "bg-green-50 text-green-700",
  leased: "bg-blue-50 text-blue-700",
  sold: "bg-purple-50 text-purple-700",
  bid: "bg-amber-50 text-amber-700",
};

export function AssetsList({
  assets,
  loading,
  error,
  onRetry,
  onPress,
}: {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPress: (a: Asset) => void;
}) {
  if (error && assets.length === 0) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && assets.length === 0)
    return (
      <div className="flex justify-center py-10">
        <Spinner size={32} />
      </div>
    );
  if (assets.length === 0)
    return <EmptyState icon={<Home size={40} />} title="No properties yet" message="Properties you own or have bid on show up here." />;
  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {assets.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onPress(a)} className="flex w-full items-center gap-3 rounded-xl border border-borderColor p-3 text-left hover:border-primary">
              <img
                src={a.imageUri || "/images/apt-1.png"}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg bg-cardBackground object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${stateColor[a.state ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                  {a.stateLabel ?? "Not listed"}
                </span>
              </span>
              <ChevronRight size={18} className="text-secondaryText" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Label ...... value" row for the detail dialogs. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-borderColor py-3 text-sm last:border-0">
      <dt className="text-secondaryText">{label}</dt>
      <dd className="min-w-0 break-all text-right font-medium">{children}</dd>
    </div>
  );
}

/** One of the two choices at the top of Deposit / Withdraw. */
export function OptionCard({
  icon,
  title,
  body,
  note,
  noteTone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  note: string;
  noteTone: "green" | "amber";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-3 w-full rounded-xl border border-borderColor p-4 text-left hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-start gap-3">
        <span className="mt-0.5 text-primary">{icon}</span>
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="mt-1 block text-xs text-secondaryText">{body}</span>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${noteTone === "green" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {note}
          </span>
        </span>
      </span>
    </button>
  );
}
