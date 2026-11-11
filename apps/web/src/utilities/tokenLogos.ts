/**
 * Token Logos — Maps token symbols to display properties
 *
 * For testnet tokens we use colored circle + letter fallback.
 * For mainnet/production, replace with actual CDN image URLs.
 */

import { CIRCLE_USDC_TESTNET } from '@/config/tokens';

export interface TokenDisplayInfo {
    /** Background color for the token icon circle */
    color: string;
    /** Text abbreviation shown when no logo image is available */
    letter: string;
    /** Full display name */
    displayName: string;
    /** Optional remote logo URL (from NEAR token metadata CDN) */
    logoUrl?: string;
}

const TOKEN_DISPLAY: Record<string, TokenDisplayInfo> = {
    NEAR: {
        color: "#00C08B",
        letter: "N",
        displayName: "NEAR Protocol",
        logoUrl: "https://cryptologos.cc/logos/near-protocol-near-logo.png?v=040",
    },
    USDT: {
        color: "#26A17B",
        letter: "₮",
        displayName: "Tether USD",
        logoUrl: "https://cryptologos.cc/logos/tether-usdt-logo.png?v=040",
    },
    USDC: {
        color: "#2775CA",
        letter: "$",
        displayName: "USD Coin",
        logoUrl: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040",
    },
    wNEAR: {
        color: "#2F3A4F",
        letter: "w",
        displayName: "Wrapped NEAR",
        logoUrl: "https://cryptologos.cc/logos/near-protocol-near-logo.png?v=040",
    },
    DAI: {
        color: "#F4B731",
        letter: "D",
        displayName: "Dai Stablecoin",
        logoUrl: "https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png?v=040",
    },
    USN: {
        color: "#4F90EA",
        letter: "U",
        displayName: "USN",
    },
    AURORA: {
        color: "#78D64B",
        letter: "A",
        displayName: "Aurora",
    },
    REF: {
        color: "#F7931E",
        letter: "R",
        displayName: "Ref Finance",
    },
};

/**
 * Contract-specific overrides for display name.
 * Useful when multiple contracts share a symbol (e.g. two USDC contracts).
 */
const CONTRACT_DISPLAY_OVERRIDES: Record<string, Partial<TokenDisplayInfo>> = {
    [CIRCLE_USDC_TESTNET]: {
        displayName: "USDC (Circle)",
    },
    'usdc.fakes.testnet': {
        displayName: "USDC (Testnet)",
    },
    'usdt.fakes.testnet': {
        displayName: "USDT (Testnet)",
    },
};

/**
 * Get display info for a token symbol.
 * Optionally pass contractId for more specific matching when multiple
 * contracts share a symbol (e.g. Circle USDC vs fake USDC).
 */
export function getTokenDisplay(symbol: string, contractId?: string): TokenDisplayInfo {
    const base = TOKEN_DISPLAY[symbol] || {
        color: "#888888",
        letter: symbol.charAt(0).toUpperCase(),
        displayName: symbol,
    };

    // Apply contract-specific overrides if available
    if (contractId && CONTRACT_DISPLAY_OVERRIDES[contractId]) {
        return { ...base, ...CONTRACT_DISPLAY_OVERRIDES[contractId] };
    }

    return base;
}

/**
 * Get all known token display entries.
 */
export function getAllTokenDisplays(): Record<string, TokenDisplayInfo> {
    return { ...TOKEN_DISPLAY };
}
