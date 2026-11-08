/**
 * CurrencyContext
 *
 * Global state managing the user's preferred display currency.
 * Provides oracle data (crypto & fiat rates), conversion helpers,
 * and a currency selector toggle.
 *
 * Wraps the app so every screen can access:
 *   - selectedCurrency (e.g. "NGN")
 *   - setSelectedCurrency(...)
 *   - formatInSelected(usdAmount)
 *   - convertFiatToUsd(amount, fiatCode)
 *   - oracle rates
 */

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    fetchOracleData,
    usdToFiat,
    fiatToUsd,
    usdToCrypto,
    cryptoToUsd,
    getFiatInfo,
    type OracleData,
    type FiatCurrencyInfo,
    type CryptoPrices,
    type FiatRates,
    SUPPORTED_FIATS,
} from "@/services/priceOracle";

const STORAGE_KEY = "@sheda_display_currency";
const ORACLE_REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutes

// ── Context shape ──
export interface CurrencyContextType {
    /** Currently selected fiat display currency code, e.g. "NGN" */
    selectedCurrency: string;
    /** Currency info (symbol, flag, name) for the selected currency */
    currencyInfo: FiatCurrencyInfo;
    /** Change the display currency */
    setSelectedCurrency: (code: string) => void;

    /** Oracle data – may be null while loading */
    oracle: OracleData | null;
    /** Whether oracle is loading */
    oracleLoading: boolean;
    /** Force refresh oracle */
    refreshOracle: () => Promise<void>;

    /**
     * Format a USD-denominated amount into the selected display currency.
     * Returns e.g. "₦825,000" or "$500"
     */
    formatPrice: (usdAmount: number) => string;

    /**
     * Get the raw numeric value of a USD amount in the selected currency.
     */
    convertToSelected: (usdAmount: number) => number;

    /**
     * Convert from a specific fiat to USD.
     */
    fiatToUsd: (amount: number, fromCode: string) => number;

    /**
     * Convert from USD to a specific fiat.
     */
    usdToFiat: (usdAmount: number, toCode: string) => number;

    /**
     * Format a fiat amount in its own currency with symbol.
     */
    formatFiat: (amount: number, currencyCode: string) => string;

    /**
     * Format a USD amount.
     */
    formatUsd: (usdAmount: number) => string;

    /**
     * Convert USD → crypto.
     */
    usdToCrypto: (usdAmount: number, symbol: string) => number;

    /**
     * Convert crypto → USD.
     */
    cryptoToUsd: (amount: number, symbol: string) => number;

    /** List of supported fiats */
    supportedFiats: FiatCurrencyInfo[];
}

const defaultInfo: FiatCurrencyInfo = { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" };

const CurrencyContext = createContext<CurrencyContextType>({
    selectedCurrency: "USD",
    currencyInfo: defaultInfo,
    setSelectedCurrency: () => { },
    oracle: null,
    oracleLoading: true,
    refreshOracle: async () => { },
    formatPrice: () => "$0",
    convertToSelected: () => 0,
    fiatToUsd: () => 0,
    usdToFiat: () => 0,
    formatFiat: () => "0",
    formatUsd: () => "$0",
    usdToCrypto: () => 0,
    cryptoToUsd: () => 0,
    supportedFiats: SUPPORTED_FIATS,
});

// ── Formatting helpers ──
function compactNumber(num: number): string {
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    if (abs >= 1) return num.toFixed(2);
    if (abs >= 0.01) return num.toFixed(4);
    return num.toFixed(6);
}

function fullNumber(num: number): string {
    if (num >= 1_000) {
        return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Provider ──
export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [selectedCurrency, setSelectedCurrencyState] = useState("USD");
    const [oracle, setOracle] = useState<OracleData | null>(null);
    const [oracleLoading, setOracleLoading] = useState(true);

    // Load persisted currency
    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then((stored) => {
                if (stored && SUPPORTED_FIATS.find((f) => f.code === stored)) {
                    setSelectedCurrencyState(stored);
                }
            })
            .catch(() => { });
    }, []);

    const setSelectedCurrency = useCallback((code: string) => {
        setSelectedCurrencyState(code);
        AsyncStorage.setItem(STORAGE_KEY, code).catch(() => { });
    }, []);

    const refreshOracle = useCallback(async () => {
        try {
            setOracleLoading(true);
            const data = await fetchOracleData();
            setOracle(data);
        } catch (err) {
            console.warn("Oracle fetch failed:", err);
        } finally {
            setOracleLoading(false);
        }
    }, []);

    // Auto-fetch oracle + refresh interval
    useEffect(() => {
        refreshOracle();
        const interval = setInterval(refreshOracle, ORACLE_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [refreshOracle]);

    const currencyInfo = useMemo(
        () => getFiatInfo(selectedCurrency) || defaultInfo,
        [selectedCurrency]
    );

    // ── Conversion / formatting functions ──
    const convertToSelectedFn = useCallback(
        (usdAmount: number): number => {
            if (!oracle?.fiat) return usdAmount;
            return usdToFiat(usdAmount, selectedCurrency, oracle.fiat);
        },
        [oracle, selectedCurrency]
    );

    const formatPriceFn = useCallback(
        (usdAmount: number): string => {
            const converted = convertToSelectedFn(usdAmount);
            return `${currencyInfo.symbol}${fullNumber(converted)}`;
        },
        [convertToSelectedFn, currencyInfo]
    );

    const fiatToUsdFn = useCallback(
        (amount: number, fromCode: string): number => {
            if (!oracle?.fiat) return amount;
            return fiatToUsd(amount, fromCode, oracle.fiat);
        },
        [oracle]
    );

    const usdToFiatFn = useCallback(
        (usdAmount: number, toCode: string): number => {
            if (!oracle?.fiat) return usdAmount;
            return usdToFiat(usdAmount, toCode, oracle.fiat);
        },
        [oracle]
    );

    const formatFiatFn = useCallback(
        (amount: number, currencyCode: string): string => {
            const info = getFiatInfo(currencyCode) || { symbol: currencyCode + " " };
            return `${info.symbol}${fullNumber(amount)}`;
        },
        []
    );

    const formatUsdFn = useCallback(
        (usdAmount: number): string => `$${fullNumber(usdAmount)}`,
        []
    );

    const usdToCryptoFn = useCallback(
        (usdAmount: number, symbol: string): number => {
            if (!oracle?.crypto) return 0;
            return usdToCrypto(usdAmount, symbol, oracle.crypto);
        },
        [oracle]
    );

    const cryptoToUsdFn = useCallback(
        (amount: number, symbol: string): number => {
            if (!oracle?.crypto) return 0;
            return cryptoToUsd(amount, symbol, oracle.crypto);
        },
        [oracle]
    );

    const value = useMemo<CurrencyContextType>(
        () => ({
            selectedCurrency,
            currencyInfo,
            setSelectedCurrency,
            oracle,
            oracleLoading,
            refreshOracle,
            formatPrice: formatPriceFn,
            convertToSelected: convertToSelectedFn,
            fiatToUsd: fiatToUsdFn,
            usdToFiat: usdToFiatFn,
            formatFiat: formatFiatFn,
            formatUsd: formatUsdFn,
            usdToCrypto: usdToCryptoFn,
            cryptoToUsd: cryptoToUsdFn,
            supportedFiats: SUPPORTED_FIATS,
        }),
        [
            selectedCurrency,
            currencyInfo,
            setSelectedCurrency,
            oracle,
            oracleLoading,
            refreshOracle,
            formatPriceFn,
            convertToSelectedFn,
            fiatToUsdFn,
            usdToFiatFn,
            formatFiatFn,
            formatUsdFn,
            usdToCryptoFn,
            cryptoToUsdFn,
        ]
    );

    return (
        <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
    );
}

/**
 * Hook to access currency context.
 */
export function useCurrency(): CurrencyContextType {
    return useContext(CurrencyContext);
}
