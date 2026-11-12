/**
 * Crypto → USD spot prices.
 *
 * WHY THIS MODULE EXISTS:
 * The same Pyth Hermes URL was hardcoded in both priceService.ts and
 * priceOracle.ts, so when that endpoint started refusing anonymous requests the
 * identical bug appeared twice and had to be found twice. One source of prices,
 * one place to change it.
 *
 * WHY NOT PYTH ANY MORE:
 * hermes.pyth.network/v2/updates/price/latest now answers 401 "unauthorized" to
 * everyone — verified with plain curl, no Origin header involved. In a browser
 * that surfaces as a CORS error rather than a 401, because the error response
 * carries no Access-Control-Allow-Origin, which is what made it look like a
 * CORS problem in the console. It is not; the endpoint simply requires
 * credentials now. Chasing the CORS message leads nowhere.
 *
 * The practical consequence was every token showing "Price unavailable" and a
 * portfolio total of 0 — an alarming thing to show someone about their own
 * money when the balances themselves were fine.
 */

/** CoinGecko's id for each symbol we quote. */
const COINGECKO_IDS: Record<string, string> = {
  NEAR: "near",
  USDT: "tether",
  USDC: "usd-coin",
  ETH: "ethereum",
  BTC: "bitcoin",
};

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";
const COINBASE_SPOT = "https://api.coinbase.com/v2/prices";

/** Per-request ceiling. A price is a nicety; the wallet must not hang for one. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Stablecoins are worth ~$1 by construction. When every source fails, quoting
 * them at parity is far closer to the truth than showing nothing, and it keeps
 * a portfolio that is mostly USDC from reading as zero.
 */
const STABLE_PARITY: Record<string, number> = { USDT: 1, USDC: 1 };

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Primary source. One request covers every symbol, and it sends
 * `Access-Control-Allow-Origin: *`, so it works from the web build.
 */
async function fromCoinGecko(symbols: string[]): Promise<Record<string, number>> {
  const wanted = symbols.filter((s) => COINGECKO_IDS[s]);
  if (!wanted.length) return {};

  const ids = wanted.map((s) => COINGECKO_IDS[s]).join(",");
  const json = await fetchJson(
    `${COINGECKO_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`
  );

  const out: Record<string, number> = {};
  for (const symbol of wanted) {
    const usd = json?.[COINGECKO_IDS[symbol]]?.usd;
    if (typeof usd === "number" && usd > 0) out[symbol] = usd;
  }
  return out;
}

/**
 * Fallback, one request per symbol. Slower and noisier than CoinGecko, so it
 * is only asked for what the primary could not supply — a stablecoin missing
 * from CoinGecko is not worth a round trip when parity is a better answer.
 */
async function fromCoinbase(symbols: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const json = await fetchJson(`${COINBASE_SPOT}/${symbol}-USD/spot`);
        const amount = parseFloat(json?.data?.amount);
        return Number.isFinite(amount) && amount > 0
          ? ([symbol, amount] as const)
          : null;
      } catch {
        return null;
      }
    })
  );

  const out: Record<string, number> = {};
  for (const entry of results) if (entry) out[entry[0]] = entry[1];
  return out;
}

/**
 * USD spot prices for the requested symbols.
 *
 * Never throws and never returns a partial answer as a failure: callers render
 * a wallet, and one unreachable price provider should cost a single "price
 * unavailable" label, not the whole screen. Symbols that could not be priced
 * are simply absent from the result, so callers can tell "unpriced" from
 * "worth zero" — a distinction the UI has to make honestly.
 */
export async function fetchUsdPrices(
  symbols: string[],
  options: { direct?: boolean } = {}
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // In the browser, ask Sheda's own /api/prices first: one shared, cached
  // request to CoinGecko instead of one per visitor (see that route).
  if (!options.direct && typeof window !== "undefined") {
    try {
      const json = await fetchJson(`/api/prices?symbols=${encodeURIComponent(symbols.join(","))}`);
      for (const [symbol, usd] of Object.entries(json?.prices ?? {})) {
        if (typeof usd === "number" && usd > 0) prices[symbol] = usd;
      }
    } catch (error) {
      console.warn("cryptoPrices: /api/prices unavailable, asking providers directly:", error);
    }
    if (symbols.every((s) => prices[s] != null)) return prices;
  }

  try {
    Object.assign(prices, await fromCoinGecko(symbols));
  } catch (error) {
    console.warn("cryptoPrices: CoinGecko unavailable:", error);
  }

  // Only chase what is still missing, and only where a real quote beats parity.
  const missing = symbols.filter(
    (s) => prices[s] == null && STABLE_PARITY[s] == null
  );
  if (missing.length) {
    try {
      Object.assign(prices, await fromCoinbase(missing));
    } catch (error) {
      console.warn("cryptoPrices: Coinbase fallback unavailable:", error);
    }
  }

  for (const [symbol, parity] of Object.entries(STABLE_PARITY)) {
    if (symbols.includes(symbol) && prices[symbol] == null) {
      prices[symbol] = parity;
    }
  }

  return prices;
}

/** Exposed so callers and tests can see which symbols are quotable at all. */
export const SUPPORTED_PRICE_SYMBOLS = Object.keys(COINGECKO_IDS);
