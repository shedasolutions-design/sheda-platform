/**
 * useNearIntents Hook
 *
 * Custom hook that manages the NEAR Intents cross-chain deposit flow.
 * Encapsulates all state, token loading, quoting, status polling,
 * and amount formatting for the 1Click Swap API.
 *
 * Accepts a whitelist of symbols so the receive-side only shows
 * tokens that the wallet actually supports.

 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
    getIntentsTokens,
    requestDryQuote,
    requestQuote,
    checkSwapStatus,
    submitDepositTx,
    groupTokensByChain,
    findNearAsset,
    getChainDisplayName,
    type IntentsToken,
    type QuoteResponse,
    type SwapStatus,
} from "@/services/nearIntents";
import Alert from "@/utilities/alertPolyfill";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IntentsStep = "choose" | "form" | "preview" | "deposit" | "status";

export interface IntentsState {
    step: IntentsStep;
    tokens: IntentsToken[];
    tokensLoading: boolean;

    // Chain & token selection
    selectedSourceChain: string;
    selectedSourceToken: IntentsToken | null;
    selectedDestToken: IntentsToken | null;
    amount: string;

    // Picker visibility
    showChainPicker: boolean;
    showSourceTokenPicker: boolean;
    showDestTokenPicker: boolean;

    // Dry-run preview
    previewQuote: QuoteResponse | null;
    previewLoading: boolean;

    // Live quote & deposit
    liveQuote: QuoteResponse | null;
    liveQuoteLoading: boolean;

    // Swap status
    swapStatus: SwapStatus | null;
    swapStatusLabel: string;
    statusPolling: boolean;

    // Deadline tracking
    quoteDeadline: Date | null;
    quoteExpired: boolean;
    estimatedTimeMs: number | null;
}

const INITIAL_STATE: IntentsState = {
    step: "choose",
    tokens: [],
    tokensLoading: false,
    selectedSourceChain: "",
    selectedSourceToken: null,
    selectedDestToken: null,
    amount: "",
    showChainPicker: false,
    showSourceTokenPicker: false,
    showDestTokenPicker: false,
    previewQuote: null,
    previewLoading: false,
    liveQuote: null,
    liveQuoteLoading: false,
    swapStatus: null,
    swapStatusLabel: "",
    statusPolling: false,
    quoteDeadline: null,
    quoteExpired: false,
    estimatedTimeMs: null,
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format a raw amount (smallest units) to a human-readable string.
 * E.g., "1000000" with decimals=6 → "1.00"
 */
export function formatTokenAmount(
    rawAmount: string,
    decimals: number,
    maxDecimals: number = 6
): string {
    try {
        if (!rawAmount || rawAmount === "0") return "0";

        const raw = BigInt(rawAmount);
        const divisor = BigInt(10 ** decimals);
        const wholePart = raw / divisor;
        const fractionalPart = raw % divisor;

        if (fractionalPart === BigInt(0)) {
            return wholePart.toString();
        }

        const fractionalStr = fractionalPart
            .toString()
            .padStart(decimals, "0")
            .slice(0, maxDecimals);

        // Trim trailing zeros
        const trimmed = fractionalStr.replace(/0+$/, "");
        return trimmed ? `${wholePart}.${trimmed}` : wholePart.toString();
    } catch {
        return rawAmount;
    }
}

/**
 * Convert a human-readable amount to smallest units string.
 * E.g., "1.5" with decimals=6 → "1500000"
 */
export function toSmallestUnits(
    humanAmount: string,
    decimals: number
): string {
    try {
        const parts = humanAmount.split(".");
        const wholePart = parts[0] || "0";
        let fractionalPart = parts[1] || "";

        // Pad or trim fractional part
        if (fractionalPart.length > decimals) {
            fractionalPart = fractionalPart.slice(0, decimals);
        } else {
            fractionalPart = fractionalPart.padEnd(decimals, "0");
        }

        const combined = wholePart + fractionalPart;
        // Remove leading zeros but keep at least one digit
        return combined.replace(/^0+/, "") || "0";
    } catch {
        return "0";
    }
}

/**
 * Get a status label emoji + text for display.
 */
export function getStatusDisplay(status: string): {
    emoji: string;
    text: string;
    color: "green" | "red" | "yellow" | "blue";
} {
    switch (status) {
        case "PENDING_DEPOSIT":
            return { emoji: "⏳", text: "Waiting for your deposit...", color: "yellow" };
        case "KNOWN_DEPOSIT_TX":
            return { emoji: "🔍", text: "Deposit detected, processing...", color: "blue" };
        case "PROCESSING":
            return { emoji: "⚙️", text: "Swap in progress...", color: "blue" };
        case "SUCCESS":
            return { emoji: "✅", text: "Swap completed successfully!", color: "green" };
        case "INCOMPLETE_DEPOSIT":
            return { emoji: "⚠️", text: "Incomplete deposit — amount too low", color: "yellow" };
        case "REFUNDED":
            return { emoji: "↩️", text: "Deposit has been refunded", color: "red" };
        case "FAILED":
            return { emoji: "❌", text: "Swap failed", color: "red" };
        default:
            return { emoji: "❓", text: status, color: "yellow" };
    }
}

// ─── Chain icon/color helpers ─────────────────────────────────────────────────

export const CHAIN_COLORS: Record<string, string> = {
    near: "#00EC97",
    sol: "#9945FF",
    eth: "#627EEA",
    arb: "#28A0F0",
    base: "#0052FF",
    bsc: "#F0B90B",
    btc: "#F7931A",
    ton: "#0088CC",
    pol: "#8247E5",
    op: "#FF0420",
    avax: "#E84142",
    sui: "#4DA2FF",
    tron: "#EF0027",
    xrp: "#23292F",
    ltc: "#BFBBBB",
    doge: "#C2A633",
    bch: "#8DC351",
    zec: "#ECB244",
    gnosis: "#04795B",
    xlayer: "#000000",
};

export function getChainColor(chain: string): string {
    return CHAIN_COLORS[chain] || "#6B7280";
}

export function getChainEmoji(chain: string): string {
    const emojis: Record<string, string> = {
        near: "Ⓝ",
        sol: "◎",
        eth: "Ξ",
        arb: "🔵",
        base: "🔷",
        bsc: "🟡",
        btc: "₿",
        ton: "💎",
        pol: "🟣",
        op: "🔴",
        avax: "🔺",
        sui: "🌊",
        tron: "⚡",
        xrp: "✕",
    };
    return emojis[chain] || "🔗";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param nearAccountId  The user's NEAR account ID
 * @param whitelistedSymbols  Optional list of token symbols the wallet supports.
 *                            When provided, the "Receive" picker only shows
 *                            NEAR-chain tokens whose symbol is in this list.
 */
export function useNearIntents(
    nearAccountId: string | undefined,
    whitelistedSymbols?: string[]
) {
    const [state, setState] = useState<IntentsState>(INITIAL_STATE);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const deadlineCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Derived data ──

    const availableChains = useMemo(() => {
        const chains = [
            ...new Set(
                state.tokens
                    .filter((t) => t.blockchain !== "near")
                    .map((t) => t.blockchain)
            ),
        ].sort();
        return chains;
    }, [state.tokens]);

    const sourceChainTokens = useMemo(() => {
        if (!state.selectedSourceChain) return [];
        return state.tokens.filter(
            (t) => t.blockchain === state.selectedSourceChain
        );
    }, [state.tokens, state.selectedSourceChain]);

    const nearTokens = useMemo(() => {
        const allNear = state.tokens.filter((t) => t.blockchain === "near");
        if (!whitelistedSymbols || whitelistedSymbols.length === 0) return allNear;

        // Normalise the whitelist for case-insensitive matching.
        // Also map common aliases: wNEAR ↔ NEAR, USDT.e ↔ USDT, etc.
        const normSet = new Set(
            whitelistedSymbols.map((s) => s.toUpperCase())
        );
        // Always allow native NEAR / wNEAR since the wallet supports NEAR
        if (normSet.has("NEAR")) normSet.add("WNEAR");
        if (normSet.has("WNEAR")) normSet.add("NEAR");

        return allNear.filter((t) => normSet.has(t.symbol.toUpperCase()));
    }, [state.tokens, whitelistedSymbols]);

    const usdEquivalent = useMemo(() => {
        if (!state.selectedSourceToken || !state.amount) return null;
        const val = parseFloat(state.amount);
        if (isNaN(val) || val <= 0) return null;
        return val * state.selectedSourceToken.price;
    }, [state.selectedSourceToken, state.amount]);

    // ── Update helpers ──

    const update = useCallback(
        (partial: Partial<IntentsState>) =>
            setState((prev) => ({ ...prev, ...partial })),
        []
    );

    // ── Load tokens ──

    const loadTokens = useCallback(async () => {
        if (state.tokens.length > 0) return; // Already loaded
        try {
            update({ tokensLoading: true });
            const tokens = await getIntentsTokens();
            // Default dest token to USDC on NEAR
            const nearUsdc = tokens.find(
                (t) => t.blockchain === "near" && t.symbol === "USDC"
            );
            update({
                tokens,
                tokensLoading: false,
                selectedDestToken: nearUsdc || null,
            });
        } catch (e) {
            console.error("Failed to load intents tokens:", e);
            update({ tokensLoading: false });
            Alert.alert(
                "Error",
                "Failed to load cross-chain tokens. Please try again."
            );
            throw e;
        }
    }, [state.tokens.length]);

    // ── Select chain ──

    const selectChain = useCallback((chain: string) => {
        update({
            selectedSourceChain: chain,
            selectedSourceToken: null,
            showChainPicker: false,
            previewQuote: null,
        });
    }, []);

    // ── Select source token ──

    const selectSourceToken = useCallback((token: IntentsToken) => {
        update({
            selectedSourceToken: token,
            showSourceTokenPicker: false,
            previewQuote: null,
        });
    }, []);

    // ── Select dest token ──

    const selectDestToken = useCallback((token: IntentsToken) => {
        update({
            selectedDestToken: token,
            showDestTokenPicker: false,
            previewQuote: null,
        });
    }, []);

    // ── Set amount ──

    const setAmount = useCallback((amount: string) => {
        update({ amount, previewQuote: null });
    }, []);

    // ── Get dry-run preview ──

    const getPreview = useCallback(async () => {
        const { selectedSourceToken, selectedDestToken, amount } = state;
        if (!selectedSourceToken || !selectedDestToken || !amount || !nearAccountId)
            return;

        try {
            update({ previewLoading: true });
            const amountInSmallest = toSmallestUnits(
                amount,
                selectedSourceToken.decimals
            );

            const preview = await requestDryQuote({
                swapType: "EXACT_INPUT",
                slippageTolerance: 100, // 1%
                originAsset: selectedSourceToken.assetId,
                depositType: "ORIGIN_CHAIN",
                destinationAsset: selectedDestToken.assetId,
                amount: amountInSmallest,
                refundTo: nearAccountId,
                refundType: "INTENTS",
                recipient: nearAccountId,
                recipientType: "INTENTS",
            });

            update({
                previewQuote: preview,
                previewLoading: false,
                step: "preview",
            });
        } catch (error: any) {
            update({ previewLoading: false });
            Alert.alert(
                "Preview Failed",
                error.message || "Unable to get swap preview. Please try again."
            );
        }
    }, [state.selectedSourceToken, state.selectedDestToken, state.amount, nearAccountId]);

    // ── Confirm & get live quote with deposit address ──

    const confirmAndGetDepositAddress = useCallback(async () => {
        const { selectedSourceToken, selectedDestToken, amount } = state;
        if (!selectedSourceToken || !selectedDestToken || !amount || !nearAccountId)
            return;

        try {
            update({ liveQuoteLoading: true });
            const amountInSmallest = toSmallestUnits(
                amount,
                selectedSourceToken.decimals
            );

            const quote = await requestQuote({
                swapType: "EXACT_INPUT",
                slippageTolerance: 100,
                originAsset: selectedSourceToken.assetId,
                depositType: "ORIGIN_CHAIN",
                destinationAsset: selectedDestToken.assetId,
                amount: amountInSmallest,
                refundTo: nearAccountId,
                refundType: "INTENTS",
                recipient: nearAccountId,
                recipientType: "INTENTS",
            });

            const deadline = quote.deadline ? new Date(quote.deadline) : null;

            update({
                liveQuote: quote,
                liveQuoteLoading: false,
                step: "deposit",
                swapStatus: { status: "PENDING_DEPOSIT" },
                swapStatusLabel: "PENDING_DEPOSIT",
                quoteDeadline: deadline,
                quoteExpired: false,
                estimatedTimeMs: quote.estimatedProcessingTimeMs || null,
            });

            // Start status polling
            startStatusPolling(quote.depositAddress, quote.depositMemo);

            // Start deadline tracking
            if (deadline) {
                startDeadlineTracking(deadline);
            }
        } catch (error: any) {
            update({ liveQuoteLoading: false });
            Alert.alert(
                "Quote Failed",
                error.message || "Failed to get deposit address. Please try again."
            );
        }
    }, [state.selectedSourceToken, state.selectedDestToken, state.amount, nearAccountId]);

    // ── Submit deposit tx hash (optional, speeds up processing) ──

    const submitTxHash = useCallback(
        async (txHash: string) => {
            const { liveQuote, selectedSourceToken } = state;
            if (!liveQuote || !selectedSourceToken) return;

            try {
                await submitDepositTx(
                    liveQuote.depositAddress,
                    txHash,
                    selectedSourceToken.blockchain,
                    liveQuote.depositMemo
                );
                console.log("✅ Deposit tx hash submitted successfully");
            } catch (e) {
                console.warn("Failed to submit deposit tx hash (non-critical):", e);
            }
        },
        [state.liveQuote, state.selectedSourceToken]
    );

    // ── Status polling ──

    const startStatusPolling = useCallback(
        (depositAddress: string, depositMemo?: string) => {
            // Clear any existing poll
            if (statusPollRef.current) {
                clearInterval(statusPollRef.current);
            }

            update({ statusPolling: true });

            const poll = setInterval(async () => {
                try {
                    const result = await checkSwapStatus(depositAddress, depositMemo);
                    update({
                        swapStatus: result,
                        swapStatusLabel: result.status,
                    });

                    // Stop polling on terminal states
                    if (
                        result.status === "SUCCESS" ||
                        result.status === "FAILED" ||
                        result.status === "REFUNDED"
                    ) {
                        clearInterval(poll);
                        statusPollRef.current = null;
                        update({ statusPolling: false, step: "status" });
                    }
                } catch (e) {
                    console.warn("Status poll error:", e);
                }
            }, 8_000); // Poll every 8 seconds

            statusPollRef.current = poll;
        },
        []
    );

    // ── Deadline tracking ──

    const startDeadlineTracking = useCallback((deadline: Date) => {
        if (deadlineCheckRef.current) {
            clearInterval(deadlineCheckRef.current);
        }

        const check = setInterval(() => {
            if (new Date() >= deadline) {
                update({ quoteExpired: true });
                clearInterval(check);
                deadlineCheckRef.current = null;
            }
        }, 5_000);

        deadlineCheckRef.current = check;
    }, []);

    // ── Reset entire flow ──

    const reset = useCallback(() => {
        // Clear polling
        if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
        }
        if (deadlineCheckRef.current) {
            clearInterval(deadlineCheckRef.current);
            deadlineCheckRef.current = null;
        }

        setState((prev) => ({
            ...INITIAL_STATE,
            tokens: prev.tokens, // Keep loaded tokens
        }));
    }, []);

    // ── Go back to form ──

    const goToForm = useCallback(() => {
        update({
            step: "form",
            previewQuote: null,
            liveQuote: null,
            swapStatus: null,
            swapStatusLabel: "",
            quoteDeadline: null,
            quoteExpired: false,
        });
    }, []);

    // ── Start the intents flow ──

    const startIntentsFlow = useCallback(async () => {
        try {
            await loadTokens();
            update({ step: "form" });
        } catch {
            // Error already shown in loadTokens
        }
    }, [loadTokens]);

    // ── Cleanup on unmount ──

    useEffect(() => {
        return () => {
            if (statusPollRef.current) {
                clearInterval(statusPollRef.current);
            }
            if (deadlineCheckRef.current) {
                clearInterval(deadlineCheckRef.current);
            }
        };
    }, []);

    return {
        // State
        ...state,

        // Derived
        availableChains,
        sourceChainTokens,
        nearTokens,
        usdEquivalent,

        // Actions
        update,
        loadTokens,
        selectChain,
        selectSourceToken,
        selectDestToken,
        setAmount,
        getPreview,
        confirmAndGetDepositAddress,
        submitTxHash,
        reset,
        goToForm,
        startIntentsFlow,

        // Helpers (re-exported for convenience)
        formatTokenAmount,
        toSmallestUnits,
        getStatusDisplay,
        getChainColor,
        getChainEmoji,
        getChainDisplayName,
    };
}
