/**
 * The arithmetic behind the new-raise form.
 *
 * Its own module rather than inline in the screen, for the reason that has
 * caught this repository three times now: anything importing a screen or a
 * hook drags in the wallet context and native storage, and then a test of a
 * pure function dies on a missing native module.
 *
 * What is here decides whether a raise is accepted at all, so it is worth
 * testing directly.
 */

/** A phase as the form holds it: a name and a percentage, both as typed. */
export interface PhaseDraft {
  name: string;
  tranche: string;
}

/** Basis points denominator. The contract and the backend both use these. */
export const BPS_TOTAL = 10_000;

/**
 * A URL-safe id derived from the name.
 *
 * The backend requires `^[a-z0-9][a-z0-9-]*$`, so anything else has to go
 * before it is sent rather than coming back as a validation error about a
 * pattern the person never saw.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** One phase's share, in basis points, as it will be sent. */
export function trancheBps(tranche: string): number {
  const pct = parseFloat(tranche);
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.round(pct * 100);
}

export function tranchesToBps(phases: PhaseDraft[]): number[] {
  return phases.map((p) => trancheBps(p.tranche));
}

/**
 * Whether the schedule releases exactly the whole raise.
 *
 * Checked on the basis points, deliberately, and not on the percentages
 * the person typed. Those are not the same question. Three phases of
 * 33.333, 33.333 and 33.334 sum to exactly 100 as decimals, but each
 * rounds to 3333 basis points and the total sent is 9999. Validating the
 * decimals would show a green 100% and then have the server reject it with
 * a figure the form never displayed.
 *
 * Under 100% strands money in escrow with no phase that would ever free
 * it. Over it promises the builder money the raise never collected. Both
 * only surface near handover, when the terms can no longer be changed.
 */
export function scheduleBalances(phases: PhaseDraft[]): boolean {
  return tranchesToBps(phases).reduce((a, b) => a + b, 0) === BPS_TOTAL;
}

/** The schedule total as a percentage, derived from what will be sent. */
export function schedulePercent(phases: PhaseDraft[]): number {
  return tranchesToBps(phases).reduce((a, b) => a + b, 0) / 100;
}

/**
 * What one share of a unit costs, in atomic units.
 *
 * The number that decides whether an ordinary person can take part, so the
 * form shows it rather than leaving someone to divide a price by ten
 * thousand in their head. Floor division: a share cannot cost a fraction
 * of the smallest unit the coin has.
 */
export function sharePrice(priceAtomic: string | null, totalShares: string): string | null {
  if (!priceAtomic) return null;
  try {
    const shares = BigInt(totalShares || "0");
    if (shares <= 0n) return null;
    return (BigInt(priceAtomic) / shares).toString();
  } catch {
    return null;
  }
}
