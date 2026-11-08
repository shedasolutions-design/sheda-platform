# Sheda Architecture & Application Flows

This document details the expected core flows of the Sheda application, including user interactions, contract formation, and where/how the platform integrates with the blockchain (focused on Near/TON smart contracts).

## 1. Property Operations & Appointments Flow

This is the standard Web2 workflow where agents list properties and clients can schedule viewings.

```mermaid
sequenceDiagram
    actor Agent
    actor Client
    participant Backend
    participant Database

    Note over Agent, Backend: Listing & Availability
    Agent->>Backend: Set Availability Schedule (CreateAvailability)
    Agent->>Backend: Create Property Listing (PropertyBase)
    Backend->>Database: Save Property & Images
    
    Note over Client, Backend: Discovery & Booking
    Client->>Backend: Browse/Filter Properties
    Client->>Backend: Book Appointment (run_book_appointment)
    Backend->>Database: Verify Available Slot & Reserve
    Backend-->>Client: Appointment Pending
    
    Agent->>Backend: Confirm Appointment (confirm_agent_appointment)
    Backend->>Database: Update Appointment Status
    Backend-->>Client: Notification (Appointment Confirmed)
```

## 2. Standard Contract & Payment Flow

When a client wants to rent or buy a property without full on-chain escrow, they can make a payment that is verified by the backend. Once verified, a contract is generated.

```mermaid
sequenceDiagram
    actor Client
    actor Agent
    participant Backend
    participant CeleryWorker
    participant Blockchain

    Client->>Blockchain: Transfer Funds (Rent/Sale Amount)
    Blockchain-->>Client: Transaction Hash (TxHash)
    
    Client->>Backend: Submit Payment Confirmation (TxHash)
    Backend->>CeleryWorker: Queue Process Payment Task (process_payment_async)
    CeleryWorker->>Blockchain: Verify Transaction Hash
    CeleryWorker->>Backend: Update Payment Status (Confirmed)
    
    Client->>Backend: Request Contract Creation (run_create_contract)
    Backend->>Backend: Verify Payment Confirmed
    Backend->>Database: Create Contract (Pending) & Change Property Status
    
    Agent->>Backend: Approve Contract (proccess_approve_payment)
    Backend->>Database: Activate Contract
    Backend-->>Client: Contract Signed & Active
```

## 3. Blockchain Escrow Flow (Transactions)

For completely trustless transactions, Sheda utilizes a blockchain escrow system. The smart contract (`sheda_contract`) manages the escrow and enforces state machines for both Purchase and Lease actions.

### Purchase Flow (Dual-Path Acceptance)

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Accepted_Immediate : accept_bid
    Pending --> Accepted_Escrow : accept_bid_with_escrow
    Pending --> Rejected : reject_bid
    Pending --> Cancelled : cancel_bid
    
    Accepted_Escrow --> DocsReleased : confirm_document_release
    DocsReleased --> DocsConfirmed : confirm_document_receipt
    DocsConfirmed --> PaymentReleased : release_escrow (after timelock)
    
    Accepted_Immediate --> Completed : accept_bid_callback (Auto)
    PaymentReleased --> Completed
```

#### Path A: Immediate Acceptance

For trusted or simple transactions, the seller uses `accept_bid`.

1. **Bid Placed**: Buyer transfers funds to the contract (`ft_on_transfer`).
2. **Acceptance**: Seller calls `accept_bid`.
3. **Execution**: The contract immediately transfers the escrowed stablecoin to the seller and mints/transfers the document NFT to the buyer.

#### Path B: Escrowed Staged Release

For higher security, the seller uses `accept_bid_with_escrow`.

1. **Bid Placed**: Buyer transfers funds to contract.
2. **Acceptance**: Seller calls `accept_bid_with_escrow`.
3. **Document Release**: Seller creates/mints the document NFT (`confirm_document_release`).
4. **Buyer Confirmation**: Buyer verifies the document (`confirm_document_receipt`). This starts a time-lock (default 24 hours).
5. **Release**: After the timelock expires, the buyer explicitly releases the funds (`release_escrow`).

```mermaid
sequenceDiagram
    actor Buyer
    actor Seller
    participant Backend
    participant Protocol as Sheda Contract
    
    Buyer->>Protocol: place_bid (ft_on_transfer)
    Protocol-->>Backend: Event: bid_placed
    Backend->>Database: Create TransactionRecord (Pending)
    
    Seller->>Protocol: accept_bid_with_escrow
    Protocol-->>Backend: Event: bid_accepted 
    Backend->>Database: Update Status (Accepted)
    
    Seller->>Protocol: confirm_document_release (Mints NFT)
    Protocol-->>Backend: Event: docs_released
    Backend->>Database: Update Status (Docs Released)
    
    Buyer->>Protocol: confirm_document_receipt
    Protocol-->>Backend: Event: docs_confirmed
    
    Note over Protocol: Timelock (e.g. 24h) starts
    
    Buyer->>Protocol: release_escrow
    Protocol->>Seller: Transfers Stablecoin
    Protocol->>Buyer: Transfers Document NFT
```

## 4. Lease Escrow & Dispute Flow

When a property is leased, the bid amount serves as the *damage escrow*.

1. **Lease Bid**: Tenant bids on a property flagged for lease.
2. **Acceptance**: Owner accepts bid. A `Lease` record is created, and the escrow is held separately by the contract.
3. **During Lease**: The tenant holds the document NFT temporarily.
4. **Resolution**: If disputes arise (e.g., damages), `raise_dispute` is called. It can be resolved manually or via oracle (`resolve_dispute_with_oracle`). Otherwise, at `complete_lease`, the escrow is returned.

```mermaid
sequenceDiagram
    actor Tenant
    actor Owner
    participant Protocol as Sheda Contract
    
    Tenant->>Protocol: place_bid (Damage Escrow)
    Owner->>Protocol: accept_bid (Creates Lease)
    Protocol->>Tenant: Transfers NFT temporarily
    Note over Tenant,Owner: Lease Duration Passes
    
    alt No Damages
        Owner->>Protocol: complete_lease
        Protocol->>Tenant: Returns Escrow & retrieves NFT
    else Damages Occur
        Owner->>Protocol: raise_dispute
        Note over Owner,Protocol: Manual or Oracle Resolution
        Protocol->>Owner: Pays Damages from Escrow
        Protocol->>Tenant: Returns Remainder
    end
```

## 5. Property NFT Minting & Linking

Sheda allows properties to be tokenized (minted as NFTs) for proof of ownership and on-chain trading.

```mermaid
sequenceDiagram
    actor Owner
    participant Backend
    participant CeleryWorker
    participant NFTContract

    Note over Owner, Backend: Asynchronous Minting Request
    Owner->>Backend: Request Property Minting (mint_nft_async)
    Backend->>CeleryWorker: Queue Mint Task
    CeleryWorker->>NFTContract: Execute Mint Function (owner_address)
    NFTContract-->>CeleryWorker: Success & Token ID
    CeleryWorker->>Backend: Update Property (blockchain_property_id)
    
    Note over Owner, Backend: Bring Existing NFT to Platform
    Owner->>Backend: Register Minted Property Draft
    Backend->>Backend: Verify Wallet Ownership
    Owner->>Backend: Link Draft to New Listing (link_minted_property_to_listing)
    Backend->>Database: Create Listing & Associate Token ID
```

### Integration Points Summary

- **Wallet Auth/Mapping**: Users map their on-chain wallets (e.g. Near/TON) to their profile (`WalletMapping`).
- **Payment Verification**: Traditional payments or direct transfers are verified asynchronously via `process_payment_confirmation` Celery task.
- **Escrow Contracts**: Handled by the `sheda_contract`. Includes features like `accept_bid_with_escrow`, `confirm_document_release` for NFT minting, and configurable timelocks (`escrow_release_delay_ns`).
- **Background Sync**: Polling tasks (`sync_blockchain_events` and `check_payment_timeouts`) keep the backend database transaction records in sync with the smart contract state.
