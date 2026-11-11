"use client";

import { useCurrency } from "@/contexts/CurrencyContext";

const SIZES = {
  sm: { primary: "text-sm", secondary: "text-[11px]" },
  md: { primary: "text-lg", secondary: "text-xs" },
  lg: { primary: "text-[26px] leading-tight", secondary: "text-sm" },
} as const;

function compactFormat(num: number, symbol: string): string {
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${symbol}${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${symbol}${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(num / 1_000).toFixed(1)}K`;
  return `${symbol}${num.toFixed(2)}`;
}

/**
 * A price in the viewer's chosen currency, with the USD equivalent beneath.
 * Pass either `amountUsd`, or `amountFiat` with its `fiatCode`.
 */
export default function PriceDisplay({
  amountUsd,
  amountFiat,
  fiatCode,
  suffix = "",
  size = "md",
  showUsd = true,
  compact = false,
  className = "",
}: {
  amountUsd?: number;
  amountFiat?: number;
  fiatCode?: string;
  suffix?: string;
  size?: keyof typeof SIZES;
  showUsd?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { formatPrice, formatUsd, fiatToUsd, convertToSelected, selectedCurrency, currencyInfo } =
    useCurrency();

  const usd = amountFiat != null && fiatCode ? fiatToUsd(amountFiat, fiatCode) : amountUsd ?? 0;
  const s = SIZES[size];

  return (
    <div className={className}>
      <p className={`font-bold text-[#333] ${s.primary}`}>
        {compact ? compactFormat(convertToSelected(usd), currencyInfo.symbol) : formatPrice(usd)}
        {suffix}
      </p>
      {showUsd && selectedCurrency !== "USD" && usd > 0 && (
        <p className={`text-[#999] ${s.secondary}`}>≈ {formatUsd(usd)}</p>
      )}
    </div>
  );
}
