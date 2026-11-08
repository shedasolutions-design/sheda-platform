/**
 * Building the wallet's Assets tab from raw contract reads.
 *
 * The list is *derived* from chain state on every load, never accumulated —
 * a property the contract no longer reports simply isn't in the next result,
 * so deleting/burning one makes it disappear from the wallet.
 *
 * Kept separate from the screen so the rules below (what counts as deleted,
 * which bids still represent a claim, how a price is denominated) are
 * testable without mounting the wallet.
 */

import type { Asset, AssetState } from "@/types/wallet";
import type { PropertyView, BidView } from "@/types/contract";
import { parseAtomicAmount } from "@/utilities/atomicAmount";

/**
 * Bid statuses that end the buyer's claim on a property. A rejected or
 * cancelled bid leaves the user with no stake in the property, so it
 * shouldn't sit in their asset list looking like a holding.
 */
export const CLOSED_BID_STATUSES = ["Rejected", "Cancelled"];

const BID_STATUS_LABELS: Record<string, string> = {
    Pending: "Bid pending",
    Accepted: "Bid accepted",
    Rejected: "Bid rejected",
    Cancelled: "Bid cancelled",
    DocsReleased: "Documents released",
    DocsConfirmed: "Documents confirmed",
    PaymentReleased: "Payment released",
    Completed: "Completed",
    Disputed: "Disputed",
};

/** NEAR contract timestamps are nanoseconds. */
function nsToMs(ns?: number | null): number | undefined {
    return ns ? Math.floor(ns / 1_000_000) : undefined;
}

/**
 * Current on-chain state of a property the user owns.
 *
 * Order matters: an active lease outranks everything (the property is
 * occupied), then a live listing, then a historical sale. `sold` is a
 * permanent record on the property, so checking it before `is_for_sale`
 * would leave any re-listed property labelled "Sold" forever.
 */
export function derivePropertyState(
    prop: PropertyView,
    accountId: string
): { state: AssetState; stateLabel: string; status: Asset["status"] } {
    if (prop.active_lease?.active) {
        return {
            state: "leased",
            stateLabel:
                prop.active_lease.tenant_id === accountId ? "Leased to you" : "Leased out",
            status: "Completed",
        };
    }
    if (prop.is_for_sale) {
        return { state: "listed", stateLabel: "Listed for sale", status: "Ongoing" };
    }
    if (prop.sold) {
        return { state: "sold", stateLabel: "Sold", status: "Completed" };
    }
    return { state: "unlisted", stateLabel: "Not listed", status: "Completed" };
}

/** Price fields for an Asset, converted out of the token's atomic units. */
export function assetPriceFields(
    atomic?: string | null,
    token?: string | null
): Pick<Asset, "price" | "priceToken" | "priceAmount" | "priceSymbol" | "priceUsd"> {
    const parsed = parseAtomicAmount(atomic, token);
    if (!parsed) return {};
    return {
        price: atomic ?? undefined,
        priceToken: token ?? undefined,
        priceAmount: parsed.amount,
        priceSymbol: parsed.symbol,
        priceUsd: parsed.usd,
    };
}

export function ownedPropertyToAsset(prop: PropertyView, accountId: string): Asset {
    const { state, stateLabel, status } = derivePropertyState(prop, accountId);
    return {
        id: `prop-${prop.id}`,
        name: prop.description || `Property #${prop.id}`,
        status,
        image: null,
        imageUri: prop.metadata_uri || undefined,
        description: prop.description || undefined,
        owner: prop.owner_id,
        propertyId: prop.id,
        state,
        stateLabel,
        owned: prop.owner_id === accountId,
        mintedAt: nsToMs(prop.timestamp),
        ...assetPriceFields(prop.price, prop.stablecoin_token),
    };
}

export function bidToAsset(bid: BidView, prop: PropertyView | undefined): Asset {
    const statusLabel = BID_STATUS_LABELS[bid.status] || bid.status;
    const isCompleted = ["Completed", "PaymentReleased", "DocsConfirmed"].includes(
        bid.status
    );
    const action = bid.action === "Lease" ? "Lease" : "Purchase";

    return {
        id: `prop-${bid.property_id}`,
        name: prop?.description || `Property #${bid.property_id}`,
        status: isCompleted ? "Completed" : "Ongoing",
        image: null,
        imageUri: prop?.metadata_uri || undefined,
        description: `${statusLabel} • ${action}`,
        owner: prop?.owner_id,
        propertyId: bid.property_id,
        state: "bid",
        stateLabel: `${statusLabel} • ${action}`,
        owned: false,
        mintedAt: nsToMs(prop?.timestamp),
        // The property's own asking price is the authoritative number; the bid
        // amount is only what this user offered, and is the fallback when the
        // property record couldn't be read.
        ...assetPriceFields(
            prop?.price ?? bid.bid_amount,
            prop?.stablecoin_token ?? bid.stablecoin_token
        ),
    };
}

export interface BuildAssetListInput {
    accountId: string;
    /** Properties the contract currently reports this account as owning */
    ownedProperties: PropertyView[];
    /** Every bid this account has placed, in any status */
    bids: BidView[];
    /** Properties resolved for those bids, keyed by property id */
    bidProperties: Map<number, PropertyView>;
    /**
     * Property ids the contract explicitly answered "no such property" for.
     * That's a definitive deleted/burnt, as opposed to a read that simply
     * failed — those tell us nothing and must not erase an asset.
     */
    deletedPropertyIds: Set<number>;
}

/** True for entries derived from a bid rather than from ownership. */
export const isBidAsset = (asset: Asset): boolean => asset.state === "bid";

/** Assets for the properties the contract reports this account as owning. */
export function ownedAssets({
    accountId,
    ownedProperties,
    deletedPropertyIds,
}: Pick<
    BuildAssetListInput,
    "accountId" | "ownedProperties" | "deletedPropertyIds"
>): Asset[] {
    return ownedProperties
        .filter((prop) => !deletedPropertyIds.has(prop.id))
        .map((prop) => ownedPropertyToAsset(prop, accountId));
}

/** Assets for the properties this account has an open bid on. */
export function bidAssets({
    bids,
    bidProperties,
    deletedPropertyIds,
}: Pick<
    BuildAssetListInput,
    "bids" | "bidProperties" | "deletedPropertyIds"
>): Asset[] {
    return bids
        .filter((bid) => !CLOSED_BID_STATUSES.includes(bid.status))
        // Burnt/deleted on-chain — a bid row outlives the property it points
        // at, so without this the wallet kept rendering a ghost card built
        // from placeholder "Property #<id>" data forever.
        .filter((bid) => !deletedPropertyIds.has(bid.property_id))
        .map((bid) => bidToAsset(bid, bidProperties.get(bid.property_id)));
}

/**
 * Combine the two asset sources, newest read winning.
 *
 * Pass `null` for a source whose read failed this round: its entries are
 * carried over from `previous` untouched. The two reads behind this list
 * (`get_property_by_owner` and `get_bids_by_bidder`) fail independently — the
 * bid read in particular has a known contract-side fault it has to work around
 * — and treating either failure as fatal to the whole list is what made the
 * Assets tab go blank while the user's owned properties were perfectly
 * readable. A source that *was* read is authoritative, so deletions still take
 * effect for it.
 *
 * Owned entries win over bid entries for the same property: if you own it,
 * that's the more meaningful relationship to show.
 */
export function mergeAssetSources({
    previous,
    owned,
    bids,
}: {
    previous: Asset[];
    owned: Asset[] | null;
    bids: Asset[] | null;
}): Asset[] {
    const ownedEntries = owned ?? previous.filter((a) => !isBidAsset(a));
    const bidEntries = bids ?? previous.filter(isBidAsset);

    const assetMap = new Map<string, Asset>();
    for (const asset of ownedEntries) assetMap.set(asset.id, asset);
    for (const asset of bidEntries) {
        if (!assetMap.has(asset.id)) assetMap.set(asset.id, asset);
    }
    return Array.from(assetMap.values());
}

/**
 * Assemble the asset list from a complete, trusted read of both sources.
 * Anything confirmed deleted on-chain is dropped.
 */
export function buildAssetList(input: BuildAssetListInput): Asset[] {
    return mergeAssetSources({
        previous: [],
        owned: ownedAssets(input),
        bids: bidAssets(input),
    });
}

/** Property ids referenced by open bids that aren't already covered. */
export function bidPropertyIdsToFetch(
    bids: BidView[],
    alreadyKnown: Set<number>
): number[] {
    return [
        ...new Set(
            bids
                .filter((b) => !CLOSED_BID_STATUSES.includes(b.status))
                .map((b) => b.property_id)
                .filter((pid) => !alreadyKnown.has(pid))
        ),
    ];
}
