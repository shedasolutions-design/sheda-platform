"use client";

import { useCallback, useEffect, useState } from "react";
import { Home } from "lucide-react";
import HouseCard, { PropertySkeletonList } from "@/components/property/HouseCard";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import { useNearContract } from "@/hooks/useNearContract";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import nearContractService from "@/services/nearContract";
import { adaptPropertyToHouse } from "@/utilities/adapter";

interface Dialog {
  type: FeedbackType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** The seller's listings, with delist/relist and delete. */
export function MyListings() {
  const { myListings, getMyListings, deleteProperty, updateProperty } = useApi();
  const { walletState } = useWallet();
  const { delistProperty, deleteProperty: deleteOnChain, updateListing } = useNearContract();
  const { run } = useTransactionToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Only sets state after the first await, so it can run straight from an effect.
  const fetchListings = useCallback(async () => {
    try {
      await getMyListings({ silent: true });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your listings.");
    } finally {
      setLoading(false);
    }
  }, [getMyListings]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const load = () => {
    setLoading(true);
    fetchListings();
  };

  const listings = (myListings ?? []).filter(Boolean);
  const find = (id: string) => listings.find((p) => p.id === parseInt(id, 10));
  const chainId = (id: string) => {
    const bc = find(id)?.blockchain_property_id;
    const n = bc != null ? parseInt(String(bc), 10) : NaN;
    return walletState.account?.accountId && !isNaN(n) ? n : null;
  };

  const confirmDelete = async (id: string) => {
    setDialog(null);
    try {
      await run({
        loadingMessage: "Deleting your listing...",
        successMessage: "Listing deleted.",
        notification: { type: "general", title: "Listing Deleted", message: "Your listing has been deleted." },
        action: async () => {
          const bc = chainId(id);
          if (bc != null) {
            const r = await deleteOnChain(bc);
            if (!r.success) throw new Error(r.error || "Couldn't delete this property on-chain, so it hasn't been removed. Please try again.");
          }
          await deleteProperty(parseInt(id, 10));
        },
      });
      load();
    } catch (err) {
      setDialog({
        type: "error",
        title: "Couldn't delete",
        message: err instanceof Error ? err.message : "Failed to delete listing. Please try again.",
        actionLabel: "Try again",
        onAction: () => askDelete(id),
      });
    }
  };

  const askDelete = (id: string) =>
    setDialog({
      type: "warning",
      title: "Delete listing",
      message:
        "Are you sure you want to permanently delete this property? This burns the NFT and removes all records. This can't be undone.",
      actionLabel: "Delete",
      onAction: () => confirmDelete(id),
    });

  const confirmDelist = async (id: string, delist: boolean) => {
    setDialog(null);
    try {
      await run({
        loadingMessage: delist ? "Delisting your property..." : "Relisting your property...",
        successMessage: delist ? "Property delisted from the marketplace." : "Property is back on the marketplace.",
        notification: {
          type: "general",
          title: delist ? "Property Delisted" : "Property Relisted",
          message: delist ? "Your property was removed from the marketplace." : "Your property is back on the marketplace.",
        },
        action: async () => {
          const bc = chainId(id);
          if (bc != null) {
            if (delist) {
              const r = await delistProperty(bc);
              if (!r.success) throw new Error(r.error || "Couldn't delist this property on-chain, so it's still on the market. Please try again.");
            } else {
              // Reuse the terms the chain already holds. The backend price is
              // in the seller's own currency, not the stablecoin units the
              // contract expects, so it can't be sent as-is.
              const current = await nearContractService.getPropertyById(bc);
              const onChain = current.success ? current.data : null;
              if (!onChain?.price) throw new Error("Couldn't read this property's price on-chain. Please list it again from List a property.");
              const r = await updateListing({
                property_id: bc,
                price: onChain.price,
                is_for_sale: true,
                lease_duration_days: onChain.lease_duration_days ?? null,
                damage_deposit_required:
                  onChain.damage_deposit_required && onChain.damage_deposit_required !== "0" ? onChain.damage_deposit_required : null,
              });
              if (!r.success) throw new Error(r.error || "Couldn't relist this property on-chain. Please try again.");
            }
          }
          await updateProperty(parseInt(id, 10), { is_active: !delist });
        },
      });
      load();
    } catch (err) {
      setDialog({
        type: "error",
        title: "Something went wrong",
        message: err instanceof Error ? err.message : "Operation failed. Please try again.",
        actionLabel: "Try again",
        onAction: () => askDelist(id),
      });
    }
  };

  const askDelist = (id: string) => {
    const active = find(id)?.is_active !== false;
    setDialog({
      type: "warning",
      title: active ? "Delist property" : "Relist property",
      message: active
        ? "This temporarily removes your property from the marketplace. You can relist it later."
        : "This puts your property back on the marketplace.",
      actionLabel: active ? "Delist" : "Relist",
      onAction: () => confirmDelist(id, active),
    });
  };

  return (
    <>
      {loading && listings.length === 0 ? (
        <PropertySkeletonList count={4} />
      ) : loadError && listings.length === 0 ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : listings.length === 0 ? (
        <EmptyState icon={<Home size={40} />} title="No listings yet" message="You haven't listed any properties yet." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((p) => (
            <li key={p.id}>
              <HouseCard house={adaptPropertyToHouse(p)} onDelete={askDelete} onDelist={askDelist} />
            </li>
          ))}
        </ul>
      )}
      <FeedbackModal
        isVisible={!!dialog}
        type={dialog?.type ?? "info"}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        actionLabel={dialog?.actionLabel}
        onAction={dialog?.onAction}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
