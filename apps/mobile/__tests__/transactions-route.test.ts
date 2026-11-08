// @ts-nocheck — Test file
//
// There is one transaction surface per role: Activity for a seller, History
// for a buyer. Both are role-gated in app/(tabs)/_layout.tsx.
//
// Every entry point used to push "/(tabs)/history" unconditionally — chat's
// "view offer", the appointment confirmation, the listing form, all thirteen
// transaction notification types, and the on-chain event listener. History has
// no tab in seller mode, so a seller following one of those links landed on a
// screen that rendered its own "My Listings & Transactions" variant: MyListings
// (already on the List tab) plus a second copy of the list they already had on
// Activity. That third page existed only because of these links.
import {
    transactionsRouteFor,
    isTransactionsRoute,
    SELLER_TRANSACTIONS_ROUTE,
    BUYER_TRANSACTIONS_ROUTE,
} from "@/utilities/transactionsRoute";

describe("transactionsRouteFor", () => {
    it("sends a seller to Activity", () => {
        expect(transactionsRouteFor(true)).toBe("/(tabs)/activity");
    });

    it("sends a buyer to History", () => {
        expect(transactionsRouteFor(false)).toBe("/(tabs)/history");
    });

    it("never sends a seller to the buyer-only tab", () => {
        // The regression in one line: this is the push that produced the
        // duplicate "My Listings & Transactions" page.
        expect(transactionsRouteFor(true)).not.toBe(BUYER_TRANSACTIONS_ROUTE);
    });
});

describe("isTransactionsRoute", () => {
    // Notifications are created before the reader's role is known — bid_placed
    // is read by the seller, bid_accepted by the buyer, and the same account
    // can switch modes in between. The stored route is a placeholder that gets
    // re-resolved on open, so both must be recognised.
    it("recognises both role surfaces", () => {
        expect(isTransactionsRoute(SELLER_TRANSACTIONS_ROUTE)).toBe(true);
        expect(isTransactionsRoute(BUYER_TRANSACTIONS_ROUTE)).toBe(true);
    });

    it("leaves unrelated routes alone", () => {
        expect(isTransactionsRoute("/(tabs)/home")).toBe(false);
        expect(isTransactionsRoute("/details/12")).toBe(false);
    });

    it("handles a missing route without throwing", () => {
        expect(isTransactionsRoute(undefined)).toBe(false);
        expect(isTransactionsRoute(null)).toBe(false);
    });
});
