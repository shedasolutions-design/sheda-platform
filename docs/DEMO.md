# Demo: try Sheda in five minutes

Everything below runs on NEAR testnet at https://testing.sheda.app with test
money. No install, no wallet extension, no seed phrase. Each step says what to
do and what you should see.

## 1. Sign in

**Do:** open https://testing.sheda.app → **Continue with Google**.
**See:** the app creates a NEAR testnet wallet for you and lands on Home.

## 2. Get test money

**Do:** bottom bar **Portfolio** (the wallet) → **Get test dollars**.
**See:** test USDC in the Tokens tab within a few seconds.

## 3. Browse a building to invest in

**Do:** bottom bar **Invest** → **Yaba Test Terraces**.
**See:**
- the funding bar and "Open to invest";
- the builder card, and **Follow updates**;
- "Where this building is": funding → building → with manager → listed → rented;
- **Rent you could earn**: type an amount, switch Day / Month / Year;
- the location on OpenStreetMap;
- **Property manager**: Eze Property Management at 8% of rent, with their pledge;
- **Read the project pack** with its SHA-256 fingerprint (also recorded on chain);
- "How the money is released": four phases, each paid only after inspection;
- **More information** sections and **Know the risks**. Every "i" opens a short explanation.

## 4. Invest

**Do:** **Invest now** → choose the flat → enter an amount (e.g. 10) → **Continue**.
**See:** the shares you get, your share of the flat, the price per share and the possible rent.
Enter less than one share to see the "below minimum" message.

**Do:** read the terms, tick both boxes → **Agree and continue** → **Confirm and pay**.
**See:** "You're in". The money is now held by `sheda-raise-v5.testnet`, not by the builder.

## 5. Your position

**Do:** **Invest** → **Portfolio** (top right of the Invest page; the bottom-bar Portfolio is your wallet).
**See:** **Rounds you're in** with time left and % filled.
While the round is filling you can **Take out** your money (v5 raise, until 2 minutes
before the deadline on testnet; 7 days on mainnet). If a round misses its deadline,
**Get my money back** refunds everything.

## 6. Shares, rent and the manager

**Do:** Invest → **Shares**.
**See:** shares other investors are selling and offers to buy, with the price against
the original price per share. Buying moves the shares and pays the seller (less 2%) in
one transaction.

**Do:** Invest → Portfolio → a holding → **Sell shares** or **Change manager**.
**See:** listing at your price (your shares keep earning rent until sold), or a vote for
a new manager that applies once holders of more than half of the flat's shares agree.

## 7. Notifications

**Do:** bell → **Notifications**, and **Settings → Notification settings**.
**See:** "Invest updates" for buildings you follow (round closing, filled, phase signed
off or paid, flat listed or let), and the switch to turn them off.

## The marketplace (homes to buy or rent)

**Do:** Home → open a listing → **Make offer** → choose a test stablecoin → **Place Bid**.
**See:** contact with the owner unlocks; the deal appears under **History**; the seller
accepts, books a viewing, sends the agreement, and the money is released from escrow
only when the buyer confirms. Sellers see Sheda's 2% before accepting.

## What to check on chain

- Raise: `sheda-raise-v5.testnet`, method `get_project` with `{"project_id": "yaba-test-terraces"}`:
  status, candidates and votes, the manager's fee, the pack hash.
- Flat vaults: `get_info`, `get_listings`, `get_offers`, `claimable`.
- Marketplace: `market-v2.shedauser.testnet`, `get_version` (5) and `get_platform_fee`.

## Script for a 60–90 second video

> Most people can't buy a flat. Sheda lets you own part of one, on NEAR.
>
> Each flat is an NFT, and the NFT is owned by a vault account. The vault is the
> landlord: it rents the flat out, collects the rent in USDC, and pays it to
> whoever holds the flat's shares.
>
> Investing takes four steps. You see exactly how many shares your money buys,
> your share of the flat and the rent it could earn. Your money waits in the
> raise contract, not with the builder.
>
> Investors vote for the property manager. The manager inspects every building
> phase before it is paid, and holders can object. If the builder manages it
> themselves, more than half of investors must approve every payment.
>
> When you want out, sell your shares to another investor. The shares and the
> money move in one transaction, and the rent you earned stays yours.
>
> Built at NEAR HACKATHON.
