import { useState, useEffect, useRef } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import Button from "@/components/common/Button";
import { useWallet } from "@/contexts/WalletContext";
import nearContractService from "@/services/nearContract";
import {
  nairaToStablecoinUnits,
  nairaToUsd,
  stablecoinUnitsToUsd,
  stablecoinUnitsToNaira,
  formatUsd,
  formatNaira,
} from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useCurrency } from "@/contexts/CurrencyContext";

interface TokenSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (tokenContractId: string, amount: string, decimals: number) => void;
  title: string;
  description?: string;
  /**
   * The exact on-chain amount (U128 string in smallest stablecoin units).
   * Used for non-negotiable properties where the bid MUST match the listing price.
   * When set, the amount is fixed and cannot be changed by the user.
   */
  onChainAmount?: string;
  /**
   * The Naira amount for negotiable bids.
   * Will be converted to stablecoin units automatically.
   * Only used when onChainAmount is NOT provided.
   */
  nairaAmount?: number;
  actionLabel?: string;
  isLoading?: boolean;
}

interface WalletToken {
  contractAddress: string;
  symbol: string;
  name: string;
  amount: number;
  totalValue: number;
  decimals: number;
  isSupportedForPayment: boolean;
}

// Known token decimals fallback
const TOKEN_DECIMALS: Record<string, number> = {
  "USDT": 6,
  "USDC": 6,
  "wNEAR": 24,
  "NEAR": 24,
  "DAI": 18,
};

export default function TokenSelectionModal({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  onChainAmount,
  nairaAmount,
  actionLabel = "Confirm",
  isLoading = false,
}: TokenSelectionModalProps) {
  const { walletState, currentNetwork, getTokenBalances } = useWallet();
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { ngnPerUsd } = useExchangeRates();
  const { formatPrice, formatUsd: formatUsdCurrency } = useCurrency();

  // Determine the final amount to send
  // Priority: onChainAmount (exact match) > nairaAmount (converted)
  const finalAmount: string = (() => {
    if (onChainAmount) return onChainAmount;
    if (nairaAmount && nairaAmount > 0 && ngnPerUsd) return String(nairaToStablecoinUnits(nairaAmount, ngnPerUsd));
    return "0";
  })();

  const finalAmountNum = parseInt(finalAmount) || 0;
  const usdEquivalent = stablecoinUnitsToUsd(finalAmountNum);
  const nairaEquivalent = onChainAmount
    ? stablecoinUnitsToNaira(finalAmountNum, ngnPerUsd || 1500)
    : (nairaAmount || 0);

  // Fetch wallet tokens + cross-reference with contract whitelist when modal opens
  useEffect(() => {
    if (visible && walletState.account?.accountId) {
      fetchWalletTokensWithWhitelist();
    }
  }, [visible, currentNetwork, walletState.account?.accountId]);

  const fetchWalletTokensWithWhitelist = async () => {
    if (!walletState.account?.accountId) return;

    setLoadingTokens(true);
    setLoadError(null);
    try {
      const [walletBalances, supportedResult] = await Promise.all([
        getTokenBalances(walletState.account.accountId),
        (async () => {
          await nearContractService.initialize(currentNetwork);
          return nearContractService.getSupportedStablecoins();
        })(),
      ]);

      console.log("🔍 Wallet tokens:", walletBalances?.map((t: any) => `${t.symbol} (${t.contractAddress}): ${t.amount}`));

      const supportedContractIds = new Set<string>();
      if (supportedResult.success && supportedResult.data) {
        supportedResult.data.forEach((id: string) => supportedContractIds.add(id));
        console.log("🔍 Contract-supported stablecoins:", Array.from(supportedContractIds));
      }

      const tokens: WalletToken[] = (walletBalances || []).map((t: any) => ({
        contractAddress: t.contractAddress,
        symbol: t.symbol,
        name: t.name || t.symbol,
        amount: t.amount || 0,
        totalValue: t.totalValue || 0,
        decimals: t.decimals || TOKEN_DECIMALS[t.symbol] || 6,
        isSupportedForPayment: supportedContractIds.has(t.contractAddress),
      }));

      tokens.sort((a, b) => {
        if (a.isSupportedForPayment && !b.isSupportedForPayment) return -1;
        if (!a.isSupportedForPayment && b.isSupportedForPayment) return 1;
        return b.amount - a.amount;
      });

      setWalletTokens(tokens);

      if (tokens.length === 0) {
        setLoadError("No tokens found in your wallet");
      }
    } catch (error) {
      console.error("Error fetching wallet tokens:", error);
      setLoadError("Error loading wallet tokens");
    } finally {
      setLoadingTokens(false);
    }
  };

  // Cleared on every open so a later, deliberate bid is never blocked by the
  // latch from a previous one.
  const confirmLatch = useRef(false);
  useEffect(() => {
    if (visible) confirmLatch.current = false;
  }, [visible]);

  const handleConfirm = () => {
    // A ref, not state: setIsPlacingBid in the parent is asynchronous, so the
    // button is still enabled for a second tap landing in the same tick — and
    // that second tap used to become a second real on-chain transfer. A ref
    // updates synchronously, so the repeat sees the latch immediately.
    if (confirmLatch.current) return;
    confirmLatch.current = true;

    if (!selectedToken) return;
    if (!finalAmountNum || finalAmountNum <= 0) {
      confirmLatch.current = false;
      return;
    }
    if (hasInsufficientBalance) {
      confirmLatch.current = false;
      return;
    }

    const token = walletTokens.find((t) => t.contractAddress === selectedToken);
    if (!token) {
      confirmLatch.current = false;
      return;
    }

    console.log(`💰 TokenModal: Sending ${finalAmount} smallest units (≈ ${formatUsd(usdEquivalent)})`);
    onConfirm(selectedToken, finalAmount, token.decimals);
  };

  const formatTokenBalance = (amount: number): string => {
    if (amount === 0) return "0.00";
    if (amount < 0.01) return amount.toFixed(6);
    return amount.toFixed(2);
  };

  const getSelectedTokenInfo = () => {
    return walletTokens.find((t) => t.contractAddress === selectedToken);
  };

  /**
   * The modal already warned about insufficient balance, but Confirm stayed
   * enabled — so the bid went out, ft_transfer_call reverted on-chain for
   * lack of funds, and the user just saw a generic failure after the wait.
   * Block it here instead.
   */
  const hasInsufficientBalance = (() => {
    const token = getSelectedTokenInfo();
    if (!token || !finalAmountNum) return false;
    return token.amount * Math.pow(10, token.decimals) < finalAmountNum;
  })();

  const supportedTokens = walletTokens.filter((t) => t.isSupportedForPayment);
  const otherTokens = walletTokens.filter((t) => !t.isSupportedForPayment);

  const isExactMatch = !!onChainAmount;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl p-5 max-h-[85%]">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-4">
            <InterSemiBold className="text-lg">{title}</InterSemiBold>
            <TouchableOpacity onPress={onClose} className="p-2">
              <InterSemiBold className="text-gray-500 text-xl">×</InterSemiBold>
            </TouchableOpacity>
          </View>

          {description && (
            <InterRegular className="text-secondaryText text-sm mb-4">
              {description}
            </InterRegular>
          )}

          {/* Price Breakdown */}
          {finalAmountNum > 0 && (
            <View className={`p-3 rounded-lg mb-4 border ${isExactMatch ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100'}`}>
              <View className="flex-row justify-between items-center mb-2">
                <InterMedium className="text-sm">
                  {isExactMatch ? "Exact Listing Price" : "Your Bid Amount"}
                </InterMedium>
                {isExactMatch && (
                  <View className="bg-green-100 px-2 py-0.5 rounded">
                    <InterRegular className="text-[9px] text-green-700">Fixed Price</InterRegular>
                  </View>
                )}
              </View>
              <View className="flex-row justify-between items-center">
                <InterRegular className="text-xs text-secondaryText">Amount</InterRegular>
                <InterMedium className="text-sm">{formatPrice(usdEquivalent)}</InterMedium>
              </View>
              <View className="flex-row justify-between items-center mt-1">
                <InterRegular className="text-xs text-secondaryText">USD Equivalent</InterRegular>
                <InterMedium className="text-sm text-blue-600">{formatUsd(usdEquivalent)}</InterMedium>
              </View>
              <View className="flex-row justify-between items-center mt-1">
                <InterRegular className="text-xs text-secondaryText">On-chain Amount</InterRegular>
                <InterMedium className="text-sm text-green-700">{finalAmountNum.toLocaleString()} units</InterMedium>
              </View>
            </View>
          )}

          {/* Wallet Info */}
          <View className="bg-gray-50 p-3 rounded-lg mb-4">
            <InterRegular className="text-xs text-secondaryText">
              Connected Wallet
            </InterRegular>
            <InterMedium className="text-sm" numberOfLines={1}>
              {walletState.account?.accountId || "Not connected"}
            </InterMedium>
          </View>

          {/* Token Selection */}
          <InterMedium className="text-sm mb-2">Your Wallet Tokens</InterMedium>

          {loadingTokens ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#3b82f6" />
              <InterRegular className="text-secondaryText text-xs mt-2">
                Loading wallet tokens...
              </InterRegular>
            </View>
          ) : loadError && walletTokens.length === 0 ? (
            <View className="py-4 items-center">
              <InterRegular className="text-red-500 text-xs">{loadError}</InterRegular>
            </View>
          ) : (
            <ScrollView className="max-h-52 mb-4">
              {/* Supported tokens */}
              {supportedTokens.length > 0 && (
                <View className="mb-2">
                  <InterRegular className="text-[10px] text-green-600 mb-1 uppercase tracking-wider">
                    ✓ Accepted for Payment
                  </InterRegular>
                  {supportedTokens.map((token) => (
                    <TouchableOpacity
                      key={token.contractAddress}
                      onPress={() => setSelectedToken(token.contractAddress)}
                      className={`flex-row justify-between items-center p-3 rounded-lg mb-2 border ${selectedToken === token.contractAddress
                        ? "border-primary bg-primary/5"
                        : "border-green-200 bg-green-50/30"
                        }`}
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <InterMedium className="text-sm">{token.symbol}</InterMedium>
                          <View className="bg-green-100 px-1.5 py-0.5 rounded">
                            <InterRegular className="text-[9px] text-green-700">Accepted</InterRegular>
                          </View>
                        </View>
                        <InterRegular className="text-xs text-secondaryText" numberOfLines={1}>
                          {token.name}
                        </InterRegular>
                      </View>
                      <View className="items-end ml-2">
                        <InterMedium className="text-sm">
                          {formatTokenBalance(token.amount)}
                        </InterMedium>
                        <InterRegular className="text-[10px] text-secondaryText">
                          ≈ {formatPrice(token.totalValue || 0)}
                        </InterRegular>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Other wallet tokens */}
              {otherTokens.length > 0 && (
                <View>
                  <InterRegular className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">
                    Other Wallet Assets
                  </InterRegular>
                  {otherTokens.map((token) => (
                    <View
                      key={token.contractAddress}
                      className="flex-row justify-between items-center p-3 rounded-lg mb-2 border border-gray-100 bg-gray-50/50 opacity-60"
                    >
                      <View className="flex-1">
                        <InterMedium className="text-sm text-gray-500">{token.symbol}</InterMedium>
                        <InterRegular className="text-xs text-gray-400" numberOfLines={1}>
                          {token.name}
                        </InterRegular>
                      </View>
                      <View className="items-end ml-2">
                        <InterMedium className="text-sm text-gray-500">
                          {formatTokenBalance(token.amount)}
                        </InterMedium>
                        <InterRegular className="text-[10px] text-gray-400">
                          Not accepted
                        </InterRegular>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* Insufficient balance warning */}
          {hasInsufficientBalance && (() => {
            const token = getSelectedTokenInfo();
            if (!token) return null;
            return (
              <View className="p-3 bg-red-50 rounded-lg mb-3 border border-red-200">
                <InterRegular className="text-red-600 text-xs">
                  Insufficient {token.symbol} balance. You have {formatTokenBalance(token.amount)} {token.symbol} but need ≈ {formatPrice(usdEquivalent)}.
                </InterRegular>
              </View>
            );
          })()}

          {/* Action Button */}
          <Button
            onPress={handleConfirm}
            disabled={
              !selectedToken ||
              !finalAmountNum ||
              finalAmountNum <= 0 ||
              isLoading ||
              hasInsufficientBalance
            }
            className={`rounded-lg ${!selectedToken || !finalAmountNum || isLoading || hasInsufficientBalance
              ? "opacity-50"
              : ""
              }`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <InterSemiBold className="text-white text-center">
                {actionLabel}
              </InterSemiBold>
            )}
          </Button>

          {/* Info */}
          <View className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <InterRegular className="text-yellow-800 text-xs">
              {isExactMatch
                ? "This property has a fixed price. The exact listing price will be sent to the blockchain."
                : "This is a negotiable offer. The seller can accept or reject your bid."
              }
            </InterRegular>
          </View>
        </View>
      </View>
    </Modal>
  );
}
