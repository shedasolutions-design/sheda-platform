import { STABLECOIN_DECIMALS } from "@/config/near";

/**
 * Money, without floating point.
 *
 * Every amount the contract deals in is an integer of atomic units, and a
 * share count can be large. Converting those through `Number` loses precision
 * above 2^53 and rounds in ways nobody can predict, which is how an app ends
 * up showing a holder a figure the chain disagrees with. All of this works on
 * strings and BigInt.
 */

const BASE = 10n ** BigInt(STABLECOIN_DECIMALS);

/** Atomic units to a readable amount. `1234500` → `"1.23"`. */
export function formatMoney(atomic: string | bigint, maxFractionDigits = 2): string {
  let value: bigint;
  try {
    value = typeof atomic === "bigint" ? atomic : BigInt(atomic || "0");
  } catch {
    return "0";
  }
  const negative = value < 0n;
  if (negative) value = -value;

  const whole = value / BASE;
  const fraction = value % BASE;

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (maxFractionDigits === 0 || fraction === 0n) {
    return `${negative ? "-" : ""}${grouped}`;
  }

  const padded = fraction.toString().padStart(STABLECOIN_DECIMALS, "0");
  const sliced = padded.slice(0, maxFractionDigits);

  // Trailing zeros decide whether to show decimals at all, but are kept once
  // decimals are shown: money reads ₦10,758.60, not ₦10,758.6. An amount
  // smaller than the places on display still drops them rather than
  // rendering as ₦0.00.
  const meaningful = sliced.replace(/0+$/, "");
  return meaningful
    ? `${negative ? "-" : ""}${grouped}.${sliced}`
    : `${negative ? "-" : ""}${grouped}`;
}

/** With the currency in front, which is how every screen shows it. */
export function naira(atomic: string | bigint, maxFractionDigits = 2): string {
  return `₦${formatMoney(atomic, maxFractionDigits)}`;
}

/** A typed amount to atomic units. Returns null for anything unusable. */
export function parseMoney(input: string): string | null {
  const cleaned = input.replace(/[,\s₦]/g, "");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return null;

  const [whole = "0", fraction = ""] = cleaned.split(".");
  if (fraction.length > STABLECOIN_DECIMALS) return null;

  const padded = fraction.padEnd(STABLECOIN_DECIMALS, "0");
  const value = BigInt(whole || "0") * BASE + BigInt(padded || "0");
  return value.toString();
}

/** Basis points as a percentage string. `1250` → `"12.5%"`. */
export function bpsToPercent(bps: number, maxFractionDigits = 2): string {
  const pct = bps / 100;
  const fixed = pct.toFixed(maxFractionDigits).replace(/\.?0+$/, "");
  return `${fixed}%`;
}

/**
 * What a stake buys, given a unit's price and how many shares it divides into.
 * Returned as whole shares, rounded down, because a part-share is not a thing.
 */
export function sharesForAmount(
  amountAtomic: string,
  unitPriceAtomic: string,
  totalShares: string
): string {
  try {
    const amount = BigInt(amountAtomic);
    const price = BigInt(unitPriceAtomic);
    const shares = BigInt(totalShares);
    if (price <= 0n || shares <= 0n) return "0";
    return ((amount * shares) / price).toString();
  } catch {
    return "0";
  }
}

/** The reverse: what a number of shares costs. */
export function amountForShares(
  shareCount: string,
  unitPriceAtomic: string,
  totalShares: string
): string {
  try {
    const count = BigInt(shareCount);
    const price = BigInt(unitPriceAtomic);
    const shares = BigInt(totalShares);
    if (shares <= 0n) return "0";
    return ((count * price) / shares).toString();
  } catch {
    return "0";
  }
}

/**
 * A holding as a share of the whole, in basis points.
 *
 * The contract reports this too. Computing it the same way here means the app
 * and the chain never show a holder two different numbers for the same thing.
 */
export function ownershipBps(balance: string, totalSupply: string): number {
  try {
    const held = BigInt(balance);
    const total = BigInt(totalSupply);
    if (total <= 0n) return 0;
    return Number((held * 10_000n) / total);
  } catch {
    return 0;
  }
}
