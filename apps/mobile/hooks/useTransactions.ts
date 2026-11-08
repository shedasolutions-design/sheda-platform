/**
 * useTransactions Hook
 *
 * On-chain is the source of truth for WHICH transactions exist and their
 * core lifecycle stage — the backend's `/api/v1/transactions` table is a
 * best-effort mirror populated by the client itself after each successful
 * on-chain action (see sendTransactionUpdate call sites), so it can never
 * be more authoritative than chain data, only less. A backend response that
 * comes back empty (wallet↔user mapping not registered yet, an older bid
 * predating the sync calls, a sync call that silently failed, ...) must
 * never be treated as "confirmed no transactions."
 *
 * So: fetch on-chain (buyer bids + seller bids-on-owned-properties) and the
 * backend feed concurrently. Build the list from on-chain results; where a
 * backend entry matches (by bid_id/property_id), use it to enrich with
 * nicer property/counterparty data and the appointment_status overlay
 * (appointment booked/accepted/rejected has no on-chain BidStatus — it's
 * backend-only, written by OngoingCard.tsx / app/book-appointment's
 * sendTransactionUpdate calls). If on-chain fails entirely (rare — only
 * happens if every RPC endpoint is unreachable), fall back to backend-only
 * data so something still shows instead of a hard error.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import nearContractService from "@/services/nearContract";
import { NearContractService } from "@/services/nearContract";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { BidView, BidStatus, PropertyView, Action } from "@/types/contract";
import api, { PropertyShow, TransactionFeedItem } from "@/services/api";
import {
    resolveBackendProperties,
    getBackendPropertyCache,
} from "@/services/backendPropertyLookup";
import {
    Transaction,
    TransactionPhase,
    makeTransactionKey,
    mapBidStatusToPhase,
    partitionTransactions,
} from "@/types/transaction";
import { readCachedList, writeCachedList, LIST_CACHE_SCOPES } from "@/services/listCache";

interface UseTransactionsReturn {
    /** All transactions for the current user */
    transactions: Transaction[];
    /** Ongoing transactions (active phases) */
    ongoing: Transaction[];
    /** Completed transactions — excludes leases whose end_time has passed, see `expired` */
    completed: Transaction[];
    /** Completed Lease transactions whose real (or estimated) expiresAt has passed */
    expired: Transaction[];
    /** Cancelled/rejected transactions */
    cancelled: Transaction[];
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** Refresh transactions */
    refresh: () => Promise<void>;
    /** Update a transaction's phase in-memory (after on-chain call succeeds) */
    updatePhase: (
        bidId: number,
        propertyId: number,
        phase: TransactionPhase
    ) => Promise<void>;
}

/**
 * Lease expiry info for a completed bid — Purchase bids never get any of
 * this (a bought property doesn't expire). Prefers the real on-chain
 * property.active_lease (authoritative end_time/lease id/active flag) when
 * it's present and actually belongs to this bid's tenant. property's own
 * lease_duration_months (also real on-chain data, set at mint_property
 * time) is used for the displayed duration — there's no
 * "rental_period_months" anywhere in the backend's property schema, so
 * this used to silently default to a hardcoded 12 regardless of what the
 * property was actually configured for.
 *
 * If active_lease doesn't match (already reclaimed, re-leased to someone
 * else, or the property fetch just didn't carry lease data — the backend
 * fallback path below always builds a synthetic PropertyView with
 * active_lease null), this falls back to an estimate from
 * completedAt + duration. The caller then tries to upgrade that estimate
 * with a real get_lease_by_id(bid.lease_id) lookup — see
 * enrichLeaseExpiryFromChain below — whenever bid.lease_id is available;
 * the estimate here is what's shown until/unless that lookup succeeds.
 */
/**
 * The lease term, as a count of days.
 *
 * This used to convert from nanoseconds, because the view was called
 * `lease_duration_nanos` — but it carried the month count unconverted, so
 * dividing by nanoseconds-per-month collapsed every term to zero and the
 * `Math.max(1, ...)` floor turned that into "1 month". A twelve-month lease
 * read as a one-month lease, and both sides were shown an expiry eleven months
 * early. The field is `lease_duration_days` now and needs no conversion.
 */
function leaseDurationDays(days?: number | null): number | undefined {
    if (days == null || days <= 0) return undefined;
    return days;
}

function computeLeaseExpiry(
    bid: BidView,
    property: PropertyView | undefined,
    completedAt: number | undefined
): {
    agreementDurationDays?: number;
    expiresAt?: number;
    leaseId?: number;
    leaseActiveOnChain?: boolean;
} {
    if (bid.action !== Action.Lease) return {};

    // Stored and reported in days, in a field whose name says so.
    const durationDays = leaseDurationDays(property?.lease_duration_days);

    const onChainLease = property?.active_lease;
    if (onChainLease && onChainLease.tenant_id === bid.bidder_id) {
        return {
            agreementDurationDays: durationDays ?? undefined,
            // NEAR contract timestamps are nanoseconds.
            expiresAt: Math.floor(onChainLease.end_time / 1_000_000),
            leaseId: onChainLease.id,
            leaseActiveOnChain: onChainLease.active,
        };
    }

    if (!completedAt || !durationDays) return {};
    return {
        agreementDurationDays: durationDays,
        expiresAt: completedAt + durationDays * 30.44 * 24 * 60 * 60 * 1000,
    };
}

/**
 * Upgrades any transaction still relying on computeLeaseExpiry's
 * completedAt+duration estimate to the real on-chain Lease record, via
 * bid.lease_id -> get_lease_by_id. Mutates the given transactions in
 * place (called right before they're sorted/stored, so this is the last
 * pass over the list either way).
 *
 * Only fires for transactions that didn't already get a precise reading
 * from property.active_lease (computeLeaseExpiry sets leaseId whenever
 * that path succeeds) — a lease still actively pointed to by its property
 * doesn't need a second lookup to confirm what's already authoritative.
 */
async function enrichLeaseExpiryFromChain(transactions: Transaction[]): Promise<void> {
    const candidates = transactions.filter(
        (t) => t.bid.action === Action.Lease && t.bid.lease_id != null && !t.leaseId
    );
    if (candidates.length === 0) return;

    const results = await Promise.allSettled(
        candidates.map((t) => nearContractService.getLeaseById(t.bid.lease_id as number))
    );

    results.forEach((result, idx) => {
        if (result.status !== "fulfilled" || !result.value.success || !result.value.data) {
            return;
        }
        const lease = result.value.data;
        const tx = candidates[idx];
        tx.expiresAt = Math.floor(lease.end_time / 1_000_000);
        tx.leaseId = lease.id;
        tx.leaseActiveOnChain = lease.active;
    });
}

/**
 * Convert a backend TransactionView to a Transaction — used as a degraded
 * fallback when the on-chain fetch fails entirely, and by lighter-weight
 * consumers (see hooks/useUnattendedCount.ts) that want a rough transaction
 * count without paying for a full on-chain RPC fetch cycle.
 * The backend already joins property details and counterparty info.
 */
export function feedItemToTransaction(
    item: TransactionFeedItem,
    accountId: string
): Transaction {
    const numericBidId = Number(item.bid_id) || 0;
    const numericPropertyId = Number(item.property_id) || 0;
    const bidAmount = item.bid_amount || "0";
    const counterpartyWallet = item.counterparty?.wallet_id || "";
    const updatedAtStr = item.updated_at || new Date().toISOString();
    const updatedAtTs = new Date(updatedAtStr).getTime();
    const createdAtTs = updatedAtTs;

    const bid: BidView = {
        id: numericBidId,
        property_id: numericPropertyId,
        bidder_id: counterpartyWallet || accountId,
        bid_amount: bidAmount,
        stablecoin_token: item.stablecoin_token || "",
        action: (item.action as Action) || Action.Purchase,
        created_at: createdAtTs,
        status: (item.status as BidStatus) || BidStatus.Pending,
        updated_at: updatedAtTs,
        document_token_id: item.document_token_id ?? undefined,
        escrow_release_tx: item.escrow_release_tx ?? undefined,
    };

    const propInfo = item.property;
    const firstImage = propInfo?.images?.[0] || "";
    const property: PropertyView = {
        id: numericPropertyId,
        owner_id: "",
        description: propInfo?.title || "Property",
        metadata_uri: typeof firstImage === "string" ? firstImage : (firstImage as any)?.image_url || "",
        price: bidAmount,
        is_for_sale: true,
        damage_deposit_required: "0",
        lease_duration_days: null,
        active_lease: null,
        timestamp: createdAtTs,
        sold: null,
        stablecoin_token: item.stablecoin_token || "",
    };

    const phase = overlayAppointmentPhase(mapBidStatusToPhase(bid.status), item.appointment_status);
    const role = counterpartyWallet === accountId ? "seller" : "buyer";

    const isCompleted = phase === TransactionPhase.COMPLETED || phase === TransactionPhase.PAYMENT_RELEASED;
    const completedAt = isCompleted ? updatedAtTs : undefined;
    // property here is always synthetic (active_lease/lease_duration_months
    // both null) — this whole function only runs when on-chain is entirely
    // unreachable, so there's no real duration data available at all here.
    const leaseExpiry = computeLeaseExpiry(bid, property, completedAt);

    const propertyDetails: PropertyShow | null = propInfo ? {
        id: propInfo.id ?? 0,
        agent_id: 0,
        title: propInfo.title || "Property",
        description: "",
        price: Number(bidAmount) || 0,
        property_type: "",
        listing_type: item.action === "lease" ? "rent" : "sale",
        location: propInfo.location || "",
        bedroom: 0,
        bathroom: 0,
        status: item.status || "active",
        blockchain_property_id: propInfo.blockchain_property_id ?? undefined,
        images: propInfo.images?.map((url: string) => ({ image_url: url })) || [],
    } as unknown as PropertyShow : null;

    return {
        key: makeTransactionKey(numericBidId, numericPropertyId),
        bid,
        property,
        propertyDetails,
        phase,
        role,
        updatedAt: updatedAtTs,
        documentTokenId: item.document_token_id ?? undefined,
        escrowReleaseTxHash: item.escrow_release_tx ?? undefined,
        completedAt,
        ...leaseExpiry,
    };
}

/**
 * Appointment booked/accepted/rejected has no on-chain BidStatus — only
 * overlay it onto the base on-chain-derived phase when it's still sitting
 * at BID_ACCEPTED (the on-chain state both "appointment pending" and
 * "appointment confirmed" share) and a backend match actually carries it.
 */
function overlayAppointmentPhase(
    basePhase: TransactionPhase,
    appointmentStatus?: string | null
): TransactionPhase {
    if (basePhase !== TransactionPhase.BID_ACCEPTED || !appointmentStatus) {
        return basePhase;
    }
    if (appointmentStatus === "booked") return TransactionPhase.APPOINTMENT_BOOKED;
    if (appointmentStatus === "accepted") return TransactionPhase.APPOINTMENT_ACCEPTED;
    // "rejected" (or anything else) correctly falls back to BID_ACCEPTED.
    return basePhase;
}

interface OnChainFetchResult {
    buyerBids: BidView[];
    sellerBids: { bid: BidView; property: PropertyView }[];
    propertyCache: Record<number, PropertyView>;
    /**
     * True when at least one bid-read call errored rather than legitimately
     * returning no rows. Without this, a contract-side failure is
     * indistinguishable from "this user has no transactions" — every read
     * here is individually guarded and degrades to [], so a panic used to
     * render as a silent, confident empty state.
     *
     * This is not hypothetical: a contract deployed over incompatible stored
     * state panics with "Cannot deserialize element" on every bid read, so
     * real bids become invisible to both buyer and seller while the UI
     * insists there are none.
     */
    hadReadFailure: boolean;
}

export function useTransactions(): UseTransactionsReturn {
    const { walletState, currentNetwork } = useWallet();
    const { properties, getTransactions } = useApi();

    /**
     * Backend properties are used purely to prettify what's already been read
     * from chain (title, images, location) — they never change *which*
     * transactions exist. Reading them through a ref keeps them out of
     * fetchTransactions' dependencies.
     *
     * Naming `properties` there instead made this expensive: it's reducer
     * state, so every properties refresh produced a new array identity, which
     * gave fetchTransactions a new identity, which re-fired the effect that
     * calls it — a full on-chain refetch (bids, owned properties, and a bid
     * read per owned property) in every mounted consumer, triggered by an
     * unrelated backend list being refreshed. Wallet, History and Activity all
     * run this hook.
     */
    const propertiesRef = useRef(properties);
    useEffect(() => {
        propertiesRef.current = properties;
    }, [properties]);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const accountId = walletState.account?.accountId;

    /**
     * Show the last-known deals immediately while the real fetch runs behind
     * them. Rebuilding this list costs an on-chain bid read for both roles
     * plus a bid read per owned property, so without priming, every visit to
     * Activity/History started from an empty spinner even when the user had
     * just been looking at the very same list.
     *
     * Cache-first only: anything the live fetch produces overwrites this, and
     * a hydrate that loses the race to the live fetch is discarded rather than
     * clobbering fresher data.
     */
    useEffect(() => {
        let cancelled = false;
        if (!accountId) return;
        (async () => {
            const cached = await readCachedList<Transaction>(
                LIST_CACHE_SCOPES.transactions,
                accountId
            );
            if (!cancelled && cached && cached.length > 0) {
                setTransactions((prev) => (prev.length > 0 ? prev : cached));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [accountId]);

    /**
     * Fetch on-chain bids for both roles, fully parallelized. Guards each
     * leg individually via Promise.allSettled so a single failing RPC call
     * degrades that one piece instead of discarding everything else — this
     * only throws if nearContractService can't initialize at all (every RPC
     * endpoint unreachable), which the caller treats as a total failure.
     */
    const fetchOnChainBids = useCallback(async (): Promise<OnChainFetchResult> => {
        if (!accountId) {
            return { buyerBids: [], sellerBids: [], propertyCache: {}, hadReadFailure: false };
        }

        let hadReadFailure = false;

        await nearContractService.initialize(currentNetwork);

        const [buyerBidsSettled, myPropsSettled] = await Promise.allSettled([
            nearContractService.getBidsByBidder({
                bidder: accountId,
                from_index: 0,
                limit: 100,
            }),
            nearContractService.getMyProperties(accountId),
        ]);

        const buyerBids: BidView[] =
            buyerBidsSettled.status === "fulfilled" &&
                buyerBidsSettled.value.success &&
                buyerBidsSettled.value.data
                ? buyerBidsSettled.value.data
                : [];
        if (buyerBidsSettled.status === "rejected") {
            hadReadFailure = true;
            console.warn("useTransactions: getBidsByBidder failed:", buyerBidsSettled.reason);
        } else if (!buyerBidsSettled.value.success) {
            hadReadFailure = true;
            console.warn("useTransactions: getBidsByBidder errored:", buyerBidsSettled.value.error);
        }

        const myProperties: PropertyView[] =
            myPropsSettled.status === "fulfilled" &&
                myPropsSettled.value.success &&
                myPropsSettled.value.data
                ? myPropsSettled.value.data
                : [];
        if (myPropsSettled.status === "rejected") {
            hadReadFailure = true;
            console.warn("useTransactions: getMyProperties failed:", myPropsSettled.reason);
        } else if (!myPropsSettled.value.success) {
            hadReadFailure = true;
            console.warn("useTransactions: getMyProperties errored:", myPropsSettled.value.error);
        }

        // ---- Seller: bids on each owned property, in parallel ----
        const sellerBidsSettled = await Promise.allSettled(
            myProperties.map((prop) => nearContractService.getBidsForProperty(prop.id))
        );
        const sellerBids: { bid: BidView; property: PropertyView }[] = [];
        sellerBidsSettled.forEach((result, idx) => {
            if (result.status === "fulfilled" && result.value.success && result.value.data) {
                for (const bid of result.value.data) {
                    sellerBids.push({ bid, property: myProperties[idx] });
                }
            } else {
                // A property whose bids can't be read is not a property with
                // no bids — don't let it quietly vanish from the seller's list.
                hadReadFailure = true;
                const reason =
                    result.status === "rejected" ? result.reason : result.value.error;
                console.warn(
                    `useTransactions: getBidsForProperty(${myProperties[idx]?.id}) failed:`,
                    reason
                );
            }
        });

        const propertyCache: Record<number, PropertyView> = {};
        for (const prop of myProperties) {
            propertyCache[prop.id] = prop;
        }

        // ---- Buyer: on-chain property lookup for bids not already cached, in parallel ----
        const missingPropertyIds = Array.from(
            new Set(
                buyerBids
                    .filter((b) => !propertyCache[b.property_id])
                    .map((b) => b.property_id)
            )
        );
        const propResults = await Promise.allSettled(
            missingPropertyIds.map((pid) => nearContractService.getPropertyById(pid))
        );
        propResults.forEach((result, idx) => {
            if (result.status === "fulfilled" && result.value.success && result.value.data) {
                propertyCache[missingPropertyIds[idx]] = result.value.data;
            }
        });

        return { buyerBids, sellerBids, propertyCache, hadReadFailure };
    }, [accountId, currentNetwork]);

    const fetchTransactions = useCallback(async () => {
        if (!accountId) {
            setTransactions([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const [chainResult, backendResult] = await Promise.allSettled([
                fetchOnChainBids(),
                getTransactions(),
            ]);

            // Index backend data by transaction key for O(1) enrichment lookups.
            const backendByKey: Record<string, TransactionFeedItem> = {};
            if (backendResult.status === "fulfilled") {
                const raw = backendResult.value as any;
                const feedItems: TransactionFeedItem[] = Array.isArray(raw) ? raw : raw?.data || [];
                for (const item of feedItems) {
                    const key = makeTransactionKey(Number(item.bid_id) || 0, Number(item.property_id) || 0);
                    backendByKey[key] = item;
                }
            } else {
                console.warn("useTransactions: backend fetch failed, using on-chain data only:", backendResult.reason);
            }

            if (chainResult.status === "rejected") {
                // On-chain totally unreachable — degrade to backend-only data
                // (if any) rather than showing nothing.
                console.warn("useTransactions: on-chain fetch failed entirely:", chainResult.reason);
                const backendItems = Object.values(backendByKey);
                if (backendItems.length > 0) {
                    const sorted = backendItems
                        .map((item) => feedItemToTransaction(item, accountId))
                        .sort((a, b) => b.updatedAt - a.updatedAt);
                    setTransactions(sorted);
                    // The backend mirrors bids; the chain decides them. When the
                    // chain is unreachable these rows are the last thing the
                    // backend heard, which can be badly out of date: a bid the
                    // chain has since rejected or cancelled still reads here as
                    // "Bid Pending", and two attempts at the same bid show as
                    // two live rows. Rendering that silently is how a list of
                    // stale records comes to look like duplicate bids.
                    //
                    // Still shown rather than hidden — someone mid-deal needs to
                    // see something — but said plainly, because every action on
                    // these rows would be aimed at a chain we cannot currently
                    // read.
                    setError(
                        "Showing your last known activity — we couldn't reach the blockchain, so these may be out of date. Pull to refresh once you're back online."
                    );
                    // Deliberately not cached: this is the degraded
                    // backend-only path (on-chain unreachable), so it can be
                    // missing deals. Priming a later visit with a known-partial
                    // list would make that gap look authoritative.
                    return;
                }
                throw chainResult.reason;
            }

            const { buyerBids, sellerBids, propertyCache, hadReadFailure } = chainResult.value;

            // Shared across every screen running this hook, and remembers
            // which ids have no backend row at all, so the walk below happens
            // once per unknown id rather than once per screen per refresh.
            const backendPropertyCache = getBackendPropertyCache(currentNetwork);
            // The feed is still the cheapest source for anything it happens to
            // hold, and it is already loaded. Let it overwrite earlier entries
            // so an edited listing does not stay stale behind a cached copy.
            for (const apiProp of propertiesRef.current) {
                if (apiProp.blockchain_property_id) {
                    backendPropertyCache[Number(apiProp.blockchain_property_id)] = apiProp;
                }
            }

            const neededChainIds = new Set<number>();
            for (const bid of buyerBids) neededChainIds.add(bid.property_id);
            for (const { bid } of sellerBids) neededChainIds.add(bid.property_id);

            await resolveBackendProperties(
                neededChainIds,
                backendPropertyCache,
                (limit, cursor) => api.getProperties(limit, cursor)
            );

            const buildTransaction = (
                bid: BidView,
                property: PropertyView | undefined,
                role: "buyer" | "seller"
            ): Transaction | null => {
                if (!property) return null;

                const txKey = makeTransactionKey(bid.id, bid.property_id);
                const backendMatch = backendByKey[txKey];
                const phase = overlayAppointmentPhase(
                    mapBidStatusToPhase(bid.status),
                    backendMatch?.appointment_status
                );

                const isCompleted = phase === TransactionPhase.COMPLETED || phase === TransactionPhase.PAYMENT_RELEASED;
                const completedAt = isCompleted ? (bid.updated_at ?? bid.created_at) : undefined;
                const backendProp = backendPropertyCache[bid.property_id];
                const leaseExpiry = computeLeaseExpiry(bid, property, completedAt);

                return {
                    key: txKey,
                    bid,
                    property,
                    propertyDetails: backendProp ?? null,
                    phase,
                    role,
                    updatedAt: bid.updated_at ?? bid.created_at,
                    documentTokenId: bid.document_token_id ?? undefined,
                    escrowReleaseTxHash: bid.escrow_release_tx ?? undefined,
                    completedAt,
                    ...leaseExpiry,
                };
            };

            const allTransactions: Transaction[] = [];

            for (const bid of buyerBids) {
                const tx = buildTransaction(bid, propertyCache[bid.property_id], "buyer");
                if (tx) allTransactions.push(tx);
            }

            for (const { bid, property } of sellerBids) {
                const txKey = makeTransactionKey(bid.id, bid.property_id);
                if (allTransactions.some((t) => t.key === txKey)) continue;
                const tx = buildTransaction(bid, property, "seller");
                if (tx) allTransactions.push(tx);
            }

            await enrichLeaseExpiryFromChain(allTransactions);

            const sorted = allTransactions.sort((a, b) => b.updatedAt - a.updatedAt);
            setTransactions(sorted);

            // Only prime the next visit from a clean read. hadReadFailure
            // means at least one bid read errored, so this list is knowingly
            // incomplete — caching it would resurface those gaps later with
            // no error banner to explain them.
            if (!hadReadFailure) {
                writeCachedList(LIST_CACHE_SCOPES.transactions, accountId, sorted);
            }

            // Distinguish "you have no transactions" from "we couldn't read
            // them". Showing a confident empty state when the chain actually
            // errored is what made this look like data loss to users — their
            // bids existed the whole time, we just couldn't decode them.
            if (hadReadFailure && sorted.length === 0) {
                setError(
                    "Couldn't load your transactions from the blockchain. They haven't been lost — please try again shortly."
                );
            } else if (hadReadFailure) {
                setError(
                    "Some transactions couldn't be loaded from the blockchain, so this list may be incomplete."
                );
            }
        } catch (err: any) {
            console.error("useTransactions: Failed to fetch:", err);
            setError(
                NearContractService.parseContractError(
                    err.message || "Failed to load transactions"
                )
            );
        } finally {
            setLoading(false);
        }
    }, [accountId, fetchOnChainBids, getTransactions]);

    /**
     * Update a transaction's phase in-memory (optimistic UI update).
     * Call this after a successful on-chain call to immediately reflect the change
     * without waiting for a full refresh.
     */
    const updatePhase = useCallback(
        async (bidId: number, propertyId: number, phase: TransactionPhase) => {
            setTransactions((prev) =>
                prev.map((t) =>
                    t.bid.id === bidId && t.bid.property_id === propertyId
                        ? {
                            ...t,
                            phase,
                            updatedAt: Date.now(),
                        }
                        : t
                )
            );
        },
        []
    );

    // Fetch on mount and when wallet changes
    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    // Derived lists — a true partition, so no deal appears under two tabs.
    // See partitionTransactions for the rules.
    const { ongoing, completed, expired, cancelled } = partitionTransactions(transactions);

    return {
        transactions,
        ongoing,
        completed,
        expired,
        cancelled,
        loading,
        error,
        refresh: fetchTransactions,
        updatePhase,
    };
}

export default useTransactions;
