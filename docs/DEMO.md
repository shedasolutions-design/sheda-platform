# Three-minute demo

This is the shortest path that shows the product doing the thing the pitch
claims. It assumes the testnet app and the v2 Collections deployment from
`docs/DEPLOY_COLLECTIONS.md`. If the live raise is still v1, stop after step
4 and use the "v1 fallback" below; do not show a claim button that the
contract cannot serve.

## Before recording

- Signed out of https://testing.sheda.app in a clean browser profile.
- A Google account that has never used the app, so wallet provisioning is
  visible.
- An investor account that holds the raise's USDC, if you are recording the
  claim.
- The manager account signed in in a second window for the sign-off clip, or
  record that part separately and cut it in.

## Click path

1. **testing.sheda.app** → Continue with Google.
   The app lands on `/wallet-setup/provision`, creates a wallet, and reaches
   Home with a funded account. Say: "There is no wallet setup. The account
   exists before the first screen."
2. **Collections** → open a project.
   Point at: the phase schedule, the builder and manager records, the
   documents (verified vs uploaded vs missing), and the line that the return
   is the builder's estimate.
3. **Choose a unit** → pick a flat → enter an amount → **Commit**.
   Say: "The money goes to escrow by `ft_transfer_call`, so the transfer and
   the record of whose it is happen in one transaction."
4. **Project page → Your position**.
   Before funding: the commitment and the shares set aside. After funding:
   **Claim shares**. Claiming mints NEP-141 shares against that flat's vault.
5. **Holdings**.
   The share balance is read from the vault. Rent owed is `claimable`, and
   **Claim** pays from the vault's own balance.
6. **Sign-offs** (manager account).
   The phase waiting on inspection is listed. Click **I have inspected this
   — sign it off**. In the builder window the same phase moves to "Holders
   may object" for seven days.
7. **Directory → a builder profile**.
   The rank shows its working: delivery, cover posted, integrity, and the
   facts each was computed from. If the indexer has not run, it says what is
   missing instead of showing a score.

## 60-second voiceover

> Property is the asset most people want and the one most are priced out of.
> A fund gives you a slice of a pool you cannot see. Sheda gives you shares in
> one specific flat.
>
> The flat is an NFT. The NFT is owned by a vault account, so the marketplace
> treats three hundred owners exactly like one landlord. The claims on the
> flat are a fungible token, so they divide, add up and sell in part.
>
> Money is released a phase at a time: the builder asks for an inspection, an
> independent manager signs it off, and holders have seven days to object.
> Rent lands in the vault and is divided by the share ledger, not by a
> spreadsheet someone can edit.
>
> The wallet is created at sign-up. No extension, no seed phrase, no connect
> button. The chain is doing the work; the user is buying a flat.

## v1 fallback

The live `sheda-raise-v1.testnet` predates `set_unit_vault` and
`shares_owed`. Against it:

- Steps 1–3 still work: provisioning, browsing, committing.
- Step 4 will not show a claim action. Say: "Commitments are held in escrow;
  the current testnet contract predates the vault registration call, so the
  claim step is shown in the runbook and the code rather than on this
  deployment."
- Steps 6–7 still work if the project is funded and the manager account is
  independent: `attest` and the phase schedule exist on v1.
- Do not claim the shares loop works on v1. The honest fallback is stronger
  than a failed transaction on camera.

## Links to show in the post

- App: https://testing.sheda.app
- Repo: https://github.com/shedasolutions-design/sheda-platform
- Contracts: https://github.com/shedasolutions-design/sheda-platform/tree/TT/contracts
- Runbook: https://github.com/shedasolutions-design/sheda-platform/blob/TT/docs/DEPLOY_COLLECTIONS.md
