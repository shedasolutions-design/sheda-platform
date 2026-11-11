"use client";

/* eslint-disable @next/next/no-img-element -- property media comes from arbitrary hosts */
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useWallet } from "@/contexts/WalletContext";
import nearContractService from "@/services/nearContract";
import type { PropertyView } from "@/types/contract";
import { StepFrame } from "./ListingParts";

/**
 * List a property already held on-chain instead of minting a duplicate: the
 * contract mints a fresh NFT on every mint call. Only properties that can be
 * listed are offered — not already for sale, and not under a running lease.
 */
export default function OwnedPropertyPicker({
  onSelect,
  onCreateNew,
  onBack,
}: {
  onSelect: (property: PropertyView) => void;
  onCreateNew: () => void;
  onBack: () => void;
}) {
  const { walletState, currentNetwork } = useWallet();
  const accountId = walletState.account?.accountId;
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [loading, setLoading] = useState(!!accountId);
  const [error, setError] = useState<string | null>(null);

  // Only sets state after the first await, so it can run straight from an effect.
  const fetchOwned = useCallback(async () => {
    if (!accountId) return;
    try {
      await nearContractService.initialize(currentNetwork);
      const result = await nearContractService.getMyProperties(accountId);
      if (!result.success || !result.data) throw new Error(result.error || "Could not load your properties");
      setProperties(result.data.filter((p) => !p.is_for_sale && !p.active_lease));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your properties");
    } finally {
      setLoading(false);
    }
  }, [accountId, currentNetwork]);

  useEffect(() => {
    fetchOwned();
  }, [fetchOwned]);

  const retry = () => {
    setLoading(true);
    setError(null);
    fetchOwned();
  };

  return (
    <StepFrame title="Create a listing" onBack={onBack}>
      <p className="mb-4 text-sm text-secondaryText">List a property you already own, or add a new one.</p>
      {loading ? (
        <div className="flex flex-col items-center py-10 text-sm text-secondaryText">
          <Spinner size={32} />
          <p className="mt-3">Checking properties you own…</p>
        </div>
      ) : error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
          <p className="mb-2 text-red-600">{error}</p>
          <button type="button" onClick={retry} className="text-red-800 underline">
            Try again
          </button>
        </div>
      ) : properties.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-secondaryText">Properties you own</h2>
          <ul className="space-y-2">
            {properties.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="flex w-full items-center gap-3 rounded-xl border border-borderColor p-3 text-left hover:border-primary hover:bg-primaryLight"
                >
                  {p.metadata_uri ? (
                    <img src={p.metadata_uri} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-gray-400">
                      No image
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.description || `Property #${p.id}`}</span>
                    <span className="text-xs text-secondaryText">Not currently listed · reuses your existing NFT</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-6 rounded-xl bg-cardBackground p-4 text-sm text-secondaryText">
          {accountId
            ? "You don't have any unlisted properties yet. Properties you buy on Sheda show up here, ready to relist without minting again."
            : "Set up your wallet from your profile to see properties you own on-chain."}
        </p>
      )}
      <Button full onClick={onCreateNew}>
        Add a new property
      </Button>
      <p className="mt-2 text-center text-xs text-secondaryText">Mints a new property NFT to your wallet.</p>
    </StepFrame>
  );
}
