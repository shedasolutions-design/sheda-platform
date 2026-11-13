# NEAR Hackathon 2026 submission

**Project:** Sheda
**Tracks:** `nfts` (primary), `realworld` (secondary)
**Repository:** https://github.com/shedasolutions-design/sheda-platform
**Live app (testnet):** https://testing.sheda.app (also served at https://market.sheda.app until mainnet launches)
**Demo post:** see the X post linked from the submission
**Licence:** Apache-2.0 (`LICENSE`)
**Tags:** `pre-hackathon` (= `monorepo-baseline`) and `hackathon-submission`
**Hackathon diff:** https://github.com/shedasolutions-design/sheda-platform/compare/pre-hackathon...hackathon-submission

## One sentence

Sheda is a property marketplace on NEAR where a flat is an NFT owned by a
vault account: the vault holds the flat, collects its rent in USDC and pays it
to whoever holds the flat's NEP-141 shares, and the shares can be resold
between people on chain.

## Why this is the `nfts` entry

The track asks for NFTs that hold money and earn. Here the property NFT is held
by a vault account that *is* the landlord: it is listed on the marketplace,
accepts tenants, receives rent, keeps a repair reserve and pays holders. Each
flat has its own vault and its own share token, so owning 1% of a flat means
receiving 1% of that flat's rent, with no one reporting the figure by hand.

## Why this is also the `realworld` entry

Around the NFT is the ordinary property business that makes it worth owning,
settled in USDC: listings, viewings, offers, escrow, agreements, security
deposits, leases, disputes and cancellations, plus raising money for a
building with payments released phase by phase after inspection.

## What was built during the hackathon window

The marketplace and the first Collections contracts existed before the event
in five public repositories under the same organisation. They were combined
into this repository on **2026-11-08**; the `pre-hackathon` tag marks that
first commit. Everything in the diff above was built during the event,
including:

- **Invest v5 (fractional ownership), end to end**
  - Raise contract v5: investors **vote for the property manager** with their
    money; the most-voted candidate is fixed when the round fills.
  - **Withdraw from a filling round** (not when full, not in its last 7 days).
  - A builder's own company may manage only when flagged; each phase payment
    then needs **approval from more than half** of investors.
  - The **project pack** (every agreement and term) is required, and its
    SHA-256 is recorded on chain.
  - Vault v5: an **in-vault share market** (listings and buy offers settle
    shares and money in one transaction; rent earned before a sale stays with
    the seller) and a **holder vote to replace the manager** (more than half of
    the shares). Existing vaults were upgraded with `migrate()`.
- **Marketplace v5:** a 2% platform fee on completed sales and rent, sent to a
  council-set wallet; a contract migration verified field by field.
- **A rebuilt Invest experience:** photo cards, a four-step invest flow (flat,
  amount with live shares and rent estimate, terms, confirm), a building
  timeline (funding, building, with manager, listed, rented), map, manager
  pledges and fees, About and Updates tabs, "Know the risks".
- **Investor notifications:** followers get in-app and email updates when a
  round closes or misses its deadline, a phase is signed off or paid, or a
  flat is listed or let.
- **Marketplace work:** a new council-owned market contract, a 2-of-3 council,
  booking rules for viewings, security deposits refunded in every path,
  unified buyer and seller profiles, notification settings, and email through
  Brevo.

## Try it

No install is needed:

1. Open https://testing.sheda.app and **Continue with Google**. A NEAR testnet
   wallet is created for you; there is no extension or seed phrase.
2. Go to **Portfolio (wallet) → Get test dollars** for free test USDC.
3. Go to **Invest → Yaba Test Terraces → Invest now** and follow the four
   steps. `docs/DEMO.md` has the full click path and what each step shows.

To build and test locally:

```bash
# Contracts: 105 unit tests + 37 marketplace integration tests
cd contracts
cargo test --workspace --lib
cargo test -p sheda-contract   # needs cargo-near; drives a near-workspaces node

# Backend: 155 tests
cd services/backend
cp .env.example .env.local && pip install -r requirements-server.txt
pytest -q

# Web app
cd apps/web
cp .env.example .env.local && npm ci
npx tsc --noEmit && npx next build
```

## Contracts on testnet

| Contract | Account |
| --- | --- |
| Marketplace (v5) | `market-v2.shedauser.testnet` |
| Raise v5 | `sheda-raise-v5.testnet` |
| Raise v4 (raises opened before v5) | `sheda-raise-v4.testnet` |
| Stake registry | `sheda-stake-v5.testnet`, `sheda-stake-v4.testnet` |
| Owner of all of them | 2-of-3 council `sheda-council.testnet` |

## Known limits, stated rather than hidden

- **No external contract audit.** Testnet only; nothing is on mainnet.
- **Opening a raise is an operator step.** The council creates it on chain
  and the builder publishes it; vaults are deployed per flat by a runbook,
  not a factory.
- **Raise-to-vault cross-contract paths** are covered by live testnet smoke
  tests, not yet by a sandbox suite. The marketplace has sandbox tests,
  including rent reaching a vault and the 2% fee.
- **Manager occupancy and rent records** are not indexed yet, so new managers
  show as unrated rather than scored on missing data.

## Tools and code used

See the "AI tools and libraries" section of `README.md`.
