"use client";

import { DealCard, DealMedia, Badge, RoleBadge, DealFacts, DealActions, DealAction, dealImage } from "@/components/history/DealCardParts";
import Alert from "@/utilities/alertPolyfill";
import { router } from "@/lib/router";
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
import PriceDisplay from "@/components/property/PriceDisplay";
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
      : { uri: "/images/apt-1.png" };

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

  const until = (ns: number) => new Date(Math.floor(ns / 1_000_000)).toLocaleDateString();

  return (
    <DealCard>
      <DealMedia
        src={dealImage(imageSource)}
        alt={title}
        onOpen={handleDetailsNavigation}
        badges={
          <>
            <Badge className="absolute left-3 top-3 bg-gray-800/80 !text-[11px] text-white">{formatElapsed(expiresAt)}</Badge>
            <Badge className="absolute right-3 top-3 bg-gray-100 text-gray-700">{role === "seller" ? "Was Renting Out" : "Was Renting"}</Badge>
          </>
        }
      />
      <div className="px-3 py-2">
        <DealFacts title={title} location={location} bedrooms={bedrooms} bathrooms={bathrooms} />
        <div className="mt-1">
          <PriceDisplay amountFiat={priceNaira} fiatCode="NGN" suffix="/yr" compact />
        </div>

        {/* The deposit is the tenant's money in escrow: say when it can be taken. */}
        {role === "seller" && deposit && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <div>
              <p className="text-xs font-medium text-gray-900">${(Number(deposit.held) / 1_000_000).toFixed(2)} deposit held</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {depositClaimWindowOpen
                  ? `Claim against it by ${until(deposit.deadline)}, or it returns to the tenant.`
                  : "The window to claim has closed. This is the tenant's to take back."}
              </p>
            </div>
            {depositClaimWindowOpen && (
              <button type="button" onClick={() => setShowClaim(true)} disabled={actionLoading} className="shrink-0 px-2 text-xs text-primary hover:underline disabled:opacity-50">
                Claim
              </button>
            )}
          </div>
        )}
        {role === "buyer" && deposit && (
          <div
            className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
              depositClaimable ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div>
              <p className="text-xs font-medium text-gray-900">${(Number(deposit.held) / 1_000_000).toFixed(2)} security deposit</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {depositClaimable
                  ? "The owner's claim window has closed. This is yours to take back."
                  : `Held until the owner's claim window closes on ${until(deposit.deadline)}.`}
              </p>
            </div>
            {depositClaimable && (
              <button type="button" onClick={handleReclaimDeposit} disabled={actionLoading} className="shrink-0 px-2 text-xs text-emerald-700 hover:underline disabled:opacity-50">
                Reclaim
              </button>
            )}
          </div>
        )}
        {role === "seller" && !transaction.leaseActiveOnChain && <p className="mt-1 text-[10px] text-green-700">Already reclaimed on-chain.</p>}
      </div>

      <DealActions loading={actionLoading}>
        {role === "seller" ? (
          <>
            <DealAction onClick={handleDetailsNavigation}>View Details</DealAction>
            <DealAction onClick={handleReclaimProperty} color="#C1272D" disabled={transaction.leaseActiveOnChain === false}>
              Reclaim Property
            </DealAction>
          </>
        ) : (
          <>
            <DealAction onClick={() => setShowRating(true)} color="#F59E0B">
              ⭐ Rate Seller
            </DealAction>
            <DealAction onClick={handleRequestRenewal} color="#C1272D">
              Pay &amp; Renew
            </DealAction>
          </>
        )}
      </DealActions>

      <DamageClaimModal
        visible={showClaim}
        onClose={() => setShowClaim(false)}
        depositHeld={deposit ? String(deposit.held) : "0"}
        deadline={deposit?.deadline ?? 0}
        submitting={actionLoading}
        onSubmit={handleRaiseDamageClaim}
      />
      <RatingModal visible={showRating} onClose={() => setShowRating(false)} sellerId={propertyDetails?.agent_id ?? null} propertyTitle={title} />
    </DealCard>
  );
};

export default ExpireCard;
