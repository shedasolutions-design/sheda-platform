"use client";

import {
  View,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import historyHeader from "@/constants/historyHeader";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useFocusEffect, router } from "expo-router";
import { NoHistory } from "@/components/history/NoHistory";
import { useMode } from "@/contexts/ModeContext";
import { useApi } from "@/contexts/ApiContext";
import TransactionList from "@/components/history/HistoryList";
import useTransactions from "@/hooks/useTransactions";
import useExpirationChecker from "@/hooks/useExpirationChecker";
import AuthGuard from "@/components/AuthGuard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWallet } from "@/contexts/WalletContext";
import { PropertySkeletonList } from "@/components/common/PropertySkeleton";
import { SELLER_TRANSACTIONS_ROUTE } from "@/utilities/transactionsRoute";

/**
 * Buyer's transaction surface. The seller equivalent is app/(tabs)/activity,
 * which shows the same Ongoing/Active/Cancelled/Expired list alongside revenue
 * and property stats.
 *
 * This screen used to branch on isSeller and render "My Listings &
 * Transactions" — MyListings (already on the List tab) plus a second copy of
 * the transaction list a seller already had on Activity. It has no tab in
 * seller mode, so that variant was only ever reachable from links that pushed
 * this route unconditionally; those now resolve by role. Sellers who still
 * arrive here (an old deep link, a stale notification) are sent to Activity,
 * mirroring how app/(tabs)/saved redirects sellers.
 */
const History = () => {
  const { isSeller, isLoading: modeLoading } = useMode();
  const { getMe, registerWallet } = useApi();
  const { walletState } = useWallet();
  const [activeIndex, setIsActiveIndex] = useState<number>(0);
  const [activeItem, setActiveItem] = useState<"Ongoing" | "Active" | "Cancelled" | "Expired">("Ongoing");
  const [refreshing, setRefreshing] = useState(false);

  const {
    ongoing,
    completed,
    expired,
    cancelled,
    loading: txLoading,
    error: txError,
    refresh: refreshTransactions,
    updatePhase,
  } = useTransactions();

  // Check completed + already-expired transactions for approaching/reached
  // expiration milestones (30d/7d/1d/expired notifications).
  useExpirationChecker(useMemo(() => [...completed, ...expired], [completed, expired]));

  // Seller mode has no tab for this route — send them to their own surface
  // rather than rendering a second transaction list.
  useEffect(() => {
    if (!modeLoading && isSeller) {
      router.replace(SELLER_TRANSACTIONS_ROUTE as any);
    }
  }, [modeLoading, isSeller]);

  useEffect(() => {
    getMe({ silent: true });
  }, [getMe]);

  // Register wallet on mount so backend can map wallet → user ID
  useEffect(() => {
    const accountId = walletState.account?.accountId;
    if (accountId) {
      registerWallet(accountId).catch((err: any) =>
        console.warn("Failed to register wallet:", err)
      );
    }
  }, [walletState.account?.accountId, registerWallet]);

  // Refetch on tab focus (skip the very first one — useTransactions already
  // fetches on mount) and poll every 60s while focused, matching
  // app/(tabs)/wallet/index.tsx's cadence — so completing a transaction
  // elsewhere (or the counterparty acting on one) shows up here without
  // requiring a manual pull-to-refresh.
  const hasFocusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedBefore.current) {
        refreshTransactions();
      }
      hasFocusedBefore.current = true;

      const pollId = setInterval(() => {
        refreshTransactions();
      }, 60_000);

      return () => clearInterval(pollId);
    }, [refreshTransactions])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([getMe(), refreshTransactions()]);
    setRefreshing(false);
  }, [getMe, refreshTransactions]);

  // RefreshControl below is a no-op on web — react-native-web renders it as a
  // bare View and discards onRefresh — so the gesture is reimplemented there,
  // and both platforms additionally refresh when the screen is returned to.
  const webRefresh = usePullToRefresh(onRefresh);

  const handleHistoryClick = (index: number, item: any) => {
    setIsActiveIndex(index);
    setActiveItem(item);
  };

  // Get the right transaction list based on active tab
  const currentTransactions = useMemo(() => {
    switch (activeItem) {
      case "Ongoing":
        return ongoing;
      case "Active":
        return completed;
      case "Cancelled":
        return cancelled;
      case "Expired":
        return expired;
      default:
        return ongoing;
    }
  }, [activeItem, ongoing, completed, cancelled, expired]);

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <ScrollView
          className="container flex-1 mx-auto max-w-2xl"
          style={{ padding: 20 }}
          onScroll={webRefresh.onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Web-only feedback: the platform draws no spinner of its own, so
              without this a pull looks like nothing happened. */}
          {(webRefresh.refreshing || webRefresh.pullProgress > 0) && (
            <View className="items-center pb-2">
              <InterRegular className="text-xs text-secondaryText">
                {webRefresh.refreshing
                  ? "Refreshing…"
                  : webRefresh.pullProgress >= 1
                    ? "Release to refresh"
                    : "Pull to refresh"}
              </InterRegular>
            </View>
          )}
          <View className="mb-5">
            <InterSemiBold className="text-lg leading-5">
              Transaction History
            </InterSemiBold>
          </View>

          {/* Transaction Tabs */}
          <View className="flex-row justify-between mt-2">
            {historyHeader.map((item, index) => (
              <Button
                key={index}
                color={activeIndex === index ? "#C1272D" : "#C1272D0A"}
                onPress={() => handleHistoryClick(index, item)}
                className="text-white rounded-lg px-4"
              >
                <InterRegular
                  className={
                    activeIndex === index ? "text-white" : "text-secondaryText"
                  }
                >
                  {item}
                  {/* Show count badges */}
                  {item === "Ongoing" && ongoing.length > 0 ? ` (${ongoing.length})` : ""}
                  {item === "Active" && completed.length > 0 ? ` (${completed.length})` : ""}
                  {item === "Cancelled" && cancelled.length > 0 ? ` (${cancelled.length})` : ""}
                  {item === "Expired" && expired.length > 0 ? ` (${expired.length})` : ""}
                </InterRegular>
              </Button>
            ))}
          </View>

          {/* Transaction List */}
          <View className="mt-4">
            {/* A partial read failure still has rows worth showing — warn
                above the list instead of replacing it, so we don't hide real
                transactions we successfully loaded. */}
            {txError && currentTransactions.length > 0 && (
              <View className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex-row items-center justify-between">
                <InterRegular className="text-amber-700 text-xs flex-1 mr-2">
                  {txError}
                </InterRegular>
                <TouchableOpacity onPress={refreshTransactions}>
                  <InterRegular className="text-amber-900 text-xs underline">
                    Retry
                  </InterRegular>
                </TouchableOpacity>
              </View>
            )}

            {txError && currentTransactions.length === 0 ? (
              <View className="py-6 items-center">
                <InterRegular className="text-red-500 text-center mb-3">
                  {txError}
                </InterRegular>
                <Button
                  className="bg-primary rounded-lg px-6"
                  onPress={refreshTransactions}
                >
                  <InterRegular className="text-white text-sm">Retry</InterRegular>
                </Button>
              </View>
            ) : txLoading && currentTransactions.length === 0 ? (
              <PropertySkeletonList count={3} />
            ) : currentTransactions.length === 0 ? (
              <NoHistory headText={activeItem} />
            ) : (
              <TransactionList
                transactions={currentTransactions}
                onPhaseUpdate={updatePhase}
                cardType={
                  activeItem === "Active" ? "active" :
                    activeItem === "Expired" ? "expired" :
                      activeItem === "Cancelled" ? "cancelled" :
                        "ongoing"
                }
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default History;
