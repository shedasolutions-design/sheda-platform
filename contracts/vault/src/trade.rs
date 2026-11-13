//! Holders selling shares to each other, and holders replacing the manager.
//!
//! **The share market lives in the vault.** A seller's listed shares stay in
//! their own balance, locked, so the rent they earn keeps accruing to the
//! seller until the moment of sale; escrowing them in a separate contract
//! would hand that rent to the escrow. A buyer pays in the stablecoin with
//! `ft_transfer_call`, and in that one call the shares move and the seller
//! is paid, less Sheda's 2%. Nobody can take the money without the shares
//! moving, or the shares without the money.
//!
//! Buy offers work the other way round: the buyer's money waits in the
//! vault at their price, and any holder may sell into it.
//!
//! Stablecoin held for the market is booked into `last_accounted` the moment
//! it arrives, so `sync_income` never mistakes a buyer's payment for rent.
//!
//! **Replacing the manager.** Any holder may vote for a manager and fee.
//! Once holders of more than half of the flat's shares agree on the same
//! pair, anyone may apply it. What the outgoing manager earned is paid to
//! them, not to whoever replaces them.

use crate::income::PayKind;
use crate::{Vault, VaultExt, BPS, MAX_TOTAL_FEE_BPS};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json;
use near_sdk::{env, near, require, AccountId, PromiseOrValue};

/// Sheda's share of every completed sale: 2%, taken from the seller's
/// proceeds, never from a cancelled listing or offer.
pub const TRADE_FEE_BPS: u128 = 200;

/// Most votes counted when applying a manager change, to bound gas.
pub const MAX_VOTERS: usize = 500;

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Listing {
    pub seller: AccountId,
    pub shares: U128,
    pub price_per_share: U128,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Offer {
    pub buyer: AccountId,
    pub shares: U128,
    pub price_per_share: U128,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct ManagerVote {
    pub manager: AccountId,
    pub fee_bps: u32,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct BuyMsg {
    buy: u64,
    shares: Option<U128>,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct OfferMsg {
    offer: OfferTerms,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct OfferTerms {
    shares: U128,
    price_per_share: U128,
}

#[near]
impl Vault {
    // ---- selling ----------------------------------------------------------

    /// Offer some of your shares at a price per share, in the stablecoin.
    pub fn list_shares(&mut self, shares: U128, price_per_share: U128) -> u64 {
        let who = env::predecessor_account_id();
        require!(shares.0 > 0, "List at least one share");
        require!(price_per_share.0 > 0, "Set a price above zero");
        require!(
            !matches!(self.custody, crate::Custody::Redeemed { .. }),
            "This flat has been redeemed"
        );
        require!(
            self.free_balance(&who) >= shares.0,
            "You do not have that many shares free to list"
        );
        let locked = self.locked_of(&who) + shares.0;
        self.locked.insert(&who, &locked);
        let id = self.next_trade_id;
        self.next_trade_id += 1;
        self.listings.insert(
            &id,
            &Listing {
                seller: who.clone(),
                shares,
                price_per_share,
            },
        );
        env::log_str(&format!(
            "shares_listed {} by {}: {} at {}",
            id, who, shares.0, price_per_share.0
        ));
        id
    }

    pub fn cancel_listing(&mut self, listing_id: u64) {
        let listing = self
            .listings
            .get(&listing_id)
            .unwrap_or_else(|| env::panic_str("No such listing"));
        require!(
            env::predecessor_account_id() == listing.seller,
            "Only the seller may cancel this listing"
        );
        self.unlock(&listing.seller, listing.shares.0);
        self.listings.remove(&listing_id);
        env::log_str(&format!("listing_cancelled {}", listing_id));
    }

    /// Sell into a buyer's standing offer.
    #[payable]
    pub fn sell_to_offer(&mut self, offer_id: u64, shares: U128) {
        Self::assert_one_yocto();
        let seller = env::predecessor_account_id();
        let mut offer = self
            .offers
            .get(&offer_id)
            .unwrap_or_else(|| env::panic_str("No such offer"));
        require!(seller != offer.buyer, "You cannot sell to your own offer");
        let n = shares.0.min(offer.shares.0);
        require!(n > 0, "Sell at least one share");
        require!(
            self.free_balance(&seller) >= n,
            "You do not have that many shares free to sell"
        );

        self.internal_transfer(&seller, &offer.buyer, n);
        let cost = n * offer.price_per_share.0;
        let fee = cost * TRADE_FEE_BPS / (BPS as u128);
        let net = cost - fee;
        // The offer's money is already booked; the seller's part leaves and
        // Sheda's part stays as a fee owed to the treasury.
        self.owed_treasury += fee;
        self.last_accounted -= net;
        offer.shares = U128(offer.shares.0 - n);
        if offer.shares.0 == 0 {
            self.offers.remove(&offer_id);
        } else {
            self.offers.insert(&offer_id, &offer);
        }
        env::log_str(&format!(
            "shares_sold offer {} {} by {} to {} for {} fee {}",
            offer_id, n, seller, offer.buyer, cost, fee
        ));
        let _ = self.pay(seller, net, PayKind::Holder);
    }

    /// Withdraw a buy offer and get its money back.
    #[payable]
    pub fn cancel_offer(&mut self, offer_id: u64) {
        Self::assert_one_yocto();
        let offer = self
            .offers
            .get(&offer_id)
            .unwrap_or_else(|| env::panic_str("No such offer"));
        require!(
            env::predecessor_account_id() == offer.buyer,
            "Only the buyer may cancel this offer"
        );
        let escrow = offer.shares.0 * offer.price_per_share.0;
        self.offers.remove(&offer_id);
        self.last_accounted -= escrow;
        env::log_str(&format!("offer_cancelled {}", offer_id));
        let _ = self.pay(offer.buyer, escrow, PayKind::Holder);
    }

    /// Payments for the market arrive here, from the vault's stablecoin.
    ///
    /// `{"buy": listing_id, "shares": n?}` buys from a listing;
    /// `{"offer": {"shares": n, "price_per_share": p}}` posts a buy offer.
    /// Whatever is not used is returned to the sender by the token.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.stablecoin {
            env::log_str("rejected: wrong token");
            return PromiseOrValue::Value(amount);
        }
        // A rent sync in flight compares the token balance against a
        // snapshot; money arriving now would be counted as rent.
        if self.busy {
            env::log_str("rejected: the vault is busy; try again in a moment");
            return PromiseOrValue::Value(amount);
        }

        if let Ok(buy) = serde_json::from_str::<BuyMsg>(&msg) {
            return PromiseOrValue::Value(U128(self.buy_from_listing(sender_id, amount.0, buy)));
        }
        if let Ok(o) = serde_json::from_str::<OfferMsg>(&msg) {
            let escrow = o.offer.shares.0 * o.offer.price_per_share.0;
            if o.offer.shares.0 == 0 || o.offer.price_per_share.0 == 0 || escrow > amount.0 {
                env::log_str("rejected: the offer does not match the amount sent");
                return PromiseOrValue::Value(amount);
            }
            let id = self.next_trade_id;
            self.next_trade_id += 1;
            self.offers.insert(
                &id,
                &Offer {
                    buyer: sender_id.clone(),
                    shares: o.offer.shares,
                    price_per_share: o.offer.price_per_share,
                },
            );
            self.last_accounted += escrow;
            env::log_str(&format!(
                "offer_posted {} by {}: {} at {}",
                id, sender_id, o.offer.shares.0, o.offer.price_per_share.0
            ));
            return PromiseOrValue::Value(U128(amount.0 - escrow));
        }
        env::log_str("rejected: unknown message");
        PromiseOrValue::Value(amount)
    }

    // ---- replacing the manager -------------------------------------------

    /// Vote for a manager and their fee. Counted at your balance when the
    /// vote is applied, so it follows your shares if you sell.
    pub fn vote_manager(&mut self, manager: AccountId, fee_bps: u32) {
        let who = env::predecessor_account_id();
        require!(self.balance_of_internal(&who) > 0, "Only a holder may vote");
        require!(
            fee_bps + self.reserve_bps + self.platform_bps <= MAX_TOTAL_FEE_BPS,
            "That fee would take fees above 30% of rent"
        );
        if self.manager_votes.get(&who).is_none() {
            require!(
                self.voters.len() < MAX_VOTERS as u64,
                "Too many voters recorded"
            );
            self.voters.push(&who);
        }
        self.manager_votes.insert(
            &who,
            &ManagerVote {
                manager: manager.clone(),
                fee_bps,
            },
        );
        env::log_str(&format!(
            "manager_vote {} for {} at {}",
            who, manager, fee_bps
        ));
    }

    /// Apply a manager change that holders of more than half of the shares
    /// voted for. Open to anyone.
    pub fn apply_manager_vote(&mut self, manager: AccountId, fee_bps: u32) {
        let support = self.vote_support(&manager, fee_bps);
        let whole = if self.share_cap > 0 {
            self.share_cap
        } else {
            self.total_supply
        };
        require!(whole > 0, "No shares exist");
        require!(
            support * 2 > whole,
            "Holders of more than half of the shares have not voted for this"
        );
        require!(manager != self.manager, "That is already the manager");
        self.change_manager(manager.clone(), Some(fee_bps));
        env::log_str(&format!(
            "manager_replaced by vote: {} at {} with {} of {} shares",
            manager, fee_bps, support, whole
        ));
    }

    // ---- views ------------------------------------------------------------

    pub fn get_listings(&self, from: Option<u64>, limit: Option<u64>) -> Vec<(u64, Listing)> {
        self.listings
            .iter()
            .skip(from.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .collect()
    }

    pub fn get_offers(&self, from: Option<u64>, limit: Option<u64>) -> Vec<(u64, Offer)> {
        self.offers
            .iter()
            .skip(from.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .collect()
    }

    pub fn locked_shares(&self, account_id: AccountId) -> U128 {
        U128(self.locked_of(&account_id))
    }

    pub fn get_manager_vote(&self, account_id: AccountId) -> Option<ManagerVote> {
        self.manager_votes.get(&account_id)
    }

    /// Shares currently backing a manager and fee.
    pub fn manager_vote_support(&self, manager: AccountId, fee_bps: u32) -> U128 {
        U128(self.vote_support(&manager, fee_bps))
    }
}

impl Vault {
    pub(crate) fn locked_of(&self, who: &AccountId) -> u128 {
        self.locked.get(who).unwrap_or(0)
    }

    /// Shares an account may move: its balance less what it has listed.
    pub(crate) fn free_balance(&self, who: &AccountId) -> u128 {
        self.balance_of_internal(who)
            .saturating_sub(self.locked_of(who))
    }

    fn unlock(&mut self, who: &AccountId, n: u128) {
        let left = self.locked_of(who).saturating_sub(n);
        if left == 0 {
            self.locked.remove(who);
        } else {
            self.locked.insert(who, &left);
        }
    }

    /// Returns what is left of the payment, for the token to refund.
    fn buy_from_listing(&mut self, buyer: AccountId, amount: u128, msg: BuyMsg) -> u128 {
        let Some(mut listing) = self.listings.get(&msg.buy) else {
            env::log_str("rejected: no such listing");
            return amount;
        };
        if listing.seller == buyer {
            env::log_str("rejected: you cannot buy your own listing");
            return amount;
        }
        let price = listing.price_per_share.0;
        let affordable = amount / price;
        let wanted = msg.shares.map(|s| s.0).unwrap_or(affordable);
        let n = wanted.min(affordable).min(listing.shares.0);
        if n == 0 {
            env::log_str("rejected: not enough for one share");
            return amount;
        }
        // The seller may have moved shares off since listing; never sell
        // more than they still hold.
        if self.balance_of_internal(&listing.seller) < n {
            env::log_str("rejected: the seller no longer holds these shares");
            return amount;
        }

        let cost = n * price;
        let fee = cost * TRADE_FEE_BPS / (BPS as u128);
        let net = cost - fee;

        self.unlock(&listing.seller, n);
        self.internal_transfer(&listing.seller, &buyer, n);
        listing.shares = U128(listing.shares.0 - n);
        if listing.shares.0 == 0 {
            self.listings.remove(&msg.buy);
        } else {
            self.listings.insert(&msg.buy, &listing);
        }

        // The whole price arrived; the seller's part leaves at once, Sheda's
        // waits as a fee owed to the treasury.
        self.last_accounted += cost;
        self.last_accounted -= net;
        self.owed_treasury += fee;
        env::log_str(&format!(
            "shares_sold listing {} {} by {} to {} for {} fee {}",
            msg.buy, n, listing.seller, buyer, cost, fee
        ));
        let _ = self.pay(listing.seller, net, PayKind::Holder);
        amount - cost
    }

    fn vote_support(&self, manager: &AccountId, fee_bps: u32) -> u128 {
        let mut support = 0u128;
        for voter in self.voters.iter() {
            if let Some(v) = self.manager_votes.get(&voter) {
                if &v.manager == manager && v.fee_bps == fee_bps {
                    support += self.balance_of_internal(&voter);
                }
            }
        }
        support
    }

    /// Hand the flat to a new manager. What the outgoing one earned is paid
    /// to them now; left in `owed_manager` it would go to their successor.
    pub(crate) fn change_manager(&mut self, manager: AccountId, fee_bps: Option<u32>) {
        let owed = self.owed_manager;
        let outgoing = self.manager.clone();
        self.manager = manager;
        if let Some(f) = fee_bps {
            self.manager_bps = f;
        }
        if owed > 0 {
            self.owed_manager = 0;
            self.last_accounted -= owed;
            // Paid as a holder payout so that, if the transfer fails, it is
            // restored to the outgoing manager's own claimable balance and
            // never to `owed_manager`, which now belongs to their successor.
            let _ = self.pay(outgoing, owed, PayKind::Holder);
        }
    }
}
