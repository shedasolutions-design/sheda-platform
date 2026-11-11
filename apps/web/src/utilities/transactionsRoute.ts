/**
 * Where a user's transactions live, by role.
 *
 * There is one transaction surface per role, not one per entry point:
 *   - seller → /(tabs)/activity  (SellerActivities: revenue, properties, and
 *     the Ongoing/Active/Cancelled/Expired list where bids are accepted,
 *     rejected, documents released, and payment completed)
 *   - buyer  → /(tabs)/history   (the same list, buyer side)
 *
 * Both are role-gated in app/(tabs)/_layout.tsx — `history` has no tab for a
 * seller and `activity` has none for a buyer. Every caller used to push
 * "/(tabs)/history" unconditionally: chat's "view offer", the appointment
 * confirmation, the listing form's success screen, all thirteen transaction
 * notification types, and the on-chain event listener. For a seller that
 * landed on a tab they can't otherwise reach, which rendered its own
 * "My Listings & Transactions" variant — a third copy of a list they already
 * had on Activity, reached only by these links.
 *
 * Resolve the route where the role is known (at tap time), never at the point
 * a notification is created — a bid_accepted notification is read by the
 * buyer, while bid_placed is read by the seller, and the same user can switch
 * modes between receiving one and opening it.
 */

export const SELLER_TRANSACTIONS_ROUTE = "/(tabs)/activity";
export const BUYER_TRANSACTIONS_ROUTE = "/(tabs)/history";

/** The transactions screen for the mode the user is currently in. */
export function transactionsRouteFor(isSeller: boolean): string {
    return isSeller ? SELLER_TRANSACTIONS_ROUTE : BUYER_TRANSACTIONS_ROUTE;
}

/**
 * True for a route that means "the user's transactions" rather than a specific
 * screen. Callers that stored one before the role was known (notifications)
 * use this to re-resolve it on open.
 */
export function isTransactionsRoute(route?: string | null): boolean {
    return (
        route === SELLER_TRANSACTIONS_ROUTE || route === BUYER_TRANSACTIONS_ROUTE
    );
}
