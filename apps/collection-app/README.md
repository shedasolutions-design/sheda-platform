# Sheda Collections

Backing a building before it is built, and earning a share of its rent once
it is let.

Kept apart from the rental app on purpose. That app has real users and a
working contract behind it; this is stage 7 of [the build spec][spec] being
developed where it cannot destabilise them. It folds in as an **Invest** tab
once the flows hold up.

[spec]: https://claude.ai/artifact/9ttLG6SjqLLK5SV5dEtt47

The vault contract these screens read lives in `contracts/vault/`, and the
raise in `contracts/raise/`, both in this repository.

---

## Running it

```bash
npm install
npm start          # then a for Android, i for iOS, w for web
npm test           # money arithmetic and the ranking
npm run typecheck
```

Nothing needs configuring to start. It reads the same testnet marketplace and
stablecoin the rental app uses. `app.json` under `extra` is the one place to
change that.

## Built to be merged, not ported

Every version is pinned to what the rental app already resolves: Expo 57,
React Native 0.86.0, React 19.2.3, NativeWind 4, expo-router. The Tailwind
tokens are the same Sheda values, and `components/Text.tsx` has the same
shape as that app's `components/Text/*`, so a screen moves across with only
its import paths changing.

Two colours exist here that do not exist there: `positive` and `caution`.
A raise has to say whether a guarantee exists and whether a phase passed,
and the brand red cannot mean both "Sheda" and "something is wrong".

## Two sides, one app

Sheda Collections has a buyer side and a builder side that barely overlap, so
the tab bar changes with the role rather than showing each of them half a
product. The switch sits in the header of every screen. Once sign in lands
the role follows the connected account, and the switch stays only for an
account that is genuinely both.

**As a buyer**

| Route | Does |
| --- | --- |
| `/` | Raises open for investment |
| `/project/[id]` | Who is behind it, what is verified, how money is released |
| `/project/[id]/units` | Pick a flat, choose an amount, see what you get |
| `/holdings` | Units held, rent ready to claim |

**As a builder**

| Route | Does |
| --- | --- |
| `/raises` | Your raises, what has been released and what is still in escrow |
| `/approvals` | Every phase, and which party is holding it up |
| `/stake` | Stake posted, allocated and free, and what it lets you promise |

**Both**

| Route | Does |
| --- | --- |
| `/directory` | Builders and managers, ranked |
| `/person/[id]` | One profile in full, including the jobs that went wrong |

```
services/money.ts      amounts, shares, ownership, BigInt throughout
services/vault.ts      reading vaults over JSON-RPC
services/projects.ts   project shapes, with sample data until stage 3
services/people.ts     builders, managers, and the ranking
services/builder.ts    phase states and what each party can do
services/role.ts       which side of the product is on screen
components/ui.tsx      the pieces every screen is built from
components/Score.tsx   how a rank is shown, never without its working
constants/theme.ts     palette and type scale, for props Tailwind cannot reach
```

## How the ranking works

A score beside someone's name on a platform where people commit money is not
decoration, and a number nobody can account for is worse than no number. So:

**Only facts the chain records.** Raises completed, completed late or
abandoned; stake posted and stake slashed; phases attested; rent credited;
months a unit sat empty. Nothing self reported, and Sheda never adjusts a
score by hand.

**Builders**, out of 100: delivery 50, cover posted 25, integrity 25. A late
job counts for half, because the building did get built. An abandoned one
counts against, because otherwise a builder dilutes a walk away by opening
more raises. Delivery is clamped at zero so a failure cannot eat the other
components.

**Managers**, out of 100: occupancy 40, paying on time 35, conduct 25. An
empty flat pays nothing however well it is looked after, and rent that
arrives but is never credited is rent the holder does not have.

**Below a minimum history there is no score at all.** Two finished projects
for a builder, a year of mandates for a manager. A builder with one finished
job is not excellent and is not poor, and a rank on a sample that small
misleads whichever way it lands. Those profiles read "Not rated yet", sit
under their own heading in the directory, and carry no rank number, because a
position at the bottom of one list would read as "worst" when it means "no
evidence".

Every component is published with the input that produced it, so a reader who
disagrees can see which part they disagree with.

## Decisions worth knowing

**Money never touches `Number`.** Every amount is an integer string handled
as `BigInt`. Above 2^53 a JavaScript number stops being exact, and atomic
units reach that easily. A price of ₦18m is `18000000000000`. Rounding there
is how an app ends up showing a holder a figure the chain disagrees with.
`parseMoney` refuses more precision than the coin has rather than silently
truncating, because truncation is a rounding decision taken on someone's
behalf.

**Ownership is computed the way the contract computes it.** The vault exposes
`ownership_bps`; `money.ts` reproduces it exactly. Two implementations of the
same division is two numbers for the same holding.

**Base64 is written out.** Neither `btoa` nor Node's `Buffer` is reliably
present across React Native, Hermes and the web build. Depending on either
gives a call that works in the simulator and throws on a device.

**RPC falls through its endpoints** and remembers which one answered. A single
unreachable provider should cost speed, not function. The rental app learned
that when a deprecated endpoint began refusing everything.

**Browsing needs no wallet.** Someone deciding whether this is worth their
money has not decided to sign anything. Asking first is how a browse screen
stops being browsed.

## What the screens are careful about

These come from the risk register and are the reason some text reads the way
it does.

- **The projected return is labelled as the builder's figure** wherever it
  appears. The moment a platform displays a projection unattributed it is
  endorsing it.
- **"No guarantee" is printed, never left blank.** An empty space where a
  cover figure belongs reads as reassurance.
- **Cover is restated in money at the point of commitment.** 18% is abstract
  while someone is deciding; ₦45,000 of ₦250,000 is not.
- **An unverified document is as prominent as a verified one.** Under an open
  market the investor carries the judgement, so they are owed the material to
  make it.
- **A builder managing their own build is flagged on the project page**, with
  the reason: they may hold the mandate but may not sign off their own
  construction phases.
- **Vacancy is shown as plainly as income.** A unit earning nothing is what a
  holder most needs to know and what a portfolio screen most often hides
  behind a total.
- **A share is described as a claim on rent, not as title.**
- **A rank is never shown without its working**, and a profile that cannot be
  ranked says so in words rather than showing a zero.
- **A builder cannot sign off their own phases**, and the sign-off screen
  says which party each phase is waiting on rather than offering a button
  that quietly does nothing.

## Not wired yet

Signing. Committing to a raise and claiming rent both read correctly and
compute correctly, and neither submits a transaction. The raise contract is
stage 3 and the wallet is stage 7. The arithmetic and the disclosure are the
parts that have to be right first, and they are testable without a wallet.

`services/projects.ts` carries sample projects shaped exactly like the
contract's eventual return, so the screens are written against the real
interface rather than a placeholder that would need unpicking.

The builder's screens read and compute but do not write. Opening a raise,
requesting an inspection and responding to an objection all need the raise
contract, and collecting terms a contract cannot yet enforce would be a form
that lies.

Also absent: the manager's own side, voting, and the share market. Sections
03 and 05 of the spec have their wireframes.

## Testing

```bash
npm test
```

Thirty-three tests over the two things that make a claim to a reader.

**The money arithmetic**: grouping and trimming, a figure larger than a
JavaScript number can hold, what a stake buys and the round trip back,
rounding down below one share, division by zero, and ownership in basis
points matching the contract.

**The ranking**: every score is pinned to a computed total rather than
eyeballed, including the boundary where a strong builder sits at 84.9 and not
85, the clamp that stops an abandoned job producing a negative component, and
the gate that refuses to rank anyone with too little history.

The screens are not snapshot-tested. Snapshots of a layout still moving
record what it happens to be rather than what it must be, and they fail on
every honest change. They become worth adding once the flows settle.

## Licence

Unpublished. All rights reserved by Sheda Solutions.
