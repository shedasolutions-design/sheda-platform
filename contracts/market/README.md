# Sheda Contract

The NEAR smart contract behind Sheda: property listings as NFTs, purchase and
lease flows with on-contract escrow, security deposits, and dispute resolution.

## On chain

| | |
| --- | --- |
| Account | `market-v2.shedauser.testnet` |
| Owner | `sheda-council.testnet` (2-of-3 multisig of `sheda-signer-a/b/c.testnet`) |
| Network | NEAR **testnet** |
| State version | `4` |
| Explorer | https://testnet.nearblocks.io/address/market-v2.shedauser.testnet |
| Deployed from | this repository — see [DEPLOYMENT.md](DEPLOYMENT.md) |
| Source of truth | this repository — `contract_source_metadata` points back here |

Deployed 2026-11-12. It replaced `market.shedauser.testnet`, whose key was
lost, so that one could never be upgraded. Owner actions (timings, admins,
stablecoins) are a request one council member proposes and a second confirms;
the admin panel's Smart contracts page writes both commands.

Nothing here is on mainnet. Treat "production" as the contract the app talks
to, not as something that cannot be replaced.

Accepted stablecoins, as the contract reports them:

```
usdt.fakes.testnet
usdc.fakes.testnet
3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af   (Circle USDC)
```

Check any of this yourself rather than trusting this file:

```bash
near view market-v2.shedauser.testnet get_version
near view market-v2.shedauser.testnet supported_stablecoins
near view market-v2.shedauser.testnet get_time_lock_config
near view market-v2.shedauser.testnet get_cancellation_windows
near view market-v2.shedauser.testnet get_owner_id
```

## ABI

The ABI is **generated, not committed**. Every CI run produces it and uploads
it as the `sheda-contract-abi` artifact — download it from any run on the
[Actions tab](../../actions), or build it yourself:

```bash
cargo near abi     # writes target/near/sheda_contract_abi.json
```

It is generated rather than committed on purpose. A checked-in ABI drifts from
the code silently, and an integrator has no way to tell — they find out when a
call they wrote against it fails on chain. Deriving it from the source on every
run means the ABI cannot describe a contract that does not exist.

## Calling conventions

Two things account for most integration failures against this contract.

**Every change method takes exactly 1 yoctoNEAR.** They are all `#[payable]`.
near-sdk rejects a deposit on a method that is not payable, so this has to be
consistent in both directions: a client attaching one yocto to a non-payable
method gets `Method doesn't accept deposit`, and a method that needs a deposit
but is not payable cannot be called at all. Attach `1` yoctoNEAR to every
change call listed below.

**`mint_property` also needs storage.** It mints an NEP-171 token, so it wants
a real deposit on top — the app sends `0.01 NEAR` and the excess is refunded.

Amounts are **atomic stablecoin units** (6 decimals for the tokens above), sent
as strings. `250000000` is 250 USDT.

## The flows

### Buying

```
mint_property                     seller lists
  ft_transfer_call -> the contract  buyer bids; the token contract calls
                                    ft_on_transfer, which creates the bid
accept_bid                        fast path: pays the seller and hands over
                                  the NFT in one transaction
accept_bid_with_escrow            escrow path, below
  confirm_document_release        seller mints the agreement to the buyer
  confirm_document_receipt        buyer accepts the terms — point of no return
  release_escrow                  buyer releases payment; ownership transfers
```

A buyer can walk away at `Accepted` (`buyer_cancel_accepted_bid`) or at
`DocsReleased` (`buyer_reject_documents_and_cancel`, which burns the agreement
so they cannot keep a document they never paid for). There is deliberately no
exit after `confirm_document_receipt`: accepting the terms is the commitment
the seller relies on.

Losing bids are refunded when a deal completes. If gas runs short the sweep
stops, and whatever it did not reach stays `Pending` — `claim_lost_bid` is how
that bidder gets their own money back without needing anyone's cooperation.

### Renting

```
mint_property(is_for_sale: false, lease_duration_days: 365, damage_deposit_required?)
  ft_transfer_call                tenant sends rent + deposit in one transfer
accept_bid                        lease starts; rent to the landlord, deposit held
accept_lease_renewal              extends the term; no second deposit
```

The term is in **days**, and it is exact. A client that offers a seller days,
months or years maps them itself — 30 for a month, 365 for a year, the number
entered for a custom term. Days are the unit because they are the finest thing
a seller can pick; storing months meant anything shorter was rounded up, so a
seven-day let ran for thirty and a year ran for 360 days.

### Security deposits

Optional, set by the owner on a lease listing. `0` or omitted charges none, and
the contract refuses one on a sale listing — there is no tenant to collect from
and nobody to give it back to.

The tenant pays it alongside the rent in a single transfer. `ft_on_transfer`
splits the two and snapshots the deposit onto the bid, so an owner cannot raise
it between the tenant reading the listing and bidding. On acceptance the rent
goes to the landlord and the deposit stays with the contract as
`Lease.escrow_held`.

After the lease ends:

| | |
| --- | --- |
| Owner claims | `raise_damage_claim(lease_id, amount, reason)`, within 7 days of the lease ending. `amount` is what they are asking for, not what they get. |
| Admin settles | `resolve_dispute(lease_id, winner, payout_amount, resolution_notes)`. **Whatever is not awarded returns to the tenant in the same call.** |
| No claim made | `refund_damage_deposit(lease_id)` returns the whole deposit. Callable by anyone, since the money can only go to the tenant. |

The window is what makes this safe in both directions. Before the lease ends
there is nothing to claim; once it closes the tenant needs no cooperation from
the owner. Neither side can strand the other by going quiet.

### Disputes

`raise_dispute` for a bid, `raise_lease_dispute` for a lease. An admin settles
either one with `resolve_dispute` / `admin_resolve_bid_dispute`, naming a
winner, an amount and the reasoning — which is stored alongside the verdict, so
the losing side can read why rather than just seeing a number.

Resolution is by admin arbitration. There is no oracle and no on-chain voting.

## Timing

Defaults, all configurable on chain.

| Setting | Default | Set with |
| --- | --- | --- |
| Bid expiry | 7 days | `set_time_lock_config` |
| Escrow release delay | 24 hours | `set_time_lock_config` |
| Lost-bid claim delay | 24 hours | `set_time_lock_config` |
| Buyer cancel, accepted | 24 hours | `set_cancellation_windows` |
| Buyer reject documents | 48 hours | `set_cancellation_windows` |
| Stalled deal timeout | 7 days | `set_cancellation_windows` |
| Dispute resolution timelock | 72 hours | `set_cancellation_windows` |
| Lease early termination | 7 days | `set_cancellation_windows` |
| **Damage claim window** | **7 days** | `set_cancellation_windows` |

## Methods

All change methods take 1 yoctoNEAR. Owner/admin-only ones are marked.

### Listing

| Method | Notes |
| --- | --- |
| `mint_property(title, description, media_uri, price, is_for_sale, lease_duration_days?, damage_deposit_required?)` | Returns the property id. Needs a storage deposit. Term in days. |
| `update_listing(property_id, price, is_for_sale, lease_duration_days?, damage_deposit_required?)` | Owner. Relists without minting a second token. |
| `delist_property(property_id)` / `delete_property(property_id)` | Owner. Both refuse while bids hold escrow. |

### Bidding and settlement

| Method | Notes |
| --- | --- |
| `ft_on_transfer(sender_id, amount, msg)` | Not called directly — `ft_transfer_call` on the token contract reaches it. `msg` is `{property_id, action, stablecoin_token}`. |
| `accept_bid(bid_id, property_id)` | Owner. Settles immediately. |
| `accept_bid_with_escrow(bid_id, property_id)` | Owner. Starts the document flow. |
| `accept_lease_renewal(bid_id, property_id)` | Owner. Extends the sitting tenant's term. |
| `reject_bid(bid_id, property_id)` | Owner. Refunds the bidder. |
| `cancel_bid(bid_id, property_id)` | Bidder, while `Pending`. |
| `buyer_cancel_accepted_bid(bid_id, property_id)` | Bidder, at `Accepted`. |
| `buyer_reject_documents_and_cancel(bid_id, property_id)` | Bidder, at `DocsReleased`. Burns the agreement. |
| `confirm_document_release(bid_id, property_id, document_image_uri, document_description)` | Owner. Mints the agreement. |
| `confirm_document_receipt(bid_id, property_id)` | Bidder. Point of no return. |
| `release_escrow(bid_id, property_id)` | Bidder. Pays the seller, transfers ownership. |
| `claim_lost_bid(bid_id, property_id)` | Bidder. Only for a bid still `Pending` on a property that went elsewhere. A rejected bid was refunded at rejection, so it is not claimable. |
| `complete_transaction(bid_id, property_id)` | |
| `refund_escrow_timeout(bid_id, property_id)` | Unwinds a deal whose counterparty went silent. |

### Leases and deposits

| Method | Notes |
| --- | --- |
| `raise_damage_claim(lease_id, amount, reason)` | Owner, after the lease ends, inside the window. |
| `refund_damage_deposit(lease_id)` | Anyone, after the window closes. Pays the tenant. |
| `expire_lease(lease_id)` | Ends a lease that has run its term. |
| `raise_lease_dispute(lease_id)` / `raise_lease_dispute_with_reason(lease_id, reason)` | |
| `raise_dispute(bid_id, property_id, reason)` | |
| `cron_check_leases()` | Sweeps expired leases. |

### Admin

`add_admin`, `remove_admin`, `resolve_dispute`, `admin_resolve_bid_dispute`,
`set_cancellation_windows`, `set_time_lock_config`, `add_supported_stablecoin`,
`remove_supported_stablecoin`, `withdraw_stablecoin`, `emergency_withdraw`,
`refund_bids`, `admin_delist_property`, `admin_delete_property`,
`admin_change_nft_metadata`.

### Views

Free to call and take no deposit.

**Properties** — `get_property_by_id`, `get_properties`, `get_property_by_owner`,
`get_my_properties`, `get_property_counter`

**Bids** — `get_bids_for_property`, `get_active_bids_for_property`,
`get_bids_for_property_paginated`, `get_bids_by_bidder`, `get_my_bids`,
`get_all_bids`, `get_bids_on_my_property`, `get_bid_counter`, `get_disputed_bids`

**Leases** — `get_lease_by_id`, `get_leases_by_tenant`, `get_my_leases`,
`get_active_leases_count`, `get_lease_counter`, `get_leases_with_disputes`

**Contract** — `get_version`, `supported_stablecoins`, `get_stablecoin_balance`,
`get_time_lock_config`, `get_cancellation_windows`, `get_owner_id`,
`get_all_admins`, `is_admin`, `get_user_stats`

Plus the NEP-171 enumeration methods (`nft_token`, `nft_tokens_for_owner`,
`nft_total_supply`, `nft_metadata`, …).

`get_version` is also the deserialization canary: it reads the state struct end
to end, so it only answers if the deployed code and the stored state agree.

## Development

```bash
cargo fmt --all            # CI enforces this
cargo clippy --all-features --workspace --tests
cargo test                 # sandbox tests; downloads a neard binary on first run
cargo near abi
cargo near build
```

Tests run against a real NEAR sandbox with a real NEP-141 token
(`tests/fixtures/ft`), so escrow movement is asserted on balances rather than
described. `tests/common/mod.rs` has the fixture.

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md). In short: nothing is deployed from a laptop.
Merging to `main` deploys; every pull request gets its own throwaway staging
subaccount so a change can be exercised on chain before it lands.

Before anything reaches the chain the workflow compares the live contract's
`get_version` against the version this commit builds, and refuses a code-only
deploy onto a state layout that has changed. Borsh is positional, so adding,
removing or reordering a field in `ShedaContract` counts as a change and needs
a migration written to go with it.

## Layout

```
src/lib.rs        contract state, entrypoints, NEP-171 wiring
src/internal.rs   the flows — accept, escrow, documents, refunds, leases
src/admin.rs      admin and owner-only operations
src/models.rs     stored types
src/views.rs      read-only types and methods
src/events.rs     NEP-297 events
src/ext.rs        external contract interfaces
tests/            sandbox integration tests
```
