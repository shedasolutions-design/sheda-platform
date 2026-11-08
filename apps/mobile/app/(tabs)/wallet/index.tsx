"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  TouchableOpacity,
  View,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import InterExtraBold from "@/components/Text/InterExtraBold";
import Icon from "@/components/common/Icon";
import Button from "@/components/common/Button";
import { DEPOSIT, EYE, EYESLASH, WITHDRAW } from "@/assets/icons";
import WalletTabs from "@/components/organisms/WalletTabs";
import TokensList from "@/components/organisms/TokensList";
import AssetsList from "@/components/organisms/AssetsList";
import TransactionsList from "@/components/organisms/TransactionsList";
import type { WalletTab, Token, Transaction, Asset, AggregatedBalance } from "@/types/wallet";
import { computeAggregatedBalance } from "@/types/wallet";
import type { PropertyView } from "@/types/contract";
import {
  ownedAssets,
  bidAssets,
  mergeAssetSources,
  bidPropertyIdsToFetch,
} from "@/utilities/walletAssets";
import { readCachedAssets, writeCachedAssets } from "@/services/assetCache";
import { formatAmount } from "@/utilities/atomicAmount";
import { formatDateTime, formatRelativeTime } from "@/utilities/formatTimestamp";
import { openTxOnExplorer, openAccountOnExplorer } from "@/utilities/nearExplorer";
import { getMethodLabel } from "@/services/nearIndexer";
import { useWallet } from "@/contexts/WalletContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import WalletDashboard from "@/components/WalletDashboard";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import nearContractService from "@/services/nearContract";
import CurrencySelector from "@/components/common/CurrencySelector";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getTokenDisplay } from "@/utilities/tokenLogos";

import AuthGuard from "@/components/AuthGuard";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import InterBold from "@/components/Text/InterBold";
import IntentsDepositFlow from "@/components/IntentsDepositFlow";
import IntentsWithdrawFlow from "@/components/IntentsWithdrawFlow";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// Mainnet-whitelisted symbols the wallet supports.
// NEAR Intents is mainnet-only, so only show these in the "Receive" picker.
const WALLET_WHITELISTED_SYMBOLS = ["USDC", "USDT", "wNEAR", "NEAR"];

// 60s, not 30s — each tick fires ~5-6 concurrent RPC calls (NEAR balance +
// per-token ft_balance_of + transactions + assets) against shared free
// public testnet RPC endpoints; 30s was tripping their rate limits under
// real usage. See services/nearWallet.ts's withRetry for the failover-on-429
// fix — this interval change reduces baseline load on top of that.
const POLLING_INTERVAL_MS = 60_000;

const Wallet = () => {
  const [showBal, setShowBal] = useState(true);
  const [activeTab, setActiveTab] = useState<WalletTab>("Tokens");
  const [refreshing, setRefreshing] = useState(false);
  const {
    walletState,
    currentNetwork,
    getAccountBalance,
    getAccountTransactions,
    getTokenBalances,
    sendTransaction,
    sendFungibleToken,
    loading,
  } = useWallet();
  const { run: runTransaction } = useTransactionToast();
  const { nearUsd } = useExchangeRates();
  const { formatPrice, formatUsd } = useCurrency();
  const [balance, setBalance] = useState<string>("0");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const { authenticate, authMethod } = useBiometricAuth();

  // Aggregated balance state
  const [aggregatedBalance, setAggregatedBalance] = useState<AggregatedBalance>({
    totalUsd: 0,
    isComplete: true,
    missingPriceCount: 0,
    missingPriceSymbols: [],
  });

  // Modal states
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [tokenDetailVisible, setTokenDetailVisible] = useState(false);
  const [transactionDetailVisible, setTransactionDetailVisible] = useState(false);
  const [assetDetailVisible, setAssetDetailVisible] = useState(false);

  // Selected items
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Withdraw form
  const [recipientAddress, setRecipientAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedWithdrawToken, setSelectedWithdrawToken] = useState<Token | null>(null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);

  // Asset transfer
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Deposit mode: "address" = copy address, "intents" = cross-chain via NEAR Intents
  const [depositMode, setDepositMode] = useState<"choose" | "address" | "intents">("choose");
  const [withdrawMode, setWithdrawMode] = useState<"choose" | "direct" | "intents">("choose");

  // NEAR Intents — state is managed by the IntentsDepositFlow component
  // (previously 14 useState hooks lived here; now encapsulated in useNearIntents hook)

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirrors `assets` so loadAssets can read the current list without naming it
  // in its deps (which would restart the polling effect on every load).
  const assetsRef = useRef<Asset[]>([]);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // True once a live chain read has populated the list for this account, so
  // late-arriving cached data can't overwrite it.
  const liveAssetsLoadedRef = useRef(false);

  // ── Recalculate aggregated total when tokens change ──
  useEffect(() => {
    const agg = computeAggregatedBalance(tokens);
    setAggregatedBalance(agg);
  }, [tokens]);

  // ── Data loading ──
  const loadBalance = useCallback(async () => {
    try {
      if (walletState.account?.accountId) {
        const accountBalance = await getAccountBalance(
          walletState.account.accountId
        );
        setBalance(accountBalance);
      }
    } catch (error) {
      console.error("Failed to load balance:", error);
    }
  }, [walletState.account?.accountId, getAccountBalance]);

  const loadTransactions = useCallback(async (forceRefresh = false) => {
    if (!walletState.account?.accountId) return;
    try {
      setTransactionsLoading(true);
      const accountTransactions = await getAccountTransactions(
        walletState.account.accountId,
        25,
        forceRefresh
      );
      setTransactions(accountTransactions);
      setTransactionsError(null);
    } catch (error: any) {
      console.error("Failed to load transactions:", error);
      // Surface the failure instead of leaving a stale/empty list looking
      // authoritative — the transactions exist on-chain either way.
      setTransactionsError(
        "We couldn't reach the blockchain indexer. Your transactions are safe on-chain — please try again shortly."
      );
    } finally {
      setTransactionsLoading(false);
    }
  }, [walletState.account?.accountId, getAccountTransactions]);

  const loadTokenBalances = useCallback(async () => {
    try {
      if (walletState.account?.accountId) {
        const tokenBalances = await getTokenBalances(
          walletState.account.accountId
        );
        setTokens(tokenBalances);
      }
    } catch (error) {
      console.error("Failed to load token balances:", error);
    }
  }, [walletState.account?.accountId, getTokenBalances]);

  /**
   * Rebuild the Assets tab straight from chain state on every run.
   *
   * The list is derived, never accumulated: a property that the contract no
   * longer reports (deleted / burnt / transferred away) simply isn't in the
   * next result, so it disappears from the wallet. What used to resurrect a
   * dead property was the bid path — a bid row outlives the property it
   * points at, so a deleted property kept rendering from `Property #<id>`
   * placeholder data forever. See utilities/walletAssets.ts for the rules.
   *
   * The flip side: removal is only safe on reads we trust, so a failed read
   * leaves the existing list untouched rather than emptying it.
   */
  const loadAssets = useCallback(async () => {
    if (!walletState.account?.accountId) return;
    const accountId = walletState.account.accountId;

    try {
      setAssetsLoading(true);
      await nearContractService.initialize(currentNetwork);

      // Fetch in parallel — use allSettled so one failure doesn't block the other
      const [ownedSettled, bidsSettled] = await Promise.allSettled([
        nearContractService.getMyProperties(accountId),
        nearContractService.getBidsByBidder({
          bidder: accountId,
          from_index: 0,
          limit: 100,
        }),
      ]);

      const ownedResult = ownedSettled.status === "fulfilled" ? ownedSettled.value : null;
      const bidsResult = bidsSettled.status === "fulfilled" ? bidsSettled.value : null;

      let hadReadFailure = false;
      // These two reads fail independently and neither can stand in for the
      // other, so they're tracked separately. A source that came back empty
      // *because it failed* looks exactly like "the user no longer owns/bid on
      // anything" — the very signal used to remove assets — so an unreadable
      // source is carried over from the previous list instead of rebuilt.
      //
      // Treating either failure as fatal to the whole tab is what made Assets
      // go blank: get_bids_by_bidder has a known contract-side fault (it hits
      // ProhibitedInView and falls back to scanning all bids), and when that
      // fallback also failed it took the user's perfectly readable owned
      // properties down with it.
      const ownedReadable =
        ownedSettled.status === "fulfilled" && ownedResult?.success === true;
      const bidsReadable =
        bidsSettled.status === "fulfilled" && bidsResult?.success === true;

      if (!ownedReadable) {
        hadReadFailure = true;
        console.warn(
          "Failed to load owned properties:",
          ownedSettled.status === "rejected" ? ownedSettled.reason : ownedResult?.error
        );
      }
      if (!bidsReadable) {
        hadReadFailure = true;
        console.warn(
          "Failed to load user bids:",
          bidsSettled.status === "rejected" ? bidsSettled.reason : bidsResult?.error
        );
      }

      if (!ownedReadable && !bidsReadable) {
        // Nothing trustworthy to rebuild from — leave what's on screen alone
        // and say it may be stale. A property is only removed on a read we
        // trust.
        setAssetsError(
          "Some properties couldn't be read from the blockchain, so this list may be out of date."
        );
        return;
      }

      // Properties the user currently owns. get_property_by_owner reads live
      // contract state, so anything deleted, burnt or transferred away is
      // already absent from this result.
      const ownedProperties = ownedReadable ? ownedResult!.data ?? [] : [];
      const bids = bidsReadable ? bidsResult!.data ?? [] : [];

      // Resolve the properties behind the user's open bids. A bid row
      // outlives the property it points at, so each one has to be confirmed
      // against the contract before it can be shown as an asset.
      const ownedIds = new Set(ownedProperties.map((p) => p.id));
      const idsToFetch = bidPropertyIdsToFetch(bids, ownedIds);

      const propertyResults = await Promise.allSettled(
        idsToFetch.map((pid) => nearContractService.getPropertyById(pid))
      );

      const bidProperties = new Map<number, PropertyView>();
      // Properties the contract answered about and said don't exist —
      // definitively burnt/deleted. A read that simply *failed* tells us
      // nothing, so it doesn't land here and can't erase an asset over a
      // flaky RPC call.
      const deletedPropertyIds = new Set<number>();

      propertyResults.forEach((result, idx) => {
        const propertyId = idsToFetch[idx];
        if (result.status !== "fulfilled" || !result.value.success) {
          hadReadFailure = true;
          console.warn(
            `Failed to read property ${propertyId}:`,
            result.status === "rejected" ? result.reason : result.value.error
          );
          return;
        }
        if (result.value.data) {
          bidProperties.set(propertyId, result.value.data);
        } else {
          deletedPropertyIds.add(propertyId);
        }
      });

      // The entries of an unreadable source are carried over from the list
      // currently on screen. That's read through a ref rather than `assets`
      // directly: the state value would be stale inside this callback, and
      // naming it in the deps would rebuild loadAssets on every load and
      // restart the polling effect that depends on it.
      const merged = mergeAssetSources({
        previous: assetsRef.current,
        owned: ownedReadable
          ? ownedAssets({ accountId, ownedProperties, deletedPropertyIds })
          : null,
        bids: bidsReadable
          ? bidAssets({ bids, bidProperties, deletedPropertyIds })
          : null,
      });

      // Live data has landed, so cached entries must no longer be applied on
      // top of it — see the hydration effect below.
      liveAssetsLoadedRef.current = true;
      setAssets(merged);
      setAssetsError(
        hadReadFailure
          ? "Some properties couldn't be read from the blockchain, so this list may be incomplete."
          : null
      );

      // Prime the next visit. Only a clean read is worth persisting — caching
      // a partial list would make the gap outlive the outage that caused it.
      if (!hadReadFailure) {
        writeCachedAssets(accountId, currentNetwork, merged);
      }
    } catch (error: any) {
      console.error("Failed to load assets:", error);
      // Keep whatever is already on screen — an RPC outage is not evidence
      // that the user's properties are gone.
      setAssetsError(
        "We couldn't reach the blockchain. Your properties are safe on-chain — please try again shortly."
      );
    } finally {
      setAssetsLoading(false);
    }
  }, [walletState.account?.accountId, currentNetwork]);

  const loadAllData = useCallback(async (forceRefresh = false) => {
    await Promise.all([
      loadBalance(),
      loadTransactions(forceRefresh),
      loadTokenBalances(),
      loadAssets(),
    ]);
  }, [loadBalance, loadTransactions, loadTokenBalances, loadAssets]);

  // ── Show the last-known assets immediately, then let the live read replace
  //    them. Rebuilding this tab costs two contract reads plus a property
  //    lookup per open bid, so without priming it sits empty on every visit
  //    while Tokens and Transactions already have something on screen. ──
  useEffect(() => {
    const accountId = walletState.account?.accountId;
    if (!accountId || !isUnlocked) return;

    let cancelled = false;
    // Belongs to whichever account is current — a switch resets both the list
    // and the "live data has landed" flag so the next account never inherits
    // the previous one's properties.
    liveAssetsLoadedRef.current = false;
    setAssets([]);

    readCachedAssets(accountId, currentNetwork).then((cached) => {
      // Chain data always wins: skip if the live read finished first, or if
      // this effect has already been superseded by another account.
      if (cancelled || liveAssetsLoadedRef.current || !cached?.length) return;
      setAssets(cached);
    });

    return () => {
      cancelled = true;
    };
  }, [walletState.account?.accountId, currentNetwork, isUnlocked]);

  // ── Initial data load ──
  useEffect(() => {
    if (walletState.account?.accountId && isUnlocked) {
      loadAllData();
    }
  }, [walletState.account?.accountId, isUnlocked, loadAllData]);

  // ── Auto-polling every 30 seconds ──
  useEffect(() => {
    if (walletState.account?.accountId && isUnlocked) {
      pollingRef.current = setInterval(() => {
        console.log("🔄 Wallet: Auto-polling balances, transactions & assets");
        loadBalance();
        loadTokenBalances();
        loadTransactions();
        loadAssets();
      }, POLLING_INTERVAL_MS);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [walletState.account?.accountId, isUnlocked, loadBalance, loadTokenBalances, loadTransactions, loadAssets]);

  // ── Biometric / PIN gate — runs once on mount ──
  const hasPromptedAuth = useRef(false);
  useEffect(() => {
    if (walletState.account?.accountId && !isUnlocked && !hasPromptedAuth.current) {
      hasPromptedAuth.current = true;
      authenticate("Authenticate to access your wallet").then((result) => {
        if (result.success) setIsUnlocked(true);
      });
    }
  }, [walletState.account?.accountId]);

  // Pull-to-refresh bypasses the indexer's 5-minute transaction cache —
  // otherwise a user who just signed a transaction pulls to refresh and keeps
  // being served the pre-transaction snapshot.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAllData(true);
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes on return — balances move while the user is away signing
  // things elsewhere.
  usePullToRefresh(onRefresh);

  const handleShowBal = () => {
    setShowBal(!showBal);
  };

  const handleConnectWallet = () => {
    router.push("/wallet-setup");
  };

  const handleSignOut = () => {
    router.push("/wallet-setup");
  };

  const handleDeposit = async () => {
    if (!walletState.account?.accountId) {
      Alert.alert("Error", "No wallet connected");
      return;
    }
    setDepositModalVisible(true);
  };

  const handleWithdraw = () => {
    if (!walletState.account?.accountId) {
      Alert.alert("Error", "No wallet connected");
      return;
    }
    // Default to NEAR if no token selected
    if (!selectedWithdrawToken && tokens.length > 0) {
      setSelectedWithdrawToken(tokens[0]);
    }
    setWithdrawMode("choose");
    setWithdrawModalVisible(true);
  };

  const handleSendTransaction = async () => {
    if (!walletState.account?.accountId) {
      Alert.alert("Error", "No wallet connected");
      return;
    }

    if (!recipientAddress || !withdrawAmount) {
      Alert.alert("Error", "Please enter both recipient address and amount");
      return;
    }

    const tokenLabel = selectedWithdrawToken?.symbol || "NEAR";

    try {
      setSending(true);

      const txHash = await runTransaction({
        loadingMessage: `Sending ${withdrawAmount} ${tokenLabel}...`,
        successMessage: (hash) => `Sent ${withdrawAmount} ${tokenLabel} successfully! Hash: ${hash.substring(0, 10)}...`,
        notification: {
          type: "general",
          title: "Transaction Sent",
          message: `Sent ${withdrawAmount} ${tokenLabel} successfully.`,
        },
        action: () =>
          !selectedWithdrawToken || selectedWithdrawToken.symbol === "NEAR"
            ? sendTransaction(walletState.account!.accountId, recipientAddress, withdrawAmount)
            : sendFungibleToken(
                walletState.account!.accountId,
                recipientAddress,
                selectedWithdrawToken.contractAddress || "",
                withdrawAmount,
                selectedWithdrawToken.decimals || 6
              ),
      });

      console.log("Transaction sent, hash:", txHash);

      setWithdrawModalVisible(false);
      setRecipientAddress("");
      setWithdrawAmount("");

      // Refresh data
      await onRefresh();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send transaction");
    } finally {
      setSending(false);
    }
  };

  const handleTokenPress = (token: Token) => {
    setSelectedToken(token);
    setTokenDetailVisible(true);
  };

  const handleTransactionPress = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setTransactionDetailVisible(true);
  };

  const handleAssetPress = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetDetailVisible(true);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied!", `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  };

  // ── Per-token transactions ──
  const getTokenTransactions = (symbol: string) => {
    return transactions.filter((tx) => {
      if (symbol === "NEAR") {
        return tx.currency === "NEAR" || tx.currency === "Ⓝ";
      }
      return tx.currency === symbol;
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "Tokens":
        return (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {tokens.length === 0 && !loading ? (
              <View className="flex-1 items-center justify-center py-12">
                <InterMedium className="text-base text-gray-500 mb-2">
                  No supported tokens found
                </InterMedium>
                <InterRegular className="text-sm text-gray-400 text-center px-6">
                  Your wallet doesn't have any whitelisted tokens yet. Supported tokens will appear here automatically.
                </InterRegular>
              </View>
            ) : (
              <TokensList
                tokens={tokens}
                onTokenPress={handleTokenPress}
              />
            )}
          </ScrollView>
        );
      case "Transactions":
        return (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <TransactionsList
              transactions={transactions}
              loading={transactionsLoading}
              error={transactionsError}
              onRetry={() => loadTransactions(true)}
              onTransactionPress={handleTransactionPress}
            />
          </ScrollView>
        );
      case "Assets":
        return (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <AssetsList
              assets={assets}
              loading={assetsLoading}
              error={assetsError}
              onRetry={loadAssets}
              onAssetPress={handleAssetPress}
            />
          </ScrollView>
        );
      default:
        return (
          <TokensList
            tokens={tokens}
            onTokenPress={handleTokenPress}
          />
        );
    }
  };

  // Still running WalletContext's background restore check (session restore,
  // FastAuth session lookup, etc.) — distinguish this from "confirmed no
  // wallet" below, since both used to render the identical Connect Wallet
  // prompt with no way to tell "still checking" from "checked, found nothing."
  if (loading && (!walletState.isConnected || !walletState.account)) {
    return (
      <AuthGuard requireAuth={true}>
        <SafeAreaView style={{ flex: 1 }}>
          <View className="container flex-1 mx-auto max-w-2xl items-center justify-center px-8">
            <ActivityIndicator size="large" color="#C1272D" />
            <InterRegular className="text-secondaryText text-sm text-center mt-4">
              Checking for your wallet...
            </InterRegular>
          </View>
        </SafeAreaView>
      </AuthGuard>
    );
  }

  // If wallet is not connected, show wallet dashboard
  if (!walletState.isConnected || !walletState.account) {
    return (
      <AuthGuard requireAuth={true}>
        <SafeAreaView style={{ flex: 1 }}>
          <View className="container flex-1 mx-auto max-w-2xl">
            <View className="px-5 py-5 flex-row justify-between">
              <InterSemiBold className="text-lg/5">Wallet</InterSemiBold>
              <Button
                className="rounded-xl"
                onPress={handleConnectWallet}
              >
                <InterSemiBold className="text-white text-sm">
                  Connect Wallet
                </InterSemiBold>
              </Button>
            </View>
            <WalletDashboard onSignOut={handleSignOut} />
          </View>
        </SafeAreaView>
      </AuthGuard>
    );
  }

  // Connected but not unlocked — prompt biometric or PIN
  if (!isUnlocked) {
    return (
      <AuthGuard requireAuth={true}>
        <SafeAreaView style={{ flex: 1 }}>
          <View className="container flex-1 mx-auto max-w-2xl items-center justify-center px-8">
            <InterBold className="text-xl mb-3">{"\ud83d\udd12"} Wallet Locked</InterBold>
            <InterRegular className="text-secondaryText text-center text-sm mb-6">
              {authMethod === "device_passcode"
                ? "Use your device PIN or passcode to unlock your wallet"
                : "Authenticate to view your wallet"}
            </InterRegular>
            <Button
              className="bg-primary rounded-lg px-8"
              onPress={() => {
                hasPromptedAuth.current = false;
                authenticate("Authenticate to access your wallet").then((r) => {
                  if (r.success) setIsUnlocked(true);
                });
              }}
            >
              <InterSemiBold className="text-white">
                {authMethod === "device_passcode" ? "Unlock with PIN" : "Unlock Wallet"}
              </InterSemiBold>
            </Button>
          </View>
        </SafeAreaView>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="container flex-1 mx-auto max-w-2xl">
          <View className="px-5 py-5 flex-row justify-between items-center">
            <CurrencySelector />
            <View className="flex-row items-center gap-2">
              <View className="w-2 h-2 bg-green-500 rounded-full"></View>
              <InterMedium className="text-green-600 text-xs">
                Connected
              </InterMedium>
            </View>
          </View>

          {/* Balance Section — Aggregated from ALL whitelisted tokens */}
          <View className="max-w-64 mx-auto my-9 items-center">
            <View className="flex-row items-center gap-2">
              <InterRegular className="text-sm/5">Total balance</InterRegular>
              <TouchableOpacity onPress={handleShowBal}>
                <View pointerEvents="none">
                  {showBal ? (
                    <Icon icon={EYE} width={15} height={15} color="black" />
                  ) : (
                    <Icon icon={EYESLASH} width={15} height={15} color="black" />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <InterExtraBold className="text-2xl/5 pt-5 pb-1">
              {showBal
                ? `${!aggregatedBalance.isComplete ? "~" : ""}${formatPrice(aggregatedBalance.totalUsd)}`
                : "********"}
            </InterExtraBold>

            {/* Partial total warning */}
            {showBal && !aggregatedBalance.isComplete && (
              <InterRegular className="text-xs text-amber-500 text-center px-4 pb-1">
                Some token prices are unavailable ({aggregatedBalance.missingPriceSymbols.join(", ")})
              </InterRegular>
            )}

            {showBal && aggregatedBalance.isComplete && nearUsd != null && (
              <InterRegular className="text-sm text-gray-500 pb-4">
                ≈ {formatUsd(aggregatedBalance.totalUsd)}
              </InterRegular>
            )}

            <View className="flex-row gap-3">
              <Button
                isFull={false}
                color="#d4d4d7"
                className="flex-row gap-3 items-center justify-center rounded-md"
                onPress={handleDeposit}
              >
                <Icon
                  icon={DEPOSIT}
                  width={18}
                  height={16}
                  className="w-0 justify-center items-center bg-[#D8DADC26]"
                />
                <InterRegular className="text-sm/5">Deposit</InterRegular>
              </Button>
              <Button
                isFull={false}
                color="#d4d4d7"
                className="flex-row gap-3 items-center justify-center rounded-md"
                onPress={handleWithdraw}
              >
                <Icon
                  icon={WITHDRAW}
                  width={18}
                  height={16}
                  className="w-0 justify-center items-center bg-[#D8DADC26]"
                />
                <InterRegular className="text-sm/5">Withdraw</InterRegular>
              </Button>
            </View>
          </View>

          {/* Wallet Tabs */}
          <WalletTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab Content */}
          <View className="flex-1">{renderTabContent()}</View>

          {/* Withdraw Modal — dual option: direct send or cross-chain */}
          <Modal
            visible={withdrawModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => {
              setWithdrawModalVisible(false);
              setWithdrawMode("choose");
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1 justify-end bg-black/50"
            >
              <View className="bg-white rounded-t-3xl p-6 pb-10" style={{ maxHeight: "90%" }}>
                <View className="flex-row justify-between items-center mb-6">
                  <InterSemiBold className="text-xl">
                    {withdrawMode === "choose" ? "Withdraw" : withdrawMode === "direct" ? "Send to NEAR Address" : "Cross-Chain Withdrawal"}
                  </InterSemiBold>
                  <TouchableOpacity onPress={() => {
                    setWithdrawModalVisible(false);
                    setWithdrawMode("choose");
                  }}>
                    <InterMedium className="text-gray-500 text-lg">✕</InterMedium>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* ── Option chooser ── */}
                  {withdrawMode === "choose" && (
                    <View>
                      {/* Option 1: Direct NEAR send */}
                      <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4 mb-3"
                        onPress={() => setWithdrawMode("direct")}
                      >
                        <View className="flex-row items-center gap-3 mb-2">
                          <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center">
                            <InterSemiBold className="text-blue-600 text-lg">📤</InterSemiBold>
                          </View>
                          <View className="flex-1">
                            <InterSemiBold className="text-base">Send to NEAR Address</InterSemiBold>
                            <InterRegular className="text-xs text-gray-500 mt-1">
                              Transfer tokens directly to another NEAR wallet
                            </InterRegular>
                          </View>
                        </View>
                        <View className="bg-green-50 rounded-lg px-2 py-1 self-start">
                          <InterRegular className="text-green-700 text-xs">Works on Testnet & Mainnet</InterRegular>
                        </View>
                      </TouchableOpacity>

                      {/* Option 2: Cross-chain via NEAR Intents */}
                      <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4"
                        onPress={() => setWithdrawMode("intents")}
                      >
                        <View className="flex-row items-center gap-3 mb-2">
                          <View className="w-10 h-10 rounded-full bg-purple-100 items-center justify-center">
                            <InterSemiBold className="text-purple-600 text-lg">⚡</InterSemiBold>
                          </View>
                          <View className="flex-1">
                            <InterSemiBold className="text-base">Cross-Chain via NEAR Intents</InterSemiBold>
                            <InterRegular className="text-xs text-gray-500 mt-1">
                              Withdraw to Ethereum, Solana, Bitcoin, BSC & more
                            </InterRegular>
                          </View>
                        </View>
                        <View className="bg-amber-50 rounded-lg px-2 py-1 self-start">
                          <InterRegular className="text-amber-700 text-xs">Mainnet Only — No testnet available</InterRegular>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ── Option 1: Direct NEAR send ── */}
                  {withdrawMode === "direct" && (
                    <View>
                      <TouchableOpacity onPress={() => setWithdrawMode("choose")} className="mb-4">
                        <InterMedium className="text-blue-500 text-sm">← Back to options</InterMedium>
                      </TouchableOpacity>

                      {/* Token selector */}
                      <View className="mb-4">
                        <InterMedium className="text-sm mb-2">Select Token</InterMedium>
                        <TouchableOpacity
                          onPress={() => setShowTokenPicker(!showTokenPicker)}
                          className="border border-gray-300 rounded-lg p-3 flex-row justify-between items-center"
                        >
                          <View className="flex-row items-center gap-2">
                            {selectedWithdrawToken && (() => {
                              const display = getTokenDisplay(selectedWithdrawToken.symbol);
                              return (
                                <View
                                  className="w-6 h-6 rounded-full items-center justify-center"
                                  style={{ backgroundColor: display.color }}
                                >
                                  {display.logoUrl ? (
                                    <Image
                                      source={{ uri: display.logoUrl }}
                                      style={{ width: 16, height: 16 }}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <InterSemiBold style={{ color: "#fff", fontSize: 10 }}>
                                      {display.letter}
                                    </InterSemiBold>
                                  )}
                                </View>
                              );
                            })()}
                            <InterMedium>{selectedWithdrawToken?.symbol || "Select token"}</InterMedium>
                          </View>
                          <InterRegular className="text-gray-400">▼</InterRegular>
                        </TouchableOpacity>

                        {showTokenPicker && (
                          <View className="border border-gray-200 rounded-lg mt-1 bg-white" style={{ maxHeight: 200 }}>
                            <ScrollView>
                              {tokens.filter(t => t.amount > 0).map((token) => (
                                <TouchableOpacity
                                  key={token.id}
                                  className="flex-row items-center justify-between p-3 border-b border-gray-100"
                                  onPress={() => {
                                    setSelectedWithdrawToken(token);
                                    setShowTokenPicker(false);
                                  }}
                                >
                                  <View className="flex-row items-center gap-2">
                                    {(() => {
                                      const display = getTokenDisplay(token.symbol);
                                      return (
                                        <View
                                          className="w-6 h-6 rounded-full items-center justify-center"
                                          style={{ backgroundColor: display.color }}
                                        >
                                          {display.logoUrl ? (
                                            <Image
                                              source={{ uri: display.logoUrl }}
                                              style={{ width: 16, height: 16 }}
                                              resizeMode="contain"
                                            />
                                          ) : (
                                            <InterSemiBold style={{ color: "#fff", fontSize: 10 }}>
                                              {display.letter}
                                            </InterSemiBold>
                                          )}
                                        </View>
                                      );
                                    })()}
                                    <InterMedium className="text-sm">{token.symbol}</InterMedium>
                                  </View>
                                  <InterRegular className="text-sm text-gray-500">
                                    {token.amount.toFixed(token.amount < 1 ? 6 : 4)}
                                  </InterRegular>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      {selectedWithdrawToken && (
                        <View className="mb-2">
                          <InterRegular className="text-xs text-gray-500">
                            Available: {selectedWithdrawToken.amount.toFixed(
                              selectedWithdrawToken.amount < 1 ? 6 : 4
                            )} {selectedWithdrawToken.symbol}
                          </InterRegular>
                        </View>
                      )}

                      <View className="mb-4">
                        <InterMedium className="text-sm mb-2">Recipient Address</InterMedium>
                        <TextInput
                          className="border border-gray-300 rounded-lg p-3 text-base"
                          placeholder="example.testnet"
                          value={recipientAddress}
                          onChangeText={setRecipientAddress}
                          autoCapitalize="none"
                        />
                      </View>

                      <View className="mb-6">
                        <InterMedium className="text-sm mb-2">
                          Amount ({selectedWithdrawToken?.symbol || "NEAR"})
                        </InterMedium>
                        <TextInput
                          className="border border-gray-300 rounded-lg p-3 text-base"
                          placeholder="0.00"
                          value={withdrawAmount}
                          onChangeText={setWithdrawAmount}
                          keyboardType="decimal-pad"
                        />
                      </View>

                      <Button
                        className="rounded-xl py-4"
                        onPress={handleSendTransaction}
                        disabled={sending}
                      >
                        <InterSemiBold className="text-white text-center">
                          {sending ? "Sending..." : `Send ${selectedWithdrawToken?.symbol || "NEAR"}`}
                        </InterSemiBold>
                      </Button>
                    </View>
                  )}

                  {/* ── Option 2: Cross-Chain via NEAR Intents ── */}
                  {withdrawMode === "intents" && (
                    <View>
                      <TouchableOpacity onPress={() => setWithdrawMode("choose")} className="mb-4">
                        <InterMedium className="text-indigo-500 text-sm">← Back to options</InterMedium>
                      </TouchableOpacity>

                      <IntentsWithdrawFlow
                        nearAccountId={walletState.account?.accountId || ""}
                        walletTokenSymbols={WALLET_WHITELISTED_SYMBOLS}
                        onDone={() => {
                          setWithdrawModalVisible(false);
                          setWithdrawMode("choose");
                        }}
                        onRefresh={onRefresh}
                      />
                    </View>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Deposit Modal — dual option */}
          <Modal
            visible={depositModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => {
              setDepositModalVisible(false);
              setDepositMode("choose");
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1 justify-end bg-black/50"
            >
              <View className="bg-white rounded-t-3xl p-6 pb-10" style={{ maxHeight: "90%" }}>
                <View className="flex-row justify-between items-center mb-6">
                  <InterSemiBold className="text-xl">
                    {depositMode === "choose" ? "Deposit" : depositMode === "address" ? "Deposit via Address" : "Cross-Chain Deposit"}
                  </InterSemiBold>
                  <TouchableOpacity onPress={() => {
                    setDepositModalVisible(false);
                    setDepositMode("choose");
                  }}>
                    <InterMedium className="text-gray-500 text-lg">✕</InterMedium>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* ── Option chooser ── */}
                  {depositMode === "choose" && (
                    <View>
                      {/* Option 1: Copy address */}
                      <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4 mb-3"
                        onPress={() => setDepositMode("address")}
                      >
                        <View className="flex-row items-center gap-3 mb-2">
                          <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center">
                            <InterSemiBold className="text-blue-600 text-lg"> </InterSemiBold>
                          </View>
                          <View className="flex-1">
                            <InterSemiBold className="text-base">Copy Wallet Address</InterSemiBold>
                            <InterRegular className="text-xs text-gray-500 mt-1">
                              Send NEAR or FT tokens directly to your wallet address
                            </InterRegular>
                          </View>
                        </View>
                        <View className="bg-green-50 rounded-lg px-2 py-1 self-start">
                          <InterRegular className="text-green-700 text-xs">Works on Testnet & Mainnet</InterRegular>
                        </View>
                      </TouchableOpacity>

                      {/* Option 2: NEAR Intents cross-chain */}
                      <TouchableOpacity
                        className="border border-gray-200 rounded-xl p-4"
                        onPress={() => setDepositMode("intents")}
                      >
                        <View className="flex-row items-center gap-3 mb-2">
                          <View className="w-10 h-10 rounded-full bg-purple-100 items-center justify-center">
                            <InterSemiBold className="text-purple-600 text-lg">⚡</InterSemiBold>
                          </View>
                          <View className="flex-1">
                            <InterSemiBold className="text-base">Cross-Chain via NEAR Intents</InterSemiBold>
                            <InterRegular className="text-xs text-gray-500 mt-1">
                              Deposit from Solana, Ethereum, Bitcoin, BSC & more
                            </InterRegular>
                          </View>
                        </View>
                        <View className="bg-amber-50 rounded-lg px-2 py-1 self-start">
                          <InterRegular className="text-amber-700 text-xs">Mainnet Only — No testnet available</InterRegular>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ── Option 1: Copy Address ── */}
                  {depositMode === "address" && (
                    <View>
                      <TouchableOpacity onPress={() => setDepositMode("choose")} className="mb-4">
                        <InterMedium className="text-blue-500 text-sm">← Back to options</InterMedium>
                      </TouchableOpacity>

                      <View className="mb-4">
                        <InterMedium className="text-sm mb-2">Your Wallet Address</InterMedium>
                        <View className="bg-gray-100 rounded-lg p-4">
                          <InterRegular className="text-sm">
                            {walletState.account?.accountId}
                          </InterRegular>
                        </View>
                      </View>

                      <InterRegular className="text-gray-600 text-sm mb-6">
                        Send NEAR or any supported token to this address to deposit funds into your wallet.
                      </InterRegular>

                      <Button
                        className="rounded-xl py-4"
                        onPress={() => copyToClipboard(walletState.account?.accountId || "", "Address")}
                      >
                        <InterSemiBold className="text-white text-center">
                          Copy Address
                        </InterSemiBold>
                      </Button>
                    </View>
                  )}

                  {/* ── Option 2: NEAR Intents Cross-Chain (fully managed component) ── */}
                  {depositMode === "intents" && (
                    <View>
                      <TouchableOpacity onPress={() => setDepositMode("choose")} className="mb-4">
                        <InterMedium className="text-indigo-500 text-sm">← Back to options</InterMedium>
                      </TouchableOpacity>

                      <IntentsDepositFlow
                        nearAccountId={walletState.account?.accountId || ""}
                        whitelistedSymbols={WALLET_WHITELISTED_SYMBOLS}
                        onDone={() => {
                          setDepositModalVisible(false);
                          setDepositMode("choose");
                        }}
                        onRefresh={onRefresh}
                      />
                    </View>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* ── Token Detail Modal — enhanced with per-token transactions ── */}
          <Modal
            visible={tokenDetailVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setTokenDetailVisible(false)}
          >
            <View className="flex-1 justify-end bg-black/50">
              <View className="bg-white rounded-t-3xl p-6 pb-10" style={{ maxHeight: "85%" }}>
                <View className="flex-row justify-between items-center mb-6">
                  <View className="flex-row items-center gap-3">
                    {selectedToken && (() => {
                      const display = getTokenDisplay(selectedToken.symbol);
                      return (
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{ backgroundColor: display.color }}
                        >
                          {display.logoUrl ? (
                            <Image
                              source={{ uri: display.logoUrl }}
                              style={{ width: 24, height: 24 }}
                              resizeMode="contain"
                            />
                          ) : (
                            <InterSemiBold style={{ color: "#fff", fontSize: 14 }}>
                              {display.letter}
                            </InterSemiBold>
                          )}
                        </View>
                      );
                    })()}
                    <InterSemiBold className="text-xl">{selectedToken?.name}</InterSemiBold>
                  </View>
                  <TouchableOpacity onPress={() => setTokenDetailVisible(false)}>
                    <InterMedium className="text-gray-500 text-lg">✕</InterMedium>
                  </TouchableOpacity>
                </View>

                {selectedToken && (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Balance card */}
                    <View className="bg-gray-50 rounded-lg p-4 mb-4">
                      <InterMedium className="text-gray-600 text-sm mb-1">Balance</InterMedium>
                      <InterSemiBold className="text-2xl">
                        {selectedToken.amount.toFixed(selectedToken.amount < 1 ? 6 : 4)} {selectedToken.symbol}
                      </InterSemiBold>
                      {selectedToken.priceAvailable !== false ? (
                        <InterRegular className="text-gray-500 text-sm mt-1">
                          ≈ {formatPrice(selectedToken.totalValue)}
                        </InterRegular>
                      ) : (
                        <InterRegular className="text-amber-500 text-sm mt-1">
                          Price unavailable
                        </InterRegular>
                      )}
                    </View>

                    {/* Token info */}
                    <View className="mb-4">
                      <View className="flex-row justify-between py-3 border-b border-gray-200">
                        <InterRegular className="text-gray-600">Symbol</InterRegular>
                        <InterMedium>{selectedToken.symbol}</InterMedium>
                      </View>
                      {selectedToken.priceAvailable !== false && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Price</InterRegular>
                          <InterMedium>{formatPrice(selectedToken.price)}</InterMedium>
                        </View>
                      )}
                      {selectedToken.contractAddress && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Contract</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedToken.contractAddress!, "Contract address")}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedToken.contractAddress.length > 20
                                ? selectedToken.contractAddress.substring(0, 20) + "…"
                                : selectedToken.contractAddress}
                              {" "}
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Per-token transactions */}
                    <View className="mt-2">
                      <InterSemiBold className="text-base mb-3">Transaction History</InterSemiBold>
                      {(() => {
                        const tokenTxs = getTokenTransactions(selectedToken.symbol);
                        if (tokenTxs.length === 0) {
                          return (
                            <View className="items-center py-6">
                              <InterRegular className="text-gray-400 text-sm">
                                No transactions yet for {selectedToken.symbol}
                              </InterRegular>
                            </View>
                          );
                        }
                        return tokenTxs.slice(0, 10).map((tx: any) => (
                          <TouchableOpacity
                            key={tx.id}
                            className="flex-row justify-between py-3 border-b border-gray-100"
                            onPress={() => {
                              setTokenDetailVisible(false);
                              setTimeout(() => {
                                setSelectedTransaction(tx);
                                setTransactionDetailVisible(true);
                              }, 300);
                            }}
                          >
                            <View>
                              <InterMedium className={`text-sm ${tx.direction === "incoming" ? "text-green-600" : "text-red-600"}`}>
                                {tx.direction === "incoming" ? "+" : "-"}{tx.amount} {tx.currency}
                              </InterMedium>
                              <InterRegular className="text-xs text-gray-400">
                                {formatDateTime(tx.timestamp ?? tx.date)}
                              </InterRegular>
                            </View>
                            <View className="items-end">
                              <InterRegular className="text-xs text-gray-500">
                                {getMethodLabel(tx.methodName) || tx.type}
                              </InterRegular>
                              <InterRegular className={`text-xs ${tx.status === "failed" ? "text-red-500" : tx.status === "pending" ? "text-yellow-500" : "text-green-500"}`}>
                                {tx.status || "completed"}
                              </InterRegular>
                            </View>
                          </TouchableOpacity>
                        ));
                      })()}
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          {/* Transaction Detail Modal */}
          <Modal
            visible={transactionDetailVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setTransactionDetailVisible(false)}
          >
            <View className="flex-1 justify-end bg-black/50">
              <View className="bg-white rounded-t-3xl p-6 pb-10">
                <View className="flex-row justify-between items-center mb-6">
                  <InterSemiBold className="text-xl">Transaction Details</InterSemiBold>
                  <TouchableOpacity onPress={() => setTransactionDetailVisible(false)}>
                    <InterMedium className="text-gray-500 text-lg">✕</InterMedium>
                  </TouchableOpacity>
                </View>

                {selectedTransaction && (
                  <>
                    <View className={`rounded-lg p-4 mb-4 ${selectedTransaction.direction === 'incoming' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <InterMedium className="text-gray-600 text-sm mb-1">Amount</InterMedium>
                      <InterSemiBold className={`text-2xl ${selectedTransaction.direction === 'incoming' ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedTransaction.direction === 'incoming' ? '+' : '-'}{selectedTransaction.amount} {selectedTransaction.currency}
                      </InterSemiBold>
                      <InterRegular className="text-gray-500 text-sm mt-1">
                        ≈ {formatPrice(selectedTransaction.value)}
                      </InterRegular>
                    </View>

                    <View className="mb-4">
                      <View className="flex-row justify-between py-3 border-b border-gray-200">
                        <InterRegular className="text-gray-600">Type</InterRegular>
                        <InterMedium>
                          {getMethodLabel(selectedTransaction.methodName) || selectedTransaction.type}
                        </InterMedium>
                      </View>
                      <View className="flex-row justify-between py-3 border-b border-gray-200">
                        <InterRegular className="text-gray-600">Status</InterRegular>
                        <InterMedium className={
                          selectedTransaction.status === 'failed'
                            ? 'text-red-600'
                            : selectedTransaction.status === 'pending'
                              ? 'text-yellow-600'
                              : 'text-green-600'
                        }>
                          {selectedTransaction.status || 'Completed'}
                        </InterMedium>
                      </View>
                      <View className="flex-row justify-between py-3 border-b border-gray-200">
                        <InterRegular className="text-gray-600">Date</InterRegular>
                        <View className="items-end">
                          <InterMedium>
                            {formatDateTime(selectedTransaction.timestamp ?? selectedTransaction.date)}
                          </InterMedium>
                          <InterRegular className="text-xs text-gray-400">
                            {formatRelativeTime(selectedTransaction.timestamp ?? selectedTransaction.date)}
                          </InterRegular>
                        </View>
                      </View>
                      {selectedTransaction.from && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">From</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedTransaction.from || "", "From address")}
                            onLongPress={() => openAccountOnExplorer(selectedTransaction.from!)}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedTransaction.from.substring(0, 15)}...
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      )}
                      {selectedTransaction.to && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">To</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedTransaction.to || "", "To address")}
                            onLongPress={() => openAccountOnExplorer(selectedTransaction.to!)}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedTransaction.to.substring(0, 15)}...
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      )}
                      {selectedTransaction.hash && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Tx Hash</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedTransaction.hash || "", "Transaction hash")}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedTransaction.hash.substring(0, 10)}...
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      )}
                      {selectedTransaction.blockHash ? (
                        <View className="flex-row justify-between py-3">
                          <InterRegular className="text-gray-600">Block</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedTransaction.blockHash || "", "Block hash")}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedTransaction.blockHash.substring(0, 10)}...
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>

                    {/* Every on-chain action is verifiable — link straight to
                        the block explorer for the active network. */}
                    {selectedTransaction.hash && (
                      <Button
                        className="rounded-xl py-4"
                        onPress={() => openTxOnExplorer(selectedTransaction.hash!)}
                      >
                        <InterSemiBold className="text-white text-center">
                          View on Block Explorer ↗
                        </InterSemiBold>
                      </Button>
                    )}
                  </>
                )}
              </View>
            </View>
          </Modal>

          {/* Asset Detail Modal */}
          <Modal
            visible={assetDetailVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setAssetDetailVisible(false)}
          >
            <View className="flex-1 justify-end bg-black/50">
              <View className="bg-white rounded-t-3xl p-6 pb-10">
                <View className="flex-row justify-between items-center mb-6">
                  <InterSemiBold className="text-xl">Asset Details</InterSemiBold>
                  <TouchableOpacity onPress={() => setAssetDetailVisible(false)}>
                    <InterMedium className="text-gray-500 text-lg">✕</InterMedium>
                  </TouchableOpacity>
                </View>

                {selectedAsset && (
                  <>
                    <View className="items-center mb-6">
                      {(selectedAsset.imageUri || selectedAsset.image) && (
                        <View className="w-32 h-32 bg-gray-200 rounded-lg mb-4 overflow-hidden">
                          {selectedAsset.imageUri ? (
                            <Image source={{ uri: selectedAsset.imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : selectedAsset.image ? (
                            <Image source={selectedAsset.image} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : null}
                        </View>
                      )}
                      <InterSemiBold className="text-xl">{selectedAsset.name}</InterSemiBold>
                      <View className={`mt-2 px-3 py-1 rounded-full ${selectedAsset.state === 'listed' ? 'bg-green-100' : selectedAsset.state === 'leased' ? 'bg-blue-100' : selectedAsset.state === 'sold' ? 'bg-purple-100' : selectedAsset.state === 'bid' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                        <InterMedium className={selectedAsset.state === 'listed' ? 'text-green-700' : selectedAsset.state === 'leased' ? 'text-blue-700' : selectedAsset.state === 'sold' ? 'text-purple-700' : selectedAsset.state === 'bid' ? 'text-amber-700' : 'text-gray-600'}>
                          {selectedAsset.stateLabel ?? 'Not listed'}
                        </InterMedium>
                      </View>
                    </View>

                    <View className="mb-4">
                      <View className="flex-row justify-between py-3 border-b border-gray-200">
                        <InterRegular className="text-gray-600">Property ID</InterRegular>
                        <InterMedium>#{selectedAsset.propertyId ?? selectedAsset.id}</InterMedium>
                      </View>
                      {selectedAsset.owner && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Owner</InterRegular>
                          <TouchableOpacity
                            onPress={() => copyToClipboard(selectedAsset.owner!, "Owner address")}
                            onLongPress={() => openAccountOnExplorer(selectedAsset.owner!)}
                          >
                            <InterMedium className="text-blue-500">
                              {selectedAsset.owner.length > 20 ? selectedAsset.owner.substring(0, 20) + '...' : selectedAsset.owner}
                            </InterMedium>
                          </TouchableOpacity>
                        </View>
                      )}
                      {selectedAsset.priceAmount != null && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Price</InterRegular>
                          <View className="items-end">
                            <InterMedium>
                              {formatAmount(selectedAsset.priceAmount)} {selectedAsset.priceSymbol}
                            </InterMedium>
                            {selectedAsset.priceUsd != null && (
                              <InterRegular className="text-xs text-gray-500">
                                {formatPrice(selectedAsset.priceUsd)}
                              </InterRegular>
                            )}
                          </View>
                        </View>
                      )}
                      {selectedAsset.mintedAt && (
                        <View className="flex-row justify-between py-3 border-b border-gray-200">
                          <InterRegular className="text-gray-600">Minted</InterRegular>
                          <InterMedium>{formatDateTime(selectedAsset.mintedAt)}</InterMedium>
                        </View>
                      )}
                      <View className="flex-row justify-between py-3">
                        <InterRegular className="text-gray-600">Status</InterRegular>
                        <InterMedium>{selectedAsset.stateLabel ?? 'Not listed'}</InterMedium>
                      </View>
                    </View>

                    {selectedAsset.description && (
                      <InterRegular className="text-gray-600 text-sm mb-4">
                        {selectedAsset.description}
                      </InterRegular>
                    )}

                    {/* Transfer button — only for properties the user owns */}
                    {selectedAsset.owner === walletState.account?.accountId && (
                      <View className="mt-2">
                        <InterMedium className="text-sm mb-2">Transfer to another wallet</InterMedium>
                        <TextInput
                          className="border border-gray-300 rounded-lg p-3 text-sm mb-3"
                          placeholder="recipient.testnet"
                          value={transferRecipient}
                          onChangeText={setTransferRecipient}
                          autoCapitalize="none"
                        />
                        <Button
                          className="rounded-xl py-3"
                          disabled={transferring || !transferRecipient.trim()}
                          onPress={async () => {
                            if (!selectedAsset.propertyId || !walletState.account?.accountId) return;
                            try {
                              setTransferring(true);
                              await nearContractService.initialize(currentNetwork);
                              const privateKey = walletState.account.privateKey;
                              if (!privateKey) {
                                Alert.alert("Error", "Private key not available. Please reconnect wallet.");
                                return;
                              }
                              const result = await nearContractService.transferProperty(
                                walletState.account.accountId,
                                privateKey,
                                {
                                  receiver_id: transferRecipient.trim(),
                                  token_id: selectedAsset.propertyId.toString(),
                                }
                              );
                              if (result.success) {
                                Alert.alert("Success", `Property transferred to ${transferRecipient}`);
                                setAssetDetailVisible(false);
                                setTransferRecipient("");
                                await loadAssets();
                              } else {
                                Alert.alert("Error", result.error || "Failed to transfer property");
                              }
                            } catch (error: any) {
                              Alert.alert("Error", error.message || "Failed to transfer property");
                            } finally {
                              setTransferring(false);
                            }
                          }}
                        >
                          <InterSemiBold className="text-white text-center text-sm">
                            {transferring ? "Transferring..." : "Transfer Property"}
                          </InterSemiBold>
                        </Button>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          </Modal>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default Wallet;
