/**
 * Atomic (on-chain) amount → human-readable amount.
 *
 * Property prices and bid amounts are stored as u128 strings in the smallest
 * unit of the property's `stablecoin_token` — 1500 USDC is "1500000000". Any
 * UI that prints `property.price` straight out of the contract shows that raw
 * integer, which is why property prices in the wallet looked nothing like the
 * prices in the marketplace.
 */

import { getTokenDecimals, getTokenSymbol, isStablecoin } from "@/config/tokens";

export interface ParsedAmount {
    /** Human-readable amount, e.g. 1500 for "1500000000" USDC */
    amount: number;
    /** Ticker of the token the amount is denominated in, e.g. "USDC" */
    symbol: string;
    decimals: number;
    /** USD value when it can be derived without a rate (stablecoins), else null */
    usd: number | null;
    /** Ready-to-render string, e.g. "1,500 USDC" */
    label: string;
}

/**
 * Convert an atomic u128 amount to its human-readable form.
 * Returns null when there is genuinely no amount to show (null/empty/unparsable)
 * so callers can omit the row rather than render a misleading "0".
 */
export function parseAtomicAmount(
    atomic?: string | number | null,
    tokenContract?: string | null
): ParsedAmount | null {
    if (atomic == null || atomic === "") return null;

    const decimals = getTokenDecimals(tokenContract ?? "");
    const symbol = getTokenSymbol(tokenContract);

    let amount: number;
    try {
        // Go through BigInt so a u128 beyond Number.MAX_SAFE_INTEGER doesn't
        // silently lose its low-order digits before we scale it down.
        const raw = BigInt(String(atomic).split(".")[0]);
        const divisor = BigInt(10) ** BigInt(decimals);
        const whole = raw / divisor;
        const fraction = raw % divisor;
        amount =
            Number(whole) +
            Number(fraction) / Number(divisor);
    } catch {
        const fallback = Number(atomic);
        if (!Number.isFinite(fallback)) return null;
        amount = fallback / Math.pow(10, decimals);
    }

    if (!Number.isFinite(amount)) return null;

    return {
        amount,
        symbol,
        decimals,
        usd: isStablecoin(tokenContract) ? amount : null,
        label: `${formatAmount(amount)} ${symbol}`,
    };
}

/**
 * Format a human-readable amount with thousands separators, keeping decimals
 * only where they carry information (a 1500 USDC price shouldn't read
 * "1,500.000000", and a 0.25 wNEAR one shouldn't round to "0").
 */
export function formatAmount(amount: number): string {
    if (!Number.isFinite(amount)) return "0";
    if (amount === 0) return "0";

    const maximumFractionDigits = amount >= 1000 ? 0 : amount >= 1 ? 2 : 6;
    return amount.toLocaleString(undefined, {
        maximumFractionDigits,
        minimumFractionDigits: 0,
    });
}
