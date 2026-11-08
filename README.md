# Sheda Solutions

**Making real estate operations affable, available, affordable, and secure through blockchain for buyers, sellers, and everyone in between.**

A full real estate platform on NEAR. Search verified listings, book an inspection, agree terms, sign on chain and pay, all in one place, with no intermediary taking a cut between the two people doing the deal.

**Live:** https://sheda-solution-mobile--sheda-tt.expo.app · **Network:** NEAR · **Site:** https://sheda.app

<p align="left">
  <img src="docs/screenshots/welcome.png" width="260" alt="Sheda" />
  <img src="docs/screenshots/register-as-builder.png" width="260" alt="Registering as a builder" />
</p>

---

## What the platform does

Property transactions are slow, paper-heavy and built on trusting people you have never met. A deposit sits with someone you hope will return it. A title exists as a document someone could reprint. An agent stands between the buyer and the seller and is paid for being there.

Sheda puts the parts that need to be trustworthy on chain, and keeps everything else ordinary.

**For someone buying or renting**

- Search verified listings and filter by what matters to you
- Book an inspection directly with the owner, around their real availability
- Make an offer, negotiate, and agree terms in the app
- Pay into escrow that a contract releases, not a person
- Receive the documents on chain, where they cannot be quietly reissued

**For someone selling or letting**

- List a property and have it minted as an NFT you own
- Receive and review offers from verified buyers
- Release documents and take payment when the contract says the conditions are met
- Manage tenants, leases, renewals and deposits from one place
- Raise a dispute or a damage claim against a deposit, with an on-chain record

**Underneath**

- A wallet built into the app. No extension, no seed phrase to understand, no "connect your wallet" step. Account creation, signing and recovery are handled for you.
- Prices in **14 currencies** across four continents, settled in Circle USDC.
- Identity checks, ratings, in-app chat and notifications, because a marketplace is a place where people meet before it is anything else.

The blockchain is deliberately not the product. It is what makes the escrow releasable by rule rather than by permission, and the documents impossible to quietly change.

---

## Collections: fractional ownership

The second item on the Sheda roadmap, and the reason most of this repository exists.

> **Fractional Ownership & Yield Investments.** Affordable entry into premium properties, NFT-backed ownership receipts, and transparent yield distribution.

Property is the asset most people would choose and the one most are priced out of. The usual answer is a fund or a REIT: you own a slice of a pool, you do not know which building, and you trust an intermediary to tell you what it earned.

Collections does the opposite. You buy shares in **one specific flat**, often before it is built. The rent that flat earns is divided among the people who hold its shares, in proportion, in arrears, on chain. Nobody reports the figure to you, because nobody has to.

Someone who cannot buy a whole apartment can own 1.39% of one, and receive 1.39% of its rent for as long as they hold it.

---

## The NFT is the flat. The shares are a fungible token.

This is the design decision the whole system rests on.

A property is an **NEP-171 NFT**, because a flat is a *specific* flat: unit 1B on the third floor, with its own address, its own tenant and its own rent. That identity cannot be divided without destroying what makes it an asset.

The claims on it are an **NEP-141 fungible token**, because ten people splitting a flat do not own ten distinguishable things. They own ten identical claims, and the point is that those claims divide again, add together, and sell in part. A tenth of the rent is a tenth of the rent.

The alternative, numbered sub-NFTs, means writing division, merging and partial transfer by hand, and every one of those is a place to get arithmetic wrong with other people's money.

**What this buys:** the marketplace knows one thing about ownership, that a property NFT has an owner account which lists it, accepts bids and gets paid. It never asks whether that account belongs to a person. A vault *is* an account. It holds the NFT, so it is the landlord, and **the marketplace needed no change at all** for a flat owned by three hundred people to be rented exactly like a flat owned by one.

```
NEP-171 NFT  ──owned by──>  Vault account  ──shares──>  NEP-141 FT
  the flat                   the landlord                the holders
```

---

## How a raise works

1. A builder registers. The profile is public and permanent: delivery record, stake posted, anything ever slashed.
2. They open a raise: what is being built, the flats it divides into, and a phase schedule that must release **exactly** 100% of the target. Less strands money in escrow with no phase that frees it; more promises money the raise never collected.
3. Sheda checks the documents and publishes it on chain. Deliberately not the builder's step: the terms are what investors commit against.
4. People commit, choosing a specific flat. Money moves by `ft_transfer_call`, so the transfer and the record of whose it is happen in one transaction and cannot come apart.
5. The build runs a phase at a time. The builder says a phase is finished; an **independent** property manager inspects and attests; holders then have seven days to object, and a quarter of them objecting holds the payment.
6. Once let, rent arrives at the flat's vault and is divided among its shareholders.

Nothing in step 5 can be done by one party. A builder who could mark their own phase complete would make the schedule decorative. A manager who could release without the objection window would leave holders a vote they never get to use.

If the build stalls, the builder's posted stake is what investors recover. A guarantee the builder can walk away from is not a guarantee.

---

## Builders and managers are ranked, and the ranking shows its working

Collections ranks the people you are trusting with your money, and that ranking is computed **in the app**, never on the server.

The backend returns the counts: raises completed, completed late, abandoned, stake posted, stake slashed, months a unit sat empty. It returns no score and no ordering. The directory endpoint deliberately hands back an unordered list, because ordering would mean scoring.

The reason is narrow. The product tells people Sheda does not adjust these rankings. That claim only holds if the scoring lives somewhere a reader can audit, computing from facts the chain already published. A score arriving from a server could only be believed.

So every profile shows its working:

```
Delivery        41.7 of 50    2 on time, 1 late, 0 abandoned, of 3 finished
Cover posted    18.2 of 25    18.2% of everything raised is backed by their own stake
Integrity         25 of 25    No stake has ever been slashed
```

A late job counts for half, because the building did get built. An abandoned one counts against, because otherwise a builder dilutes a walk-away by opening more raises.

Below a minimum history there is no score at all. A builder with one finished job is not excellent and is not poor. Those profiles read **"Not rated yet"**, sit under their own heading, and carry no rank number, because a position at the bottom of a single list would read as "worst" when what is true is that nobody knows yet.

---

## The repository

```
sheda-platform/
├── apps/mobile/          Expo app. Marketplace and Collections, one product.
│   ├── app/(tabs)/           home, saved, activity, inbox, portfolio, invest
│   ├── app/collections/      the Collections screens
│   ├── services/collections/ money, chain reads, the ranking
│   └── contexts/WalletContext.tsx   the built-in NEAR wallet
├── services/backend/     FastAPI. What a contract is the wrong place for.
├── contracts/            NEAR. What has to be true without trusting us.
│   ├── vault/                one flat, its shares, its rent
│   ├── raise/                escrow, phases, refunds, opt-outs
│   └── stake-registry/       builder and manager stake
└── docs/ARCHITECTURE.md
```

One rule decides every placement:

**The chain holds anything that decides ownership.** Share balances, escrow, the stake behind a builder's promises, which phase has been released. These cannot be edited by anyone with database access, including us.

**The backend holds what a contract is the wrong place for.** Prose, photographs, title documents, phase names, and a cache of chain events so a directory can be sorted without every client replaying the chain.

**No figure appears in both.** A second copy of a number that decides who owns what is a second answer waiting to contradict the first.

---

## Deployed

NEAR testnet. Built by CI and deployed from that wasm, so the binary is one anyone can reproduce.

| Contract | Account |
| --- | --- |
| Marketplace | `market.shedauser.testnet` |
| Raise, escrow and phases | `sheda-raise-v1.testnet` |
| Stake registry | `sheda-stake-v1.testnet` |

The registry's controller is the raise contract. That is the entire authority to touch a builder's stake: a stalled project can slash the cover allocated to it, and nothing else can reach it.

Nothing is on mainnet. **None of this has been audited**, and an address there would be a claim that it had.

---

## Running it

Each part stands alone.

```bash
# Contracts: 71 unit tests
cd contracts
cargo test --workspace --lib
cargo clippy --all-targets -- -D warnings
cargo build --workspace --target wasm32-unknown-unknown --release

# Backend: docs at /sheda-docs
cd services/backend
cp .env.example .env && pip install -r requirements.txt
alembic upgrade head && uvicorn main:app --reload

# Mobile app: 424 tests
cd apps/mobile
cp .env.example .env && npm install
npm test
npm start          # a for Android, i for iOS, w for web
```

---

## Decisions that are easy to get wrong

**Money never goes through a JavaScript number.** Every amount is an integer string handled as `BigInt`. A unit price sits inside what a double holds exactly, but the vault's income accumulator is scaled by 1e18 and passes 1e25 in ordinary use, and a holder's claim is `balance * acc_per_share` before it is divided back down. One rule for every amount is cheaper than remembering which ones happen to be safe.

**Nobody is paid when rent arrives.** The obvious implementation loops over holders and pays each, and stops working past a few dozen of them because a transaction has a gas ceiling. It would pass every test and fail once the product succeeded. Instead one number moves, `acc_per_share += income / total_shares`, and holders pull what they are owed. Crediting costs the same for ten holders and ten thousand.

**A balance may not move until both sides are settled.** Without that, someone buying shares on Monday collects rent that accrued in March. A silent bug, favouring whoever trades most, found by the person it robbed.

**The marketplace pays landlords with a plain `ft_transfer`,** which notifies nobody. This was checked by reading the deployed bytecode rather than assumed. So money lands in a vault silently and `sync_income()` goes and looks, comparing the token balance against what was last accounted for.

**A share claim is derived, never requested.** An earlier version let the caller name their own share count and their own vault, which would have let anyone who committed the smallest amount mint as many shares as they liked. Both now come from contract state.

**Two backends share one database.** Reads fail over between them; writes never do. A write that failed at the transport layer may still have been applied, and retrying it elsewhere writes to the same database, so the buyer gets two bids.

---

## Status

| | |
| --- | --- |
| Marketplace: listings, inspections, offers, escrow, leases, documents, disputes | Working |
| Built-in wallet: creation, import, recovery, cloud backup, biometrics | Working |
| Collections: browse, rank, register as a builder, open a raise | Working |
| Contracts: vault, raise, stake registry | Deployed to testnet, 71 tests |
| Per-unit vault deployment | **Not built.** The raise records where a vault lives and mints against it; nothing creates the account. |
| Cross-contract tests | **None.** Every transfer path is unproven, including the failure paths that assume a failed transfer means the money never left. |
| Manager screens | **None.** A manager can register and then cannot attest a phase, which is the step the release schedule turns on. |
| Chain-event indexer | **Not built.** Nothing populates the counts the ranking reads, so every profile currently reads "Not rated yet". |
| Security audit | **Not done.** |

Still ahead on the Sheda roadmap: real estate services integration (management, legal, insurance), and on-chain importation of existing property.

---

## Where development happens

This repository is a snapshot, assembled so the whole system can be read in one place. Work continues in the three repositories it was built from:

- `shedasolutions-design/sheda-solution-mobile`
- `shedasolutions-design/Sheda-Backend`
- `shedasolutions-design/sheda-collection-app-contract`

---

## Licence

Unpublished. All rights reserved by Sheda Solutions.
