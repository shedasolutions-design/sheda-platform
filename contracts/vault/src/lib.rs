//! A vault that owns one property unit on behalf of many people.
//!
//! The rental marketplace knows one thing about ownership: a property NFT has
//! an owner account, and that owner lists it, accepts bids and is paid. It
//! never asks whether that account belongs to a person. This contract is an
//! account. It holds the NFT, so it is the landlord, and the marketplace
//! needs no knowledge that anything unusual is going on.
//!
//! What it adds is the split. Shares in the vault are a fungible token; rent
//! arriving is divided among whoever holds them, in proportion and in
//! arrears. Nobody is paid when rent arrives; see `income.rs` for why that
//! matters more than it sounds.

// The `#[near_bindgen]` constructor is expanded into a function whose argument
// count is fixed by the contract's init parameters. Clippy's default threshold
// is lower than that, so the lint fires on generated code we do not control.
#![allow(clippy::too_many_arguments)]

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

mod custody;
mod ext;
mod income;
mod market;
mod shares;
mod trade;

#[cfg(test)]
mod tests;

pub use ext::*;
pub use shares::ShareMetadata;
pub use trade::{Listing, ManagerVote, Offer, TRADE_FEE_BPS};

/// Fixed-point scale for the income accumulator.
///
/// Rent per share is almost always a fraction, so the accumulator is carried
/// scaled and divided out only when a holder is paid. 1e18 leaves room for a
/// unit priced in millions split into millions of shares without the per-share
/// figure collapsing to zero.
pub const PRECISION: u128 = 1_000_000_000_000_000_000;

/// Basis points denominator. Fees are expressed in hundredths of a percent.
pub const BPS: u32 = 10_000;

/// Nothing may be configured to take more than this from rent in total.
///
/// A vault where fees could reach 100% is one where holders can be left with
/// nothing by configuration rather than by misfortune.
pub const MAX_TOTAL_FEE_BPS: u32 = 3_000;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Balances,
    Credited,
    Unclaimed,
    // Appended in v5; existing prefixes keep their places.
    Listings,
    Offers,
    Locked,
    ManagerVotes,
    Voters,
}

/// Where the unit is in its life.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum Custody {
    /// Shares exist but the unit has not been handed over yet. This is the
    /// state a vault is in while its building is still going up.
    AwaitingUnit,
    /// The vault holds the NFT. This is the ordinary operating state.
    Held { token_id: String },
    /// A single holder took the whole supply and withdrew the unit. The vault
    /// is finished; it keeps its history and accepts nothing further.
    Redeemed { token_id: String, to: AccountId },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    // ---- identity -------------------------------------------------------
    /// Human label, e.g. "M120 Apartments · Unit 1B".
    pub name: String,
    /// Ticker for the share token.
    pub symbol: String,
    /// The marketplace this unit is listed through.
    pub marketplace: AccountId,
    /// The property id the marketplace knows this unit by.
    pub property_id: u64,
    /// The stablecoin rent arrives in. One per vault, matching the raise.
    pub stablecoin: AccountId,

    // ---- people ---------------------------------------------------------
    /// Set once at creation; may be replaced only by `set_manager`, which the
    /// governance contract calls after a holder vote.
    pub manager: AccountId,
    /// Allowed to replace the manager and change fees. The governance
    /// contract in production; the deployer while testing.
    pub governor: AccountId,
    /// Where the platform fee accrues.
    pub treasury: AccountId,

    // ---- fees, in basis points of collected rent ------------------------
    pub manager_bps: u32,
    pub reserve_bps: u32,
    pub platform_bps: u32,

    // ---- shares ---------------------------------------------------------
    pub total_supply: u128,
    /// How many shares this flat divides into in total (the raise's
    /// `total_shares`). When set, rent is divided over all of them from the
    /// start, so an investor earns their share whenever they claim, and the
    /// whole flat can only be redeemed by someone holding every share. Zero
    /// keeps the old behaviour (divide over shares minted so far).
    pub share_cap: u128,
    /// Once true, no share may ever be minted again. Set when the raise that
    /// funded this unit closes.
    pub supply_frozen: bool,
    balances: LookupMap<AccountId, u128>,

    // ---- income ---------------------------------------------------------
    /// Rent per share, scaled by `PRECISION`, accumulated over all time.
    pub acc_per_share: u128,
    /// What each holder's balance had already earned when it last changed.
    credited: LookupMap<AccountId, u128>,
    /// Settled but not yet withdrawn.
    unclaimed: LookupMap<AccountId, u128>,
    /// Division remainder carried forward so no rent is lost to rounding.
    pub dust: u128,
    /// The token balance this vault has already accounted for. The delta
    /// against the real balance is what `sync_income` credits.
    pub last_accounted: u128,
    /// Held back for repairs. Not distributed.
    pub reserve: u128,
    /// Owed to the manager and the treasury, pulled the same way holders pull.
    pub owed_manager: u128,
    pub owed_treasury: u128,

    // ---- lifecycle ------------------------------------------------------
    pub custody: Custody,
    /// Set while a cross-contract call is in flight, so a second one cannot
    /// start against stale state.
    pub busy: bool,

    // ---- v5: the share market and holder votes ---------------------------
    pub(crate) listings: UnorderedMap<u64, Listing>,
    pub(crate) offers: UnorderedMap<u64, Offer>,
    pub next_trade_id: u64,
    /// Shares each holder has listed, still in their balance but unmovable.
    pub(crate) locked: LookupMap<AccountId, u128>,
    pub(crate) manager_votes: LookupMap<AccountId, ManagerVote>,
    pub(crate) voters: Vector<AccountId>,
}

/// The vault's layout before v5, for `migrate`.
#[derive(BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct VaultV4 {
    name: String,
    symbol: String,
    marketplace: AccountId,
    property_id: u64,
    stablecoin: AccountId,
    manager: AccountId,
    governor: AccountId,
    treasury: AccountId,
    manager_bps: u32,
    reserve_bps: u32,
    platform_bps: u32,
    total_supply: u128,
    share_cap: u128,
    supply_frozen: bool,
    balances: LookupMap<AccountId, u128>,
    acc_per_share: u128,
    credited: LookupMap<AccountId, u128>,
    unclaimed: LookupMap<AccountId, u128>,
    dust: u128,
    last_accounted: u128,
    reserve: u128,
    owed_manager: u128,
    owed_treasury: u128,
    custody: Custody,
    busy: bool,
}

#[near]
impl Vault {
    /// Bring a v4 vault's state forward after deploying v5 code to it.
    /// Holders, rent and custody carry over unchanged; the market starts
    /// empty.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: VaultV4 =
            env::state_read().unwrap_or_else(|| env::panic_str("No v4 state to migrate"));
        Self {
            name: old.name,
            symbol: old.symbol,
            marketplace: old.marketplace,
            property_id: old.property_id,
            stablecoin: old.stablecoin,
            manager: old.manager,
            governor: old.governor,
            treasury: old.treasury,
            manager_bps: old.manager_bps,
            reserve_bps: old.reserve_bps,
            platform_bps: old.platform_bps,
            total_supply: old.total_supply,
            share_cap: old.share_cap,
            supply_frozen: old.supply_frozen,
            balances: old.balances,
            acc_per_share: old.acc_per_share,
            credited: old.credited,
            unclaimed: old.unclaimed,
            dust: old.dust,
            last_accounted: old.last_accounted,
            reserve: old.reserve,
            owed_manager: old.owed_manager,
            owed_treasury: old.owed_treasury,
            custody: old.custody,
            busy: old.busy,
            listings: UnorderedMap::new(StorageKey::Listings),
            offers: UnorderedMap::new(StorageKey::Offers),
            next_trade_id: 0,
            locked: LookupMap::new(StorageKey::Locked),
            manager_votes: LookupMap::new(StorageKey::ManagerVotes),
            voters: Vector::new(StorageKey::Voters),
        }
    }

    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        name: String,
        symbol: String,
        marketplace: AccountId,
        property_id: U64,
        stablecoin: AccountId,
        manager: AccountId,
        governor: AccountId,
        treasury: AccountId,
        manager_bps: u32,
        reserve_bps: u32,
        platform_bps: u32,
        share_cap: Option<U128>,
    ) -> Self {
        require!(
            manager_bps + reserve_bps + platform_bps <= MAX_TOTAL_FEE_BPS,
            "Fees would take more than 30% of rent"
        );
        let share_cap = share_cap.map(|c| c.0).unwrap_or(0);
        Self {
            name,
            symbol,
            marketplace,
            property_id: property_id.0,
            stablecoin,
            manager,
            governor,
            treasury,
            manager_bps,
            reserve_bps,
            platform_bps,
            total_supply: 0,
            share_cap,
            supply_frozen: false,
            balances: LookupMap::new(StorageKey::Balances),
            acc_per_share: 0,
            credited: LookupMap::new(StorageKey::Credited),
            unclaimed: LookupMap::new(StorageKey::Unclaimed),
            dust: 0,
            last_accounted: 0,
            reserve: 0,
            owed_manager: 0,
            owed_treasury: 0,
            custody: Custody::AwaitingUnit,
            busy: false,
            listings: UnorderedMap::new(StorageKey::Listings),
            offers: UnorderedMap::new(StorageKey::Offers),
            next_trade_id: 0,
            locked: LookupMap::new(StorageKey::Locked),
            manager_votes: LookupMap::new(StorageKey::ManagerVotes),
            voters: Vector::new(StorageKey::Voters),
        }
    }

    // ---- guards ---------------------------------------------------------

    pub(crate) fn assert_manager(&self) {
        require!(
            env::predecessor_account_id() == self.manager,
            "Only the property manager may do this"
        );
    }

    pub(crate) fn assert_governor(&self) {
        require!(
            env::predecessor_account_id() == self.governor,
            "Only governance may do this"
        );
    }

    /// One yoctoNEAR, the usual proof that a full-access key signed this
    /// rather than a function-call key someone was granted for something else.
    pub(crate) fn assert_one_yocto() {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Requires an attached deposit of exactly 1 yoctoNEAR"
        );
    }

    // ---- governance -----------------------------------------------------

    /// Replace the manager. Any income already earned stays owed to the
    /// outgoing manager. Removing someone does not cancel what they are due
    /// for work already done.
    #[payable]
    pub fn set_manager(&mut self, manager: AccountId) {
        Self::assert_one_yocto();
        self.assert_governor();
        self.change_manager(manager, None);
    }

    #[payable]
    pub fn set_fees(&mut self, manager_bps: u32, reserve_bps: u32, platform_bps: u32) {
        Self::assert_one_yocto();
        self.assert_governor();
        require!(
            manager_bps + reserve_bps + platform_bps <= MAX_TOTAL_FEE_BPS,
            "Fees would take more than 30% of rent"
        );
        self.manager_bps = manager_bps;
        self.reserve_bps = reserve_bps;
        self.platform_bps = platform_bps;
    }

    // ---- views ----------------------------------------------------------

    pub fn get_info(&self) -> VaultInfo {
        VaultInfo {
            name: self.name.clone(),
            symbol: self.symbol.clone(),
            marketplace: self.marketplace.clone(),
            property_id: U64(self.property_id),
            stablecoin: self.stablecoin.clone(),
            manager: self.manager.clone(),
            total_supply: U128(self.total_supply),
            share_cap: U128(self.share_cap),
            supply_frozen: self.supply_frozen,
            manager_bps: self.manager_bps,
            reserve_bps: self.reserve_bps,
            platform_bps: self.platform_bps,
            reserve: U128(self.reserve),
            acc_per_share: U128(self.acc_per_share),
            last_accounted: U128(self.last_accounted),
            custody: self.custody.clone(),
        }
    }

    /// What this account could withdraw right now: already settled, plus what
    /// its current balance has earned since.
    pub fn claimable(&self, account_id: AccountId) -> U128 {
        U128(self.unclaimed_of(&account_id) + self.pending_of(&account_id))
    }

    pub fn get_reserve(&self) -> U128 {
        U128(self.reserve)
    }

    pub fn get_owed_manager(&self) -> U128 {
        U128(self.owed_manager)
    }

    pub fn get_owed_treasury(&self) -> U128 {
        U128(self.owed_treasury)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct VaultInfo {
    pub name: String,
    pub symbol: String,
    pub marketplace: AccountId,
    pub property_id: U64,
    pub stablecoin: AccountId,
    pub manager: AccountId,
    pub total_supply: U128,
    pub share_cap: U128,
    pub supply_frozen: bool,
    pub manager_bps: u32,
    pub reserve_bps: u32,
    pub platform_bps: u32,
    pub reserve: U128,
    pub acc_per_share: U128,
    pub last_accounted: U128,
    pub custody: Custody,
}
