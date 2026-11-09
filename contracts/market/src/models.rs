use near_sdk::{
    borsh::{self, BorshDeserialize, BorshSerialize},
    serde::{Deserialize, Serialize},
    AccountId, Timestamp,
};

use schemars::JsonSchema;

#[derive(
    BorshDeserialize, BorshSerialize, Deserialize, Serialize, PartialEq, Debug, Clone, JsonSchema,
)]
pub enum DisputeStatus {
    None,
    Raised,
    Resolved,
    PendingTenantResponse,
}

#[derive(
    BorshDeserialize, BorshSerialize, Deserialize, Serialize, PartialEq, Debug, Clone, JsonSchema,
)]
pub enum DisputeWinner {
    Tenant,
    Owner,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
/// What happened to a disputed lease: who raised it, and how it was settled.
///
/// The fields say what the outcome *was*, not how it was arrived at. An
/// earlier shape recorded an admin vote tally and an oracle verdict, neither
/// of which any caller could reach — and the client has always read this as
/// `winner` / `resolution_notes` / `deduction_amount`, so every one of those
/// three came back undefined.
pub struct DisputeInfo {
    pub raised_by: AccountId,
    pub raised_at: Timestamp,
    pub reason: String,
    /// What the owner asked for when they raised the claim, so it can be
    /// compared against what was actually awarded.
    pub claimed_amount: Option<u128>,
    /// Who the admin found for. `None` while the dispute is still open.
    pub winner: Option<DisputeWinner>,
    /// The admin's reasoning, kept on chain so the losing side can see it.
    pub resolution_notes: Option<String>,
    /// How much escrow was actually moved to the winner.
    pub deduction_amount: Option<u128>,
    pub resolved_by: Option<AccountId>,
    pub resolved_at: Option<Timestamp>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct DisputeInfoView {
    pub raised_by: String,
    pub raised_at: Timestamp,
    pub reason: String,
    pub claimed_amount: Option<String>,
    pub winner: Option<DisputeWinner>,
    pub resolution_notes: Option<String>,
    /// u128 as a string, like every other amount these views report.
    pub deduction_amount: Option<String>,
    pub resolved_by: Option<String>,
    pub resolved_at: Option<Timestamp>,
}

#[derive(
    BorshDeserialize, BorshSerialize, Deserialize, Serialize, PartialEq, Debug, Clone, JsonSchema,
)]
pub enum BidStatus {
    Pending,
    Accepted,
    Rejected,
    Cancelled,
    DocsReleased,
    DocsConfirmed,
    PaymentReleased,
    Completed,
    Disputed,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
pub struct Property {
    pub id: u64,
    pub owner_id: AccountId,
    pub description: String,
    pub metadata_uri: String,
    pub is_for_sale: bool,
    // Price in Stablecoin Atomic Units (e.g., 6 decimals for USDC)
    pub price: u128,
    /// Lease term in **days**. `None` when the property is not for lease.
    ///
    /// Days, not months, because that is the finest granularity the client
    /// offers: a seller can list a let by the day, the month or the year, and
    /// a month-based field silently rounded the short ones up — a seven-day
    /// let was stored as thirty. Every choice a seller can make is now exact.
    pub lease_duration_days: Option<u64>,
    /// Security deposit the owner requires from a tenant, in the stablecoin's
    /// atomic units. `0` means they are not asking for one.
    ///
    /// Only meaningful for a lease listing: it is what the tenant pays *on top
    /// of* the rent, held by the contract for the duration and returned unless
    /// the owner raises a damage claim once the lease ends.
    ///
    /// Was `damage_escrow`, which was never written to anything but zero.
    pub damage_deposit_required: u128,
    pub active_lease: Option<Lease>,
    pub timestamp: Timestamp,
    pub sold: Option<Sold>,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
pub struct Sold {
    pub property_id: u64,
    pub buyer_id: AccountId,
    pub amount: u128,
    pub previous_owner_id: AccountId,
    pub sold_at: Timestamp,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
pub struct Bid {
    pub id: u64,
    pub bidder: AccountId,
    pub property_id: u64,
    pub amount: u128,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub status: BidStatus,
    pub document_token_id: Option<String>,
    pub document_image_uri: Option<String>,
    pub document_description: Option<String>,
    pub escrow_release_tx: Option<String>,
    pub dispute_reason: Option<String>,
    pub expires_at: Option<Timestamp>,
    pub escrow_release_after: Option<Timestamp>,
    pub action: Action,
    pub stablecoin_token: AccountId,
    /// The security deposit included in this bid, taken from the property's
    /// `damage_deposit_required` when the bid was placed.
    ///
    /// Snapshotted rather than read live, so an owner cannot raise the deposit
    /// out from under a tenant between them reading the listing and bidding.
    /// `amount` is the rent alone; the tenant transferred the two together.
    pub damage_deposit: u128,
    /// Set once this bid results in a Lease (whichever accept path created
    /// it, plus renewals). Lets a client look up the authoritative
    /// start_time/end_time/active via get_lease_by_id at any time, even
    /// after property.active_lease has been cleared by expire_lease —
    /// that field only reflects the *current* lease, not this bid's.
    pub lease_id: Option<u64>,
}

impl From<&DisputeInfo> for DisputeInfoView {
    fn from(info: &DisputeInfo) -> Self {
        Self {
            raised_by: info.raised_by.to_string(),
            raised_at: info.raised_at,
            reason: info.reason.clone(),
            claimed_amount: info.claimed_amount.map(|a| a.to_string()),
            winner: info.winner.clone(),
            resolution_notes: info.resolution_notes.clone(),
            deduction_amount: info.deduction_amount.map(|a| a.to_string()),
            resolved_by: info.resolved_by.as_ref().map(|id| id.to_string()),
            resolved_at: info.resolved_at,
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct BidAction {
    pub property_id: u64,
    pub action: Action,
    pub stablecoin_token: AccountId,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
pub enum Action {
    Purchase,
    Lease,
}

/// How an admin settles a bid stuck in `Disputed`.
///
/// Raising a dispute freezes the bid, and until now nothing could move it out
/// again — the buyer's escrow stayed locked in the contract permanently, with
/// no refund and no payout. These are the three ways out.
#[derive(
    BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone, PartialEq, Debug, JsonSchema,
)]
#[serde(crate = "near_sdk::serde")]
pub enum DisputeResolution {
    /// The seller didn't deliver. Refund the buyer in full and unwind the
    /// deal; the property stays with the seller.
    BuyerWins,
    /// The seller did deliver and the buyer is refusing to release payment.
    ///
    /// This returns the bid to `DocsConfirmed` rather than paying anyone
    /// directly, so the deal completes through the ordinary release path —
    /// which is what knows to transfer ownership on a purchase and to open the
    /// lease on a rental. Settling that here would mean a second copy of the
    /// hardest logic in the contract, reachable only by admins and exercised
    /// only in disputes.
    SellerWins,
    /// Neither side is clearly at fault. Split the escrow evenly and unwind;
    /// an odd unit goes to the buyer, since it is their money at rest.
    Split,
}

#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, Clone)]
pub struct Lease {
    pub id: u64,
    pub property_id: u64,
    pub tenant_id: AccountId,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
    pub active: bool,
    pub dispute_status: DisputeStatus,
    pub dispute: Option<DisputeInfo>,
    /// The security deposit this contract is actually holding for the tenant.
    ///
    /// It used to be set to the rent — which the contract had paid out to the
    /// landlord moments earlier, so it described a balance that did not exist.
    /// `resolve_dispute` pays out of this figure, so settling a lease dispute
    /// moved real money out of the pool backing every other open deal.
    ///
    /// Now it is the deposit and nothing else, so it is a number the contract
    /// can actually honour. Zero when no deposit was charged.
    pub escrow_held: u128,
    pub escrow_token: AccountId,
    /// When the owner's right to claim against the deposit runs out.
    ///
    /// Stored rather than derived from the current config, so neither side's
    /// deadline moves because an admin retuned the window mid-lease. Recomputed
    /// when a renewal extends `end_time`.
    pub damage_claim_deadline: Timestamp,
}

// Kept your error handling, it is clean.
#[derive(BorshDeserialize, BorshSerialize, Deserialize, Serialize, PartialEq, Debug, Clone)]
pub enum ContractError {
    PropertyNotFound,
    NotPropertyOwner,
    InvalidBidAmount,
    LeaseNotActive,
    UnauthorizedAccess,
    DisputeAlreadyRaised,
    LeaseNotFound,

    // Added for Stablecoin logic
    InvalidPaymentToken,
    IncorrectBidAmount { expected: u128, received: u128 },
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContractError::PropertyNotFound => write!(f, "Property not found"),
            ContractError::NotPropertyOwner => write!(f, "Not property owner"),
            ContractError::InvalidBidAmount => write!(f, "Invalid bid amount"),
            ContractError::LeaseNotActive => write!(f, "Lease not active"),
            ContractError::UnauthorizedAccess => write!(f, "Unauthorized access"),
            ContractError::DisputeAlreadyRaised => write!(f, "Dispute already raised"),
            ContractError::LeaseNotFound => write!(f, "Lease not found"),
            ContractError::InvalidPaymentToken => write!(f, "Invalid payment token"),
            ContractError::IncorrectBidAmount { expected, received } => write!(
                f,
                "Incorrect bid amount: expected {}, received {}",
                expected, received
            ),
        }
    }
}

impl std::error::Error for ContractError {}

impl AsRef<str> for ContractError {
    fn as_ref(&self) -> &str {
        match self {
            ContractError::PropertyNotFound => "PropertyNotFound",
            ContractError::NotPropertyOwner => "NotPropertyOwner",
            ContractError::InvalidBidAmount => "InvalidBidAmount",
            ContractError::LeaseNotActive => "LeaseNotActive",
            ContractError::UnauthorizedAccess => "UnauthorizedAccess",
            ContractError::DisputeAlreadyRaised => "DisputeAlreadyRaised",
            ContractError::LeaseNotFound => "LeaseNotFound",
            ContractError::InvalidPaymentToken => "InvalidPaymentToken",
            ContractError::IncorrectBidAmount { .. } => "IncorrectBidAmount",
        }
    }
}
