import { useEffect, useState, useCallback } from "react";
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import BackBtn from "@/components/common/BackBtn";
import { useWallet } from "@/contexts/WalletContext";
import nearContractService from "@/services/nearContract";
import type { PropertyView } from "@/types/contract";

interface OwnedPropertyPickerProps {
  /** User picked an existing property to list — no minting needed. */
  onSelect: (property: PropertyView) => void;
  /** User wants a brand-new listing, which mints a fresh NFT. */
  onCreateNew: () => void;
  onBack: () => void;
}

/**
 * Lets a seller list a property they already hold on-chain instead of minting
 * a duplicate.
 *
 * This exists because the contract mints a new NFT on every `mint_property`
 * call with no dedup — so a resale used to create a second token for a
 * property that already existed. Anything shown here is listed via
 * `update_listing`, which reuses the existing token.
 *
 * Only properties the user can actually act on are offered:
 *   - already listed → nothing to do, and update_listing would just edit it
 *   - actively leased → the contract refuses while a lease is running
 * Both are filtered out rather than shown-and-rejected, so the user never
 * picks something that's going to fail on-chain.
 */
export default function OwnedPropertyPicker({
  onSelect,
  onCreateNew,
  onBack,
}: OwnedPropertyPickerProps) {
  const { walletState, currentNetwork } = useWallet();
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accountId = walletState.account?.accountId;

  const load = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await nearContractService.initialize(currentNetwork);
      const result = await nearContractService.getMyProperties(accountId);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Could not load your properties");
      }
      const relistable = result.data.filter(
        (p) => !p.is_for_sale && !p.active_lease
      );
      setProperties(relistable);
    } catch (err: any) {
      // Distinguish "you own nothing listable" from "we couldn't check" —
      // silently showing an empty list would push the user into minting a
      // duplicate of something they already own.
      setError(err?.message || "Could not load your properties");
    } finally {
      setLoading(false);
    }
  }, [accountId, currentNetwork]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-5 py-5 flex-row items-center gap-4">
        <BackBtn onPress={onBack} />
        <InterSemiBold className="text-lg/5">Create a listing</InterSemiBold>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <InterRegular className="text-secondaryText text-sm mb-4">
          List a property you already own, or add a new one.
        </InterRegular>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color="#C1272D" />
            <InterRegular className="text-secondaryText text-sm mt-3">
              Checking properties you own...
            </InterRegular>
          </View>
        ) : error ? (
          <View className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
            <InterRegular className="text-red-600 text-xs mb-3">{error}</InterRegular>
            <TouchableOpacity onPress={load}>
              <InterRegular className="text-red-800 text-xs underline">
                Try again
              </InterRegular>
            </TouchableOpacity>
          </View>
        ) : properties.length > 0 ? (
          <View className="mb-6">
            <InterMedium className="text-xs text-secondaryText uppercase tracking-wider mb-2">
              Properties you own
            </InterMedium>
            {properties.map((property) => (
              <TouchableOpacity
                key={property.id}
                onPress={() => onSelect(property)}
                className="flex-row items-center gap-3 p-3 mb-2 border border-borderColor rounded-xl"
              >
                {property.metadata_uri ? (
                  <Image
                    source={{ uri: property.metadata_uri }}
                    style={{ width: 52, height: 52, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{ width: 52, height: 52, borderRadius: 8 }}
                    className="bg-gray-100 items-center justify-center"
                  >
                    <InterRegular className="text-gray-400 text-[10px]">
                      No image
                    </InterRegular>
                  </View>
                )}
                <View className="flex-1">
                  <InterMedium className="text-sm" numberOfLines={1}>
                    {property.description || `Property #${property.id}`}
                  </InterMedium>
                  <InterRegular className="text-[11px] text-secondaryText">
                    Not currently listed · reuses your existing NFT
                  </InterRegular>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View className="p-4 bg-gray-50 rounded-xl mb-6">
            <InterRegular className="text-secondaryText text-xs">
              You don't have any unlisted properties yet. Properties you buy on
              Sheda show up here, ready to relist without minting again.
            </InterRegular>
          </View>
        )}

        <Button isFull className="rounded-xl" onPress={onCreateNew}>
          <InterSemiBold className="text-white">Add a new property</InterSemiBold>
        </Button>
        <InterRegular className="text-[11px] text-secondaryText text-center mt-2">
          Mints a new property NFT to your wallet.
        </InterRegular>
      </ScrollView>
    </View>
  );
}
