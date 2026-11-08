# Where each thing lives, and why

One rule decides every placement in this repository: **anything that
determines who owns what lives on the chain, and nothing that determines
who owns what is stored anywhere else.**

Everything below follows from that.

## The three parts

### `contracts/`

What has to be true without trusting Sheda.

| Crate | Holds |
| --- | --- |
| `vault` | One flat, its shares, and its rent |
| `stake-registry` | Builder and manager stake, per profile |
| `raise` | Escrow, the phase schedule, refunds and opt-outs |

Each deploys to its own account. The registry's controller is the raise
contract, which is the entire authority to touch a builder's stake.

### `services/backend/`

What a contract is the wrong place for: prose, photographs, documents,
phase names, which Sheda account a builder profile belongs to, and a cache
of chain events so a directory can be sorted and paged without every client
replaying the chain.

It stores **no** target, no raised total, no share balance, and no score.

### `apps/mobile/`

The marketplace, with Collections inside it rather than beside it. It rides
the app's existing buyer and seller mode rather than introducing a role of
its own, because the app already knows which side someone is on and two
switches can disagree.

Collections is one tab. Everything past it is pushed onto a stack under
`app/collections/`, so the whole feature can be removed without touching a
marketplace screen.

## Why the ranking is in the app

The backend returns the counts a rank is computed from and never the rank.
The directory endpoint returns rows unordered, because ordering would mean
scoring.

The product tells people Sheda does not adjust these rankings. That only
stays true if the scoring lives somewhere a reader can audit, computing from
facts the chain already published. It also means the thing making a claim
about a person can be unit tested, which a figure arriving from a server
could not be.

## How a vault can be a landlord

The marketplace knows one thing about ownership: a property NFT has an owner
account, and that owner lists it, accepts bids and gets paid. It never asks
whether that account belongs to a person.

A vault is an account. It holds the NFT, so it is the landlord, and **the
marketplace needs no change at all** for a flat owned by three hundred people
to be rented exactly like a flat owned by one.

## Where money can fail

Every cross-contract call here is a transfer that can fail after the state
has already moved. The pattern throughout is the same: mark the state before
sending, and restore it in the callback if the transfer failed. The other
order leaves a window in which a second call can be made while the first is
still in flight.

The honest limit: none of those failure paths has been executed. The unit
tests run in `near_sdk`'s mock environment, where a cross-contract call is
built and then not executed, so what is proven is the arithmetic and the
access rules.
