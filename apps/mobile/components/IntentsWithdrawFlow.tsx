/**
 * IntentsWithdrawFlow
 *
 * Cross-chain withdrawal component using NEAR Intents 1Click API.
 * Users select a token from their NEAR wallet, choose a destination
 * chain & token, enter the recipient address, and the system handles
 * the cross-chain swap automatically.
 *
 * Flow: form → preview → execute (ft_transfer to deposit address) → status
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    View,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    TextInput,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import * as Clipboard from "expo-clipboard";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import {
    getIntentsTokens,
    requestDryQuote,
    requestQuote,
    checkSwapStatus,
    submitDepositTx,
    getChainDisplayName,
    CHAIN_NAMES,
    type IntentsToken,
    type QuoteResponse,
    type SwapStatus,
} from "@/services/nearIntents";
import {
    formatTokenAmount,
    toSmallestUnits,
    getStatusDisplay,
    getChainColor,
    getChainEmoji,
} from "@/hooks/useNearIntents";
import { useWallet } from "@/contexts/WalletContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";

// ─── Types ───────────────────────────────────────────────────────────────────

type WithdrawStep = "form" | "preview" | "executing" | "status";

interface IntentsWithdrawFlowProps {
    nearAccountId: string;
    onDone: () => void;
    onRefresh: () => void;
    /** Wallet token symbols the user actually holds */
    walletTokenSymbols?: string[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntentsWithdrawFlow({
    nearAccountId,
    onDone,
    onRefresh,
    walletTokenSymbols,
}: IntentsWithdrawFlowProps) {
    // ── State ──
    const [step, setStep] = useState<WithdrawStep>("form");
    const [tokens, setTokens] = useState<IntentsToken[]>([]);
    const [tokensLoading, setTokensLoading] = useState(false);

    // Source: NEAR-chain token the user wants to send
    const [selectedSourceToken, setSelectedSourceToken] = useState<IntentsToken | null>(null);
    const [showSourcePicker, setShowSourcePicker] = useState(false);

    // Destination: chain & token user wants to receive
    const [selectedDestChain, setSelectedDestChain] = useState<string>("");
    const [selectedDestToken, setSelectedDestToken] = useState<IntentsToken | null>(null);
    const [showDestChainPicker, setShowDestChainPicker] = useState(false);
    const [showDestTokenPicker, setShowDestTokenPicker] = useState(false);

    // Amount (human-readable)
    const [amount, setAmount] = useState("");

    // Recipient address on destination chain
    const [recipientAddress, setRecipientAddress] = useState("");

    // Preview
    const [previewQuote, setPreviewQuote] = useState<QuoteResponse | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Live quote (with deposit address)
    const [liveQuote, setLiveQuote] = useState<QuoteResponse | null>(null);
    const [executingTx, setExecutingTx] = useState(false);

    // Status
    const [swapStatus, setSwapStatus] = useState<SwapStatus | null>(null);
    const [statusPolling, setStatusPolling] = useState(false);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { sendFungibleToken } = useWallet();
    const { run: runTransaction } = useTransactionToast();

    // ── Derived data ──

    // NEAR-chain tokens available for withdrawal (filter to wallet holdings)
    const nearSourceTokens = useMemo(() => {
        const nearTokens = tokens.filter((t) => t.blockchain === "near");
        if (!walletTokenSymbols || walletTokenSymbols.length === 0) return nearTokens;

        const normSet = new Set(walletTokenSymbols.map((s) => s.toUpperCase()));
        if (normSet.has("NEAR")) normSet.add("WNEAR");
        if (normSet.has("WNEAR")) normSet.add("NEAR");

        return nearTokens.filter((t) => normSet.has(t.symbol.toUpperCase()));
    }, [tokens, walletTokenSymbols]);

    // Available destination chains (all except NEAR)
    const destChains = useMemo(() => {
        return [...new Set(tokens.filter((t) => t.blockchain !== "near").map((t) => t.blockchain))].sort();
    }, [tokens]);

    // Tokens on the selected destination chain
    const destChainTokens = useMemo(() => {
        if (!selectedDestChain) return [];
        return tokens.filter((t) => t.blockchain === selectedDestChain);
    }, [tokens, selectedDestChain]);

    // USD equivalent of the entered amount
    const usdEquivalent = useMemo(() => {
        if (!selectedSourceToken || !amount) return null;
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return null;
        return val * selectedSourceToken.price;
    }, [selectedSourceToken, amount]);

    // ── Load tokens on mount ──

    useEffect(() => {
        loadTokens();
    }, []);

    const loadTokens = async () => {
        try {
            setTokensLoading(true);
            const allTokens = await getIntentsTokens();
            setTokens(allTokens);

            // Default source to wNEAR
            const wNear = allTokens.find(
                (t) => t.blockchain === "near" && (t.symbol === "wNEAR" || t.symbol === "NEAR")
            );
            if (wNear) setSelectedSourceToken(wNear);

            setTokensLoading(false);
        } catch (e) {
            console.error("Failed to load intents tokens:", e);
            setTokensLoading(false);
            Alert.alert("Error", "Failed to load cross-chain tokens. Please try again.");
        }
    };

    // ── Get preview (dry quote) ──

    const getPreview = async () => {
        if (!selectedSourceToken || !selectedDestToken || !amount || !recipientAddress) {
            Alert.alert("Missing Info", "Please fill in all fields to get a preview.");
            return;
        }

        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount.");
            return;
        }

        try {
            setPreviewLoading(true);
            const amountSmallest = toSmallestUnits(amount, selectedSourceToken.decimals);

            const preview = await requestDryQuote({
                swapType: "EXACT_INPUT",
                slippageTolerance: 100,
                originAsset: selectedSourceToken.assetId,
                depositType: "ORIGIN_CHAIN",
                destinationAsset: selectedDestToken.assetId,
                amount: amountSmallest,
                refundTo: nearAccountId,
                refundType: "ORIGIN_CHAIN",
                recipient: recipientAddress,
                recipientType: "DESTINATION_CHAIN",
            });

            setPreviewQuote(preview);
            setPreviewLoading(false);
            setStep("preview");
        } catch (error: any) {
            setPreviewLoading(false);
            Alert.alert(
                "Preview Failed",
                error.message || "Could not get a swap preview. Please try again."
            );
        }
    };

    // ── Confirm: get live quote, then execute ft_transfer ──

    const confirmAndExecute = async () => {
        if (!selectedSourceToken || !selectedDestToken || !amount || !recipientAddress) return;

        try {
            setExecutingTx(true);
            setStep("executing");
            const amountSmallest = toSmallestUnits(amount, selectedSourceToken.decimals);

            // 1. Get committed quote with deposit address
            const quote = await requestQuote({
                swapType: "EXACT_INPUT",
                slippageTolerance: 100,
                originAsset: selectedSourceToken.assetId,
                depositType: "ORIGIN_CHAIN",
                destinationAsset: selectedDestToken.assetId,
                amount: amountSmallest,
                refundTo: nearAccountId,
                refundType: "ORIGIN_CHAIN",
                recipient: recipientAddress,
                recipientType: "DESTINATION_CHAIN",
            });

            setLiveQuote(quote);

            // 2. Execute ft_transfer to the deposit address
            // For NEAR chain, this is an ft_transfer call on the token contract
            const tokenContract = selectedSourceToken.contractAddress || "wrap.near";

            console.log(
                `IntentsWithdraw: Sending ${amountSmallest} of ${selectedSourceToken.symbol} to deposit address ${quote.depositAddress}`
            );

            // Use the wallet's sendFungibleToken to execute the transfer.
            // This toast covers the on-chain deposit leg only — the actual
            // cross-chain swap completion is detected later by
            // startStatusPolling below, which is out of scope for this
            // toast/notification (it already has its own "status" step UI).
            const result = await runTransaction({
                loadingMessage: `Sending ${amount} ${selectedSourceToken.symbol} to start the withdrawal...`,
                successMessage: "Deposit sent. Tracking your withdrawal...",
                notification: {
                    type: "general",
                    title: "Withdrawal Started",
                    message: `Your ${amount} ${selectedSourceToken.symbol} withdrawal is now processing.`,
                },
                action: () =>
                    sendFungibleToken(
                        nearAccountId,
                        quote.depositAddress,
                        tokenContract,
                        amountSmallest,
                        selectedSourceToken.decimals
                    ),
            });

            console.log("IntentsWithdraw: ft_transfer result:", result);

            // 3. Submit deposit tx hash to speed up processing
            try {
                const txHash = typeof result === "string" ? result : (result as any)?.transaction?.hash || "";
                if (txHash) {
                    await submitDepositTx(
                        quote.depositAddress,
                        txHash,
                        "near",
                        quote.depositMemo,
                        nearAccountId
                    );
                    console.log("IntentsWithdraw: Deposit tx hash submitted");
                }
            } catch (submitError) {
                console.warn("IntentsWithdraw: Failed to submit tx hash (non-critical):", submitError);
            }

            setExecutingTx(false);
            setStep("status");

            // 4. Start polling for status
            startStatusPolling(quote.depositAddress, quote.depositMemo);
        } catch (error: any) {
            setExecutingTx(false);
            setStep("preview");
            Alert.alert(
                "Withdrawal Failed",
                error.message || "Failed to execute the withdrawal transaction. Please try again."
            );
        }
    };

    // ── Status polling ──

    const startStatusPolling = (depositAddress: string, depositMemo?: string) => {
        if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
        }

        setStatusPolling(true);

        const poll = setInterval(async () => {
            try {
                const result = await checkSwapStatus(depositAddress, depositMemo);
                setSwapStatus(result);

                if (
                    result.status === "SUCCESS" ||
                    result.status === "FAILED" ||
                    result.status === "REFUNDED" ||
                    result.status === "INCOMPLETE_DEPOSIT"
                ) {
                    clearInterval(poll);
                    statusPollRef.current = null;
                    setStatusPolling(false);
                }
            } catch (e) {
                console.warn("Status poll error:", e);
            }
        }, 8_000);

        statusPollRef.current = poll;
    };

    // ── Cleanup ──

    useEffect(() => {
        return () => {
            if (statusPollRef.current) {
                clearInterval(statusPollRef.current);
            }
        };
    }, []);

    // ── Handle done ──

    const handleDone = () => {
        if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
        }
        onRefresh();
        onDone();
    };

    // ────────────────────────────────────────────────────────────────────────────
    // Loading state
    // ────────────────────────────────────────────────────────────────────────────

    if (tokensLoading) {
        return (
            <View className="items-center py-10">
                <ActivityIndicator size="large" color="#6366f1" />
                <InterRegular className="text-gray-500 text-sm mt-3">
                    Loading cross-chain tokens...
                </InterRegular>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: FORM
    // ────────────────────────────────────────────────────────────────────────────

    if (step === "form") {
        return (
            <View>
                {/* Mainnet warning */}
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                    <InterRegular className="text-amber-800 text-xs leading-5">
                        NEAR Intents operates on <InterSemiBold className="text-amber-800 text-xs">mainnet only</InterSemiBold>.
                        Withdrawals convert your NEAR tokens and deliver to your chosen chain.
                    </InterRegular>
                </View>

                {/* Source Token (NEAR wallet) */}
                <View className="mb-4">
                    <InterMedium className="text-sm mb-2">Send Token (from your wallet)</InterMedium>
                    <TouchableOpacity
                        onPress={() => setShowSourcePicker(!showSourcePicker)}
                        className="border border-gray-300 rounded-lg p-3 flex-row justify-between items-center"
                    >
                        <View className="flex-row items-center gap-2">
                            <View
                                className="w-6 h-6 rounded-full items-center justify-center"
                                style={{ backgroundColor: getChainColor("near") }}
                            >
                                <InterSemiBold style={{ color: "#fff", fontSize: 10 }}>
                                    {getChainEmoji("near")}
                                </InterSemiBold>
                            </View>
                            <InterMedium>{selectedSourceToken?.symbol || "Select token"}</InterMedium>
                        </View>
                        <InterRegular className="text-gray-400">▼</InterRegular>
                    </TouchableOpacity>

                    {showSourcePicker && (
                        <View className="border border-gray-200 rounded-lg mt-1 bg-white" style={{ maxHeight: 200 }}>
                            <ScrollView>
                                {nearSourceTokens.map((token) => (
                                    <TouchableOpacity
                                        key={token.assetId}
                                        className="flex-row items-center justify-between p-3 border-b border-gray-100"
                                        onPress={() => {
                                            setSelectedSourceToken(token);
                                            setShowSourcePicker(false);
                                            setPreviewQuote(null);
                                        }}
                                    >
                                        <InterMedium className="text-sm">{token.symbol}</InterMedium>
                                        <InterRegular className="text-xs text-gray-500">
                                            ${token.price?.toFixed(2) || "–"}
                                        </InterRegular>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* Amount */}
                <View className="mb-4">
                    <InterMedium className="text-sm mb-2">
                        Amount ({selectedSourceToken?.symbol || "–"})
                    </InterMedium>
                    <TextInput
                        className="border border-gray-300 rounded-lg p-3 text-base"
                        placeholder="0.00"
                        value={amount}
                        onChangeText={(v) => {
                            setAmount(v);
                            setPreviewQuote(null);
                        }}
                        keyboardType="decimal-pad"
                    />
                    {usdEquivalent !== null && (
                        <InterRegular className="text-xs text-gray-500 mt-1">
                            ≈ ${usdEquivalent.toFixed(2)} USD
                        </InterRegular>
                    )}
                </View>

                {/* Destination Chain */}
                <View className="mb-4">
                    <InterMedium className="text-sm mb-2">Receive on Chain</InterMedium>
                    <TouchableOpacity
                        onPress={() => setShowDestChainPicker(!showDestChainPicker)}
                        className="border border-gray-300 rounded-lg p-3 flex-row justify-between items-center"
                    >
                        <View className="flex-row items-center gap-2">
                            {selectedDestChain ? (
                                <>
                                    <View
                                        className="w-6 h-6 rounded-full items-center justify-center"
                                        style={{ backgroundColor: getChainColor(selectedDestChain) }}
                                    >
                                        <InterSemiBold style={{ color: "#fff", fontSize: 10 }}>
                                            {getChainEmoji(selectedDestChain)}
                                        </InterSemiBold>
                                    </View>
                                    <InterMedium>{getChainDisplayName(selectedDestChain)}</InterMedium>
                                </>
                            ) : (
                                <InterMedium className="text-gray-400">Select destination chain</InterMedium>
                            )}
                        </View>
                        <InterRegular className="text-gray-400">▼</InterRegular>
                    </TouchableOpacity>

                    {showDestChainPicker && (
                        <View className="border border-gray-200 rounded-lg mt-1 bg-white" style={{ maxHeight: 250 }}>
                            <ScrollView>
                                {destChains.map((chain) => (
                                    <TouchableOpacity
                                        key={chain}
                                        className="flex-row items-center gap-3 p-3 border-b border-gray-100"
                                        onPress={() => {
                                            setSelectedDestChain(chain);
                                            setSelectedDestToken(null);
                                            setShowDestChainPicker(false);
                                            setPreviewQuote(null);
                                        }}
                                    >
                                        <View
                                            className="w-8 h-8 rounded-full items-center justify-center"
                                            style={{ backgroundColor: getChainColor(chain) }}
                                        >
                                            <InterSemiBold style={{ color: "#fff", fontSize: 12 }}>
                                                {getChainEmoji(chain)}
                                            </InterSemiBold>
                                        </View>
                                        <InterMedium className="text-sm">{getChainDisplayName(chain)}</InterMedium>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* Destination Token */}
                {selectedDestChain && (
                    <View className="mb-4">
                        <InterMedium className="text-sm mb-2">
                            Receive Token on {getChainDisplayName(selectedDestChain)}
                        </InterMedium>
                        <TouchableOpacity
                            onPress={() => setShowDestTokenPicker(!showDestTokenPicker)}
                            className="border border-gray-300 rounded-lg p-3 flex-row justify-between items-center"
                        >
                            <View className="flex-row items-center gap-2">
                                {selectedDestToken ? (
                                    <>
                                        <View
                                            className="w-6 h-6 rounded-full items-center justify-center"
                                            style={{ backgroundColor: getChainColor(selectedDestChain) }}
                                        >
                                            <InterSemiBold style={{ color: "#fff", fontSize: 10 }}>
                                                {selectedDestToken.symbol.charAt(0)}
                                            </InterSemiBold>
                                        </View>
                                        <InterMedium>{selectedDestToken.symbol}</InterMedium>
                                    </>
                                ) : (
                                    <InterMedium className="text-gray-400">Select token</InterMedium>
                                )}
                            </View>
                            <InterRegular className="text-gray-400">▼</InterRegular>
                        </TouchableOpacity>

                        {showDestTokenPicker && (
                            <View className="border border-gray-200 rounded-lg mt-1 bg-white" style={{ maxHeight: 200 }}>
                                <ScrollView>
                                    {destChainTokens.map((token) => (
                                        <TouchableOpacity
                                            key={token.assetId}
                                            className="flex-row items-center justify-between p-3 border-b border-gray-100"
                                            onPress={() => {
                                                setSelectedDestToken(token);
                                                setShowDestTokenPicker(false);
                                                setPreviewQuote(null);
                                            }}
                                        >
                                            <InterMedium className="text-sm">{token.symbol}</InterMedium>
                                            <InterRegular className="text-xs text-gray-500">
                                                ${token.price?.toFixed(2) || "–"}
                                            </InterRegular>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                )}

                {/* Recipient Address */}
                <View className="mb-6">
                    <InterMedium className="text-sm mb-2">
                        Recipient Address on {selectedDestChain ? getChainDisplayName(selectedDestChain) : "destination chain"}
                    </InterMedium>
                    <TextInput
                        className="border border-gray-300 rounded-lg p-3 text-base"
                        placeholder={selectedDestChain === "eth" || selectedDestChain === "arb" || selectedDestChain === "base" || selectedDestChain === "bsc" || selectedDestChain === "pol" || selectedDestChain === "op"
                            ? "0x..."
                            : selectedDestChain === "sol"
                                ? "Solana address..."
                                : "Recipient address..."
                        }
                        value={recipientAddress}
                        onChangeText={setRecipientAddress}
                        autoCapitalize="none"
                    />
                </View>

                {/* Preview Button */}
                <Button
                    className="bg-indigo-500 rounded-lg py-4"
                    onPress={getPreview}
                    disabled={previewLoading || !selectedSourceToken || !selectedDestToken || !amount || !recipientAddress}
                >
                    <InterSemiBold className="text-white text-center">
                        {previewLoading ? "Getting preview..." : "Preview Withdrawal"}
                    </InterSemiBold>
                </Button>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: PREVIEW
    // ────────────────────────────────────────────────────────────────────────────

    if (step === "preview" && previewQuote && selectedSourceToken && selectedDestToken) {
        const amountOutFormatted = previewQuote.amountOut
            ? formatTokenAmount(previewQuote.amountOut, selectedDestToken.decimals)
            : "–";

        return (
            <View>
                <InterSemiBold className="text-lg mb-4">Withdrawal Preview</InterSemiBold>

                {/* Source */}
                <View className="bg-gray-50 rounded-xl p-4 mb-3">
                    <InterRegular className="text-gray-500 text-xs mb-1">You Send</InterRegular>
                    <View className="flex-row items-center gap-2">
                        <View
                            className="w-8 h-8 rounded-full items-center justify-center"
                            style={{ backgroundColor: getChainColor("near") }}
                        >
                            <InterSemiBold style={{ color: "#fff", fontSize: 12 }}>
                                {getChainEmoji("near")}
                            </InterSemiBold>
                        </View>
                        <View>
                            <InterSemiBold className="text-base">
                                {amount} {selectedSourceToken.symbol}
                            </InterSemiBold>
                            <InterRegular className="text-xs text-gray-500">
                                on NEAR{usdEquivalent ? ` ≈ $${usdEquivalent.toFixed(2)}` : ""}
                            </InterRegular>
                        </View>
                    </View>
                </View>

                {/* Arrow */}
                <View className="items-center my-1">
                    <InterSemiBold className="text-gray-400 text-lg">↓</InterSemiBold>
                </View>

                {/* Destination */}
                <View className="bg-gray-50 rounded-xl p-4 mb-3">
                    <InterRegular className="text-gray-500 text-xs mb-1">You Receive (est.)</InterRegular>
                    <View className="flex-row items-center gap-2">
                        <View
                            className="w-8 h-8 rounded-full items-center justify-center"
                            style={{ backgroundColor: getChainColor(selectedDestChain) }}
                        >
                            <InterSemiBold style={{ color: "#fff", fontSize: 12 }}>
                                {getChainEmoji(selectedDestChain)}
                            </InterSemiBold>
                        </View>
                        <View>
                            <InterSemiBold className="text-base">
                                ≈ {amountOutFormatted} {selectedDestToken.symbol}
                            </InterSemiBold>
                            <InterRegular className="text-xs text-gray-500">
                                on {getChainDisplayName(selectedDestChain)}
                            </InterRegular>
                        </View>
                    </View>
                </View>

                {/* Recipient */}
                <View className="bg-blue-50 rounded-xl p-3 mb-4">
                    <InterRegular className="text-blue-800 text-xs">
                        Recipient: {recipientAddress.slice(0, 12)}...{recipientAddress.slice(-8)}
                    </InterRegular>
                </View>

                {/* Slippage info */}
                <View className="bg-gray-50 rounded-lg p-3 mb-4">
                    <InterRegular className="text-gray-600 text-xs leading-4">
                        Slippage tolerance: 1%. The actual amount received may vary slightly.
                        Refunds go back to your NEAR wallet if the swap fails.
                    </InterRegular>
                </View>

                {/* Actions */}
                <View className="flex-row gap-3">
                    <Button
                        className="flex-1 bg-gray-200 rounded-lg py-4"
                        onPress={() => {
                            setStep("form");
                            setPreviewQuote(null);
                        }}
                    >
                        <InterSemiBold className="text-gray-700 text-center">Back</InterSemiBold>
                    </Button>
                    <Button
                        className="flex-1 bg-indigo-500 rounded-lg py-4"
                        onPress={confirmAndExecute}
                        disabled={executingTx}
                    >
                        <InterSemiBold className="text-white text-center">
                            Confirm Withdrawal
                        </InterSemiBold>
                    </Button>
                </View>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: EXECUTING
    // ────────────────────────────────────────────────────────────────────────────

    if (step === "executing") {
        return (
            <View className="items-center py-10">
                <ActivityIndicator size="large" color="#6366f1" />
                <InterSemiBold className="text-base mt-4 mb-2">Processing Withdrawal</InterSemiBold>
                <InterRegular className="text-gray-500 text-sm text-center px-4">
                    Sending your {selectedSourceToken?.symbol} to the cross-chain bridge...
                    {"\n\n"}This may take a moment. Please don't close this screen.
                </InterRegular>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: STATUS
    // ────────────────────────────────────────────────────────────────────────────

    if (step === "status") {
        const statusInfo = swapStatus ? getStatusDisplay(swapStatus.status) : null;
        const isTerminal = swapStatus && ["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT"].includes(swapStatus.status);

        return (
            <View>
                <InterSemiBold className="text-lg mb-4 text-center">Withdrawal Status</InterSemiBold>

                {/* Status display */}
                <View className="bg-gray-50 rounded-xl p-6 items-center mb-4">
                    {statusPolling && !isTerminal && (
                        <ActivityIndicator size="small" color="#6366f1" style={{ marginBottom: 8 }} />
                    )}

                    {statusInfo && (
                        <>
                            <InterSemiBold className="text-3xl mb-2">{statusInfo.emoji}</InterSemiBold>
                            <InterSemiBold
                                className="text-base mb-1"
                                style={{
                                    color:
                                        statusInfo.color === "green" ? "#16a34a" :
                                            statusInfo.color === "red" ? "#dc2626" :
                                                statusInfo.color === "blue" ? "#2563eb" :
                                                    "#ca8a04",
                                }}
                            >
                                {statusInfo.text}
                            </InterSemiBold>
                        </>
                    )}

                    {!statusInfo && (
                        <>
                            <ActivityIndicator size="small" color="#6366f1" />
                            <InterRegular className="text-gray-500 text-sm mt-2">
                                Checking status...
                            </InterRegular>
                        </>
                    )}
                </View>

                {/* Transaction details */}
                <View className="bg-gray-50 rounded-lg p-3 mb-4">
                    <View className="flex-row justify-between mb-2">
                        <InterRegular className="text-gray-500 text-xs">Sent</InterRegular>
                        <InterMedium className="text-xs">
                            {amount} {selectedSourceToken?.symbol} (NEAR)
                        </InterMedium>
                    </View>
                    <View className="flex-row justify-between mb-2">
                        <InterRegular className="text-gray-500 text-xs">Receiving</InterRegular>
                        <InterMedium className="text-xs">
                            {selectedDestToken?.symbol} on {selectedDestChain ? getChainDisplayName(selectedDestChain) : "–"}
                        </InterMedium>
                    </View>
                    <View className="flex-row justify-between">
                        <InterRegular className="text-gray-500 text-xs">To</InterRegular>
                        <InterMedium className="text-xs">
                            {recipientAddress.slice(0, 10)}...{recipientAddress.slice(-6)}
                        </InterMedium>
                    </View>
                </View>

                {/* Done button (only after terminal state) */}
                {isTerminal && (
                    <Button className="bg-indigo-500 rounded-lg py-4" onPress={handleDone}>
                        <InterSemiBold className="text-white text-center">Done</InterSemiBold>
                    </Button>
                )}

                {/* If still processing, show hint */}
                {!isTerminal && (
                    <View className="bg-blue-50 rounded-lg p-3">
                        <InterRegular className="text-blue-800 text-xs text-center">
                            Cross-chain swaps typically take 1–5 minutes.
                            You can close this screen; the transaction will complete automatically.
                        </InterRegular>
                    </View>
                )}
            </View>
        );
    }

    // Fallback
    return null;
}
