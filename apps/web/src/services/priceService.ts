import { fetchUsdPrices } from "./cryptoPrices";

const FIAT_API_URL = "https://open.er-api.com/v6/latest/USD";

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; 
const FIAT_CACHE_TTL_MS = 60 * 60 * 1000; 

export interface ExchangeRates {
  ngnPerUsd: number;
  ngnPerNear: number;
  nearUsd: number;
  usdtUsd: number;
  lastUpdated: number;
}

let cachedCryptoRates: { nearUsd: number; usdtUsd: number; timestamp: number } | null = null;
let cachedFiatRate: { ngnPerUsd: number; timestamp: number } | null = null;

async function fetchCryptoPrices(): Promise<{ nearUsd: number; usdtUsd: number }> {
  const now = Date.now();
  if (cachedCryptoRates && now - cachedCryptoRates.timestamp < CACHE_TTL_MS) {
    return { nearUsd: cachedCryptoRates.nearUsd, usdtUsd: cachedCryptoRates.usdtUsd };
  }

  const prices = await fetchUsdPrices(["NEAR", "USDT"]);
  const nearUsd = prices.NEAR;
  // USDT falls back to parity inside fetchUsdPrices, so only NEAR can really
  // be missing here.
  const usdtUsd = prices.USDT ?? 1;

  if (nearUsd == null) {
    throw new Error("NEAR price unavailable from every source");
  }

  cachedCryptoRates = { nearUsd, usdtUsd, timestamp: now };
  return { nearUsd, usdtUsd };
}

async function fetchNgnRate(): Promise<number> {
  const now = Date.now();
  if (cachedFiatRate && now - cachedFiatRate.timestamp < FIAT_CACHE_TTL_MS) {
    return cachedFiatRate.ngnPerUsd;
  }

  const response = await fetch(FIAT_API_URL);
  if (!response.ok) throw new Error(`Fiat API error: ${response.status}`);

  const data = await response.json();
  const ngnPerUsd = data.rates?.NGN;
  if (!ngnPerUsd || typeof ngnPerUsd !== "number") {
    throw new Error("NGN rate not found in response");
  }

  cachedFiatRate = { ngnPerUsd, timestamp: now };
  return ngnPerUsd;
}

/**
 * Fetch all exchange rates from the crypto price sources + fiat API.
 * Returns cached values if within TTL. Throws on failure.
 */
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const [crypto, ngnPerUsd] = await Promise.all([
    fetchCryptoPrices(),
    fetchNgnRate(),
  ]);

  const ngnPerNear = crypto.nearUsd * ngnPerUsd;

  return {
    ngnPerUsd,
    ngnPerNear,
    nearUsd: crypto.nearUsd,
    usdtUsd: crypto.usdtUsd,
    lastUpdated: Date.now(),
  };
}

/**
 * Get cached rates synchronously. Returns null if never fetched.
 */
export function getCachedRates(): ExchangeRates | null {
  if (!cachedCryptoRates || !cachedFiatRate) return null;

  const { nearUsd, usdtUsd } = cachedCryptoRates;
  const { ngnPerUsd } = cachedFiatRate;

  return {
    ngnPerUsd,
    ngnPerNear: nearUsd * ngnPerUsd,
    nearUsd,
    usdtUsd,
    lastUpdated: cachedCryptoRates.timestamp,
  };
}
