/**
 * Money and shares for Collections, as integers throughout.
 *
 * The marketplace already has `utilities/atomicAmount.ts`, and it is the
 * right tool for what it does: turn an on-chain amount into something a
 * label can show. It returns a `number`, which is fine for display and
 * wrong for everything here.
 *
 * Collections divides. A holder's claim is `balance * acc_per_share / 1e18`,
 * and `acc_per_share` routinely runs past 10^25. A JavaScript number stops
 * being exact above 2^53, so computing a claim through one loses the low
 * digits and shows a holder a figure the chain disagrees with. Every
 * function below works on BigInt and returns strings.
 *
 * Decimals come from `config/tokens.ts` rather than a constant, so a vault
 * denominated in a coin with other than six decimals formats correctly
 * instead of silently by a factor of a hundred.
 */

import { getTokenDecimals, getTokenSymbol } from "@/config/tokens";

/** The accumulator's fixed-point scale. Must match the vault contract. */
export const PRECISION = 10n ** 18n;

/** Basis points denominator. */
export const BPS = 10_000n;

const base = (token?: string | null): bigint =>
  10n ** BigInt(getTokenDecimals(token ?? ""));

const toBigInt = (value: string | bigint | null | undefined): bigint => {
  if (typeof value === "bigint") return value;
  try {
    return BigInt(value || "0");
  } catch {
    return 0n;
  }
};

/**
 * Atomic units to a readable amount.
 *
 * Trailing zeros decide whether to show decimals at all but are kept once
 * decimals are shown, so money reads 10,758.60 rather than 10,758.6. An
 * amount smaller than the places on display drops them instead of
 * rendering a misleading 0.00.
 */
export function formatAmount(
  atomic: string | bigint,
  token?: string | null,
  maxFractionDigits = 2
): string {
  let value = toBigInt(atomic);
  const negative = value < 0n;
  if (negative) value = -value;

  const divisor = base(token);
  const decimals = getTokenDecimals(token ?? "");
  const whole = value / divisor;
  const fraction = value % divisor;

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";
  if (maxFractionDigits === 0 || fraction === 0n) return `${sign}${grouped}`;

  const padded = fraction.toString().padStart(decimals, "0");
  const sliced = padded.slice(0, maxFractionDigits);
  return sliced.replace(/0+$/, "") ? `${sign}${grouped}.${sliced}` : `${sign}${grouped}`;
}

/** With the coin's own ticker, which is what the marketplace shows. */
export function formatWithSymbol(
  atomic: string | bigint,
  token?: string | null,
  maxFractionDigits = 2
): string {
  return `${formatAmount(atomic, token, maxFractionDigits)} ${getTokenSymbol(token)}`;
}

/** A typed amount to atomic units. Null for anything unusable. */
export function parseAmount(input: string, token?: string | null): string | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return null;

  const decimals = getTokenDecimals(token ?? "");
  const [whole = "0", fraction = ""] = cleaned.split(".");
  // Refused rather than truncated. Truncation is a rounding decision taken
  // on someone's behalf, and this is the number they are about to commit.
  if (fraction.length > decimals) return null;

  return (BigInt(whole || "0") * base(token) + BigInt(fraction.padEnd(decimals, "0") || "0"))
    .toString();
}

/**
 * What a stake buys, as whole shares rounded down.
 *
 * Down, never nearest: rounding up would hand out a share the raise never
 * received the money for, and every holder's slice would shrink by a
 * fraction nobody can account for.
 */
export function sharesForAmount(
  amountAtomic: string,
  unitPriceAtomic: string,
  totalShares: string
): string {
  const amount = toBigInt(amountAtomic);
  const price = toBigInt(unitPriceAtomic);
  const shares = toBigInt(totalShares);
  if (price <= 0n || shares <= 0n) return "0";
  return ((amount * shares) / price).toString();
}

/** The reverse: what a number of shares costs. */
export function amountForShares(
  shareCount: string,
  unitPriceAtomic: string,
  totalShares: string
): string {
  const count = toBigInt(shareCount);
  const price = toBigInt(unitPriceAtomic);
  const shares = toBigInt(totalShares);
  if (shares <= 0n) return "0";
  return ((count * price) / shares).toString();
}

/**
 * A holding as a share of the whole, in basis points.
 *
 * The vault reports this too. Computing it the same way here means the app
 * and the chain never show a holder two different numbers for one holding.
 */
export function ownershipBps(balance: string, totalSupply: string): number {
  const held = toBigInt(balance);
  const total = toBigInt(totalSupply);
  if (total <= 0n) return 0;
  return Number((held * BPS) / total);
}

/** Basis points as a percentage string. 1250 becomes "12.5%". */
export function bpsToPercent(bps: number, maxFractionDigits = 2): string {
  return `${(bps / 100).toFixed(maxFractionDigits).replace(/\.?0+$/, "")}%`;
}

/** A proportion of an amount, in basis points. Used for cover and fees. */
export function applyBps(atomic: string, bps: number): string {
  return ((toBigInt(atomic) * BigInt(Math.max(0, Math.trunc(bps)))) / BPS).toString();
}

/**
 * What a holder is owed right now, the way the vault computes it.
 *
 * Reproduced rather than only read so the app can show an accrued figure
 * between syncs. Where the two disagree the chain is right, and anything
 * about to move money reads `claimable` from the vault instead.
 */
export function owedFor(
  balance: string,
  accPerShare: string,
  credited: string
): string {
  const earned = (toBigInt(balance) * toBigInt(accPerShare)) / PRECISION;
  const already = toBigInt(credited);
  return earned > already ? (earned - already).toString() : "0";
}

/** Percent funded, 0 to 100, for a progress bar. */
export function fundedPct(raised: string, target: string): number {
  const total = toBigInt(target);
  if (total <= 0n) return 0;
  const pct = Number((toBigInt(raised) * 100n) / total);
  return Math.min(100, Math.max(0, pct));
}
