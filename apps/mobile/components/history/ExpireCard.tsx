import { View, TouchableOpacity, ActivityIndicator, Image, GestureResponderEvent } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import Button from "@/components/common/Button";
import { router } from "expo-router";
import Icon from "@/components/common/Icon";
import { LOCATION, BATH, BED } from "@/assets/icons";
import { Transaction, TransactionPhase } from "@/types/transaction";
import { Action } from "@/types/contract";
import { stablecoinUnitsToNaira } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useState, useCallback, useEffect } from "react";
import nearContractService from "@/services/nearContract";
import { NearContractService } from "@/services/nearContract";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import RatingModal from "@/components/RatingModal";
import DamageClaimModal from "@/components/history/DamageClaimModal";
import PriceDisplay from "@/components/common/PriceDisplay";
import { formatElapsed } from "@/utilities/formatDuration";

interface ExpireCardProps {
  transaction: Transaction;
  onPhaseUpdate: (
    bidId: number,
    propertyId: number,
    phase: TransactionPhase,
    extra?: any
  ) => Promise<void>;
}

/**
 * Renders a completed Lease transaction whose end_time has passed. This is
 * its own tab/card on purpose (not folded into ActiveCard's "expired"
 * urgency state) — an ongoing agreement and a closed-out one are different
 * records, and the actions available on each are different:
 *   - Seller: reclaim the property (on-chain expire_lease/completeLease —
 *     the NFT doesn't return to the owner automatically, someone has to
 *     call this after end_time passes), or accept a renewal the tenant
 *     already paid for (owner sees that offer as an "Accept Renewal"
 *     action on the matching OngoingCard, once the tenant pays below).
 *   - Tenant: pays for the next term the same way an initial bid is paid
 *     (placeBid, same amount/token/property, Action.Lease) — the contract
 *     doesn't need a special "this is a renewal" flag, it just needs the
 *     owner's accept_lease_renewal to see this bid comes from the account
 *     currently on the lease. There's no reissue/renew of the *previous*
 *     term's document — this produces its own new bid and, once accepted,
 *     its own new document.
 */
const ExpireCard = ({ transaction, onPhaseUpdate }: ExpireCardProps) => {
  const { bid, property, propertyDetails, role, expiresAt, leaseId } = transaction;
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { sendTransactionUpdate, getUserByWallet } = useApi();
  const { run: runTransaction } = useTransactionToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const { ngnPerUsd } = useExchangeRates();

  const title = propertyDetails?.title || property.description || "Property";
  const location = propertyDetails?.location || "—";
  const bedrooms = propertyDetails?.bedroom || 0;
  const bathrooms = propertyDetails?.bathroom || 0;
  const priceNaira = stablecoinUnitsToNaira(parseInt(bid.bid_amount) || 0, ngnPerUsd || 1500);
  const imageSource = propertyDetails?.images?.[0]?.image_url
    ? { uri: propertyDetails.images[0].image_url }
    : property.metadata_uri
      ? { uri: property.metadata_uri }
      : require("@/assets/images/apt-1.png");

  const handleDetailsNavigation = () => {
    if (propertyDetails?.id) {
      router.push({
        pathname: "/details/[id]",
        params: { id: String(propertyDetails.id) },
      });
    }
  };

  // ---- Security deposit still held for this tenancy ----
  //
  // Read from the lease rather than the property: the property only ever
  // records what the owner *asks* for, while the lease holds what was actually
  // taken and what is left after any claim.
  const [deposit, setDeposit] = useState<{ held: bigint; deadline: number } | null>(null);

  const [showClaim, setShowClaim] = useState(false);

  useEffect(() => {
    if (!leaseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await nearContractService.getLeaseById(Number(leaseId));
        const lease: any = res?.data;
        if (cancelled || !lease) return;
        const held = BigInt(lease.escrow_held ?? "0");
        if (held > 0n) {
          setDeposit({ held, deadline: Number(lease.damage_claim_deadline ?? 0) });
        }
      } catch {
        /* the card is still useful without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaseId]);

  const depositClaimable =
    !!deposit && Date.now() >= Math.floor(deposit.deadline / 1_000_000);

  // The owner's side of the deposit. Only reachable while the window is open —
  // past the deadline the money is the tenant's and the contract refuses.
  const depositClaimWindowOpen =
    !!deposit && Date.now() < Math.floor(deposit.deadline / 1_000_000);

  const handleRaiseDamageClaim = useCallback(
    async (amountAtomic: string, reason: string) => {
      if (!leaseId) return;
      try {
        setActionLoading(true);
        const privateKey = await getAuthorizedPrivateKey(
          walletState.account!.accountId
        );
        if (!privateKey) {
          Alert.alert("Error", "Could not access wallet keys.");
          return;
        }
        await nearContractService.initialize("testnet");
        const result = await runTransaction({
          loadingMessage: "Submitting your claim...",
          successMessage:
            "Your claim was submitted. An admin will review it and decide what is awarded.",
          errorMessage: (err) =>
            NearContractService.parseContractError(
              err?.message || "Failed to submit claim"
            ),
          action: async () => {
            const res = await nearContractService.raiseDamageClaim(
              walletState.account!.accountId,
              privateKey,
              { lease_id: Number(leaseId), amount: amountAtomic, reason }
            );
            if (!res.success) {
              throw new Error(
                NearContractService.parseContractError(
                  res.error || "Failed to submit claim"
                )
              );
            }
            return res;
          },
        }).catch(() => null);
        if (result) setShowClaim(false);
      } finally {
        setActionLoading(false);
      }
    },
    [leaseId, walletState.account, runTransaction, getAuthorizedPrivateKey]
  );

  const handleReclaimDeposit = useCallback(() => {
    if (!leaseId || !deposit) return;
    const amount = (Number(deposit.held) / 1_000_000).toFixed(2);
    Alert.alert(
      "Reclaim Deposit",
      `The owner's window to claim against your deposit has closed. Return $${amount} to your wallet?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reclaim",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }
              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Returning your deposit...",
                successMessage: `$${amount} has been returned to your wallet.`,
                errorMessage: (err) =>
                  NearContractService.parseContractError(
                    err?.message || "Failed to reclaim deposit"
                  ),
                action: async () => {
                  const res = await nearContractService.refundDamageDeposit(
                    walletState.account!.accountId,
                    privateKey,
                    { lease_id: Number(leaseId) }
                  );
                  if (!res.success) {
                    throw new Error(
                      NearContractService.parseContractError(
                        res.error || "Failed to reclaim deposit"
                      )
                    );
                  }
                  return res;
                },
              }).catch(() => null);
              if (result) setDeposit(null);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [leaseId, deposit, walletState.account, runTransaction]);

  const resolveCounterpartyUserId = async (): Promise<number | null> => {
    if (role === "buyer") {
      return propertyDetails?.agent_id ?? null;
    }
    try {
      const buyerInfo = await getUserByWallet(bid.bidder_id);
      return buyerInfo?.id ?? null;
    } catch (err) {
      console.warn("ExpireCard: Failed to resolve buyer's user id from wallet:", err);
      return null;
    }
  };

  // ---- Seller: reclaim the property now that the lease has ended ----
  const handleReclaimProperty = useCallback(() => {
    if (!leaseId) {
      Alert.alert(
        "Error",
        "Could not find the on-chain lease record for this property. Try refreshing and reopening this screen."
      );
      return;
    }

    Alert.alert(
      "Reclaim Property",
      `The lease for "${title}" has ended. Reclaim the property and mark the lease as complete?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reclaim",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Reclaiming property...",
                successMessage: `You've reclaimed "${title}". The lease is now complete.`,
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to reclaim property"),
                notification: {
                  type: "general",
                  title: "Lease Completed",
                  message: `You reclaimed "${title}" after the lease ended.`,
                },
                action: async () => {
                  const leaseResult = await nearContractService.completeLease(
                    walletState.account!.accountId,
                    privateKey,
                    { lease_id: leaseId, property_id: bid.property_id }
                  );
                  if (!leaseResult.success) {
                    throw new Error(NearContractService.parseContractError(leaseResult.error || "Failed to reclaim property"));
                  }
                  return leaseResult;
                },
              }).catch(() => null);

              if (result) {
                await onPhaseUpdate(bid.id, bid.property_id, TransactionPhase.COMPLETED);

                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(bid.id),
                    event: "lease_completed",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `The lease for "${title}" has ended and the property has been reclaimed.`,
                    metadata: {},
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to reclaim property"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [title, walletState, getAuthorizedPrivateKey, bid, leaseId, runTransaction, sendTransactionUpdate, onPhaseUpdate]);

  // ---- Tenant: pay for a renewal term ----
  // Same mechanism as an initial bid (placeBid -> ft_transfer_call), same
  // property/token/amount, Action.Lease. This just becomes a normal
  // Pending bid on-chain; the owner accepts it with accept_lease_renewal
  // once they see it (surfaced as "Accept Renewal" on OngoingCard when
  // that bid's bidder matches the property's current tenant).
  const handleRequestRenewal = useCallback(() => {
    Alert.alert(
      "Renew Lease",
      `Pay for another term on "${title}"? The owner will need to accept before it's finalized — your payment is held in escrow until then, same as an initial bid.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay & Renew",
          style: "default",
          onPress: async () => {
            try {
              setActionLoading(true);
              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize("testnet");
              const result = await runTransaction({
                loadingMessage: "Sending renewal payment...",
                successMessage: `Renewal payment sent for "${title}". Waiting for the owner to accept.`,
                errorMessage: (err) => NearContractService.parseContractError(err?.message || "Failed to request renewal"),
                notification: {
                  type: "general",
                  title: "Renewal Requested",
                  message: `You requested to renew "${title}".`,
                },
                action: async () => {
                  const bidResult = await nearContractService.placeBid(
                    walletState.account!.accountId,
                    privateKey,
                    bid.stablecoin_token,
                    bid.property_id,
                    bid.bid_amount,
                    Action.Lease
                  );
                  if (!bidResult.success) {
                    throw new Error(NearContractService.parseContractError(bidResult.error || "Failed to request renewal"));
                  }
                  return bidResult;
                },
              }).catch(() => null);

              if (result) {
                resolveCounterpartyUserId().then((recipientUserId) => {
                  if (!recipientUserId) return;
                  sendTransactionUpdate({
                    transaction_id: String(result.data ?? bid.id),
                    event: "bid_placed",
                    recipient_user_id: recipientUserId,
                    property_id: bid.property_id,
                    message: `Your tenant paid for a renewal of "${title}". Review it under Ongoing.`,
                    metadata: {
                      buyer_wallet_id: bid.bidder_id,
                      bid_amount: bid.bid_amount,
                      stablecoin_token: bid.stablecoin_token,
                      action: "lease",
                    },
                  }).catch(() => { });
                });
              }
            } catch (err: any) {
              Alert.alert("Error", NearContractService.parseContractError(err.message || "Failed to request renewal"));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [title, walletState, getAuthorizedPrivateKey, bid, runTransaction, sendTransactionUpdate]);

  return (
    <TouchableOpacity
      className="w-full rounded-lg bg-background"
      onPress={handleDetailsNavigation}
    >
      <View className="rounded-t-lg overflow-hidden">
        <Image
          source={imageSource}
          resizeMode="cover"
          style={{ width: "100%", height: 175, borderRadius: 8 }}
        />
        <View className="absolute top-3 right-3">
          <View className="bg-gray-700/90 px-3 py-1.5 rounded-full">
            <InterMedium className="text-white text-[11px]">
              {formatElapsed(expiresAt)}
            </InterMedium>
          </View>
        </View>
        <View className="absolute top-3 left-3">
          <View
            className={`px-2.5 py-1 rounded-full ${role === "seller" ? "bg-blue-100" : "bg-purple-100"}`}
          >
            <InterMedium
              className={`text-[10px] ${role === "seller" ? "text-blue-700" : "text-purple-700"}`}
            >
              {role === "seller" ? "Was Renting Out" : "Was Renting"}
            </InterMedium>
          </View>
        </View>
      </View>

      <View className="px-3 py-2 w-full">
        <InterMedium className="text-sm/5" numberOfLines={1}>{title}</InterMedium>

        <View className="mt-1 w-full">
          <View className="flex-row gap-2">
            <View className="flex-row items-center gap-1">
              <Icon icon={LOCATION} width={10} height={20} />
              <InterMedium className="text-[#878787BF] text-xs/[150%]">{location}</InterMedium>
            </View>
            {bedrooms > 0 && (
              <View className="flex-row items-center gap-1">
                <Icon icon={BED} width={20} height={20} />
                <InterMedium className="text-[#878787BF] text-xs/[150%]">{bedrooms} Bed</InterMedium>
              </View>
            )}
            {bathrooms > 0 && (
              <View className="flex-row items-center gap-1">
                <Icon icon={BATH} width={15} height={15} />
                <InterMedium className="text-[#878787BF] text-xs/[150%]">{bathrooms} Bath</InterMedium>
              </View>
            )}
          </View>
        </View>

        <View className="flex-row justify-between items-center mt-1">
          <PriceDisplay
            amountFiat={priceNaira}
            fiatCode="NGN"
            suffix="/yr"
            size="md"
            compact
          />
        </View>

        {/* The deposit is the tenant's money sitting in escrow — say so
            plainly, and say when they can take it, rather than leaving them to
            wonder whether it is coming back. */}
        {role === "seller" && deposit && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginTop: 8,
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <InterMedium style={{ fontSize: 12, color: "#111827" }}>
                ${(Number(deposit.held) / 1_000_000).toFixed(2)} deposit held
              </InterMedium>
              <InterRegular style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                {depositClaimWindowOpen
                  ? `Claim against it by ${new Date(
                      Math.floor(deposit.deadline / 1_000_000)
                    ).toLocaleDateString()}, or it returns to the tenant.`
                  : "The window to claim has closed — this is the tenant's to take back."}
              </InterRegular>
            </View>
            {depositClaimWindowOpen && (
              <Button
                color=""
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  setShowClaim(true);
                }}
                disabled={actionLoading}
              >
                <InterRegular style={{ color: "#C1272D", fontSize: 12 }}>Claim</InterRegular>
              </Button>
            )}
          </View>
        )}

        {role === "buyer" && deposit && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: depositClaimable ? "#ECFDF5" : "#F9FAFB",
              borderWidth: 1,
              borderColor: depositClaimable ? "#A7F3D0" : "#E5E7EB",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginTop: 8,
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <InterMedium style={{ fontSize: 12, color: "#111827" }}>
                ${(Number(deposit.held) / 1_000_000).toFixed(2)} security deposit
              </InterMedium>
              <InterRegular style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                {depositClaimable
                  ? "The owner's claim window has closed — this is yours to take back."
                  : `Held until the owner's claim window closes on ${new Date(
                      Math.floor(deposit.deadline / 1_000_000)
                    ).toLocaleDateString()}.`}
              </InterRegular>
            </View>
            {depositClaimable && (
              <Button
                color=""
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleReclaimDeposit();
                }}
                disabled={actionLoading}
              >
                <InterRegular style={{ color: "#047857", fontSize: 12 }}>Reclaim</InterRegular>
              </Button>
            )}
          </View>
        )}

        {role === "seller" && !transaction.leaseActiveOnChain && (
          <View className="mt-1 px-2 py-1.5 bg-green-50 rounded">
            <InterRegular className="text-[10px] text-green-700">
              Already reclaimed on-chain.
            </InterRegular>
          </View>
        )}
      </View>

      <View className="flex-row border-t border-borderColor">
        {actionLoading ? (
          <View className="flex-1 flex-row py-3 justify-center">
            <ActivityIndicator size="small" color="#C1272D" />
            <InterRegular className="ml-2 text-sm text-secondaryText">Processing...</InterRegular>
          </View>
        ) : role === "seller" ? (
          <>
            <View className="w-1/2 border-r border-borderColor">
              <Button
                color=""
                isFull
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleDetailsNavigation();
                }}
              >
                <InterRegular className="text-secondaryText">View Details</InterRegular>
              </Button>
            </View>
            <View className="w-1/2">
              <Button
                color=""
                isFull
                disabled={transaction.leaseActiveOnChain === false}
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleReclaimProperty();
                }}
              >
                <InterRegular
                  style={{ color: transaction.leaseActiveOnChain === false ? "#9CA3AF" : "#C1272D" }}
                >
                  Reclaim Property
                </InterRegular>
              </Button>
            </View>
          </>
        ) : (
          <>
            <View className="w-1/2 border-r border-borderColor">
              <Button
                color=""
                isFull
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  setShowRating(true);
                }}
              >
                <InterRegular style={{ color: "#F59E0B" }}>⭐ Rate Property</InterRegular>
              </Button>
            </View>
            <View className="w-1/2">
              <Button
                color=""
                isFull
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleRequestRenewal();
                }}
              >
                <InterRegular style={{ color: "#C1272D" }}>Pay & Renew</InterRegular>
              </Button>
            </View>
          </>
        )}
      </View>

      <DamageClaimModal
        visible={showClaim}
        onClose={() => setShowClaim(false)}
        depositHeld={deposit ? String(deposit.held) : "0"}
        deadline={deposit?.deadline ?? 0}
        submitting={actionLoading}
        onSubmit={handleRaiseDamageClaim}
      />

      <RatingModal
        visible={showRating}
        onClose={() => setShowRating(false)}
        propertyId={bid.property_id}
        propertyTitle={title}
      />
    </TouchableOpacity>
  );
};

export default ExpireCard;
