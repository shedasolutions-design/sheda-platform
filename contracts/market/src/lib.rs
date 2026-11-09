// Find all our documentation at https://docs.near.org
pub mod admin;
pub mod events;
pub mod internal;
pub mod models;
pub mod views;

pub mod ext;
#[allow(unused_imports)]
use crate::models::{Bid, BidStatus, ContractError, DisputeStatus, Lease, Property};
use crate::{
    events::{emit_event, BidPlacedEvent, LostBidClaimedEvent, PropertyMintedEvent},
    models::Sold,
};
use crate::{internal::*, models::Action};

#[allow(unused_imports)]
use near_contract_standards::non_fungible_token::{
    approval::NonFungibleTokenApproval,
    core::NonFungibleTokenCore,
    enumeration::NonFungibleTokenEnumeration,
    metadata::NonFungibleTokenMetadataProvider,
    metadata::{NFTContractMetadata, TokenMetadata},
    NonFungibleToken, Token,
};
use near_sdk::{
    assert_one_yocto,
    borsh::{self, BorshDeserialize, BorshSerialize},
    collections::LazyOption,
    env,
    json_types::U128,
    log, near, require,
    store::{IterableMap, IterableSet},
    AccountId, Gas, NearToken, PanicOnDefault, Promise,
};

pub use crate::ext::*;

pub type TokenId = String;

const NS_PER_HOUR: u64 = 60 * 60 * 1_000_000_000;

/// Defaults for the buyer-cancellation windows.
pub const DEFAULT_PATH_A_CANCELLATION_WINDOW_NS: u64 = NS_PER_HOUR;
pub const DEFAULT_PATH_B_STAGE1_WINDOW_NS: u64 = 24 * NS_PER_HOUR;
pub const DEFAULT_PATH_B_STAGE2_WINDOW_NS: u64 = 48 * NS_PER_HOUR;
/// 7 days.
///
/// This is *not* a lock on the buyer. While a deal is `Accepted` — the stage
/// that covers appointments — the buyer can cancel and take their escrow back
/// at any moment, with no waiting period at all. See
/// `buyer_cancel_accepted_bid`. Appointments happen off-chain and fall through
/// for all sorts of reasons, and money locked with no way out would leave the
/// buyer at the seller's mercy.
///
/// This timeout exists for the party who *can't* act unilaterally: the seller,
/// reclaiming their property when it's the buyer who went silent. Kept short
/// for the one case where it does bind a buyer — after the agreement was
/// released and the rejection window lapsed — so nobody waits a month.
pub const DEFAULT_STALLED_DEAL_TIMEOUT_NS: u64 = 7 * 24 * NS_PER_HOUR;
pub const DEFAULT_DISPUTE_RESOLUTION_TIMELOCK_NS: u64 = 72 * NS_PER_HOUR;
pub const DEFAULT_LEASE_EARLY_TERMINATION_WINDOW_NS: u64 = 7 * 24 * NS_PER_HOUR;
/// How long after a lease ends the owner may claim against the tenant's
/// security deposit.
///
/// Long enough to inspect a property after handover, short enough that a
/// tenant is not waiting weeks on their own money. Once it lapses the deposit
/// is the tenant's to take back and the owner cannot stop them, which is the
/// half of the arrangement that makes paying a deposit safe at all.
pub const DEFAULT_DAMAGE_CLAIM_WINDOW_NS: u64 = 7 * 24 * NS_PER_HOUR;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ShedaContract {
    pub tokens: NonFungibleToken,
    pub metadata: LazyOption<NFTContractMetadata>,
    pub properties: IterableMap<u64, Property>,
    pub bids: IterableMap<u64, Vec<Bid>>, //property_id to list of bids
    pub leases: IterableMap<u64, Lease>,

    //tracking
    pub property_counter: u64,
    pub bid_counter: u64,
    pub lease_counter: u64,
    pub property_per_owner: IterableMap<AccountId, Vec<u64>>, //owner to list of property ids

    pub lease_per_tenant: IterableMap<AccountId, Vec<u64>>, //tenant to list of lease ids
    //admins
    pub admins: IterableSet<AccountId>,
    pub owner_id: AccountId,

    //accepted stablecoin info could go here
    pub accepted_stablecoin: Vec<AccountId>,
    pub stable_coin_balances: IterableMap<AccountId, u128>,

    // Guards and configuration
    pub reentrancy_locks: IterableSet<String>,
    pub bid_expiry_ns: u64,
    pub escrow_release_delay_ns: u64,
    pub lost_bid_claim_delay_ns: u64,

    // Buyer-cancellation windows. How long a buyer has to walk away at each
    // stage of a deal, and how long an admin has to settle a contested one.
    // Configurable via `set_cancellation_windows` so they can be tuned without
    // a redeploy.
    //
    /// Unused. Path A is the direct, non-escrow acceptance, which settles in
    /// the same transaction and never rests in a cancellable state. Kept
    /// because removing a field would churn the Borsh layout again for nothing.
    pub path_a_cancellation_window_ns: u64,
    /// Window to cancel a bid the seller accepted, before any agreement is
    /// sent. Gates `buyer_cancel_accepted_bid`.
    pub path_b_stage1_window_ns: u64,
    /// Window for the buyer to reject the agreement they were sent. Gates
    /// `buyer_reject_documents_and_cancel`.
    pub path_b_stage2_window_ns: u64,
    /// How long a deal may sit in `Accepted` or `DocsReleased` before either
    /// party can unwind it via `refund_escrow_timeout`.
    ///
    /// This occupies the slot the spec called `path_b_stage3_window_ns`, which
    /// would have been a cancellation window *after* the buyer confirms the
    /// agreement — precisely the exit that must not exist, since accepting the
    /// terms is the commitment the seller relies on. Renamed rather than
    /// removed and re-added: Borsh is positional, so a rename is free while a
    /// new field would churn the layout again.
    ///
    /// Long by design. The `Accepted` stage covers real-world appointments,
    /// and this is the backstop for a counterparty who has gone silent, not a
    /// deadline anyone should be racing.
    pub stalled_deal_timeout_ns: u64,
    pub dispute_resolution_timelock_ns: u64,
    pub lease_early_termination_window_ns: u64,
    /// Owner's window to claim against a security deposit after a lease ends.
    pub damage_claim_window_ns: u64,

    // Global contract factory

    // Upgrade governance
    pub version: u32,
}

trait HasNew {
    fn new(media_url: String) -> Self;
}

//implement NEP-171 standard, checking that nft is not on lease before transfer
#[near]
impl NonFungibleTokenCore for ShedaContract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let property_id = token_id.parse::<u64>().expect("Invalid token ID");
        let property = self
            .properties
            .get(&property_id)
            .expect("Property does not exist");
        if let Some(lease) = &property.active_lease {
            if lease.active {
                env::panic_str("Cannot transfer property while it is on an active lease");
            }
        }
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> near_sdk::PromiseOrValue<bool> {
        let property_id = token_id.parse::<u64>().expect("Invalid token ID");
        let property = self
            .properties
            .get(&property_id)
            .expect("Property does not exist");
        if let Some(lease) = &property.active_lease {
            if lease.active {
                env::panic_str("Cannot transfer property while it is on an active lease");
            }
        }
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenApproval for ShedaContract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<near_sdk::Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id)
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id)
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for ShedaContract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for ShedaContract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().expect("Metadata not found")
    }
}

impl HasNew for NFTContractMetadata {
    fn new(media_url: String) -> Self {
        Self {
            spec: "nft-2.0.0".to_string(),
            name: "Sheda NFT".to_string(),
            symbol: "SHEDA".to_string(),
            icon: Some(media_url.clone()),
            base_uri: Some(format!("ipfs://{}", extract_base_uri(&media_url))),
            reference: None,
            reference_hash: None,
        }
    }
}

// Implement the contract structure
#[near]
impl ShedaContract {
    fn checked_add_u128(left: u128, right: u128, label: &str) -> u128 {
        left.checked_add(right)
            .unwrap_or_else(|| env::panic_str(&format!("Overflow in {}", label)))
    }

    fn checked_sub_u128(left: u128, right: u128, label: &str) -> u128 {
        left.checked_sub(right)
            .unwrap_or_else(|| env::panic_str(&format!("Underflow in {}", label)))
    }

    /// Normalises a listing's requested security deposit.
    ///
    /// A deposit only means something on a lease listing — a sale has no
    /// tenant to collect one from and nobody to give it back to — so asking
    /// for one on a sale-only property is refused rather than quietly stored
    /// and never collected.
    fn checked_damage_deposit(requested: Option<U128>, lease_duration_days: Option<u64>) -> u128 {
        let amount = requested.map(|a| a.0).unwrap_or(0);
        require!(
            amount == 0 || lease_duration_days.is_some(),
            "A security deposit can only be required on a property that is for lease"
        );
        amount
    }

    fn checked_add_u64(left: u64, right: u64, label: &str) -> u64 {
        left.checked_add(right)
            .unwrap_or_else(|| env::panic_str(&format!("Overflow in {}", label)))
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can call"
        );
    }

    fn assert_admin(&self) {
        require!(
            self.admins.contains(&env::predecessor_account_id()),
            "UnauthorizedAccess"
        );
    }

    //set required init parameters here
    #[init]
    pub fn new(media_url: String, supported_stablecoins: Vec<AccountId>) -> Self {
        assert!(!env::state_exists(), "Contract is already initialized");

        let owner_id = env::predecessor_account_id();

        let mut this = Self {
            tokens: NonFungibleToken::new(
                b"v2_t".to_vec(),
                owner_id.clone(),
                Some(b"v2_tm".to_vec()),
                Some(b"v2_te".to_vec()),
                Some(b"v2_ta".to_vec()),
            ),
            metadata: LazyOption::new(
                b"v2_md".to_vec(),
                Some(&NFTContractMetadata::new(media_url)),
            ),
            properties: IterableMap::new(b"v2_p".to_vec()),
            bids: IterableMap::new(b"v2_b".to_vec()),
            leases: IterableMap::new(b"v2_l".to_vec()),
            property_counter: 0,
            bid_counter: 0,
            lease_counter: 0,
            property_per_owner: IterableMap::new(b"v2_po".to_vec()),
            lease_per_tenant: IterableMap::new(b"v2_lt".to_vec()),
            admins: IterableSet::new(b"v2_a".to_vec()),
            owner_id: owner_id.clone(),
            accepted_stablecoin: supported_stablecoins.clone(),
            stable_coin_balances: IterableMap::new(b"v2_s".to_vec()),
            reentrancy_locks: IterableSet::new(b"v2_rl".to_vec()),
            bid_expiry_ns: 7 * 24 * 60 * 60 * 1_000_000_000,
            escrow_release_delay_ns: 24 * 60 * 60 * 1_000_000_000,
            lost_bid_claim_delay_ns: 24 * 60 * 60 * 1_000_000_000,
            path_a_cancellation_window_ns: DEFAULT_PATH_A_CANCELLATION_WINDOW_NS,
            path_b_stage1_window_ns: DEFAULT_PATH_B_STAGE1_WINDOW_NS,
            path_b_stage2_window_ns: DEFAULT_PATH_B_STAGE2_WINDOW_NS,
            stalled_deal_timeout_ns: DEFAULT_STALLED_DEAL_TIMEOUT_NS,
            dispute_resolution_timelock_ns: DEFAULT_DISPUTE_RESOLUTION_TIMELOCK_NS,
            lease_early_termination_window_ns: DEFAULT_LEASE_EARLY_TERMINATION_WINDOW_NS,
            damage_claim_window_ns: DEFAULT_DAMAGE_CLAIM_WINDOW_NS,
            version: 4,
        };
        this.admins.insert(owner_id);
        for stablecoin in supported_stablecoins {
            this.stable_coin_balances.insert(stablecoin, 0);
        }

        this
    }

    /// Update bid expiry and escrow timelock settings (nanoseconds).
    pub fn set_time_lock_config(
        &mut self,
        bid_expiry_ns: u64,
        escrow_release_delay_ns: u64,
        lost_bid_claim_delay_ns: u64,
    ) {
        self.assert_owner();
        self.bid_expiry_ns = bid_expiry_ns;
        self.escrow_release_delay_ns = escrow_release_delay_ns;
        self.lost_bid_claim_delay_ns = lost_bid_claim_delay_ns;
    }

    /// Lists a property.
    ///
    /// `damage_deposit_required` is the security deposit to ask a tenant for;
    /// `None` or `0` charges none. It is only meaningful alongside
    /// `lease_duration_days` — a property that is not for lease never has a
    /// tenant to collect one from, and a sale listing that names one is
    /// refused rather than storing a figure nothing ever charges.
    #[payable]
    pub fn mint_property(
        &mut self,
        title: String,
        description: String,
        media_uri: String, // IPFS link to image
        price: U128,
        is_for_sale: bool,
        lease_duration_days: Option<u64>,
        damage_deposit_required: Option<U128>,
    ) -> u64 {
        // 1. Calculate IDs
        let property_id = self.property_counter;
        self.property_counter = Self::checked_add_u64(self.property_counter, 1, "property_counter");
        let token_id_str = property_id.to_string(); // NEP-171 requires String IDs

        let owner_id = env::predecessor_account_id();

        // 2. Create Standard NFT Metadata (Visible in Wallets)
        let token_metadata = TokenMetadata {
            title: Some(title),
            description: Some(description.clone()),
            media: Some(media_uri.clone()), // Wallet shows this image
            copies: Some(1),
            ..Default::default()
        };

        //NOTE 3. Mint the Standard NFT (Events & Ownership)
        // This handles "property_per_owner" internally via the standard
        self.tokens
            .internal_mint(token_id_str, owner_id.clone(), Some(token_metadata));

        // 4. Create Your Custom Property Object
        let property = Property {
            id: property_id,
            owner_id: owner_id.clone(),
            description,
            metadata_uri: media_uri.clone(),
            is_for_sale,
            price: price.0,
            lease_duration_days,
            damage_deposit_required: Self::checked_damage_deposit(
                damage_deposit_required,
                lease_duration_days,
            ),
            active_lease: None,
            timestamp: env::block_timestamp(),
            sold: None,
        };

        // 5. Save Custom Data
        self.properties.insert(property_id, property);

        let mut owner_properties = self
            .property_per_owner
            .get(&owner_id)
            .cloned()
            .unwrap_or_default();
        owner_properties.push(property_id);
        self.property_per_owner
            .insert(owner_id.clone(), owner_properties);

        emit_event(
            "PropertyMinted",
            PropertyMintedEvent {
                token_id: property_id,
                owner_id: owner_id.clone(),
                metadata_uri: media_uri,
                price: price.0,
                is_for_sale,
                lease_duration_nanos: lease_duration_days.unwrap_or(0)
                    * 24
                    * 60
                    * 60
                    * 1_000_000_000,
                damage_escrow_amount: 0,
            },
        );

        // 6. Return the ID for the frontend
        property_id
    }

    //NOTE Placing a Bid
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        let bid_action: models::BidAction =
            serde_json::from_str::<models::BidAction>(&msg).expect("Invalid BidAction");
        let property_id = bid_action.property_id;
        let sender_id_guard = sender_id.clone();

        let property = self
            .properties
            .get(&property_id)
            .expect("Property not found");

        // Amount can be any value; price is advisory for frontends.

        require!(
            self.accepted_stablecoin
                .contains(&env::predecessor_account_id()),
            "StablecoinNotAccepted"
        );

        require!(
            bid_action.stablecoin_token == env::predecessor_account_id(),
            "StablecoinMismatch"
        );

        //assert the property is fo sale if action is sales and for lease if action is lease
        // A lease bid carries the rent and the security deposit in a single
        // transfer, so the tenant signs once. The two are separated here and
        // stay separate for the rest of the deal: the rent is the landlord's
        // on acceptance, the deposit is only ever the tenant's or — after a
        // successful damage claim — partly the landlord's.
        let damage_deposit = match bid_action.action {
            Action::Purchase => {
                assert!(property.is_for_sale, "Property is not for sale");
                0
            }
            Action::Lease => {
                assert!(
                    property.lease_duration_days.is_some(),
                    "Property is not for lease"
                );
                // A renewal continues a tenancy whose deposit is already held.
                // Charging again each term would stack deposits the tenant
                // cannot get back until the very end, and only the last one
                // would ever be refunded.
                let renewing = property
                    .active_lease
                    .as_ref()
                    .is_some_and(|lease| lease.active && lease.tenant_id == sender_id);
                if renewing {
                    0
                } else {
                    property.damage_deposit_required
                }
            }
        };

        // Refusing is the safe failure here: `ft_on_transfer` returning a
        // panic refunds the whole transfer to the sender, so a tenant who
        // underpays gets their money back rather than a lease with no deposit
        // behind it.
        require!(
            amount.0 >= damage_deposit,
            "Transfer must cover the rent and the security deposit"
        );
        let rent = amount.0 - damage_deposit;

        // Amount matches, create the bid
        let bid_id = self.bid_counter;
        self.bid_counter = Self::checked_add_u64(self.bid_counter, 1, "bid_counter");

        // Assuming Bid struct has fields: id, property_id, bidder, amount, etc.
        // Adjust based on actual Bid struct definition
        let expires_at = if self.bid_expiry_ns == 0 {
            None
        } else {
            Some(env::block_timestamp() + self.bid_expiry_ns)
        };

        let bid = Bid {
            id: bid_id,
            property_id: property_id,
            bidder: sender_id,
            amount: rent,
            created_at: env::block_timestamp(),
            updated_at: env::block_timestamp(),
            status: BidStatus::Pending,
            document_token_id: None,
            document_image_uri: None,
            document_description: None,
            escrow_release_tx: None,
            dispute_reason: None,
            expires_at,
            escrow_release_after: None,
            action: bid_action.action.clone(),
            stablecoin_token: env::predecessor_account_id(),
            damage_deposit,
            lease_id: None,
        };

        internal::lock_ft_on_transfer(self, property_id, &sender_id_guard);

        emit_event(
            "BidPlaced",
            BidPlacedEvent {
                token_id: property_id,
                bidder_id: bid.bidder.clone(),
                amount: bid.amount,
                created_at: bid.created_at,
            },
        );

        // Insert the bid into the bids map
        self.bids.entry(property_id).or_insert(Vec::new()).push(bid);

        //update stablecoin balance
        let current_balance = *self
            .stable_coin_balances
            .get(&env::predecessor_account_id())
            .unwrap_or(&0);

        self.stable_coin_balances.insert(
            env::predecessor_account_id(),
            Self::checked_add_u128(current_balance, amount.0, "bid deposit"),
        );

        // Returning 0 means: keep all tokens, no refund
        internal::unlock_ft_on_transfer(self, property_id, &sender_id_guard);
        U128(0)
    }

    #[payable]
    pub fn accept_bid(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal_accept_bid(self, property_id, bid_id)
    }

    #[payable]
    pub fn accept_bid_with_escrow(&mut self, bid_id: u64, property_id: u64) -> bool {
        internal::internal_accept_bid_with_escrow(self, property_id, bid_id)
    }

    /// Owner accepts a renewal bid from the property's current tenant:
    /// extends the active lease from its own end_time (same duration as the
    /// property's configured lease_duration_days) and mints that term's
    /// own document. No 24h escrow timelock and no NFT transfer — the
    /// tenant already holds the property NFT, this only ever needs to
    /// authenticate the current tenant + payment.
    #[payable]
    pub fn accept_lease_renewal(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal::internal_accept_lease_renewal(self, property_id, bid_id)
    }

    #[private]
    pub fn accept_lease_renewal_callback(
        &mut self,
        property_id: u64,
        bid_id: u64,
        new_end_time: u64,
    ) {
        internal::accept_lease_renewal_callback(self, property_id, bid_id, new_end_time);
    }

    #[private]
    pub fn accept_bid_callback(&mut self, property_id: u64, bid_id: u64) {
        internal::accept_bid_callback(self, property_id, bid_id);
    }

    #[private]
    pub fn refund_pending_bid_callback(
        &mut self,
        property_id: u64,
        bid_id: u64,
        stablecoin_token: AccountId,
        amount: u128,
    ) {
        internal::refund_pending_bid_callback(self, property_id, bid_id, stablecoin_token, amount);
    }

    #[payable]
    pub fn reject_bid(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal_reject_bid(self, property_id, bid_id)
    }

    #[payable]
    pub fn cancel_bid(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal_cancel_bid(self, property_id, bid_id)
    }

    /// Cancel a bid the seller accepted but hasn't sent the agreement for.
    ///
    /// `cancel_bid` only covers a `Pending` bid. Once a bid was accepted the
    /// buyer had no way out at all, so a deal that stalled left their funds in
    /// escrow indefinitely with only an admin refund to fall back on.
    ///
    /// Nothing has been handed over at this stage, so this is a clean exit:
    /// full refund, and the property goes back on the market.
    ///
    /// Windows are configurable via `set_cancellation_windows`.
    #[payable]
    pub fn buyer_cancel_accepted_bid(
        &mut self,
        bid_id: u64,
        property_id: u64,
    ) -> near_sdk::Promise {
        internal::internal_buyer_cancel_accepted_bid(self, property_id, bid_id)
    }

    /// Reject the agreement the seller sent, and cancel the deal.
    ///
    /// The agreement is the real-world contract the two sides settled on after
    /// their appointments, minted to the buyer as an NFT. If the buyer won't
    /// accept those terms, this burns the agreement and returns their escrow.
    ///
    /// The burn is the point: a buyer who walks away must not keep the terms
    /// the seller handed over. That's what makes releasing the document safe
    /// for the seller.
    ///
    /// Confirming the agreement instead (`confirm_document_receipt`) is the
    /// commitment — see the note on that method. There is deliberately no
    /// cancellation entrypoint past it.
    #[payable]
    pub fn buyer_reject_documents_and_cancel(
        &mut self,
        bid_id: u64,
        property_id: u64,
    ) -> near_sdk::Promise {
        internal::internal_buyer_reject_documents_and_cancel(self, property_id, bid_id)
    }

    #[payable]
    pub fn delist_property(&mut self, property_id: u64) {
        //ensure I own the property

        internal_delist_property(self, property_id);
    }

    /// Put an already-minted property back on the market, or edit its terms.
    ///
    /// Until now `is_for_sale` could only ever be set to `true` inside
    /// `mint_property`, so the only way to list anything was to mint a new
    /// NFT. That made a resale impossible without minting a second token for
    /// a property that already exists on-chain. This lets whoever currently
    /// owns a property list it — for sale or for lease — reusing the token
    /// they already hold, and doubles as the price/duration editor.
    ///
    /// Pass `is_for_sale: false` to take a listing down while keeping the
    /// updated terms (`delist_property` remains the plain "unlist" call).
    #[payable]
    pub fn update_listing(
        &mut self,
        property_id: u64,
        price: U128,
        is_for_sale: bool,
        lease_duration_days: Option<u64>,
        damage_deposit_required: Option<U128>,
    ) {
        assert_one_yocto();

        let mut property = self
            .properties
            .get(&property_id)
            .expect("Property not found")
            .clone();

        assert_eq!(
            property.owner_id,
            env::predecessor_account_id(),
            "Only the property owner can update the listing"
        );

        // An occupied property isn't the owner's to re-offer until the lease
        // ends — same guard delist/delete already apply.
        assert!(
            property.active_lease.is_none(),
            "Cannot update the listing while the property has an active lease"
        );

        assert!(
            !is_for_sale || price.0 > 0,
            "A listed property must have a price above zero"
        );

        // Changing the deposit only affects tenants who bid from here on:
        // every bid snapshots the figure it was placed against, so a tenant
        // mid-deal is unaffected by an owner editing the listing underneath
        // them.
        property.price = price.0;
        property.is_for_sale = is_for_sale;
        property.lease_duration_days = lease_duration_days;
        property.damage_deposit_required =
            Self::checked_damage_deposit(damage_deposit_required, lease_duration_days);
        self.properties.insert(property_id, property);
    }

    #[payable]
    pub fn delete_property(&mut self, property_id: u64) {
        internal_delete_property(self, property_id);
    }

    // The `#[payable]` markers from here down are not about wanting the money.
    //
    // A state-changing method is conventionally called with one yoctoNEAR
    // attached, because spending a deposit requires a full-access key and so
    // proves the call was not made by some dapp's limited-access key. Every
    // client in this project does that on every write. near_sdk rejects a
    // deposit outright on a method that is not `#[payable]` — "Method X
    // doesn't accept deposit" — so each of these was unreachable from the app,
    // no matter what arguments it sent.
    //
    // That is what took out the second half of a purchase: the buyer could not
    // accept the agreement (`confirm_document_receipt`) and could not release
    // the payment (`release_escrow`), so a deal that got as far as documents
    // had nowhere left to go.

    #[payable]
    pub fn raise_lease_dispute(&mut self, lease_id: u64) {
        internal_raise_dispute(self, lease_id, "".to_string());
    }

    #[payable]
    pub fn raise_lease_dispute_with_reason(&mut self, lease_id: u64, reason: String) {
        internal_raise_dispute(self, lease_id, reason);
    }

    #[payable]
    pub fn raise_dispute(&mut self, bid_id: u64, property_id: u64, reason: String) -> bool {
        internal::internal_raise_bid_dispute(self, property_id, bid_id, reason)
    }

    /// Owner claims against a tenant's security deposit after the lease ends.
    ///
    /// `amount` is what they are asking for, not what they get: an admin
    /// settles it with `resolve_dispute`, and whatever is not awarded goes
    /// back to the tenant.
    #[payable]
    pub fn raise_damage_claim(&mut self, lease_id: u64, amount: U128, reason: String) {
        internal::internal_raise_damage_claim(self, lease_id, amount.0, reason);
    }

    /// Returns a security deposit in full once the owner's claim window has
    /// closed without a claim.
    ///
    /// Callable by anyone — the money can only ever go to the tenant, so there
    /// is nothing to gain by calling it for them, and a tenant who has lost
    /// access to their app is not the only one who can unstick their funds.
    #[payable]
    pub fn refund_damage_deposit(&mut self, lease_id: u64) -> near_sdk::Promise {
        internal::internal_refund_damage_deposit(self, lease_id)
    }

    #[private]
    pub fn refund_damage_deposit_callback(
        &mut self,
        lease_id: u64,
        token: AccountId,
        amount: U128,
    ) {
        internal::refund_damage_deposit_callback(self, lease_id, token, amount.0);
    }

    #[payable]
    pub fn expire_lease(&mut self, lease_id: u64) {
        internal::internal_expire_lease(self, lease_id);
    }

    /// Payable so the standard one-yoctoNEAR confirmation deposit is accepted.
    /// Without it near_sdk rejected the call outright ("doesn't accept
    /// deposit"), which is what every client sends — so between that and the
    /// storage panic inside the mint, releasing an agreement could not succeed
    /// from either direction.
    #[payable]
    pub fn confirm_document_release(
        &mut self,
        bid_id: u64,
        property_id: u64,
        document_image_uri: String,
        document_description: String,
    ) -> bool {
        internal::internal_confirm_document_release(
            self,
            property_id,
            bid_id,
            document_image_uri,
            document_description,
        )
    }

    /// Accept the agreement the seller sent. **This is the point of no
    /// return.**
    ///
    /// The buyer has reviewed the real-world terms and is agreeing to them.
    /// After this there is no cancellation entrypoint — only releasing payment
    /// or raising a dispute. That asymmetry is deliberate and load-bearing: the
    /// seller hands over a signed agreement on the understanding that accepting
    /// it commits the buyer, so an exit here would let a buyer take the terms
    /// and walk.
    ///
    /// A buyer who does not want to proceed must call
    /// `buyer_reject_documents_and_cancel` instead, which burns the agreement
    /// and refunds them.
    #[payable]
    pub fn confirm_document_receipt(&mut self, bid_id: u64, property_id: u64) -> bool {
        internal::internal_confirm_document_receipt(self, property_id, bid_id)
    }

    #[payable]
    pub fn release_escrow(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal::internal_release_escrow(self, property_id, bid_id)
    }

    #[private]
    pub fn release_escrow_callback(&mut self, property_id: u64, bid_id: u64) {
        internal::release_escrow_callback(self, property_id, bid_id);
    }

    #[payable]
    pub fn complete_transaction(&mut self, bid_id: u64, property_id: u64) -> bool {
        internal::internal_complete_transaction(self, property_id, bid_id)
    }

    /// Unwind a deal whose counterparty has gone silent, once
    /// `stalled_deal_timeout_ns` has genuinely elapsed.
    ///
    /// This is the backstop behind `buyer_cancel_accepted_bid`: the buyer can
    /// leave the `Accepted` stage at any time, and this is how the *seller*
    /// gets their property back when it's the buyer who disappeared.
    ///
    /// It used to take `timeout_nanos` from the caller and had no access
    /// control, so anyone could pass `0` and force-refund any accepted deal —
    /// including a buyer wanting their money back while keeping the agreement.
    /// The duration now comes from state and the caller must be a party to the
    /// deal or an admin.
    #[payable]
    pub fn refund_escrow_timeout(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        internal::internal_refund_escrow_timeout(self, property_id, bid_id)
    }

    #[payable]
    pub fn cron_check_leases(&mut self) -> bool {
        let now = env::block_timestamp();
        let expired_ids: Vec<u64> = self
            .leases
            .iter()
            .filter_map(|(id, lease)| {
                if lease.active && lease.end_time <= now {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect();

        for lease_id in expired_ids {
            internal::internal_expire_lease(self, lease_id);
        }

        true
    }

    #[private]
    pub fn refund_escrow_timeout_callback(
        &mut self,
        property_id: u64,
        bid_id: u64,
        stablecoin_token: AccountId,
        amount: u128,
    ) {
        internal::refund_escrow_timeout_callback(
            self,
            property_id,
            bid_id,
            stablecoin_token,
            amount,
        );
    }

    // Allow bidders to manually claim/withdraw their bid that was not accepted
    #[payable]
    pub fn claim_lost_bid(&mut self, bid_id: u64, property_id: u64) -> near_sdk::Promise {
        let bids = self
            .bids
            .get(&property_id)
            .expect("No bids for this property");

        let bid = bids
            .iter()
            .find(|b| b.id == bid_id)
            .expect("Bid not found")
            .clone();

        // ONLY `Pending`. A `Rejected` bid has already been paid back.
        //
        // `internal_reject_bid` refunds the bidder, debits
        // `stable_coin_balances`, and only then sets the status to `Rejected`.
        // Accepting `Rejected` here therefore refunded the same bid a second
        // time: the bidder was paid twice and the contract's stablecoin pool
        // was debited twice for one deposit.
        //
        // The pool is shared across every open deal, so the damage is not
        // confined to the bid being claimed — it comes out of funds held for
        // other people. The visible symptom is a later, entirely legitimate
        // refund panicking with "Underflow in staged cancel refund", which is
        // the accounting guard noticing the pool can no longer cover what it
        // owes. That guard was doing its job; this is what it was catching.
        //
        // `Pending` is the state this method exists for: a bid nobody ever
        // actioned, on a property that has since gone to someone else.
        require!(
            bid.status == BidStatus::Pending,
            match bid.status {
                BidStatus::Rejected => "This bid was already refunded when it was rejected.",
                _ => "Bid is not claimable",
            }
        );

        // Only the bidder can claim their own bid
        assert_eq!(
            bid.bidder,
            env::predecessor_account_id(),
            "Only the bidder can claim their bid"
        );

        // Check if the property has been sold or leased to someone else
        let property = self
            .properties
            .get(&property_id)
            .expect("Property not found");

        let can_claim = match bid.action {
            crate::models::Action::Purchase => {
                // Can claim if property has been sold to someone else.
                //
                // `sold` is permanent history and the new owner may list the
                // property again, so the sale alone is not enough: the bid has
                // to predate it. A bid placed into a later round lost nothing
                // to that sale and is still live — without this it could be
                // withdrawn the moment it was placed.
                property.sold.as_ref().is_some_and(|sold| {
                    sold.buyer_id != bid.bidder && bid.created_at < sold.sold_at
                })
            }
            crate::models::Action::Lease => {
                // Can claim if property has been leased to someone else
                property.active_lease.is_some()
                    && property.active_lease.as_ref().unwrap().tenant_id != bid.bidder
            }
        };

        assert!(
            can_claim,
            "Cannot claim bid: property not yet sold/leased to another party"
        );

        let claimable_at = match bid.action {
            crate::models::Action::Purchase => property
                .sold
                .as_ref()
                .map(|sold| sold.sold_at + self.lost_bid_claim_delay_ns),
            crate::models::Action::Lease => property
                .active_lease
                .as_ref()
                .map(|lease| lease.start_time + self.lost_bid_claim_delay_ns),
        };
        if let Some(unlock_at) = claimable_at {
            require!(
                env::block_timestamp() >= unlock_at,
                "Lost bid claim timelock not reached"
            );
        }

        internal::lock_bid(self, property_id, bid_id);

        // Refund the bid amount
        let promise = crate::ext::ft_contract::ext(bid.stablecoin_token.clone())
            .with_attached_deposit(near_sdk::NearToken::from_yoctonear(1))
            .with_static_gas(near_sdk::Gas::from_tgas(30))
            .ft_transfer(bid.bidder.clone(), near_sdk::json_types::U128(bid.amount));

        // Update stablecoin balance after refund
        let current_balance = *self
            .stable_coin_balances
            .get(&bid.stablecoin_token)
            .unwrap_or(&0);
        self.stable_coin_balances.insert(
            bid.stablecoin_token.clone(),
            Self::checked_sub_u128(current_balance, bid.amount, "lost_bid refund"),
        );

        // Return promise and handle callback to update bid status only on success
        promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(near_sdk::Gas::from_tgas(20))
                .claim_lost_bid_callback(
                    bid_id,
                    property_id,
                    bid.stablecoin_token.clone(),
                    bid.amount,
                ),
        )
    }

    #[private]
    pub fn claim_lost_bid_callback(
        &mut self,
        bid_id: u64,
        property_id: u64,
        stablecoin_token: AccountId,
        amount: u128,
    ) {
        internal::unlock_bid(self, property_id, bid_id);
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(_) => {
                let bidder_id = self
                    .bids
                    .get(&property_id)
                    .and_then(|bids| bids.iter().find(|bid| bid.id == bid_id))
                    .map(|bid| bid.bidder.clone())
                    .unwrap_or_else(|| env::predecessor_account_id());
                if let Some(bids) = self.bids.get_mut(&property_id) {
                    let _ = internal::update_bid_in_list(bids, bid_id, |bid| {
                        bid.status = crate::models::BidStatus::Cancelled;
                        bid.updated_at = env::block_timestamp();
                    });
                }

                near_sdk::log!("Bid {} claimed and marked cancelled", bid_id);

                emit_event(
                    "LostBidClaimed",
                    LostBidClaimedEvent {
                        token_id: property_id,
                        bid_id,
                        bidder_id,
                        amount,
                    },
                );
            }
            near_sdk::PromiseResult::Failed => {
                // Revert the balance update if transfer failed
                let current_balance = *self
                    .stable_coin_balances
                    .get(&stablecoin_token)
                    .unwrap_or(&0);
                self.stable_coin_balances.insert(
                    stablecoin_token,
                    Self::checked_add_u128(current_balance, amount, "lost_bid revert"),
                );

                near_sdk::log!("Bid claim failed, balance reverted");
            }
        }
    }
}
