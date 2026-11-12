/**
 * How a rent price reads for a lease of `days`: "/year", "/month", "/week",
 * "/day", or " for 9 days". Prices said "/year" (or "/yr") for every rental,
 * including a one-day lease.
 */
export function leaseSuffix(days?: number | null): string {
  if (!days || days <= 0) return "";
  if (days === 365) return "/year";
  if (days === 30) return "/month";
  if (days === 7) return "/week";
  if (days === 1) return "/day";
  return ` for ${days} days`;
}
