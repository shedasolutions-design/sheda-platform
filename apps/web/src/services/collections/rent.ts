import type { CollectionUnit } from "@/services/api";

/**
 * What a stake in a flat might earn in rent.
 *
 * The rent figure is the builder's own estimate for the whole flat, a low
 * and a high yearly amount from their research on rents nearby (the
 * evidence belongs in the raise documents). A holder's cut is their share
 * of the flat, after the vault's fees. Nothing here is a promise: rent
 * starts only once the flat is finished and let, and empty months earn
 * nothing.
 */

/** Manager 5% + reserve 5% + platform 2%: the fees a vault launches with. */
export const DEFAULT_FEE_BPS = 1200;

export interface RentRange {
  min: bigint;
  max: bigint;
}

export function rentRangeOf(unit: Pick<CollectionUnit, "rent_min_atomic" | "rent_max_atomic">): RentRange | null {
  if (!unit.rent_min_atomic || !unit.rent_max_atomic) return null;
  const min = BigInt(unit.rent_min_atomic);
  const max = BigInt(unit.rent_max_atomic);
  if (max <= 0n || min > max) return null;
  return { min, max };
}

/** Price of one share of a flat, in atomic units. Null if it cannot be split. */
export function sharePriceOf(unit: Pick<CollectionUnit, "price_atomic" | "total_shares">): bigint | null {
  const total = BigInt(unit.total_shares || "0");
  const price = BigInt(unit.price_atomic || "0");
  return total > 0n && price > 0n ? price / total : null;
}

/** Whole shares an amount buys; the contract does not sell fractions. */
export function sharesFor(amountAtomic: bigint, unit: Pick<CollectionUnit, "price_atomic" | "total_shares">): bigint {
  const per = sharePriceOf(unit);
  return per ? amountAtomic / per : 0n;
}

/** Yearly rent to a holder of `shares`, low and high, after fees. */
export function yearlyRentFor(
  shares: bigint,
  totalShares: bigint,
  range: RentRange,
  feeBps: number = DEFAULT_FEE_BPS
): RentRange {
  if (shares <= 0n || totalShares <= 0n) return { min: 0n, max: 0n };
  const keep = BigInt(10_000 - Math.min(10_000, Math.max(0, feeBps)));
  const cut = (rent: bigint) => (rent * shares * keep) / (totalShares * 10_000n);
  return { min: cut(range.min), max: cut(range.max) };
}

export type Period = "day" | "month" | "year";

export function perPeriod(yearly: RentRange, period: Period): RentRange {
  const d = period === "day" ? 365n : period === "month" ? 12n : 1n;
  return { min: yearly.min / d, max: yearly.max / d };
}
