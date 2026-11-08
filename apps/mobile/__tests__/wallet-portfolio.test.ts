// @ts-nocheck — Test file
//
// Regression tests for the wallet Portfolio tab:
//
//  1. Property NFTs showed their raw on-chain u128 price ("1500000000") and
//     labelled it "NEAR", so a 1,500 USDC property read as 1.5 billion NEAR.
//  2. A property deleted/burnt on-chain kept rendering as an asset forever,
//     because the *bid* pointing at it outlives the property and the wallet
//     fell back to placeholder "Property #<id>" data whenever the property
//     lookup came back empty.
//  3. Transactions carried a YYYY-MM-DD string and no block timestamp, so
//     nothing could show when an interaction actually happened.
import { parseAtomicAmount, formatAmount } from "@/utilities/atomicAmount";
import {
    buildAssetList,
    bidPropertyIdsToFetch,
    derivePropertyState,
    ownedAssets,
    bidAssets,
    mergeAssetSources,
} from "@/utilities/walletAssets";
import { isTransportError } from "@/services/rpcHealth";
import {
    normalizeTimestamp,
    formatRelativeTime,
    formatTimestampLabel,
} from "@/utilities/formatTimestamp";
import { getTxExplorerUrl, getAccountExplorerUrl } from "@/utilities/nearExplorer";

const USDC = "usdc.fakes.testnet";
const ACCOUNT = "alice.sheda.testnet";

const property = (over = {}) => ({
    id: 1,
    owner_id: ACCOUNT,
    description: "3-bed in Lekki",
    metadata_uri: "https://example.test/1.png",
    is_for_sale: true,
    price: "1500000000",
    lease_duration_months: null,
    damage_deposit_required: "0",
    active_lease: null,
    timestamp: 1_770_000_000_000_000_000,
    sold: null,
    stablecoin_token: USDC,
    ...over,
});

const bid = (over = {}) => ({
    id: 10,
    property_id: 1,
    bidder_id: ACCOUNT,
    bid_amount: "1400000000",
    stablecoin_token: USDC,
    action: "Purchase",
    created_at: 1_770_000_000_000_000_000,
    status: "Pending",
    ...over,
});

describe("parseAtomicAmount", () => {
    it("converts atomic stablecoin units to the real price", () => {
        const parsed = parseAtomicAmount("1500000000", USDC);
        expect(parsed.amount).toBe(1500);
        expect(parsed.symbol).toBe("USDC");
        expect(parsed.usd).toBe(1500);
    });

    it("keeps precision on u128 values beyond Number.MAX_SAFE_INTEGER", () => {
        // 20,000,000,000 USDC — the raw integer exceeds 2^53.
        const parsed = parseAtomicAmount("20000000000000000000", USDC);
        expect(parsed.amount).toBe(20_000_000_000_000);
    });

    it("respects a 24-decimal token instead of assuming 6", () => {
        const parsed = parseAtomicAmount("2500000000000000000000000", "wrap.testnet");
        expect(parsed.amount).toBeCloseTo(2.5);
        expect(parsed.symbol).toBe("wNEAR");
        // Not a stablecoin — no USD value can be derived without a rate.
        expect(parsed.usd).toBeNull();
    });

    it("returns null when there is no amount, so callers omit the row", () => {
        expect(parseAtomicAmount(null, USDC)).toBeNull();
        expect(parseAtomicAmount("", USDC)).toBeNull();
    });

    it("formats without drowning a price in trailing zeros", () => {
        expect(formatAmount(1500)).toBe("1,500");
        expect(formatAmount(0)).toBe("0");
    });
});

describe("derivePropertyState", () => {
    it("marks a live listing as listed", () => {
        expect(derivePropertyState(property(), ACCOUNT).state).toBe("listed");
    });

    it("marks a delisted property as not listed", () => {
        const state = derivePropertyState(property({ is_for_sale: false }), ACCOUNT);
        expect(state.state).toBe("unlisted");
        expect(state.stateLabel).toBe("Not listed");
    });

    it("an active lease outranks the listing flag", () => {
        const state = derivePropertyState(
            property({ active_lease: { active: true, tenant_id: "bob.testnet" } }),
            ACCOUNT
        );
        expect(state.state).toBe("leased");
    });

    it("a re-listed property that was previously sold still reads as listed", () => {
        // `sold` is a permanent record — checking it first would brand every
        // re-listed property "Sold" forever.
        const state = derivePropertyState(
            property({ is_for_sale: true, sold: { buyer_id: "bob.testnet" } }),
            ACCOUNT
        );
        expect(state.state).toBe("listed");
    });
});

describe("buildAssetList", () => {
    const emptyInput = {
        accountId: ACCOUNT,
        ownedProperties: [],
        bids: [],
        bidProperties: new Map(),
        deletedPropertyIds: new Set(),
    };

    it("prices an owned property from its own on-chain price", () => {
        const [asset] = buildAssetList({
            ...emptyInput,
            ownedProperties: [property()],
        });
        expect(asset.priceAmount).toBe(1500);
        expect(asset.priceSymbol).toBe("USDC");
        expect(asset.state).toBe("listed");
        expect(asset.owned).toBe(true);
    });

    it("drops a property the contract reports as deleted/burnt", () => {
        const assets = buildAssetList({
            ...emptyInput,
            bids: [bid({ property_id: 7 })],
            deletedPropertyIds: new Set([7]),
        });
        expect(assets).toHaveLength(0);
    });

    it("keeps a bid whose property lookup merely failed", () => {
        // Read failure ≠ deleted. Erasing an asset over a flaky RPC call would
        // be its own kind of data loss.
        const assets = buildAssetList({
            ...emptyInput,
            bids: [bid({ property_id: 7 })],
            bidProperties: new Map(),
            deletedPropertyIds: new Set(),
        });
        expect(assets).toHaveLength(1);
        expect(assets[0].name).toBe("Property #7");
    });

    it("omits properties behind rejected or cancelled bids", () => {
        const assets = buildAssetList({
            ...emptyInput,
            bids: [
                bid({ id: 1, property_id: 2, status: "Rejected" }),
                bid({ id: 2, property_id: 3, status: "Cancelled" }),
                bid({ id: 3, property_id: 4, status: "Pending" }),
            ],
        });
        expect(assets.map((a) => a.propertyId)).toEqual([4]);
    });

    it("prefers the property's asking price over the user's bid amount", () => {
        const [asset] = buildAssetList({
            ...emptyInput,
            bids: [bid({ property_id: 5 })],
            bidProperties: new Map([[5, property({ id: 5, owner_id: "bob.testnet" })]]),
        });
        expect(asset.priceAmount).toBe(1500);
        expect(asset.owned).toBe(false);
    });

    it("shows an owned property once, not twice, when the user also bid on it", () => {
        const assets = buildAssetList({
            ...emptyInput,
            ownedProperties: [property()],
            bids: [bid({ property_id: 1 })],
        });
        expect(assets).toHaveLength(1);
        expect(assets[0].state).toBe("listed");
    });
});

describe("mergeAssetSources", () => {
    // The Assets tab went blank for users who owned properties: the owned and
    // bid reads were treated as one roster, so when get_bids_by_bidder failed
    // (it has a known contract-side fault it works around) the whole tab was
    // discarded — including perfectly readable owned properties.
    const ownedOnly = () =>
        ownedAssets({
            accountId: ACCOUNT,
            ownedProperties: [property()],
            deletedPropertyIds: new Set(),
        });
    const bidOnly = () =>
        bidAssets({
            bids: [bid({ property_id: 7 })],
            bidProperties: new Map(),
            deletedPropertyIds: new Set(),
        });

    it("still shows owned properties when the bid read failed", () => {
        const merged = mergeAssetSources({
            previous: [],
            owned: ownedOnly(),
            bids: null,
        });
        expect(merged.map((a) => a.id)).toEqual(["prop-1"]);
    });

    it("carries over the failed source's entries instead of dropping them", () => {
        const previous = [...ownedOnly(), ...bidOnly()];
        const merged = mergeAssetSources({
            previous,
            owned: ownedOnly(),
            bids: null,
        });
        expect(merged.map((a) => a.id).sort()).toEqual(["prop-1", "prop-7"]);
    });

    it("lets a successful read remove what it no longer reports", () => {
        // Owned came back empty *and* readable — the property is genuinely
        // gone (deleted, burnt or transferred), so it must not linger.
        const merged = mergeAssetSources({
            previous: ownedOnly(),
            owned: [],
            bids: null,
        });
        expect(merged).toHaveLength(0);
    });

    it("keeps everything when neither source could be read", () => {
        const previous = [...ownedOnly(), ...bidOnly()];
        expect(
            mergeAssetSources({ previous, owned: null, bids: null })
        ).toHaveLength(2);
    });

    it("prefers the owned entry when both sources describe one property", () => {
        const bidOnOwned = bidAssets({
            bids: [bid({ property_id: 1 })],
            bidProperties: new Map(),
            deletedPropertyIds: new Set(),
        });
        const merged = mergeAssetSources({
            previous: [],
            owned: ownedOnly(),
            bids: bidOnOwned,
        });
        expect(merged).toHaveLength(1);
        expect(merged[0].owned).toBe(true);
    });
});

describe("isTransportError", () => {
    // Decides whether a failed contract read is worth re-querying a different
    // way. Getting this backwards either skips a usable fallback or piles more
    // requests onto an RPC that is already refusing us.
    it("treats connection and throttling failures as transport", () => {
        expect(isTransportError("Failed to fetch")).toBe(true);
        expect(isTransportError("429 Too Many Requests")).toBe(true);
        expect(isTransportError("ERR_RPC_TIMEOUT: unable to connect")).toBe(true);
        expect(isTransportError("blocked by CORS policy")).toBe(true);
    });

    it("treats contract-side faults as answerable, so a fallback is tried", () => {
        expect(isTransportError("Smart contract panicked: ProhibitedInView")).toBe(false);
        expect(isTransportError("MethodNotFound")).toBe(false);
        expect(isTransportError("Cannot deserialize element")).toBe(false);
    });
});

describe("bidPropertyIdsToFetch", () => {
    it("skips closed bids and properties already known", () => {
        const ids = bidPropertyIdsToFetch(
            [
                bid({ id: 1, property_id: 1 }),
                bid({ id: 2, property_id: 2 }),
                bid({ id: 3, property_id: 3, status: "Rejected" }),
                bid({ id: 4, property_id: 2 }),
            ],
            new Set([1])
        );
        expect(ids).toEqual([2]);
    });
});

describe("timestamps", () => {
    it("normalizes nanosecond, second and ISO timestamps to milliseconds", () => {
        const ms = 1_770_000_000_000;
        expect(normalizeTimestamp(ms * 1_000_000)).toBe(ms);
        expect(normalizeTimestamp(ms)).toBe(ms);
        expect(normalizeTimestamp(Math.floor(ms / 1000))).toBe(ms);
        expect(normalizeTimestamp(new Date(ms).toISOString())).toBe(ms);
        expect(normalizeTimestamp(null)).toBeNull();
    });

    it("describes recent activity relatively", () => {
        expect(formatRelativeTime(Date.now() - 30 * 1000)).toBe("Just now");
        expect(formatRelativeTime(Date.now() - 5 * 60 * 1000)).toBe("5m ago");
        expect(formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000)).toBe("3h ago");
    });

    it("pairs a fuzzy relative time with the exact time, but never doubles a date", () => {
        expect(formatTimestampLabel(Date.now() - 2 * 60 * 60 * 1000)).toContain("2h ago •");
        // Older than a week: relative is already a date, so show it once.
        expect(formatTimestampLabel(Date.now() - 60 * 24 * 60 * 60 * 1000)).not.toContain("•");
    });
});

describe("explorer links", () => {
    it("builds NearBlocks links, not the retired NEAR explorer", () => {
        expect(getTxExplorerUrl("abc123", "testnet")).toBe(
            "https://testnet.nearblocks.io/txns/abc123"
        );
        expect(getTxExplorerUrl("abc123", "mainnet")).toBe(
            "https://nearblocks.io/txns/abc123"
        );
        expect(getAccountExplorerUrl(ACCOUNT, "testnet")).toBe(
            `https://testnet.nearblocks.io/address/${ACCOUNT}`
        );
    });
});
