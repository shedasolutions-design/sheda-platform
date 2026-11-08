/**
 * IntentsDepositFlow
 *
 * A self-contained component for the NEAR Intents cross-chain deposit UI.
 * Implements the full flow: form → preview → deposit → status tracking.
 *
 * Replaces the inline intents code previously in wallet/index.tsx.
 */

import React, { useCallback, useEffect } from "react";
import {
    View,
    TouchableOpacity,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Alert from "@/utilities/alertPolyfill";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import InterBold from "@/components/Text/InterBold";
import Button from "@/components/common/Button";
import {
    useNearIntents,
    formatTokenAmount,
    getStatusDisplay,
    getChainColor,
    getChainEmoji,
} from "@/hooks/useNearIntents";
import { getChainDisplayName } from "@/services/nearIntents";

interface IntentsDepositFlowProps {
    nearAccountId: string;
    onDone: () => void; // Called when the flow completes or user exits
    onRefresh: () => void; // Called to refresh wallet balances after deposit
    /** Only show these symbols in the "Receive" picker (wallet whitelist) */
    whitelistedSymbols?: string[];
}

export default function IntentsDepositFlow({
    nearAccountId,
    onDone,
    onRefresh,
    whitelistedSymbols,
}: IntentsDepositFlowProps) {
    const intents = useNearIntents(nearAccountId, whitelistedSymbols);

    const copyToClipboard = useCallback(
        async (text: string, label: string) => {
            try {
                await Clipboard.setStringAsync(text);
                Alert.alert("Copied!", `${label} copied to clipboard`);
            } catch {
                Alert.alert("Error", "Failed to copy to clipboard");
            }
        },
        []
    );

    const handleDone = useCallback(() => {
        intents.reset();
        onRefresh();
        onDone();
    }, [intents, onDone, onRefresh]);

    // Auto-start the flow when the component mounts
    useEffect(() => {
        if (intents.step === "choose") {
            intents.startIntentsFlow();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ────────────────────────────────────────────────────────────────────────────
    // Loading state
    // ────────────────────────────────────────────────────────────────────────────

    if (intents.tokensLoading) {
        return (
            <View className="items-center py-10">
                <ActivityIndicator size="large" color="#6366f1" />
                <InterRegular className="text-gray-500 text-sm mt-3">
                    Loading available tokens from 20+ blockchains...
                </InterRegular>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: FORM — Chain, token, and amount selection
    // ────────────────────────────────────────────────────────────────────────────

    if (intents.step === "form") {
        return (
            <View>
                {/* Mainnet warning */}
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                    <InterRegular className="text-amber-800 text-xs leading-5">
                        NEAR Intents operates on <InterSemiBold>mainnet only</InterSemiBold>.
                        Deposits will be swapped and delivered to your mainnet NEAR wallet.
                        Ensure your wallet supports mainnet before proceeding.
                    </InterRegular>
                </View>

                {/* ── Source Chain Selector ── */}
                <View className="mb-4">
                    <InterMedium className="text-sm mb-2 text-gray-700">
                        From Blockchain
                    </InterMedium>
                    <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4 flex-row justify-between items-center bg-gray-50"
                        onPress={() =>
                            intents.update({
                                showChainPicker: !intents.showChainPicker,
                                showSourceTokenPicker: false,
                                showDestTokenPicker: false,
                            })
                        }
                    >
                        <View className="flex-row items-center gap-2">
                            {intents.selectedSourceChain ? (
                                <>
                                    <View
                                        className="w-8 h-8 rounded-full items-center justify-center"
                                        style={{
                                            backgroundColor: getChainColor(
                                                intents.selectedSourceChain
                                            ),
                                        }}
                                    >
                                        <InterSemiBold className="text-white text-xs">
                                            {getChainEmoji(intents.selectedSourceChain)}
                                        </InterSemiBold>
                                    </View>
                                    <InterSemiBold className="text-base">
                                        {getChainDisplayName(intents.selectedSourceChain)}
                                    </InterSemiBold>
                                </>
                            ) : (
                                <InterMedium className="text-gray-400">
                                    Select source blockchain
                                </InterMedium>
                            )}
                        </View>
                        <InterRegular className="text-gray-400 text-lg">▼</InterRegular>
                    </TouchableOpacity>

                    {/* Chain picker dropdown */}
                    {intents.showChainPicker && (
                        <View
                            className="border border-gray-200 rounded-xl mt-2 bg-white overflow-hidden"
                            style={{
                                maxHeight: 240,
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.08,
                                shadowRadius: 8,
                                elevation: 3,
                            }}
                        >
                            <ScrollView>
                                {intents.availableChains.map((chain) => (
                                    <TouchableOpacity
                                        key={chain}
                                        className="flex-row items-center gap-3 p-3 border-b border-gray-50"
                                        onPress={() => intents.selectChain(chain)}
                                    >
                                        <View
                                            className="w-7 h-7 rounded-full items-center justify-center"
                                            style={{ backgroundColor: getChainColor(chain) }}
                                        >
                                            <InterSemiBold className="text-white text-[10px]">
                                                {getChainEmoji(chain)}
                                            </InterSemiBold>
                                        </View>
                                        <InterMedium className="text-sm">
                                            {getChainDisplayName(chain)}
                                        </InterMedium>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* ── Source Token Selector ── */}
                {intents.selectedSourceChain && (
                    <View className="mb-4">
                        <InterMedium className="text-sm mb-2 text-gray-700">
                            Token to Send
                        </InterMedium>
                        <TouchableOpacity
                            className="border border-gray-200 rounded-xl p-4 flex-row justify-between items-center bg-gray-50"
                            onPress={() =>
                                intents.update({
                                    showSourceTokenPicker: !intents.showSourceTokenPicker,
                                    showChainPicker: false,
                                    showDestTokenPicker: false,
                                })
                            }
                        >
                            <View className="flex-row items-center gap-2">
                                {intents.selectedSourceToken ? (
                                    <>
                                        <View className="w-7 h-7 rounded-full bg-gray-200 items-center justify-center">
                                            <InterSemiBold className="text-gray-600 text-[10px]">
                                                {intents.selectedSourceToken.symbol.slice(0, 2)}
                                            </InterSemiBold>
                                        </View>
                                        <View>
                                            <InterSemiBold className="text-base">
                                                {intents.selectedSourceToken.symbol}
                                            </InterSemiBold>
                                            <InterRegular className="text-xs text-gray-500">
                                                ≈ ${intents.selectedSourceToken.price.toFixed(2)} each
                                            </InterRegular>
                                        </View>
                                    </>
                                ) : (
                                    <InterMedium className="text-gray-400">
                                        Select token to send
                                    </InterMedium>
                                )}
                            </View>
                            <InterRegular className="text-gray-400 text-lg">▼</InterRegular>
                        </TouchableOpacity>

                        {intents.showSourceTokenPicker && (
                            <View
                                className="border border-gray-200 rounded-xl mt-2 bg-white overflow-hidden"
                                style={{
                                    maxHeight: 200,
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.08,
                                    shadowRadius: 8,
                                    elevation: 3,
                                }}
                            >
                                <ScrollView>
                                    {intents.sourceChainTokens.map((token) => (
                                        <TouchableOpacity
                                            key={token.assetId}
                                            className="flex-row justify-between items-center p-3 border-b border-gray-50"
                                            onPress={() => intents.selectSourceToken(token)}
                                        >
                                            <View className="flex-row items-center gap-2">
                                                <View className="w-6 h-6 rounded-full bg-gray-200 items-center justify-center">
                                                    <InterSemiBold className="text-gray-600 text-[8px]">
                                                        {token.symbol.slice(0, 2)}
                                                    </InterSemiBold>
                                                </View>
                                                <InterMedium className="text-sm">
                                                    {token.symbol}
                                                </InterMedium>
                                            </View>
                                            <InterRegular className="text-xs text-gray-500">
                                                ${token.price.toFixed(2)}
                                            </InterRegular>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                )}

                {/* ── Destination Token (on NEAR) ── */}
                <View className="mb-4">
                    <InterMedium className="text-sm mb-2 text-gray-700">
                        Receive Token (on NEAR)
                    </InterMedium>
                    <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4 flex-row justify-between items-center bg-gray-50"
                        onPress={() =>
                            intents.update({
                                showDestTokenPicker: !intents.showDestTokenPicker,
                                showChainPicker: false,
                                showSourceTokenPicker: false,
                            })
                        }
                    >
                        <View className="flex-row items-center gap-2">
                            {intents.selectedDestToken ? (
                                <>
                                    <View className="w-7 h-7 rounded-full bg-green-100 items-center justify-center">
                                        <InterSemiBold className="text-green-700 text-[10px]">
                                            {intents.selectedDestToken.symbol.slice(0, 2)}
                                        </InterSemiBold>
                                    </View>
                                    <View>
                                        <InterSemiBold className="text-base">
                                            {intents.selectedDestToken.symbol}
                                        </InterSemiBold>
                                        <InterRegular className="text-xs text-gray-500">
                                            on NEAR Protocol
                                        </InterRegular>
                                    </View>
                                </>
                            ) : (
                                <InterMedium className="text-gray-400">
                                    Select token to receive
                                </InterMedium>
                            )}
                        </View>
                        <InterRegular className="text-gray-400 text-lg">▼</InterRegular>
                    </TouchableOpacity>

                    {intents.showDestTokenPicker && (
                        <View
                            className="border border-gray-200 rounded-xl mt-2 bg-white overflow-hidden"
                            style={{
                                maxHeight: 200,
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.08,
                                shadowRadius: 8,
                                elevation: 3,
                            }}
                        >
                            <ScrollView>
                                {intents.nearTokens.map((token) => (
                                    <TouchableOpacity
                                        key={token.assetId}
                                        className="flex-row justify-between items-center p-3 border-b border-gray-50"
                                        onPress={() => intents.selectDestToken(token)}
                                    >
                                        <View className="flex-row items-center gap-2">
                                            <View className="w-6 h-6 rounded-full bg-green-100 items-center justify-center">
                                                <InterSemiBold className="text-green-700 text-[8px]">
                                                    {token.symbol.slice(0, 2)}
                                                </InterSemiBold>
                                            </View>
                                            <InterMedium className="text-sm">
                                                {token.symbol}
                                            </InterMedium>
                                        </View>
                                        <InterRegular className="text-xs text-gray-500">
                                            ${token.price.toFixed(2)}
                                        </InterRegular>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* ── Amount Input ── */}
                <View className="mb-5">
                    <InterMedium className="text-sm mb-2 text-gray-700">
                        Amount {intents.selectedSourceToken ? `(${intents.selectedSourceToken.symbol})` : ""}
                    </InterMedium>
                    <View className="border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                        <TextInput
                            className="p-4 text-base"
                            placeholder="0.00"
                            value={intents.amount}
                            onChangeText={intents.setAmount}
                            keyboardType="decimal-pad"
                        />
                        {intents.usdEquivalent !== null && (
                            <View className="px-4 pb-3 -mt-1">
                                <InterRegular className="text-xs text-gray-500">
                                    ≈ ${intents.usdEquivalent.toFixed(2)} USD
                                </InterRegular>
                            </View>
                        )}
                    </View>
                </View>

                {/* ── Summary bar ── */}
                {intents.selectedSourceToken && intents.selectedDestToken && intents.amount && (
                    <View className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4">
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-1">
                                <InterRegular className="text-xs text-indigo-800">
                                    {intents.amount} {intents.selectedSourceToken.symbol}
                                </InterRegular>
                                <InterRegular className="text-xs text-indigo-400">on</InterRegular>
                                <InterRegular className="text-xs text-indigo-800">
                                    {getChainDisplayName(intents.selectedSourceChain)}
                                </InterRegular>
                            </View>
                            <InterSemiBold className="text-indigo-500 text-xs">→</InterSemiBold>
                            <InterRegular className="text-xs text-indigo-800">
                                {intents.selectedDestToken.symbol} on NEAR
                            </InterRegular>
                        </View>
                    </View>
                )}

                {/* ── Preview Button ── */}
                <Button
                    className="rounded-xl py-4"
                    style={{ backgroundColor: "#6366f1" }}
                    disabled={
                        intents.previewLoading ||
                        !intents.selectedSourceToken ||
                        !intents.selectedDestToken ||
                        !intents.amount ||
                        parseFloat(intents.amount) <= 0
                    }
                    onPress={intents.getPreview}
                >
                    <InterSemiBold className="text-white text-center text-base">
                        {intents.previewLoading
                            ? "Getting preview..."
                            : "Preview Swap"}
                    </InterSemiBold>
                </Button>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: PREVIEW — Show dry-run quote before committing
    // ────────────────────────────────────────────────────────────────────────────

    if (intents.step === "preview" && intents.previewQuote) {
        const preview = intents.previewQuote;
        const sourceToken = intents.selectedSourceToken!;
        const destToken = intents.selectedDestToken!;

        const amountInFormatted = formatTokenAmount(
            preview.amountIn,
            sourceToken.decimals
        );
        const amountOutFormatted = formatTokenAmount(
            preview.amountOut,
            destToken.decimals
        );

        const usdIn =
            parseFloat(amountInFormatted) * sourceToken.price;
        const usdOut =
            parseFloat(amountOutFormatted) * destToken.price;

        return (
            <View>
                <TouchableOpacity onPress={intents.goToForm} className="mb-4">
                    <InterMedium className="text-indigo-500 text-sm">
                        ← Back to form
                    </InterMedium>
                </TouchableOpacity>

                <View className="bg-gradient-to-b bg-white border border-gray-100 rounded-2xl overflow-hidden mb-4"
                    style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.06,
                        shadowRadius: 12,
                        elevation: 4,
                    }}
                >
                    {/* Header */}
                    <View className="bg-indigo-50 px-5 py-4">
                        <InterSemiBold className="text-indigo-900 text-base">
                            Swap Preview
                        </InterSemiBold>
                        <InterRegular className="text-indigo-600 text-xs mt-1">
                            Review before confirming — no funds committed yet
                        </InterRegular>
                    </View>

                    {/* Amounts */}
                    <View className="p-5">
                        {/* You send */}
                        <View className="mb-4">
                            <InterRegular className="text-xs text-gray-500 mb-1">
                                You Send
                            </InterRegular>
                            <View className="flex-row items-baseline gap-2">
                                <InterBold className="text-2xl text-gray-900">
                                    {amountInFormatted}
                                </InterBold>
                                <InterMedium className="text-base text-gray-600">
                                    {sourceToken.symbol}
                                </InterMedium>
                            </View>
                            <InterRegular className="text-xs text-gray-400 mt-1">
                                ≈ ${usdIn.toFixed(2)} • on {getChainDisplayName(intents.selectedSourceChain)}
                            </InterRegular>
                        </View>

                        {/* Arrow */}
                        <View className="items-center my-2">
                            <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center">
                                <InterSemiBold className="text-indigo-600 text-lg">↓</InterSemiBold>
                            </View>
                        </View>

                        {/* You receive */}
                        <View className="mt-4">
                            <InterRegular className="text-xs text-gray-500 mb-1">
                                You Receive (estimated)
                            </InterRegular>
                            <View className="flex-row items-baseline gap-2">
                                <InterBold className="text-2xl text-green-600">
                                    {amountOutFormatted}
                                </InterBold>
                                <InterMedium className="text-base text-green-700">
                                    {destToken.symbol}
                                </InterMedium>
                            </View>
                            <InterRegular className="text-xs text-gray-400 mt-1">
                                ≈ ${usdOut.toFixed(2)} • on NEAR Protocol
                            </InterRegular>
                        </View>

                        {/* Swap details */}
                        <View className="mt-5 pt-4 border-t border-gray-100">
                            <View className="flex-row justify-between mb-2">
                                <InterRegular className="text-xs text-gray-500">
                                    Exchange Rate
                                </InterRegular>
                                <InterMedium className="text-xs text-gray-700">
                                    1 {sourceToken.symbol} ≈{" "}
                                    {(
                                        (parseFloat(amountOutFormatted) /
                                            parseFloat(amountInFormatted)) ||
                                        0
                                    ).toFixed(6)}{" "}
                                    {destToken.symbol}
                                </InterMedium>
                            </View>
                            <View className="flex-row justify-between mb-2">
                                <InterRegular className="text-xs text-gray-500">
                                    Slippage Tolerance
                                </InterRegular>
                                <InterMedium className="text-xs text-gray-700">1%</InterMedium>
                            </View>
                            {preview.estimatedProcessingTimeMs && (
                                <View className="flex-row justify-between">
                                    <InterRegular className="text-xs text-gray-500">
                                        Estimated Time
                                    </InterRegular>
                                    <InterMedium className="text-xs text-gray-700">
                                        ~{Math.ceil(preview.estimatedProcessingTimeMs / 60000)} min
                                    </InterMedium>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Confirm button */}
                <Button
                    className="rounded-xl py-4 mb-3"
                    style={{ backgroundColor: "#6366f1" }}
                    disabled={intents.liveQuoteLoading}
                    onPress={intents.confirmAndGetDepositAddress}
                >
                    <InterSemiBold className="text-white text-center text-base">
                        {intents.liveQuoteLoading
                            ? "Getting deposit address..."
                            : "Confirm & Get Deposit Address"}
                    </InterSemiBold>
                </Button>

                <TouchableOpacity onPress={intents.goToForm} className="py-2">
                    <InterMedium className="text-gray-400 text-center text-sm">
                        Cancel
                    </InterMedium>
                </TouchableOpacity>
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step: DEPOSIT — Show deposit address and wait for user to send tokens
    // ────────────────────────────────────────────────────────────────────────────

    if (
        (intents.step === "deposit" || intents.step === "status") &&
        intents.liveQuote
    ) {
        const quote = intents.liveQuote;
        const sourceToken = intents.selectedSourceToken!;
        const destToken = intents.selectedDestToken!;
        const statusDisplay = getStatusDisplay(intents.swapStatusLabel);

        const amountInFormatted = formatTokenAmount(
            quote.amountIn,
            sourceToken.decimals
        );
        const amountOutFormatted = formatTokenAmount(
            quote.amountOut,
            destToken.decimals
        );

        const isTerminal = ["SUCCESS", "FAILED", "REFUNDED"].includes(
            intents.swapStatusLabel
        );

        return (
            <View>
                {/* Status banner */}
                <View
                    className={`rounded-xl p-4 mb-4 ${statusDisplay.color === "green"
                        ? "bg-green-50 border border-green-200"
                        : statusDisplay.color === "red"
                            ? "bg-red-50 border border-red-200"
                            : statusDisplay.color === "blue"
                                ? "bg-blue-50 border border-blue-200"
                                : "bg-amber-50 border border-amber-200"
                        }`}
                >
                    <View className="flex-row items-center gap-2 mb-1">
                        <InterSemiBold className="text-2xl">{statusDisplay.emoji}</InterSemiBold>
                        <InterSemiBold
                            className={`text-base ${statusDisplay.color === "green"
                                ? "text-green-800"
                                : statusDisplay.color === "red"
                                    ? "text-red-800"
                                    : statusDisplay.color === "blue"
                                        ? "text-blue-800"
                                        : "text-amber-800"
                                }`}
                        >
                            {statusDisplay.text}
                        </InterSemiBold>
                    </View>

                    {/* Polling indicator */}
                    {intents.statusPolling && !isTerminal && (
                        <View className="flex-row items-center gap-2 mt-2">
                            <ActivityIndicator size="small" color="#6366f1" />
                            <InterRegular className="text-xs text-gray-500">
                                Auto-checking every 8 seconds...
                            </InterRegular>
                        </View>
                    )}
                </View>

                {/* Deposit instructions — only show when pending */}
                {intents.swapStatusLabel === "PENDING_DEPOSIT" && (
                    <View
                        className="bg-white border border-gray-100 rounded-2xl p-5 mb-4"
                        style={{
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.05,
                            shadowRadius: 8,
                            elevation: 2,
                        }}
                    >
                        <InterSemiBold className="text-base mb-3 text-gray-900">
                            Send Your Tokens
                        </InterSemiBold>

                        <InterRegular className="text-sm text-gray-600 mb-3">
                            Send exactly{" "}
                            <InterSemiBold className="text-gray-900">
                                {amountInFormatted} {sourceToken.symbol}
                            </InterSemiBold>{" "}
                            to the address below:
                        </InterRegular>

                        {/* Deposit address */}
                        <TouchableOpacity
                            className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3"
                            onPress={() =>
                                copyToClipboard(quote.depositAddress, "Deposit address")
                            }
                        >
                            <InterRegular className="text-xs text-gray-500 mb-1">
                                Deposit Address (tap to copy)
                            </InterRegular>
                            <InterMedium className="text-sm text-indigo-600 leading-5">
                                {quote.depositAddress}
                            </InterMedium>
                            <View className="flex-row items-center gap-1 mt-2">
                                <InterRegular className="text-xs text-indigo-400">
                                    Tap to copy
                                </InterRegular>
                            </View>
                        </TouchableOpacity>

                        {/* Deposit memo if applicable */}
                        {quote.depositMemo && (
                            <TouchableOpacity
                                className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3"
                                onPress={() =>
                                    copyToClipboard(quote.depositMemo!, "Deposit memo")
                                }
                            >
                                <InterRegular className="text-xs text-gray-500 mb-1">
                                    Memo (REQUIRED)
                                </InterRegular>
                                <InterMedium className="text-sm text-indigo-600">
                                    {quote.depositMemo}
                                </InterMedium>
                                <InterRegular className="text-xs text-red-500 mt-1">
                                    You MUST include this memo or your funds may be lost
                                </InterRegular>
                            </TouchableOpacity>
                        )}

                        {/* Expected output */}
                        <View className="bg-green-50 border border-green-100 rounded-xl p-3">
                            <InterRegular className="text-xs text-green-700">
                                You'll receive ≈{" "}
                                <InterSemiBold>
                                    {amountOutFormatted} {destToken.symbol}
                                </InterSemiBold>{" "}
                                in your NEAR wallet
                            </InterRegular>
                        </View>

                        {/* Deadline warning */}
                        {intents.quoteDeadline && (
                            <View className="mt-3">
                                {intents.quoteExpired ? (
                                    <View className="bg-red-50 border border-red-200 rounded-lg p-2">
                                        <InterRegular className="text-xs text-red-700">
                                            ⏰ This quote has expired. Please start a new swap.
                                        </InterRegular>
                                    </View>
                                ) : (
                                    <InterRegular className="text-xs text-gray-400">
                                        Quote valid until:{" "}
                                        {intents.quoteDeadline.toLocaleTimeString()}
                                    </InterRegular>
                                )}
                            </View>
                        )}

                        {/* Estimated time */}
                        {intents.estimatedTimeMs && (
                            <InterRegular className="text-xs text-gray-400 mt-2">
                                ⏱ Estimated processing: ~
                                {Math.ceil(intents.estimatedTimeMs / 60000)} min after deposit
                            </InterRegular>
                        )}
                    </View>
                )}

                {/* Swap details summary */}
                <View className="bg-gray-50 rounded-xl p-4 mb-4">
                    <InterMedium className="text-xs text-gray-500 mb-2">
                        Swap Details
                    </InterMedium>
                    <View className="flex-row justify-between mb-1">
                        <InterRegular className="text-xs text-gray-500">From</InterRegular>
                        <InterMedium className="text-xs text-gray-700">
                            {amountInFormatted} {sourceToken.symbol} on{" "}
                            {getChainDisplayName(intents.selectedSourceChain)}
                        </InterMedium>
                    </View>
                    <View className="flex-row justify-between mb-1">
                        <InterRegular className="text-xs text-gray-500">To</InterRegular>
                        <InterMedium className="text-xs text-gray-700">
                            {amountOutFormatted} {destToken.symbol} on NEAR
                        </InterMedium>
                    </View>
                    <View className="flex-row justify-between">
                        <InterRegular className="text-xs text-gray-500">
                            Recipient
                        </InterRegular>
                        <InterMedium className="text-xs text-gray-700">
                            {nearAccountId.length > 20
                                ? nearAccountId.substring(0, 18) + "..."
                                : nearAccountId}
                        </InterMedium>
                    </View>
                </View>

                {/* Action buttons */}
                {intents.swapStatusLabel === "SUCCESS" && (
                    <Button
                        className="rounded-xl py-4 mb-3"
                        style={{ backgroundColor: "#22c55e" }}
                        onPress={handleDone}
                    >
                        <InterSemiBold className="text-white text-center text-base">
                            ✅ Done — View Updated Balance
                        </InterSemiBold>
                    </Button>
                )}

                {(intents.swapStatusLabel === "FAILED" ||
                    intents.swapStatusLabel === "REFUNDED") && (
                        <View>
                            <InterRegular className="text-sm text-gray-500 text-center mb-3">
                                {intents.swapStatusLabel === "REFUNDED"
                                    ? "Your deposit has been refunded to the original address."
                                    : "The swap failed. Please try again or contact support."}
                            </InterRegular>
                            <Button
                                className="rounded-xl py-4 mb-3"
                                style={{ backgroundColor: "#6366f1" }}
                                onPress={() => {
                                    intents.reset();
                                    intents.startIntentsFlow();
                                }}
                            >
                                <InterSemiBold className="text-white text-center text-base">
                                    Try Again
                                </InterSemiBold>
                            </Button>
                        </View>
                    )}

                {intents.quoteExpired &&
                    intents.swapStatusLabel === "PENDING_DEPOSIT" && (
                        <Button
                            className="rounded-xl py-4 mb-3"
                            style={{ backgroundColor: "#6366f1" }}
                            onPress={() => {
                                intents.reset();
                                intents.startIntentsFlow();
                            }}
                        >
                            <InterSemiBold className="text-white text-center text-base">
                                Get New Quote
                            </InterSemiBold>
                        </Button>
                    )}
            </View>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Fallback — should not normally reach here
    // ────────────────────────────────────────────────────────────────────────────

    return (
        <View className="items-center py-8">
            <InterRegular className="text-gray-500">
                Something went wrong. Please try again.
            </InterRegular>
            <Button
                className="rounded-xl py-3 px-6 mt-4"
                style={{ backgroundColor: "#6366f1" }}
                onPress={() => {
                    intents.reset();
                    intents.startIntentsFlow();
                }}
            >
                <InterSemiBold className="text-white text-center text-sm">
                    Restart
                </InterSemiBold>
            </Button>
        </View>
    );
}
