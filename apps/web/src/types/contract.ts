// ============================================================================
// Contract Types — Exact ABI from shedasolution.testnet
// ============================================================================
// Source: INTEGRATION_GUIDE.md (commit c99d8d7)
// Deployed: Feb 27, 2026 on shedasolution.testnet
// ============================================================================

// ============================================================================
// Enums
// ============================================================================

export enum Action {
  Purchase = "Purchase",
  Lease = "Lease",
}

export enum BidStatus {
  Pending = "Pending",
  Accepted = "Accepted",
  Rejected = "Rejected",
  Cancelled = "Cancelled",
  DocsReleased = "DocsReleased",
  DocsConfirmed = "DocsConfirmed",
  PaymentReleased = "PaymentReleased",
  Completed = "Completed",
  Disputed = "Disputed",
}

export enum DisputeStatus {
  None = "None",
  Raised = "Raised",
  Resolved = "Resolved",
}

// ============================================================================
// Core Entities — returned by contract view methods
// ============================================================================

/**
 * Property as returned by get_property_view / get_properties
 */
export interface Property {
  id: number;                         // Auto-incremented u64
  owner_id: string;                   // AccountId of current owner
  description: string;                // Property details / address
  metadata_uri: string;               // IPFS or external metadata URL
  is_for_sale: boolean;               // true = accepting bids
  price: string | null;               // Sale price in atomic units (u128 as string)
  /**
   * Lease term in DAYS, as the contract stores and returns it.
   *
   * It was `lease_duration_nanos` and carried a month count with no
   * conversion, so anything doing date arithmetic on it was out by fifteen
   * orders of magnitude. Name and unit now agree, and the mint parameter
   * `lease_duration_days` is the same unit — no conversion in either
   * direction.
   */
  lease_duration_days: number | null;
  /** Security deposit this listing asks a tenant for, atomic units. "0" = none. */
  damage_deposit_required: string;
  active_lease: Lease | null;         // Non-null = currently leased, blocks new bids
  timestamp: number;                  // Creation time in nanoseconds
  sold: SoldRecord | null;            // Historical sale info if previously sold
  /**
   * OPTIONAL and APP-SUPPLIED — the contract does not return this on a
   * property, only on a Bid.
   *
   * Property objects in this app are a blend of on-chain data and backend
   * enrichment (see useTransactions, which synthesises one from a backend
   * item that does carry a token). Marked optional so the two sources are
   * distinguishable: absent means "read straight from chain", and callers
   * must handle that rather than assuming a token is always present.
   */
  stablecoin_token?: string;
}

/**
 * Mirrors `SoldView` in the contract (views.rs) field for field.
 *
 * The price field is `amount`, not `sale_price` — this said `sale_price` for
 * as long as the field was unreachable, because the contract never actually
 * constructed a `Sold` and `property.sold` was always null. It is populated
 * from the sale that transferred the property now, so the names have to agree.
 */
export interface SoldRecord {
  property_id: number;
  buyer_id: string;
  amount: string;           // Atomic units
  previous_owner_id: string;
  sold_at: number;          // Nanoseconds
}

/**
 * Bid as returned by get_bid_view / get_bids_for_property
 */
export interface Bid {
  id: number;                         // Auto-incremented u64
  bidder: string;                     // AccountId of buyer/tenant
  property_id: number;                // Target property
  amount: string;                     // Offer in stablecoin atomic units (u128 as string)
  created_at: number;                 // Nanoseconds timestamp
  updated_at: number;                 // Last state change timestamp
  status: BidStatus;                  // See full state machine in INTEGRATION_GUIDE
  document_token_id: string | null;   // NFT ID after mint e.g. "doc:1:1"
  document_image_uri: string | null;  // IPFS/URL to deed/agreement image
  document_description: string | null;// Document metadata description
  escrow_release_tx: string | null;   // TX hash of payment release
  dispute_reason: string | null;      // Dispute claim reason if disputed
  expires_at: number | null;          // Bid expiry (nanoseconds) — for accept_bid path
  escrow_release_after: number | null;// Escrow hold end time — for accept_bid_with_escrow path
  action: 'Purchase' | 'Lease';      // Transaction type
  stablecoin_token: string;           // Token address used for this bid
  /** Security deposit carried by this bid, on top of `amount`. Lease only. */
  damage_deposit: string;
}

/**
 * Lease as returned by get_lease
 */
export interface Lease {
  id: number;
  property_id: number;
  tenant_id: string;
  start_time: number;         // Nanoseconds
  end_time: number;           // Nanoseconds
  active: boolean;
  dispute_status: DisputeStatus;
  dispute: DisputeInfo | null;
  escrow_held: string;        // Security deposit held, atomic units
  escrow_token: string;       // Token address
  /**
   * When the owner's right to claim against the deposit runs out.
   *
   * Past this the tenant can call refund_damage_deposit and take the whole
   * deposit back; the owner cannot stop them.
   */
  damage_claim_deadline: number;
}

export interface DisputeInfo {
  raised_by: string;
  reason: string;
  raised_at: number;
  /** What the owner asked for, against what was actually awarded below. */
  claimed_amount: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  resolved_at: number | null;
  winner: 'Tenant' | 'Owner' | null;
  deduction_amount: string | null;
}

/**
 * NFT Token (NEP-171)
 */
export interface Token {
  token_id: string;
  owner_id: string;
  metadata?: TokenMetadata | null;
  approved_account_ids?: Record<string, number> | null;
}

export interface TokenMetadata {
  title?: string | null;
  description?: string | null;
  media?: string | null;
  media_hash?: number[] | null;
  copies?: number | null;
  issued_at?: string | null;
  expires_at?: string | null;
  starts_at?: string | null;
  updated_at?: string | null;
  extra?: string | null;
  reference?: string | null;
  reference_hash?: number[] | null;
}

export interface ContractConfig {
  escrow_release_delay_ns: number;
  bid_expiry_ns: number;
  lost_bid_claim_delay_ns: number;
}

// ============================================================================
// Contract Method Parameters — Change Methods
// ============================================================================

/** mint_property — Seller lists a property
 *  On-chain signature: mint_property(title, description, media_uri, price: U128, is_for_sale, lease_duration_days: Option<u64>, damage_deposit_required: Option<U128>)
 */
export interface PlacePropertyParams {
  title: string;
  description: string;
  media_uri: string;                    // IPFS link to image
  price: string;                        // Atomic units (U128 string) — always required
  is_for_sale: boolean;
  lease_duration_days: number | null;  // Set for lease listings
  /**
   * Security deposit to require from a tenant, in atomic stablecoin units.
   * Omit or `null` to charge none.
   *
   * Lease listings only — the contract refuses a deposit on a sale, since
   * there is no tenant to collect it from and nobody to return it to. The
   * tenant pays it on top of the rent in the same transfer, and gets it back
   * when the lease ends unless the owner claims against it within 7 days.
   */
  damage_deposit_required?: string | null;
}

/** place_bid — Buyer places bid (called AFTER ft_approve on token contract) */
export interface PlaceBidParams {
  property_id: number;
  amount: string;                // Atomic units — MUST match approved amount exactly
  action: 'Purchase' | 'Lease';
  stablecoin_token: string;      // Token contract address
}

/** accept_bid — PATH 1: Seller accepts bid (immediate release after docs) */
export interface AcceptBidParams {
  property_id: number;
  bid_id: number;
}

/** accept_bid_with_escrow — PATH 3: Seller accepts bid (24h hold) */
export type AcceptBidWithEscrowParams = AcceptBidParams;

/** confirm_document_release — Seller releases document with URI and description
 *  On-chain signature: confirm_document_release(bid_id, property_id, document_image_uri, document_description)
 */
export interface ConfirmDocumentReleaseParams {
  bid_id: number;
  property_id: number;
  document_image_uri: string;
  document_description: string;
}

/** confirm_document_receipt — Buyer acknowledges NFT */
export interface ConfirmDocumentReceiptParams {
  property_id: number;
  bid_id: number;
}

/** release_payment — Release escrow to seller */
export interface ReleasePaymentParams {
  property_id: number;
  bid_id: number;
}

/** complete_bid — Finalize transaction */
export interface CompleteBidParams {
  property_id: number;
  bid_id: number;
}

/** reject_bid — Seller rejects a bid */
export interface RejectBidParams {
  property_id: number;
  bid_id: number;
}

/** cancel_bid — Bidder withdraws / claims refund */
export interface CancelBidParams {
  property_id: number;
  bid_id: number;
}

/** complete_lease — End a lease after expiry */
export interface CompleteLeaseParams {
  property_id: number;
  lease_id: number;
}

/** raise_dispute — File dispute on a bid
 *  On-chain signature: raise_dispute(bid_id, property_id, reason)
 */
export interface RaiseDisputeParams {
  bid_id: number;
  property_id: number;
  reason: string;
}

/** resolve_dispute — Manual resolution by owner */
/**
 * Mirrors `resolve_dispute(lease_id, winner, payout_amount, resolution_notes)`.
 *
 * This used to send `property_id` and omit both `winner` and `payout_amount`,
 * so the call could never deserialize on chain — an admin resolving a dispute
 * has to say who won and how much escrow moves, and the contract has no way to
 * infer either. `property_id` was never a parameter; the lease identifies the
 * property.
 */
export interface ResolveDisputeParams {
  lease_id: number;
  winner: 'Tenant' | 'Owner';
  /** Atomic units of the lease's escrow token, capped at the escrow held. */
  payout_amount: string;
  resolution_notes: string;
}

/** nft_transfer — Transfer property NFT */
export interface TransferPropertyParams {
  receiver_id: string;
  token_id: string;
  approval_id?: number | null;
  memo?: string | null;
}

/**
 * Relist a property the caller already owns, at new terms.
 *
 * This is how a resale happens without minting a second NFT for a property
 * that already exists on-chain — the seller picks it out of their wallet and
 * only sets the terms.
 */
export interface UpdateListingParams {
  property_id: number;
  /** Atomic stablecoin units, same convention as MintPropertyParams.price. */
  price: string;
  is_for_sale: boolean;
  lease_duration_days?: number | null;
  /**
   * Security deposit to require from a tenant, in atomic stablecoin units.
   * Omit or `null` to charge none.
   *
   * Lease listings only — the contract refuses a deposit on a sale, since
   * there is no tenant to collect it from and nobody to return it to. The
   * tenant pays it on top of the rent in the same transfer, and gets it back
   * when the lease ends unless the owner claims against it within 7 days.
   */
  damage_deposit_required?: string | null;
}

// ============================================================================
// Contract Method Parameters — View Methods
// ============================================================================

export interface GetPropertiesParams {
  from_index: number;
  limit: number;
}

export interface GetBidsParams {
  from_index: number;
  limit: number;
}

export interface GetBidsByBidderParams {
  bidder: string;
  from_index: number;
  limit: number;
}

export interface GetBidsForPropertyPaginatedParams {
  property_id: number;
  from_index: number;
  limit: number;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface ContractCallResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  transactionHash?: string;
}

export interface PropertyWithBids extends Property {
  bids: Bid[];
  bidCount: number;
}

// ============================================================================
// Contract Method Names — Verified at shedasolution.testnet on-chain
// ============================================================================

export type ChangeMethod =
  | "mint_property"
  | "accept_bid"
  | "accept_bid_with_escrow"
  | "reject_bid"
  | "cancel_bid"
  | "claim_lost_bid"
  | "confirm_document_release"
  | "confirm_document_receipt"
  | "release_escrow"
  | "complete_transaction"
  | "expire_lease"
  | "raise_damage_claim"
  | "refund_damage_deposit"
  | "raise_dispute"
  | "raise_lease_dispute"
  | "raise_lease_dispute_with_reason"
  | "resolve_dispute"
  | "add_supported_stablecoin"
  | "nft_transfer"
  | "nft_transfer_call"
  | "delete_property"
  | "delist_property"
  | "create_property_instance"
  | "refund_escrow_timeout";

export type ViewMethod =
  | "get_property_by_id"
  | "get_properties"
  | "get_property_by_owner"
  | "get_property_counter"
  | "get_property_instance"
  | "get_bids_for_property"
  | "get_bids_for_property_paginated"
  | "get_bids_by_bidder"
  | "get_my_bids"
  | "get_bids_on_my_property"
  | "get_all_bids"
  | "get_bid_counter"
  | "get_lease_by_id"
  | "get_my_leases"
  | "get_leases_by_tenant"
  | "get_active_leases_count"
  | "get_leases_with_disputes"
  | "get_lease_counter"
  | "get_time_lock_config"
  | "get_user_stats"
  | "get_stablecoin_balance"
  | "supported_stablecoins"
  | "nft_metadata"
  | "nft_token"
  | "nft_tokens"
  | "nft_tokens_for_owner"
  | "nft_total_supply"
  | "nft_supply_for_owner"
  | "is_admin"
  | "is_caller_admin"
  | "get_all_admins"
  | "get_owner_id"

// ============================================================================
// LEGACY COMPATIBILITY — kept so existing code doesn't break during migration
// ============================================================================

/** @deprecated Use Property instead */
export type PropertyView = Property;

/** @deprecated Use Bid instead */
export interface BidView {
  id: number;
  property_id: number;
  bidder_id: string;       // Old field name → maps to Bid.bidder
  bid_amount: string;      // Old field name → maps to Bid.amount
  stablecoin_token: string;
  action: Action;
  created_at: number;
  status: BidStatus;
  updated_at?: number;
  document_token_id?: string;
  /** Link to the first agreement image, set when the seller releases documents. */
  document_image_uri?: string | null;
  /** The seller's description of the agreement. */
  document_description?: string | null;
  escrow_release_tx?: string;
  // Present in the on-chain Bid struct (nanosecond timestamp) but wasn't
  // declared here before — release_escrow requires
  // block_timestamp >= escrow_release_after and reverts otherwise.
  escrow_release_after?: number | null;
  // Nanosecond timestamp, set at bid creation from the contract's
  // bid_expiry_ns (7 days by default). The contract refuses to accept a bid
  // past this, but nothing refunds it automatically — the buyer has to call
  // claim_lost_bid. Returned by the contract's BidView (views.rs) but was
  // never declared here, so the expiry was invisible to the app.
  expires_at?: number | null;
  // Set once this Lease bid results in a Lease (initial or renewal) —
  // lets get_lease_by_id resolve the real start/end even after
  // property.active_lease has moved on (reclaimed, or re-leased to
  // someone else). Purchase bids never have this.
  lease_id?: number | null;
}

/** @deprecated Use Lease instead */
export interface LeaseView {
  id: number;
  property_id: number;
  tenant_id: string;
  start_time: number;
  end_time: number;
  escrow_held: string;
  active: boolean;
  dispute_status: { status: string };
}

/** @deprecated Use PlacePropertyParams instead */
export interface MintPropertyParams {
  title: string;
  description: string;
  media_uri: string;
  price: string;
  is_for_sale: boolean;
  lease_duration_days?: number | null;
  /** See PlacePropertyParams.damage_deposit_required. Lease listings only. */
  damage_deposit_required?: string | null;
}

/** @deprecated Use PlaceBidParams instead */
export interface FtTransferCallParams {
  tokenContractId: string;
  amount: string;
  msg: string;
}

/** @deprecated — message format no longer used (ft_transfer_call replaced by ft_approve + place_bid) */
export interface BidMessage {
  property_id: number;
  action: Action;
  stablecoin_token: string;
}

/** @deprecated — same as BidMessage */
export type CommitPaymentMessage = BidMessage;

/** @deprecated Use config/gas.ts instead — kept in sync for backward compat */
export const GAS_AMOUNTS = {
  MINT_PROPERTY: "100000000000000",       // 100 TGas
  ACCEPT_BID: "200000000000000",          // 200 TGas — cross-contract
  ACCEPT_BID_WITH_ESCROW: "200000000000000", // 200 TGas — cross-contract
  REJECT_BID: "150000000000000",          // 150 TGas — involves refund
  CANCEL_BID: "150000000000000",          // 150 TGas — involves refund
  DELETE_PROPERTY: "50000000000000",      // 50 TGas
  DELIST_PROPERTY: "50000000000000",      // 50 TGas
  NFT_TRANSFER: "100000000000000",        // 100 TGas — cross-contract
  RAISE_DISPUTE: "50000000000000",        // 50 TGas
  EXPIRE_LEASE: "150000000000000",        // 150 TGas — escrow return
  CLAIM_LOST_BID: "200000000000000",      // 200 TGas
  FT_TRANSFER_CALL: "200000000000000",    // 200 TGas
  CONFIRM_DOCUMENT_RELEASE: "150000000000000", // 150 TGas — NFT mint
  RELEASE_ESCROW: "200000000000000",      // 200 TGas — cross-contract
  COMPLETE_TRANSACTION: "100000000000000", // 100 TGas
  RESOLVE_DISPUTE: "200000000000000",     // 200 TGas — escrow split
} as const;

/** @deprecated Use config/gas.ts instead — kept in sync for backward compat */
export const DEPOSIT_AMOUNTS = {
  MINT_PROPERTY: "10000000000000000000000",
  NFT_TRANSFER: "1",
  DEFAULT_CALL: "1",
  FT_TRANSFER_CALL: "1",
} as const;
