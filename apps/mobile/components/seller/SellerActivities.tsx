"use client"

import { useState, useMemo, useEffect } from "react"
import { ScrollView, View, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native"
import { router } from "expo-router"
import ActivityCard from "./ActivityCard"
import DonutChart from "./DonutChart"
import InterSemiBold from "../Text/InterSemiBold"
import InterRegular from "../Text/InterRegular"
import TransactionList from "../history/HistoryList"
import historyHeader from "../../constants/historyHeader"
import Button from "../common/Button"
import { MyListings } from "./MyListings"
import { useApi } from "@/contexts/ApiContext"
import useTransactions from "@/hooks/useTransactions"
import { useCurrency } from "@/contexts/CurrencyContext"
import { stablecoinUnitsToUsd } from "@/constants/exchangeRates"
import { Action } from "@/types/contract"
import { isClosedPhase } from "@/types/transaction"
import { usePullToRefresh } from "@/hooks/usePullToRefresh"

const SellerActivities = () => {
  const { user, getMe, isLoading, getSchedule, schedule } = useApi()
  const { formatPrice } = useCurrency()
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(0)
  const [activeHistoryItem, setActiveHistoryItem] = useState("Ongoing")
  const [refreshing, setRefreshing] = useState(false)
  const [scheduleChecked, setScheduleChecked] = useState(false)

  const {
    transactions,
    ongoing,
    completed,
    cancelled,
    loading: txLoading,
    error: txError,
    refresh: refreshTransactions,
    updatePhase,
  } = useTransactions()

  useEffect(() => {
    getMe({ silent: true })
  }, [getMe])

  // A seller with no published viewing hours is silently unbookable: the
  // backend rejects every requested time with 404, and the buyer is told to
  // message them instead. Nothing surfaced that to the seller, so check once
  // here and prompt if they haven't set any.
  useEffect(() => {
    getSchedule()
      .catch(() => { })
      .finally(() => setScheduleChecked(true))
  }, [getSchedule])

  const hasNoViewingHours = scheduleChecked && (schedule?.length ?? 0) === 0

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([getMe(), refreshTransactions()])
    setRefreshing(false)
  }

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the screen is returned to — which matters most here,
  // since this is where a seller waits on buyer actions.
  usePullToRefresh(onRefresh)

  // Derived property data from user listings
  const propertiesData = useMemo(() => {
    if (!user?.listing) return [
      { label: "Total Homes", value: 0, color: "#C1272D", percentage: 0 },
      { label: "Rented Homes", value: 0, color: "#00BCD4", percentage: 0 },
      { label: "Vacant homes", value: 0, color: "#FFC107", percentage: 0 },
    ]

    const total = user.listing.length
    const rented = user.listing.filter(p => p.status === 'rented').length
    const vacant = user.listing.filter(p => p.status === 'available').length

    return [
      {
        label: "Total Homes",
        value: total,
        color: "#C1272D",
        percentage: total > 0 ? 100 : 0,
      },
      {
        label: "Rented Homes",
        value: rented,
        color: "#00BCD4",
        percentage: total > 0 ? Math.round((rented / total) * 100) : 0,
      },
      {
        label: "Vacant homes",
        value: vacant,
        color: "#FFC107",
        percentage: total > 0 ? Math.round((vacant / total) * 100) : 0,
      },
    ]
  }, [user?.listing])

  // Revenue derived from real on-chain/backend transactions, shown in the
  // user's selected display currency (not hardcoded Naira).
  const revenueData = useMemo(() => {
    // Revenue follows the escrow, not the tab. Funds reach the seller at
    // release_escrow (PAYMENT_RELEASED); complete_transaction afterwards is
    // bookkeeping. Reading the full list through isClosedPhase instead of the
    // Active tab's `completed` therefore counts a paid-out deal before it's
    // finalized, and keeps counting a lease after its term ends — `completed`
    // drops expired leases into the Expired tab, which was quietly deleting
    // collected rent from this total.
    const sellerSettled = transactions.filter(
      (t) => t.role === "seller" && isClosedPhase(t)
    )
    // Anything still in flight. Excluding settled deals matters: they appear
    // in `ongoing` until completed, so without this they'd be counted as both
    // collected and pending.
    const sellerAwaiting = ongoing.filter(
      (t) => t.role === "seller" && !isClosedPhase(t)
    )

    const sumUsd = (txs: typeof sellerSettled) =>
      txs.reduce(
        (sum, t) => sum + stablecoinUnitsToUsd(parseInt(t.bid.bid_amount, 10) || 0),
        0
      )

    const totalRevenueUsd = sumUsd(sellerSettled)
    const rentCollectedUsd = sumUsd(
      sellerSettled.filter((t) => t.bid.action === Action.Lease)
    )
    const pendingRentUsd = sumUsd(
      sellerAwaiting.filter((t) => t.bid.action === Action.Lease)
    )

    return [
      {
        label: "Total revenue",
        value: formatPrice(totalRevenueUsd),
        color: "#C1272D",
        percentage: totalRevenueUsd > 0 ? 100 : 0,
      },
      {
        label: "Rent Collected",
        value: formatPrice(rentCollectedUsd),
        color: "#00BCD4",
        percentage:
          totalRevenueUsd > 0 ? Math.round((rentCollectedUsd / totalRevenueUsd) * 100) : 0,
      },
      {
        label: "Pending Rent",
        value: formatPrice(pendingRentUsd),
        color: "#FFC107",
        percentage:
          rentCollectedUsd + pendingRentUsd > 0
            ? Math.round((pendingRentUsd / (rentCollectedUsd + pendingRentUsd)) * 100)
            : 0,
      },
    ]
  }, [transactions, ongoing, formatPrice])

  const handleViewAllRevenue = () => {
    console.log("View all revenue pressed")
  }

  const handleHistoryClick = (index: number, item: any) => {
    setActiveHistoryIndex(index)
    setActiveHistoryItem(item)
  }

  // Get current transaction list based on active tab
  const currentTransactions = useMemo(() => {
    switch (activeHistoryItem) {
      case "Ongoing":
        return ongoing
      case "Active":
        return completed
      case "Cancelled":
        return cancelled
      default:
        return []
    }
  }, [activeHistoryItem, ongoing, completed, cancelled])

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Unbookable-seller prompt. Without published hours the backend
          rejects every viewing request, so this is a hard blocker on the
          buyer's side that the seller would otherwise never see. */}
      {hasNoViewingHours && (
        <TouchableOpacity
          onPress={() => router.push("/availability")}
          className="mb-4 p-4 rounded-lg"
          style={{ backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" }}
        >
          <InterSemiBold className="text-sm mb-1" style={{ color: "#92400E" }}>
            Set your viewing hours
          </InterSemiBold>
          <InterRegular className="text-sm" style={{ color: "#B45309" }}>
            Buyers can't book a viewing on your listings until you publish the
            hours you're available. Tap to set them up.
          </InterRegular>
        </TouchableOpacity>
      )}

      {/* Revenue Card */}
      <ActivityCard title="Revenue" showViewAll={true} onViewAllPress={handleViewAllRevenue}>
        <DonutChart data={revenueData} />
      </ActivityCard>

      {/* Properties Card */}
      <ActivityCard title="Properties">
        <DonutChart data={propertiesData} />
      </ActivityCard>

      {/* History Section */}
      <View className="bg-white rounded-lg p-4 md:p-6 mx-1 mb-10 shadow-sm border border-borderColor">
        <InterSemiBold className="text-lg md:text-xl mb-4">Transaction History</InterSemiBold>

        {/* History Tabs */}
        <View className="flex flex-row flex-nowrap justify-between gap-2 mb-4 w-full">
          {historyHeader.map((item, index) => (
            <Button
              key={index}
              color={activeHistoryIndex === index ? "#C1272D" : "#C1272D0A"}
              onPress={() => handleHistoryClick(index, item)}
              className="flex-1 rounded-lg px-1 py-2"
            >
              <InterRegular
                className={`text-center text-[10px] sm:text-xs ${activeHistoryIndex === index ? "text-white" : "text-secondaryText"
                  }`}
              >
                {item}
              </InterRegular>
            </Button>
          ))}
        </View>

        {/* History Content */}
        <View className="mt-4">
          {/* A partial read failure still has rows worth showing — warn above
              the list rather than replacing it. `hadReadFailure` is set when
              *any* bid read fails, which on a seller with several listings is
              routine, and it was hiding every transaction that did load. The
              revenue widget above reads the same data with no error gate,
              which is how it could report pending rent while the list below
              claimed nothing could be loaded. Mirrors history/index.tsx. */}
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
              <TouchableOpacity
                className="bg-primary rounded-lg px-6 py-2"
                onPress={refreshTransactions}
              >
                <InterRegular className="text-white text-sm">Retry</InterRegular>
              </TouchableOpacity>
            </View>
          ) : txLoading && currentTransactions.length === 0 ? (
            // Only stand in for content that isn't there yet. This used to be
            // `(txLoading || isLoading) && !refreshing`, which hid transactions
            // that were already loaded:
            //   - `isLoading` is ApiContext's *global* flag, set by any
            //     non-silent API call anywhere in the app — including this
            //     screen's own getMe() on pull-to-refresh — so unrelated
            //     requests blanked the list.
            //   - `txLoading` goes true on every useTransactions refresh, so
            //     the 60s poll replaced a populated list with a spinner once a
            //     minute.
            // The revenue widget above reads the same `ongoing` array without
            // either gate, which is why it could show pending rent while the
            // list below it appeared to be still loading.
            <ActivityIndicator color="#C1272D" />
          ) : currentTransactions.length > 0 ? (
            <TransactionList
              transactions={currentTransactions}
              onPhaseUpdate={updatePhase}
              cardType={
                activeHistoryItem === "Active" ? "active" :
                  activeHistoryItem === "Cancelled" ? "cancelled" :
                    "ongoing"
              }
            />
          ) : (
            <View className="py-8 items-center">
              <InterRegular className="text-secondaryText text-center">
                No {activeHistoryItem.toLowerCase()} transactions found
              </InterRegular>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  )
}

export default SellerActivities

