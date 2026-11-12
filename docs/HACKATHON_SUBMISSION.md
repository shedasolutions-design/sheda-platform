# NEAR Hackathon 2026 submission

**Project:** Sheda  
**Tracks:** `nfts` (primary), `realworld` (secondary)  
**Repository:** https://github.com/shedasolutions-design/sheda-platform  
**Testnet app:** https://testing.sheda.app  
**Production-style app:** https://market.sheda.app  
**Demo video:** _add the X post or video URL before submitting_  
**Licence:** Apache-2.0

## One sentence

Sheda turns a property NFT into a landlord: the NFT is held by a vault
account, the vault's shares are an NEP-141 token, and rent paid to the vault
is divided among the people who own those shares, on chain.

## Why this is the `nfts` entry

The property NFT is not a picture with metadata. It is the account that owns
the flat, signs the lease and receives rent. Each flat has its own vault
account, each vault mints shares when the raise funds, and each share earns a
pro-rata claim on that specific flat's rent. The NFT does something: it owns
an income-producing asset on behalf of hundreds of people.

## Why this is also the `realworld` entry

The rest of the platform is the ordinary property business that makes the NFT
worth owning: listings, inspections, offers, escrow, deposits, leases,
documents and disputes, settled in Circle USDC. The fractional flow is one
part of a product a person can use without knowing what a vault is.

## What was built during the hackathon window

The marketplace and Collections contracts and apps existed before the
hackathon in five public repositories under the same organisation. They were
consolidated into this monorepo on **2026-11-08**; everything after the
`monorepo-baseline` tag is work done in this repository during the event.

That window includes:

- **Automatic wallet provisioning for every new sign-up**, on web and mobile.
  A new account gets a wallet before it reaches the app, with a buyer/seller
  chooser retained. A returning Google user is never handed a second wallet.
- **Wallet recovery and funding fixes**: lost wallets during setup, a runaway
  RPC loop, balance history, and the "account does not exist" case while
  funding a new wallet.
- **Marketplace fixes**: signed-out visitors can browse listings, listing
  type labels no longer show raw enum names, land listings are accepted with
  zero bedrooms, and the featured board is richer.
- **Collections completion**: claim-shares and manager-attest flows in the
  web service, hooks and screens; a manager sign-off inbox; a per-flat vault
  deployment runbook; and an admin endpoint registering a deployed vault.
- **A real chain indexer** (`services/backend/scripts/sync_collections_chain.py`)
  that rebuilds builder and manager chain records from the raise and stake
  contracts instead of leaving every profile "Not rated yet".
- **Hackathon packaging**: Apache-2.0 licence, this document, a demo script,
  a web CI job, and a status table that says what is and is not built.

The honest baseline is the `monorepo-baseline` tag plus the five upstream
repositories listed in the README. The diff from that tag is the
hackathon-window change set.

## Reproduce it

The contracts and the backend need no third-party services to run the tests.

```bash
# Contracts: unit tests and wasm build
cd contracts
cargo test --workspace --lib
cargo build --workspace --target wasm32-unknown-unknown --release

# Backend: tests and API
cd services/backend
cp .env.example .env.local
pip install -r requirements-server.txt
pytest -q

# Web: typecheck and production build
cd apps/web
cp .env.example .env.local
npm ci
npx next typegen
npx tsc --noEmit
npx next build
```

The live demo needs no local setup: open https://testing.sheda.app, sign in
with Google, and the wallet is created for you.

## What to look at in the demo

1. Sign in on the testnet app. The wallet is provisioned automatically.
2. Browse a property and a Collection. The project page shows the terms, the
   phase schedule, the builder and manager records, and every unverified
   document is labelled as unverified.
3. On a funded raise, the investor's position shows the commitment, the
   shares owed and a **Claim shares** action. The claim mints NEP-141 shares
   against the flat's vault.
4. The manager's **Sign-offs** screen lists phases waiting on an inspection
   and signs one off. The builder sees the same phase move to the seven-day
   objection window.
5. Holdings reads the vault directly: share balance, rent owed, and a claim
   that pays from the vault's own balance.

`docs/DEMO.md` has the exact click path and a three-minute video script.

## What the AI screeners can check without a wallet

- `README.md` states the architecture, the run commands and the limits.
- `docs/DEPLOY_COLLECTIONS.md` is the operator runbook for the contracts.
- `contracts/README.md` lists the contract interface and why shares are
  fungible while the flat is an NFT.
- `docs/ARCHITECTURE.md` explains the backend/chain split.
- The status table in `README.md` names the incomplete parts: external audit,
  cross-contract tests for vault and raise, per-unit vault factory, manager
  lease/rent indexer, and email.

## Known limits, stated rather than hidden

- **No external contract audit.** Testnet only; mainnet ids are deliberately
  empty.
- **The live `sheda-raise-v1.testnet` predates `set_unit_vault` and
  `shares_owed`.** The code and runbook are current; the deployment needs the
  v2 runbook before the claim-shares loop can be demonstrated against it.
- **Vault deployment is an operator step, not a factory.** The runbook makes
  it reproducible; a factory is future work.
- **Manager occupancy and rent are not indexed yet.** The indexer records the
  facts the raise and stake contracts publish and leaves the lease/rent
  fields at zero, which keeps a manager unrated rather than scoring missing
  data as bad performance.
- **Cross-contract failure paths are only partly tested.** The marketplace
  has integration tests; the vault/raise paths that call it still need a
  sandbox suite.

## Submission checklist

- [ ] Repository is public and the default branch is `main` or `TT` as the
      hackathon expects (both are public).
- [ ] `LICENSE` is present (Apache-2.0).
- [ ] README has the track ids, the demo script link and the baseline
      disclosure.
- [ ] The X demo post tags `@NEARProtocol` and `#NEARHackathon`.
- [ ] The demo video URL is added to this file.
- [ ] The human has reviewed the exact submission payload before
      `POST https://nearhackathon.com/api/applications`.
- [ ] No second submission is sent for the same project.

The submission API call is intentionally not automated here. The hackathon
requires a human to confirm the payload, and a duplicate submission cannot be
undone.
