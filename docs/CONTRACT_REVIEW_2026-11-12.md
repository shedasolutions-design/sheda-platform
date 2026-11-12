# Contract review before mainnet (2026-11-12)

A hand review of the four contracts in `contracts/`, focused on where money
moves and who can move it. Not an audit; an outside audit is still needed
before real money. The unit tests could not be run on the reviewer's machine
(see the end), so nothing here is backed by a fresh test run yet.

## Must fix before mainnet

### 1. Marketplace: the owner key can empty every escrow
`market/src/admin.rs` `emergency_withdraw` and `withdraw_stablecoin` send
`stable_coin_balances` to an account of the owner's choosing. That balance is
not a fee pot: incoming bids add to it and payouts to sellers and refunds to
bidders subtract from it (`internal.rs`), so it is every buyer's money held in
escrow. One call with the owner key moves all of it. It contradicts the
product promise that not even Sheda can take escrowed money, and it makes the
owner key a single point of total loss.

Suggested fix: track fees separately from escrow and let these functions
withdraw only fees (or the surplus above the sum of open escrows), and put
the owner behind a multisig.

### 2. Raise: a held phase, and the money after it, can never move again
`raise/src/phases.rs` moves a phase to `Held` when 25% of the committed
weight objects. `lib.rs` says there is "no path from `Held` back to released
without governance", but no governance function exists. The tranche for that
phase and every later phase stay in escrow permanently.

Suggested fix: an explicit, logged way out, for example the manager
re-attesting after a fix (reopening the objection window), plus a way to
declare the raise stalled from `Held`.

### 3. Raise: a stalled build strands the unreleased escrow
`declare_stalled` lets investors `opt_out` for their share of the builder's
cover (`guarantee_bps` of what they committed, slashed from stake). Nothing
returns the money still in escrow (`distributable - released`). With
`guarantee_bps = 0`, as on both demo raises, investors in a stalled build get
nothing back although most of their money is still in the contract.

Suggested fix: on `Stalled`, let each investor pull their pro-rata share of
the unreleased escrow, in addition to any cover.

## Should fix

### 4. Vault: late claimers lose rent to early ones
`vault/src/income.rs` divides rent over `total_supply`, the shares minted so
far, not the flat's full share count. Shares are minted only when an
investor calls `claim_shares`, and the raise never calls `freeze_supply`
(declared in `raise/src/ext.rs`, never invoked). Rent paid before someone
claims goes entirely to whoever claimed first.

Suggested fix: mint all of a flat's shares when the raise closes (or credit
rent against the flat's total share count and hold the unclaimed part), and
freeze the supply at that point.

### 5. Marketplace: any admin can create more admins
`add_admin` needs only `assert_admin`; only `remove_admin` needs the owner.
One compromised admin key can appoint others before it is removed.
Suggested fix: owner-only `add_admin`.

## Checked and fine

- Every marketplace callback is `#[private]` (seven checked), so nobody can
  fake a "payment succeeded" step.
- Marketplace `ft_on_transfer` accepts only whitelisted stablecoins and
  requires the declared token to match the sender.
- Raise: refunds and share claims are marked before the transfer and restored
  if it fails, so nothing can be claimed twice; commitments are capped per
  flat; the fee is taken once and only from a funded raise; the builder can
  never be the attesting manager.
- Vault: rent per share is settled before every transfer, mint and burn, so
  shares cannot be moved to game rent.

## Deployment notes (testnet v2, the same day)

- Every account that holds the stablecoin must be registered with it
  (`storage_deposit`) or `ft_transfer_call` bounces. The raise, stake
  registry, all four vaults and the demo builder/manager were registered;
  the step is now in `docs/DEPLOY_COLLECTIONS.md`.
- The objection window is a fixed seven days, so on testnet a phase cannot
  be released sooner. A shorter window behind a testnet-only build flag
  would let the full flow be tested in one sitting.

## Tests

CI runs `cargo test --workspace --lib` and the marketplace integration tests
on every push. Locally the build needs the MSVC linker or a MinGW toolchain;
neither was available, so the suites were not re-run for this review.
