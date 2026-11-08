// ============================================================================
// Gas & Deposit Constants for Contract Interactions
// ============================================================================
// These values are from INTEGRATION_GUIDE.md (commit c99d8d7).
// Gas values have been profiled against testnet — methods involving
// cross-contract calls (token transfers, NFT minting, refunds) need ≥100 TGas.
// Simple state-only methods can use 30–50 TGas.
// ============================================================================

export const GAS = {
    // Token operations
    FT_APPROVE: '30000000000000',   // 30 TGas
    FT_TRANSFER: '30000000000000',  // 30 TGas — simple ft_transfer (no cross-contract)
    STORAGE_DEPOSIT: '30000000000000',   // 30 TGas

    // Property — on-chain: mint_property
    MINT_PROPERTY: '100000000000000',  // 100 TGas

    // Bidding
    PLACE_BID: '100000000000000',  // 100 TGas — ft_transfer_call pulls funds
    ACCEPT_BID: '200000000000000',   // 200 TGas — cross-contract calls need more gas
    ACCEPT_BID_WITH_ESCROW: '200000000000000',   // 200 TGas — cross-contract calls need more gas
    REJECT_BID: '150000000000000',   // 150 TGas — involves refund cross-contract call (ft_transfer)
    CANCEL_BID: '150000000000000',   // 150 TGas — involves refund cross-contract call (ft_transfer)
    // Same refund cross-contract call as CANCEL_BID, plus burning the
    // agreement NFT on the documents-rejected path.
    BUYER_CANCEL_STAGED: '180000000000000',  // 180 TGas
    CLAIM_LOST_BID: '200000000000000',  // 200 TGas — cross-contract refund

    // Document workflow
    CONFIRM_DOCUMENT_RELEASE: '150000000000000',  // 150 TGas — mints NFT + stores on-chain data
    CONFIRM_DOCUMENT_RECEIPT: '50000000000000',   // 50 TGas — state update + potential NFT transfer

    // Payment & completion — on-chain: release_escrow, complete_transaction
    RELEASE_PAYMENT: '200000000000000',  // 200 TGas — cross-contract ft_transfer to seller
    RELEASE_ESCROW: '200000000000000',   // 200 TGas — cross-contract ft_transfer to seller
    COMPLETE_BID: '100000000000000',      // 100 TGas — finalizes state, may involve ownership transfer
    COMPLETE_TRANSACTION: '100000000000000', // 100 TGas — finalizes state, may involve ownership transfer

    // Lease & disputes — on-chain: expire_lease, raise_dispute, resolve_dispute
    COMPLETE_LEASE: '150000000000000',   // 150 TGas — calls expire_lease + escrow refund
    EXPIRE_LEASE: '150000000000000',     // 150 TGas — involves escrow return (cross-contract ft_transfer)
    ACCEPT_LEASE_RENEWAL: '200000000000000', // 200 TGas — cross-contract ft_transfer + NFT mint, same cost class as ACCEPT_BID_WITH_ESCROW
    RAISE_DISPUTE: '50000000000000',    // 50 TGas — state-only, no cross-contract calls
    RESOLVE_DISPUTE: '200000000000000',  // 200 TGas — may involve escrow split (multiple ft_transfers)

    // Admin
    ADD_STABLECOIN: '30000000000000',   // 30 TGas — simple state update
    CONFIGURE_PARAMS: '30000000000000', // 30 TGas — simple state update

    // Legacy aliases
    FT_TRANSFER_CALL: '200000000000000',  // 200 TGas — full cross-contract flow
    PLACE_PROPERTY: '100000000000000',    // 100 TGas — alias for MINT_PROPERTY
    DELETE_PROPERTY: '50000000000000',    // 50 TGas — state-only
    DELIST_PROPERTY: '50000000000000',    // 50 TGas — state-only
    UPDATE_LISTING: '50000000000000',     // 50 TGas — state-only, same class as DELIST_PROPERTY
    NFT_TRANSFER: '100000000000000',       // 100 TGas — cross-contract NFT transfer

    // Token minting (testnet only)
    MINT_TEST_TOKENS: '30000000000000',   // 30 TGas — simple mint
} as const;

export const DEPOSITS = {
    ZERO: '0',                                  // For calls that don't require deposit
    ONE_YOCTO: '1',                            // Required on all change calls
    STORAGE: '10000000000000000000000',      // 0.01 NEAR for storage registration
    STORAGE_MINIMUM: '1250000000000000000000', // 0.00125 NEAR for token storage
    PLACE_PROPERTY: '10000000000000000000000', // 0.01 NEAR for property storage
} as const;
