// ============================================================================
// NEAR Contract Configuration — SINGLE SOURCE OF TRUTH
// ============================================================================
// Contract: market.shedauser.testnet
// Source: https://github.com/Entechnologuehamadex/sheda-new-contract
//
// Moved off shedasolution.testnet (2026-09-16). That deployment ran code from
// a repo whose main had not compiled since August, and carried the bugs that
// made the document-release and payment steps impossible to call at all.
//
// Nothing was carried across. There is no migration path from the old
// contract and none was written: this starts empty, on purpose.
// Guide: INTEGRATION_GUIDE.md (commit c99d8d7)
// ============================================================================

export const SHEDA_CONTRACT = {
    testnet: 'market.shedauser.testnet',
    mainnet: 'shedasolution.near', // ⚠️ NOT LIVE — do not activate
} as const;

// nodeUrl below is currently unused (no live RPC provider is built from
// NETWORK_CONFIG anywhere in the app — actual connections go through
// config/walletConfig.ts's failover list), but kept in sync with it anyway:
// rpc.testnet.near.org / rpc.mainnet.near.org are officially deprecated,
// always return a 429, and never send Access-Control-Allow-Origin, so
// anything built from these values would fail CORS on web. Don't reintroduce
// them here even for a "quick" one-off provider.
export const NEAR_CONFIG = {
    testnet: {
        networkId: 'testnet' as const,
        contractId: SHEDA_CONTRACT.testnet,
        nodeUrl: 'https://test.rpc.fastnear.com',
        walletUrl: 'https://testnet.mynearwallet.com/',
        helperUrl: 'https://helper.testnet.near.org',
    },
    mainnet: {
        networkId: 'mainnet' as const,
        contractId: SHEDA_CONTRACT.mainnet,
        nodeUrl: 'https://free.rpc.fastnear.com',
        walletUrl: 'https://mynearwallet.com/',
        helperUrl: 'https://helper.mainnet.near.org',
    },
} as const;

// Only testnet is active — hardcode until mainnet is officially launched
export const ACTIVE_NETWORK: 'testnet' | 'mainnet' = 'testnet';
export const CONTRACT_ID = SHEDA_CONTRACT[ACTIVE_NETWORK];
export const NETWORK_CONFIG = NEAR_CONFIG[ACTIVE_NETWORK];
