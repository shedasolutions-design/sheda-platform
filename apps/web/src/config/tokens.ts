// ============================================================================
// Supported Stablecoins — Token Registry for Contract Payments
// ============================================================================
// The contract accepts a configurable whitelist of stablecoins.
// Source of truth: market.shedauser.testnet → supported_stablecoins()
// Last verified on-chain: 2026-03-02
// ============================================================================

import { ACTIVE_NETWORK } from './near';

/**
 * Circle's USDC contract on NEAR testnet (implicit account).
 * This is the REAL USDC by Circle, not a fake/test token.
 */
export const CIRCLE_USDC_TESTNET = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';

export const SUPPORTED_TOKENS = {
    testnet: {
        // On-chain whitelist (from supported_stablecoins view call):
        USDT: 'usdt.fakes.testnet',
        USDC_FAKES: 'usdc.fakes.testnet',
        USDC_CIRCLE: CIRCLE_USDC_TESTNET,
    },
    mainnet: {
        // To be configured at mainnet launch — do not use yet
        USDC: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
        USDT: 'usdt.tether-token.near',
    },
} as const;

/**
 * The token Collections raises are priced and paid in.
 *
 * Testnet uses usdc.fakes.testnet: it is what every new wallet is given at
 * set-up and anyone can mint more, so testers can actually invest. Circle's
 * testnet USDC is only obtainable from Circle's faucet, which left testers
 * with a balance they could not spend. The v2 raise and stake contracts are
 * configured with this same token.
 */
export const DEFAULT_TOKEN = ACTIVE_NETWORK === 'testnet'
    ? SUPPORTED_TOKENS.testnet.USDC_FAKES
    : SUPPORTED_TOKENS.mainnet.USDC;

/**
 * All accepted stablecoins for the current network.
 * Used by TokenSelectionModal and payment flows.
 */
export function getAcceptedStablecoins(): string[] {
    if (ACTIVE_NETWORK === 'testnet') {
        return [
            SUPPORTED_TOKENS.testnet.USDT,
            SUPPORTED_TOKENS.testnet.USDC_FAKES,
            SUPPORTED_TOKENS.testnet.USDC_CIRCLE,
        ];
    }
    return [
        SUPPORTED_TOKENS.mainnet.USDT,
        SUPPORTED_TOKENS.mainnet.USDC,
    ];
}

// Token decimals — keyed by contract address
export const TOKEN_DECIMALS: Record<string, number> = {
    // Testnet
    'usdt.fakes.testnet': 6,
    'usdc.fakes.testnet': 6,
    [CIRCLE_USDC_TESTNET]: 6,
    'wrap.testnet': 24,
    // Mainnet
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': 6,
    'usdt.tether-token.near': 6,
    'wrap.near': 24,
};

export function getTokenDecimals(tokenAddress: string): number {
    return TOKEN_DECIMALS[tokenAddress] ?? 6;
}

// Ticker per contract address. Property prices are stored on-chain as atomic
// units of whichever stablecoin the property was minted with, so anything
// rendering a price needs the ticker to go with the number.
const TOKEN_SYMBOLS: Record<string, string> = {
    'usdt.fakes.testnet': 'USDT',
    'usdc.fakes.testnet': 'USDC',
    [CIRCLE_USDC_TESTNET]: 'USDC',
    'wrap.testnet': 'wNEAR',
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': 'USDC',
    'usdt.tether-token.near': 'USDT',
    'wrap.near': 'wNEAR',
};

/**
 * Ticker for a token contract address. Falls back to sniffing the account
 * name so a stablecoin added on-chain after this file was written still shows
 * something meaningful instead of a raw contract address.
 */
export function getTokenSymbol(contractId?: string | null): string {
    if (!contractId) return 'USDC';

    const known = TOKEN_SYMBOLS[contractId];
    if (known) return known;

    const lower = contractId.toLowerCase();
    if (lower.includes('usdt') || lower.includes('tether')) return 'USDT';
    if (lower.includes('usdc')) return 'USDC';
    if (lower.includes('wrap')) return 'wNEAR';
    return 'Token';
}

/** True when 1 unit of the token can be treated as $1 for display purposes. */
export function isStablecoin(contractId?: string | null): boolean {
    const symbol = getTokenSymbol(contractId);
    return symbol === 'USDC' || symbol === 'USDT';
}

/**
 * Get human-readable label for a token contract address.
 */
export function getTokenLabel(contractId: string): string {
    const labels: Record<string, string> = {
        'usdt.fakes.testnet': 'USDT (Testnet)',
        'usdc.fakes.testnet': 'USDC (Testnet Fake)',
        [CIRCLE_USDC_TESTNET]: 'USDC (Circle)',
        'usdt.tether-token.near': 'USDT (Tether)',
        'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': 'USDC',
    };
    return labels[contractId] ?? contractId;
}

// Admin-only: to add a new accepted stablecoin call add_supported_stablecoin
// on the contract with { token_account: "new_token.testnet" }
