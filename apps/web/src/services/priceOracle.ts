/**
 * Price Oracle Service
 *
 * Provides real-time exchange rates for:
 *   - Crypto → USD (via services/cryptoPrices.ts)
 *   - Fiat  → USD (via ExchangeRate API)
 *
 * All conversions flow through USD as the base layer.
 */

import { fetchUsdPrices } from "./cryptoPrices";

const FIAT_API_URL = "https://open.er-api.com/v6/latest/USD";

/** Symbols this oracle quotes. See services/cryptoPrices.ts for the sources. */
const CRYPTO_SYMBOLS = ["NEAR", "USDT", "USDC", "ETH", "BTC"];

// ── Cache TTLs ──
const CRYPTO_CACHE_TTL = 2 * 60 * 1000;  // 2 minutes
const FIAT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Supported fiat currencies ──
export interface FiatCurrencyInfo {
    code: string;
    symbol: string;
    name: string;
    flag: string;
}

export const SUPPORTED_FIATS: FiatCurrencyInfo[] = [
    { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
    { code: "NGN", symbol: "₦", name: "Nigerian Naira", flag: "🇳🇬" },
    { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧" },
    { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺" },
    { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi", flag: "🇬🇭" },
    { code: "KES", symbol: "KSh", name: "Kenyan Shilling", flag: "🇰🇪" },
    { code: "ZAR", symbol: "R", name: "South African Rand", flag: "🇿🇦" },
    { code: "EGP", symbol: "E£", name: "Egyptian Pound", flag: "🇪🇬" },
    { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳" },
    { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪" },
    { code: "CAD", symbol: "CA$", name: "Canadian Dollar", flag: "🇨🇦" },
    { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
    { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵" },
    { code: "CNY", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳" },
    { code: "BRL", symbol: "R$", name: "Brazilian Real", flag: "🇧🇷" },
    { code: "MXN", symbol: "MX$", name: "Mexican Peso", flag: "🇲🇽" },
    { code: "KRW", symbol: "₩", name: "South Korean Won", flag: "🇰🇷" },
    { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬" },
    { code: "TRY", symbol: "₺", name: "Turkish Lira", flag: "🇹🇷" },
    { code: "RWF", symbol: "FRw", name: "Rwandan Franc", flag: "🇷🇼" },
    { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling", flag: "🇹🇿" },
    { code: "MAD", symbol: "MAD", name: "Moroccan Dirham", flag: "🇲🇦" },
    { code: "XOF", symbol: "CFA", name: "West African CFA", flag: "🌍" },
    { code: "XAF", symbol: "FCFA", name: "Central African CFA", flag: "🌍" },
];

// ── Types ──
export interface CryptoPrices {
    [symbol: string]: number; // e.g. { NEAR: 6.12, USDT: 1.0, USDC: 1.0 }
}

export interface FiatRates {
    [code: string]: number; // e.g. { NGN: 1650, EUR: 0.92 }  (units per 1 USD)
}

export interface OracleData {
    crypto: CryptoPrices;
    fiat: FiatRates;
    lastUpdated: number;
}

// ── Cache ──
let cryptoCache: { data: CryptoPrices; ts: number } | null = null;
let fiatCache: { data: FiatRates; ts: number } | null = null;

// ── Fetch crypto prices ──
async function fetchCryptoPrices(): Promise<CryptoPrices> {
    const now = Date.now();
    if (cryptoCache && now - cryptoCache.ts < CRYPTO_CACHE_TTL) {
        return cryptoCache.data;
    }

    const prices = await fetchUsdPrices(CRYPTO_SYMBOLS);

    // Cache only a useful answer. Storing an empty result would pin "price
    // unavailable" on screen for the whole TTL even after the source recovers.
    if (Object.keys(prices).length) {
        cryptoCache = { data: prices, ts: now };
    }
    return prices;
}

// ── Fetch fiat rates ──
async function fetchFiatRates(): Promise<FiatRates> {
    const now = Date.now();
    if (fiatCache && now - fiatCache.ts < FIAT_CACHE_TTL) {
        return fiatCache.data;
    }

    const response = await fetch(FIAT_API_URL);
    if (!response.ok) throw new Error(`Fiat API error: ${response.status}`);

    const json = await response.json();
    const rates: FiatRates = {};

    for (const fiat of SUPPORTED_FIATS) {
        const rate = json.rates?.[fiat.code];
        if (typeof rate === "number") {
            rates[fiat.code] = rate;
        }
    }

    // USD is always 1
    rates.USD = 1;

    fiatCache = { data: rates, ts: now };
    return rates;
}

// ── Public API ──

/**
 * Fetch all oracle data. Caches internally.
 */
export async function fetchOracleData(): Promise<OracleData> {
    const [crypto, fiat] = await Promise.all([
        fetchCryptoPrices().catch(() => cryptoCache?.data || ({ NEAR: 0, USDT: 1, USDC: 1 } as CryptoPrices)),
        fetchFiatRates().catch(() => fiatCache?.data || ({ USD: 1, NGN: 1650 } as FiatRates)),
    ]);

    return { crypto, fiat, lastUpdated: Date.now() };
}

/**
 * Convert an amount in a fiat currency to USD.
 */
export function fiatToUsd(amount: number, fiatCode: string, fiatRates: FiatRates): number {
    const rate = fiatRates[fiatCode];
    if (!rate || rate === 0) return amount; // fallback: assume 1:1
    return amount / rate;
}

/**
 * Convert a USD amount to a fiat currency.
 */
export function usdToFiat(usdAmount: number, fiatCode: string, fiatRates: FiatRates): number {
    const rate = fiatRates[fiatCode];
    if (!rate) return usdAmount;
    return usdAmount * rate;
}

/**
 * Convert USD to a crypto token amount.
 */
export function usdToCrypto(usdAmount: number, cryptoSymbol: string, cryptoPrices: CryptoPrices): number {
    const price = cryptoPrices[cryptoSymbol];
    if (!price || price === 0) return 0;
    return usdAmount / price;
}

/**
 * Convert crypto to USD.
 */
export function cryptoToUsd(amount: number, cryptoSymbol: string, cryptoPrices: CryptoPrices): number {
    const price = cryptoPrices[cryptoSymbol];
    if (!price) return 0;
    return amount * price;
}

/**
 * Get cached oracle data synchronously. Returns null if not yet fetched.
 */
export function getCachedOracleData(): OracleData | null {
    if (!cryptoCache || !fiatCache) return null;
    return { crypto: cryptoCache.data, fiat: fiatCache.data, lastUpdated: Math.min(cryptoCache.ts, fiatCache.ts) };
}

/**
 * Get info for a fiat currency by code.
 */
export function getFiatInfo(code: string): FiatCurrencyInfo | undefined {
    return SUPPORTED_FIATS.find((f) => f.code === code);
}
