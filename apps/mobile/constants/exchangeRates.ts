// Exchange rates for currency conversion
// Live rates fetched via services/cryptoPrices.ts (crypto) + Open Exchange Rates (fiat)
// See services/priceService.ts and hooks/useExchangeRates.ts

// Stablecoin decimals (USDT/USDC)
export const STABLECOIN_DECIMALS = 6;

// NEAR decimals (yoctoNEAR)
export const NEAR_DECIMALS = 24;

/**
 * Convert Naira to USD (human-readable).
 * Requires a live ngnPerUsd rate from useExchangeRates().
 */
export function nairaToUsd(nairaAmount: number, ngnPerUsd: number): number {
  return nairaAmount / ngnPerUsd;
}

/**
 * Convert USD to Naira.
 * Requires a live ngnPerUsd rate from useExchangeRates().
 */
export function usdToNaira(usdAmount: number, ngnPerUsd: number): number {
  return usdAmount * ngnPerUsd;
}

/**
 * Convert Naira to USD stablecoin smallest units.
 * Requires a live ngnPerUsd rate from useExchangeRates().
 */
export function nairaToStablecoinUnits(nairaAmount: number, ngnPerUsd: number): number {
  const usdAmount = nairaAmount / ngnPerUsd;
  return Math.floor(usdAmount * Math.pow(10, STABLECOIN_DECIMALS));
}

/**
 * Convert Naira to NEAR (plain number).
 * Requires a live ngnPerNear rate from useExchangeRates().
 */
export function nairaToNear(nairaAmount: number, ngnPerNear: number): number {
  return nairaAmount / ngnPerNear;
}

/**
 * Convert NEAR to Naira.
 * Requires a live ngnPerNear rate from useExchangeRates().
 */
export function nearToNaira(nearAmount: number, ngnPerNear: number): number {
  return nearAmount * ngnPerNear;
}

/**
 * Convert stablecoin smallest units to Naira (for display).
 * Requires a live ngnPerUsd rate from useExchangeRates().
 */
export function stablecoinUnitsToNaira(units: number, ngnPerUsd: number): number {
  const usdAmount = units / Math.pow(10, STABLECOIN_DECIMALS);
  return usdAmount * ngnPerUsd;
}

/**
 * Convert stablecoin smallest units to human-readable USD
 * e.g., 1000000 → 1.00
 */
export function stablecoinUnitsToUsd(units: number): number {
  return units / Math.pow(10, STABLECOIN_DECIMALS);
}

/**
 * Format a USD amount for display
 * e.g., 333.33 → "$333.33"
 */
export function formatUsd(usdAmount: number): string {
  return `$${usdAmount.toFixed(2)}`;
}

/**
 * Format a Naira amount for display
 * e.g., 500000 → "₦500,000"
 */
export function formatNaira(nairaAmount: number): string {
  return `₦${nairaAmount.toLocaleString()}`;
}

/**
 * Convert any fiat amount to USD using the oracle rate (units-of-fiat per 1 USD).
 * e.g. fiatToUsdGeneric(500_000, 1650) => ~303.03
 */
export function fiatToUsdGeneric(fiatAmount: number, ratePerUsd: number): number {
  if (!ratePerUsd || ratePerUsd === 0) return fiatAmount;
  return fiatAmount / ratePerUsd;
}

/**
 * Convert any fiat amount directly to stablecoin smallest units (6 decimals USDC/USDT).
 * Uses the oracle rate (units-of-fiat per 1 USD).
 */
export function fiatToStablecoinUnits(fiatAmount: number, ratePerUsd: number): number {
  const usdAmount = fiatToUsdGeneric(fiatAmount, ratePerUsd);
  return Math.floor(usdAmount * Math.pow(10, STABLECOIN_DECIMALS));
}
