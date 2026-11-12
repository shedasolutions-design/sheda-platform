import { fetchUsdPrices, SUPPORTED_PRICE_SYMBOLS } from "@/services/cryptoPrices";

/**
 * GET /api/prices?symbols=NEAR,USDC  ->  { prices: { NEAR: 3.37, USDC: 1 } }
 *
 * Every browser used to ask CoinGecko itself. Its free tier rate-limits per
 * caller and answers a throttled request without CORS headers, so the wallet
 * showed "~$0.00 · prices unavailable". Asking once here and sharing the
 * answer for a minute keeps everyone well under the limit.
 */
const TTL_MS = 60_000;
let cache: { at: number; prices: Record<string, number> } | null = null;

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = asked
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SUPPORTED_PRICE_SYMBOLS.includes(s));

  if (!cache || Date.now() - cache.at > TTL_MS) {
    const fresh = await fetchUsdPrices(SUPPORTED_PRICE_SYMBOLS, { direct: true });
    // Keep the last good quotes rather than replacing them with a worse set.
    if (!cache || Object.keys(fresh).length >= Object.keys(cache.prices).length) {
      cache = { at: Date.now(), prices: fresh };
    }
  }

  const prices = Object.fromEntries(symbols.filter((s) => cache!.prices[s] != null).map((s) => [s, cache!.prices[s]]));
  return Response.json({ prices }, { headers: { "Cache-Control": "public, max-age=30" } });
}
