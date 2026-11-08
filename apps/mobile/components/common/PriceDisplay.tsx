/**
 * PriceDisplay
 *
 * Reusable component that shows a price in the user's selected currency
 * with USD equivalent below it.
 *
 * Props:
 *   - amountUsd:   Price in USD (base layer)
 *   - amountFiat:  Price in a specific fiat (requires fiatCode)
 *   - fiatCode:    Fiat code of amountFiat (e.g. "NGN")
 *   - suffix:      Text after price, e.g. "/year"
 *   - size:        "sm" | "md" | "lg"
 *   - showUsd:     Whether to show USD equivalent (default true)
 *   - compact:     Show compact (abbreviated) numbers
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import InterBold from "@/components/Text/InterBold";
import InterRegular from "@/components/Text/InterRegular";
import { useCurrency } from "@/contexts/CurrencyContext";

interface PriceDisplayProps {
    /** Price denominated in USD */
    amountUsd?: number;
    /** Price denominated in a specific fiat (use with fiatCode) */
    amountFiat?: number;
    /** The fiat currency of amountFiat, e.g. "NGN" */
    fiatCode?: string;
    /** Suffix like "/year" */
    suffix?: string;
    /** Size preset */
    size?: "sm" | "md" | "lg";
    /** Show USD equivalent below */
    showUsd?: boolean;
    /** Use compact number formatting */
    compact?: boolean;
    /** Primary text color */
    color?: string;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({
    amountUsd,
    amountFiat,
    fiatCode,
    suffix = "",
    size = "md",
    showUsd = true,
    compact = false,
    color,
}) => {
    const {
        formatPrice,
        formatUsd,
        fiatToUsd: toUsd,
        convertToSelected,
        selectedCurrency,
        currencyInfo,
    } = useCurrency();

    // Determine the USD value
    let usdValue = amountUsd ?? 0;
    if (amountFiat != null && fiatCode) {
        usdValue = toUsd(amountFiat, fiatCode);
    }

    // Format in selected display currency
    const displayPrice = formatPrice(usdValue);

    // Format USD equivalent
    const usdDisplay = formatUsd(usdValue);

    const sizeStyles = SIZE_MAP[size];
    const isUsdSelected = selectedCurrency === "USD";

    return (
        <View>
            <InterBold style={[sizeStyles.primary, color ? { color } : undefined]}>
                {compact ? compactFormat(convertToSelected(usdValue), currencyInfo.symbol) : displayPrice}
                {suffix}
            </InterBold>
            {showUsd && !isUsdSelected && usdValue > 0 && (
                <InterRegular style={sizeStyles.secondary}>
                    ≈ {usdDisplay}
                </InterRegular>
            )}
        </View>
    );
};

function compactFormat(num: number, symbol: string): string {
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `${symbol}${(num / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${symbol}${(num / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${symbol}${(num / 1_000).toFixed(1)}K`;
    return `${symbol}${num.toFixed(2)}`;
}

const SIZE_MAP = {
    sm: StyleSheet.create({
        primary: { fontSize: 14, color: "#333" },
        secondary: { fontSize: 11, color: "#999", marginTop: 1 },
    }),
    md: StyleSheet.create({
        primary: { fontSize: 18, color: "#333" },
        secondary: { fontSize: 12, color: "#999", marginTop: 2 },
    }),
    lg: StyleSheet.create({
        primary: { fontSize: 26, color: "#333" },
        secondary: { fontSize: 14, color: "#999", marginTop: 3 },
    }),
};

export default PriceDisplay;
