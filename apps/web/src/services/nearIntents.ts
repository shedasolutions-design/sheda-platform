/**
 * NEAR Intents 1Click Swap API Service
 *
 * Enables cross-chain deposits: users can send tokens from ANY supported chain
 * (Solana, Ethereum, Arbitrum, BSC, etc.) and receive the desired token
 * (USDC, USDT, NEAR, etc.) in their NEAR wallet.
 *
 * API base: https://1click.chaindefuser.com
 * Docs: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 *
 * IMPORTANT: There is NO testnet for NEAR Intents.
 * All swaps happen on mainnet. For testnet wallets, use the "Copy Address" deposit method.
 */

const API_BASE = "https://1click.chaindefuser.com";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntentsToken {
    assetId: string;        // e.g. "nep141:wrap.near"
    decimals: number;
    blockchain: string;     // e.g. "near", "sol", "eth", "arb", "base", etc.
    symbol: string;         // e.g. "USDC", "SOL", "ETH"
    price: number;          // USD price
    priceUpdatedAt: string;
    contractAddress?: string;
}

export interface QuoteRequest {
    dry?: boolean;
    swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT";
    slippageTolerance: number; // basis points: 100 = 1%
    originAsset: string;       // source chain asset ID
    depositType: "ORIGIN_CHAIN" | "INTENTS";
    destinationAsset: string;  // destination asset ID
    amount: string;            // in smallest units (e.g. lamports for SOL)
    refundTo: string;          // refund address on source chain
    refundType: "ORIGIN_CHAIN" | "DESTINATION_CHAIN" | "INTENTS";
    recipient: string;         // address to receive output tokens
    recipientType: "ORIGIN_CHAIN" | "DESTINATION_CHAIN" | "INTENTS";
}

export interface QuoteResponse {
    quoteId: string;
    depositAddress: string;
    depositMemo?: string;
    amountIn: string;
    amountOut: string;
    originAsset: IntentsToken;
    destinationAsset: IntentsToken;
    deadline: string;
    timeWhenInactive: string;
    estimatedProcessingTimeMs?: number;
}

export interface SwapStatus {
    status: "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";
    amountIn?: string;
    amountOut?: string;
    originAsset?: string;
    destinationAsset?: string;
    txHash?: string;
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/**
 * Fetch all supported tokens from NEAR Intents.
 * Groups them by blockchain for easy filtering.
 */
export async function getIntentsTokens(): Promise<IntentsToken[]> {
    const res = await fetch(`${API_BASE}/v0/tokens`);
    if (!res.ok) throw new Error(`Failed to fetch tokens: ${res.statusText}`);
    return res.json();
}

/**
 * Request a swap quote from NEAR Intents 1Click API.
 *
 * @param params - Quote parameters
 * @param jwtToken - Optional JWT token for authenticated requests (avoids platform fees)
 */
export async function requestQuote(
    params: QuoteRequest,
    jwtToken?: string
): Promise<QuoteResponse> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (jwtToken) {
        headers["Authorization"] = `Bearer ${jwtToken}`;
    }

    const res = await fetch(`${API_BASE}/v0/quote`, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Quote failed: ${res.statusText}`);
    }

    return res.json();
}

/**
 * Request a DRY RUN quote (no deposit address generated).
 * Use this to preview the swap without committing.
 */
export async function requestDryQuote(
    params: Omit<QuoteRequest, "dry">
): Promise<QuoteResponse> {
    return requestQuote({ ...params, dry: true });
}

/**
 * Check the status of a swap using the deposit address.
 */
export async function checkSwapStatus(
    depositAddress: string,
    depositMemo?: string
): Promise<SwapStatus> {
    const url = new URL(`${API_BASE}/v0/status`);
    url.searchParams.set("depositAddress", depositAddress);
    if (depositMemo) url.searchParams.set("depositMemo", depositMemo);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
    return res.json();
}

/**
 * Optionally submit the deposit transaction hash to speed up processing.
 */
export async function submitDepositTx(
    depositAddress: string,
    txHash: string,
    blockchain: string,
    depositMemo?: string,
    nearSenderAccount?: string
): Promise<void> {
    const body: Record<string, string | undefined> = {
        depositAddress,
        txHash,
        blockchain,
        depositMemo,
    };
    if (nearSenderAccount) {
        body.nearSenderAccount = nearSenderAccount;
    }

    const res = await fetch(`${API_BASE}/v0/deposit/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        console.warn("Failed to submit deposit tx (non-critical):", res.statusText);
    }
}

// ─── Helper utilities ────────────────────────────────────────────────────────

/**
 * Group tokens by blockchain for UI display.
 */
export function groupTokensByChain(tokens: IntentsToken[]): Record<string, IntentsToken[]> {
    return tokens.reduce((acc, token) => {
        const chain = token.blockchain;
        if (!acc[chain]) acc[chain] = [];
        acc[chain].push(token);
        return acc;
    }, {} as Record<string, IntentsToken[]>);
}

/**
 * Find the NEAR-native asset ID for a given symbol.
 * E.g., for USDC on NEAR chain → "nep141:usdc.near" or similar.
 */
export function findNearAsset(tokens: IntentsToken[], symbol: string): IntentsToken | undefined {
    return tokens.find(
        (t) => t.blockchain === "near" && t.symbol.toUpperCase() === symbol.toUpperCase()
    );
}

/**
 * Human-friendly chain names for display.
 */
export const CHAIN_NAMES: Record<string, string> = {
    near: "NEAR",
    sol: "Solana",
    eth: "Ethereum",
    arb: "Arbitrum",
    base: "Base",
    bsc: "BNB Chain",
    btc: "Bitcoin",
    ton: "TON",
    doge: "Dogecoin",
    pol: "Polygon",
    op: "Optimism",
    avax: "Avalanche",
    gnosis: "Gnosis",
    xlayer: "X Layer",
    tron: "Tron",
    sui: "Sui",
    xrp: "XRP",
    ltc: "Litecoin",
    bch: "Bitcoin Cash",
    zec: "Zcash",
};

/**
 * Get display name for a chain.
 */
export function getChainDisplayName(chain: string): string {
    return CHAIN_NAMES[chain] || chain.charAt(0).toUpperCase() + chain.slice(1);
}
