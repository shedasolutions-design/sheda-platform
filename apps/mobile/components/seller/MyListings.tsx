import { View, RefreshControl, ScrollView, Alert } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import { useNearContract } from "@/hooks/useNearContract";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import HouseCard from "../HouseCard";
import LoadingSkeleton from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import { PropertyShow } from "@/services/api";
import FeedbackModal from "../common/FeedbackModal";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface MyListingsProps {
  scrollEnabled?: boolean;
}

export const MyListings = ({ scrollEnabled = true }: MyListingsProps) => {
  const { myListings, getMyListings, deleteProperty, updateProperty, isLoading = false, error } = useApi();
  const { walletState } = useWallet();
  const { delistProperty: delistPropertyOnChain, deleteProperty: deletePropertyOnChain, updateListing } = useNearContract();
  const { run: runTransaction } = useTransactionToast();
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
    actionColor?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const loadListings = useCallback(async () => {
    try {
      await getMyListings();
    } catch (e) {
      console.error(e);
    }
  }, [getMyListings]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadListings();
    setRefreshing(false);
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the screen is returned to.
  usePullToRefresh(onRefresh);

  // ─── DELETE (permanent – burns NFT + removes backend record) ───
  const handleDelete = (id: string) => {
    setFeedback({
      visible: true,
      type: "warning",
      title: "Delete Listing",
      message: "Are you sure you want to permanently delete this property? This will burn the NFT and remove all records. This action cannot be undone.",
      actionLabel: "Delete",
      actionColor: "#EF4444",
      onAction: () => confirmDelete(id),
    });
  };

  const confirmDelete = async (id: string) => {
    setFeedback(prev => ({ ...prev, visible: false }));
    try {
      // Non-blocking toast (contexts/ToastContext.tsx) instead of a blocking
      // "loading" FeedbackModal — this wraps the whole chain-then-backend
      // sequence, which is the single operation the user is waiting on.
      await runTransaction({
        loadingMessage: "Deleting your listing...",
        successMessage: "Listing deleted successfully.",
        notification: {
          type: "general",
          title: "Listing Deleted",
          message: "Your listing has been deleted.",
        },
        action: async () => {
          // Find the property to check for blockchain data
          const property = myListings?.find(p => p?.id === parseInt(id));

          // 1. Delete from smart contract if NFT was minted.
          //
          // A failure here used to be logged and swallowed, and the backend
          // delete ran regardless. That's how a listing could disappear from
          // the app while the NFT and any escrow-holding bids stayed on-chain
          // — with the property gone from our side, nobody could reject or
          // cancel those bids, so the bidders' funds had nothing left to
          // settle against.
          //
          // The chain is the source of truth for ownership and escrow, so it
          // has to succeed first. The contract refuses the delete while any
          // bid still holds funds and says which ones, so surfacing that error
          // tells the seller exactly what to resolve.
          if (property?.blockchain_property_id && walletState.account?.accountId) {
            const bcId = parseInt(property.blockchain_property_id);
            if (!isNaN(bcId)) {
              console.log("🔥 Deleting property from blockchain, ID:", bcId);
              const result = await deletePropertyOnChain(bcId);
              if (!result.success) {
                throw new Error(
                  result.error ||
                  "Couldn't delete this property on-chain, so it hasn't been removed. Please try again."
                );
              }
            }
          }

          // 2. Delete from backend — only once the chain agrees it's gone.
          await deleteProperty(parseInt(id));
        },
      });

      loadListings();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: err?.message || "Failed to delete listing. Please try again.",
        actionLabel: "Try Again",
        onAction: () => handleDelete(id)
      });
    }
  };

  // ─── DELIST (temporary – removes from sale/lease, keeps NFT) ───
  const handleDelist = (id: string) => {
    const property = myListings?.find(p => p?.id === parseInt(id));
    const isCurrentlyActive = property?.is_active !== false;

    setFeedback({
      visible: true,
      type: "warning",
      title: isCurrentlyActive ? "Delist Property" : "Relist Property",
      message: isCurrentlyActive
        ? "This will temporarily remove your property from the marketplace. You can relist it later."
        : "This will put your property back on the marketplace.",
      actionLabel: isCurrentlyActive ? "Delist" : "Relist",
      actionColor: isCurrentlyActive ? "#F59E0B" : "#10B981",
      onAction: () => confirmDelist(id, isCurrentlyActive),
    });
  };

  const confirmDelist = async (id: string, shouldDelist: boolean) => {
    setFeedback(prev => ({ ...prev, visible: false }));
    try {
      await runTransaction({
        loadingMessage: shouldDelist ? "Delisting your property..." : "Relisting your property...",
        successMessage: shouldDelist
          ? "Property delisted from the marketplace."
          : "Property is back on the marketplace.",
        notification: {
          type: "general",
          title: shouldDelist ? "Property Delisted" : "Property Relisted",
          message: shouldDelist
            ? "Your property was removed from the marketplace."
            : "Your property is back on the marketplace.",
        },
        action: async () => {
          const property = myListings?.find(p => p?.id === parseInt(id));

          // 1. Move the chain first, in both directions.
          //
          // Delisting used to log a chain failure and update the backend
          // anyway, which is worse than it sounds: the seller sees the
          // property come off the market while it stays for sale on-chain, so
          // buyers can keep bidding on it — and every bid locks their
          // stablecoins in escrow against a property the seller thinks is
          // gone. The contract also refuses to delist while bids are already
          // holding funds, which is exactly the case that was being swallowed.
          //
          // Relisting didn't touch the chain at all, so a property delisted
          // and then relisted came back in the app while the contract still
          // had is_for_sale = false — it looked available and no bid could be
          // placed on it. update_listing is what puts it back on sale.
          if (property?.blockchain_property_id && walletState.account?.accountId) {
            const bcId = parseInt(property.blockchain_property_id);
            if (!isNaN(bcId)) {
              if (shouldDelist) {
                console.log("📦 Delisting property from blockchain, ID:", bcId);
                const result = await delistPropertyOnChain(bcId);
                if (!result.success) {
                  throw new Error(
                    result.error ||
                    "Couldn't delist this property on-chain, so it's still on the market. Please try again."
                  );
                }
              } else {
                console.log("📦 Relisting property on blockchain, ID:", bcId);
                const result = await updateListing({
                  property_id: bcId,
                  price: String(property.price ?? "0"),
                  is_for_sale: true,
                  lease_duration_days: property.lease_duration_days ?? null,
                });
                if (!result.success) {
                  throw new Error(
                    result.error ||
                    "Couldn't relist this property on-chain, so it's not back on the market yet. Please try again."
                  );
                }
              }
            }
          }

          // 2. Update backend: toggle is_active — only once the chain agrees.
          await updateProperty(parseInt(id), { is_active: !shouldDelist });
        },
      });

      loadListings();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: err?.message || "Operation failed. Please try again.",
        actionLabel: "Try Again",
        onAction: () => handleDelist(id)
      });
    }
  };

  const closeFeedback = () => {
    setFeedback(prev => ({ ...prev, visible: false }));
  };

  const content = (
    <>
      {isLoading && !refreshing ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={onRefresh} />
      ) : !myListings || myListings.length === 0 ? (
        <EmptyState
          onRefresh={onRefresh}
          title="No Listings Yet"
          message="You haven't listed any properties yet."
        />
      ) : (
        <View className="flex-row flex-wrap gap-3 px-2 pb-6">
          {myListings.filter(p => p !== null).map((property, index) => (
            <Animated.View
              key={property.id}
              className="w-full lg:w-[49%]"
              entering={FadeInDown.delay(index * 100)}
              exiting={FadeOut}
              layout={LinearTransition}
            >
              <HouseCard
                house={adaptPropertyToHouse(property)}
                onDelete={handleDelete}
                onDelist={handleDelist}
              />
            </Animated.View>
          ))}
        </View>
      )}

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        actionColor={feedback.actionColor}
        onClose={closeFeedback}
      />
    </>
  );

  if (!scrollEnabled) {
    return <View>{content}</View>;
  }

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {content}
    </ScrollView>
  );
};
