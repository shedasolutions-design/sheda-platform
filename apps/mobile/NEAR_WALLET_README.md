# NEAR Wallet Integration

The Sheda app ships a built-in, seed-phrase NEAR wallet that behaves the same on
Expo (iOS/Android) and on web. It is created against the user's Sheda account,
stored encrypted on the device, and can be backed up to the user's own Google
account as client-side-encrypted ciphertext.

## Contents

- [Architecture](#architecture)
- [Two-phase initialization](#two-phase-initialization)
- [Storage model](#storage-model)
- [Encrypted cloud backup](#encrypted-cloud-backup)
- [Cloud backup setup](#cloud-backup-setup)
- [Environment variables](#environment-variables)
- [FastAuth is dormant](#fastauth-is-dormant)
- [Legacy storage migration](#legacy-storage-migration)
- [API reference](#api-reference)
- [Testing and QA](#testing-and-qa)
- [Rollback](#rollback)

---

## Architecture

| Module | Responsibility |
| --- | --- |
| `services/nearWallet.ts` | Single source of truth for seed-based wallet operations — create, import, sign, send, balances, `getAccount()` / `signAndSendTransaction()` / `viewFunction()`. |
| `services/secureStorage.ts` | Platform dispatch for secrets: Keychain on native, encrypted IndexedDB on web. Owns the legacy migration. |
| `services/webSecretStore.ts` | Web at-rest encryption: IndexedDB + a non-extractable AES-GCM `CryptoKey`. |
| `services/platformAdapter.ts` | Fast, non-secret wallet metadata (`accountId`, `publicKey`) — the Phase A read. |
| `services/walletCrypto.ts` | AES-256-GCM + PBKDF2 envelope for cloud backups. Portable across Hermes and browsers. |
| `services/cloudBackup.ts` | Firebase Auth + Firestore over REST. Only ever handles ciphertext. |
| `contexts/WalletContext.tsx` | React state, two-phase init, backup/restore surface. |
| `components/BackupPrompt.tsx` | Backup opt-in and restore UI. |
| `config/featureFlags.ts` | `FEATURE_FAST_AUTH`, `FEATURE_CLOUD_BACKUP`. |

Import graph is acyclic:
`platformAdapter → secureStorage → webSecretStore`.

---

## Two-phase initialization

Wallet startup is split so the UI is never held hostage by the network.

**Phase A — fast, local, no network.** One `AsyncStorage`/`localStorage` read of
a small non-secret metadata record. No Keychain, so no biometric prompt; no RPC.
Settles in single-digit milliseconds and answers "is there a wallet, and which
account is it?"

**Phase B — background.** Loads key material, verifies against RPC, fetches
balances. Updates state when it resolves.

```ts
const { readiness, hasLocalWallet, localWalletMetadata, loading } = useWallet();
```

| `readiness` | Meaning |
| --- | --- |
| `idle` | Nothing attempted yet (no signed-in user). |
| `metadata` | Phase A done. Enough to render the real screen. |
| `ready` | Phase B done. Balances are trustworthy. |
| `error` | Phase B failed. **Phase A's answer still stands.** |

### The rule that matters

> **Never bind `loading` to `disabled` on Create Wallet, Import, or Sign In.**

`loading` covers Phase B. Gating those buttons on it is what previously made
them dead for the length of an Auth0 session check plus an RPC probe (up to 15s
*per endpoint* on a bad network). Use a screen-local `submitting` flag for the
action's own in-flight state, and use `loading` only to drive spinners and
skeletons.

A `readiness === "error"` state deliberately does **not** retract Phase A. A dead
RPC endpoint is not evidence that the user's wallet stopped existing, and
blanking the screen on a network blip is how a working wallet comes to look lost.

---

## Wallet creation never hard-fails

`createWallet()` walks three rungs and stops at the first that works. An empty
funding account no longer takes signup down with it.

| Rung | Result | Needs funding account? | Networks |
| --- | --- | --- | --- |
| 1. Sponsored | `alice.sheda.testnet` | Yes — balance is checked, not just the key | both |
| 2. Registrar | `alice7f3k.testnet`, funded 10 NEAR by NEAR's helper | No | **testnet only** |
| 3. Implicit | 64-char hex of the public key | No | both |

Rung 1 checks the funding account's actual *balance* before committing. A
configured key over a drained account otherwise fails at signing time, several
seconds and one baffling error later.

Rung 2 calls `helper.testnet.near.org`, NEAR's public account service. There is
no mainnet counterpart and there cannot be one — see below.

Rung 3 always works. The address is the hex of the account's own ed25519 public
key, derived locally with no transaction and no funding. It is a real
self-custodial wallet: verified on testnet end-to-end, including signing a
transfer *from* it after activation, and confirming the same seed phrase
re-derives the same address so restore works.

An implicit account does not exist on chain until its first deposit. Callers get
`needsFunding: true`, `isCreated: false` and `balance: "0"`, and the testnet
airdrop is skipped — the airdrop is a signed transaction from the new account,
and an account that does not exist yet cannot sign. The create-wallet screen
says so plainly rather than presenting a dormant address as a ready wallet.

### Why mainnet cannot have a free named account

Every NEAR account must hold enough NEAR to cover its own storage staking, so
creating one always costs somebody real money. That is a protocol rule, not a
missing service, and no amount of client-side work routes around it. On mainnet
the options are: Sheda's funding account pays (needs the mainnet key, which
[would be public in a web build](#-the-funding-key-is-not-secret-in-a-web-build)),
the user pays (impossible — they have no account yet), or an implicit account.
Hence rung 3.

The real fix for mainnet is a backend endpoint that creates and funds accounts
server-side, where the key stays secret. The backend today has
`/api/v1/users/wallets/register`, which registers an *existing* wallet; it
cannot create one. That endpoint is the prerequisite for mainnet.

---

## Clean restart (WALLET_EPOCH)

The testnet funding account moved from `sheda.testnet` to `shedauser.testnet`
on 2026-09-06. Every previously-issued `*.sheda.testnet` wallet is in a
namespace the app no longer provisions under.

The account pointer is keyed by email and survives app updates, so those users
would otherwise reconnect to the dead namespace forever and never see the new
flow. `WALLET_EPOCH` in `config/walletConfig.ts` fixes that:

- Wallet metadata is stamped with the epoch it was created under.
- On launch, a wallet from an older epoch is **detached** — the pointer is
  dropped and the user is offered wallet creation, exactly like a new user.
- Metadata with no `epoch` counts as epoch 1, since those records predate the
  field and are precisely the generation being retired.

**Detaching never deletes key material.** The seed phrase for an abandoned
wallet stays in secure storage, so anything left in one of those accounts is
still recoverable by importing the phrase. Only the "this is your current
wallet" pointer is dropped — detaching is reversible, deleting a seed is not.

To force another fresh start later, bump `WALLET_EPOCH`. No per-user action and
no backend migration is needed: `registerWallet()` re-links automatically
whenever the connected account changes (`app/(tabs)/history/index.tsx`).

### Funding runway

`createWallet()` sponsors 1 NEAR per wallet and keeps a 0.05 margin, so the
parent account's balance divided by ~1.05 is roughly how many branded wallets
remain. **Below that, creation silently falls through to the free `*.testnet`
registrar** and users get names outside the `shedauser.testnet` namespace.
Nothing breaks, but the branding quietly stops. Check with:

```
curl -s -X POST https://test.rpc.fastnear.com -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"shedauser.testnet"}}'
```

### Known leftover

Property `id 0` on `shedasolution.testnet` is owned by
`shedasolutions.sheda.testnet`, an old-namespace account. It survives the
restart as an orphaned listing that nobody can act on. `delete_property` is
owner-gated and that account's key is not held here, so it cannot be cleaned up
from the app. Options: leave it, or delete it from a session holding that
account's seed phrase.

---

## Biometric unlock for the backup passphrase

The chosen key-wrapping design was "passphrase, with device-secure-enclave
unlock". The passphrase half shipped first; this is the unlock half.

The passphrase remains the portable key — it is what makes a backup openable on
a device that has never seen this wallet. What changes is that a device which
has *already* seen it can offer Face ID instead of making the user retype it.

| | Stored where | Gated by |
| --- | --- | --- |
| Native | Keychain, `BIOMETRY_ANY_OR_DEVICE_PASSCODE` | the OS, on read |
| Web | IndexedDB under a non-extractable AES-GCM key | nothing — no enclave exists |

`canUseBiometricUnlock` is false on web and on devices with nothing enrolled, so
the "Remember on this device" option is only offered where a real presence check
can back it up. Promising a Face ID gate the platform cannot enforce would
misrepresent how protected the value is.

### Why storing it at all is acceptable

The passphrase protects the blob sitting in Firestore. Its threat model is
"someone obtains the ciphertext", not "someone has the user's unlocked device" —
anyone holding an unlocked device already has the seed phrase itself, in this
same secure store. Caching the passphrase beside it grants an attacker nothing
they did not already have, and the property that actually matters is unchanged:
**the passphrase is never uploaded**, so a Firestore compromise stays useless.

### Details worth preserving

- Existence is checked with `hasInternetCredentials`, which does not decrypt.
  Probing with a real read would throw a Face ID sheet at the user the instant
  the sheet renders, before they asked for anything.
- A cancelled prompt returns `null`, not an exception. Declining to
  authenticate is a normal choice, not an error worth a banner.
- The passphrase is remembered only *after* the upload succeeds — a one-tap
  unlock for a backup that does not exist leads nowhere.
- Signing out forgets it. On a shared device it would otherwise be a one-tap
  route into the previous user's cloud backup. The remote backup is untouched.
- Unlocking fills the field rather than bypassing it, so the user can still see
  and correct what will be used.

### Passkeys

Not implemented, and deliberately so for now. WebAuthn's `prf` extension can
derive a stable KEK, so it is technically viable — but a passkey's secret lives
with its credential and provider, and the backup exists precisely for the case
where the user has a *new* device. A passkey created in iCloud Keychain is not
available in a Windows browser, so passkey-as-the-only-key would break the
feature exactly when it is needed.

If added, it must be an *additional* wrap: encrypt the seed under a random data
key, then wrap that data key once per unlock method (passphrase, passkey). The
envelope is versioned (`ENVELOPE_VERSION`) and `decryptSecret` already rejects
newer formats with a clear message, so a v2 can land without breaking existing
backups. Native passkeys would also need `react-native-passkeys`,
`associatedDomains` on iOS, Digital Asset Links on Android, and a custom dev
build — none of which exist yet.

---

## Storage model

Two stores with different security postures.

### 1. Metadata — not secret

`accountId`, `publicKey`, `network`, `authMethod`, `hasCloudBackup`.

- Key: `sheda.wallet.meta.v1.<userEmail>`
- Native: `AsyncStorage`. Web: `localStorage`.
- **Never behind biometrics.** An `accountId` is a public string that appears on
  the block explorer; gating it behind Face ID bought no security and cost the
  entire startup path.

### 2. Secrets — encrypted at rest

| Key | Contents |
| --- | --- |
| `seed_phrase_<accountId>` | BIP-39 phrase |
| `private_key_<accountId>` | ed25519 key |
| `tx_pin_<accountId>` | `{hash, salt}` PIN record |
| `private_key_current_account_<email>` | account pointer |

- **Native:** `react-native-keychain`, hardware-backed,
  `BIOMETRY_ANY_OR_DEVICE_PASSCODE`.
- **Web:** IndexedDB, AES-GCM under a **non-extractable** `CryptoKey`. Script on
  the origin can ask that key to decrypt but cannot read its bytes out to
  exfiltrate them. This replaces the previous behaviour, which wrote seed
  phrases to `localStorage` in the clear.
- **Expo Go:** falls back to plain `AsyncStorage` because the Keychain native
  module is unavailable. **Expo Go is a development configuration only** — do
  not treat a wallet created there as protected.

---

## Encrypted cloud backup

### What crosses the network

Only this envelope. The seed phrase does not, and neither does the passphrase.

```jsonc
{
  "v": 1,
  "alg": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iters": 210000,
  "salt":  "<base64, 16 bytes, per backup>",
  "nonce": "<base64, 12 bytes, per backup>",
  "ct":    "<base64 ciphertext + GCM tag>",
  "createdAt": 1755500000000
}
```

The header fields are bound into GCM as **additional authenticated data**.
Without that, an attacker with write access to the backup store could rewrite
`iters` down to `1` and hand the blob back; the tag would still verify while the
KDF cost collapsed. Binding them makes any header edit a decrypt failure.

### Key derivation — user passphrase, with device unlock

The KEK is `PBKDF2-SHA256(passphrase, random salt, 210k) → 256-bit AES-GCM key`.

This is **zero-knowledge**: compromising the user's Google account, the Firebase
project, or Sheda's infrastructure does not yield the seed. Only the passphrase
does.

The trade is stated plainly in the UI at opt-in: **a forgotten passphrase means
an unrecoverable backup.** There is no reset link, because a reset would mean
Sheda could decrypt it.

On native, the derived key is additionally cached behind the platform secure
enclave so a returning user on a known device is not retyping it. Restoring on a
**new** device always requires the passphrase.

210k iterations is the OWASP floor for this construction. OWASP's headline
figure is 600k, but that assumes native crypto; this runs in pure JS so it can
work identically on Hermes and web. A 20-second backup button is a feature
nobody uses, which is its own security outcome. The count is stored *in* the
envelope, so raising it later does not break existing backups.

### Why pure-JS crypto rather than WebCrypto

`crypto.subtle` exists in browsers but not in Hermes. Branching would mean two
cipher stacks and a real chance that a blob written on Android fails to open on
web. `@noble/ciphers` and `@noble/hashes` are audited, dependency-free, and
byte-identical on both.

Note the deliberate asymmetry: **portable** pure-JS crypto for cross-device
backup blobs, **platform-best** crypto (`crypto.subtle`, non-extractable keys)
for web at-rest storage that never leaves the browser.

---

## Cloud backup setup

### Why Firebase Auth + Firestore rather than Google Drive appDataFolder

| | Firebase Auth + Firestore | Drive appDataFolder |
| --- | --- | --- |
| OAuth scopes | Reuses the existing `openid profile email` | Needs `drive.appdata` — extra consent screen and Google verification for production |
| Access control | Security rules, ~6 lines, enforced server-side | Implicit via the user's own Drive |
| Storage liability | Sheda hosts ciphertext | Sheda hosts nothing |
| Token handling | Firebase refresh flow, one endpoint | Hand-rolled refresh on two platforms |
| Effort to ship | Low | Medium-high |

**Chosen: Firebase.** The deciding factor is that the app already has a Google
Web OAuth client wired up for backend login, so backup adds no new consent
screen and no verification review. The storage-liability advantage of Drive is
much weaker than it looks here, because what Sheda would be holding is
ciphertext it cannot decrypt.

### Steps

1. Create a Firebase project.
2. **Authentication → Sign-in method → Google**: enable it, and under *Web SDK
   configuration* paste the same OAuth client ID as
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. **Firestore Database**: create in production mode.
4. Copy the web app config into `.env` (see below).
5. **Deploy these rules before enabling backup in production:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // A user can read and write only their own backups. `uid` in the path must
    // equal the caller's authenticated UID — this is the only thing standing
    // between one user's encrypted wallet and another's.
    match /walletBackups/{uid}/items/{document} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Deny everything else by default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Documents are keyed by `accountId`, so re-backing-up the same wallet overwrites
in place rather than accumulating copies of the same seed.

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEAR_TESTNET_FUNDING_PRIVATE_KEY` | — | Funds new testnet accounts. **Becomes public in a web build — see below.** |
| `NEAR_MAINNET_FUNDING_PRIVATE_KEY` | — | Mainnet equivalent. **Must not be set for a web deploy.** |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | — | Google OAuth web client. Public. |
| `EXPO_PUBLIC_FEATURE_FAST_AUTH` | `false` | Re-enables FastAuth. See below. |
| `EXPO_PUBLIC_FEATURE_CLOUD_BACKUP` | `true` | Shows/hides backup UI. |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | — | Firebase project identifier. Public. |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | — | Public. |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | — | Public. |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | — | Public. |

### ⚠️ The funding key is NOT secret in a web build

`.env.example` describes the funding keys as "not directly exposed" because they
lack the `EXPO_PUBLIC_` prefix. **That is true of `process.env` and false of the
shipped app.** `app.config.ts` copies both keys into Expo's `extra`, and
`services/nearWallet.ts` reads them back via `Constants.expoConfig.extra`. Expo
serialises `extra` into the JS bundle, so on a web deploy the value is readable
with view-source. Verified on the live bundle:

```
"nearTestnetFundingPrivateKey":"","nearMainnetFundingPrivateKey":""
```

Empty above only because CI was not passing them. Populate the testnet one and
its value sits at a public URL.

**Testnet:** wired up in `.github/workflows/eas-web-deploy.yml` anyway. Without
it "Create new wallet" cannot fund an account and fails outright, and testnet
NEAR is disposable — the worst case is `sheda.testnet` being drained and
refilled from a faucet. Treat that keypair as compromised by design: fund it
only with what a demo needs, never reuse it, rotate it if it ever matters.

**Mainnet:** deliberately not wired, and it must stay that way. The same
mechanism would publish a key controlling real funds. Mainnet account creation
has to move behind a backend endpoint that signs server-side first. The backend
today exposes `/api/v1/users/wallets/register`, which registers an *existing*
wallet — nothing that creates or funds one. That endpoint is the prerequisite
for a mainnet launch.

The Firebase values are public **by design**: a Firebase web API key is a
project identifier, not a credential. It authorises nothing on its own — all
access control is in the security rules above. Never commit real values; use
`.env` locally and EAS Secrets for builds.

> `EXPO_PUBLIC_*` variables are inlined into the bundle at build time. Changing
> one requires a bundler restart with a cache clear (`npx expo start -c`); a
> plain reload will not pick it up.

---

## FastAuth has been removed

FastAuth (the Auth0/MPC-backed NEAR sign-in) was gated off by default and then
deleted entirely on 2026-09-09, with owner approval.

Removed: `config/fastAuth.ts`, `contexts/FastAuthClientProvider.tsx`,
`services/nearWalletFastAuth.ts`, `services/nearContractFastAuth.ts`, the
`FEATURE_FAST_AUTH` flag, `signInWithFastAuth()`, every
`authMethod === "fastauth"` branch, and the dependencies
`@fast-auth-near/react-sdk`, `@fast-auth-near/react-native-provider` and
`react-native-auth0`.

**Why it went rather than stayed dormant.** It could never complete a write:
`FASTAUTH_RELAYER_URL` was a placeholder because no public testnet relayer
exists, so account creation and signing failed by construction. Dormant code
is not free — those three packages were ~3.4 MB of dependencies that shipped in
every bundle and were parsed on every load, which on a mobile browser is
exactly what makes an app feel unresponsive.

`useNearContract`'s `callMutating` no longer branches on auth method; there is
one signing path. Restoring FastAuth would mean reverting this commit and
finding a working relayer first.

---

## Legacy storage migration

Runs once per process on first launch, fire-and-forget, from `WalletContext`.

**What it fixes:** web and Expo Go previously wrote seed phrases and private keys
to `AsyncStorage` verbatim. On web that is `localStorage` — readable by any
script on the origin and visible in devtools at a glance. Existing installs
still have those values sitting there.

**Safety properties:**

- **Copy → verify → delete.** The plaintext is removed only after the value is
  written to the encrypted store *and read back identical*. A failed migration
  loses nothing and retries next launch.
- **Idempotent**, and memoised per process.
- **No secret is logged.** The report carries key *names* only.
- Native Keychain installs are already encrypted and are left untouched.

`clearAllData()` was also fixed: it previously called `AsyncStorage.clear()`,
wiping the entire app — cached listings, notifications, session — for a method
that promises only to clear wallet secrets. It is now scoped to this service's
own keys.

Covered by `__tests__/wallet-storage-migration.test.ts`.

---

## API reference

### `useWallet()` — initialization

```ts
readiness: "idle" | "metadata" | "ready" | "error";
hasLocalWallet: boolean;
localWalletMetadata: WalletMetadata | null;
loading: boolean;   // spinner hint ONLY — never `disabled`
```

### `useWallet()` — backup

```ts
isCloudBackupAvailable: boolean;
connectBackupAccount(googleIdToken: string): Promise<void>;
backupWallet(accountId: string, passphrase: string): Promise<void>;
listCloudBackups(): Promise<BackupRecord[]>;
restoreFromCloud(accountId, passphrase, userEmail?): Promise<WalletAccount>;
hasCloudBackup: boolean;
```

The passphrase is consumed to derive a key and then dropped. It is never stored,
never held in context state, and never passed to `cloudBackup.ts`.

### `nearWalletService` — generic helpers

```ts
getAccount(accountId): Promise<Account>;
signAndSendTransaction(accountId, receiverId, actions): Promise<string>;
viewFunction<T>(contractId, methodName, args?): Promise<T>;
```

Use these instead of assembling a signer inline. Before they existed, every
screen that needed to sign rebuilt the same
`fetch key → KeyPair.fromString → new KeyPairSigner → new Account` sequence, and
they drifted: some read the in-memory keystore, others secure storage, and only
some ran inside `withRetry`. A wallet with several signing paths fails in several
different ways.

`viewFunction` deliberately builds no signer — a view call that demanded one
would drag a biometric prompt into rendering a balance.

---

## Testing and QA

```bash
npm run test:ci      # jest --watchAll=false
```

`npm run test` is `jest --watchAll` and never exits; use `test:ci` in CI and for
one-shot runs.

### Suites

| Suite | Covers |
| --- | --- |
| `wallet-crypto.test.ts` | Envelope format, nonce uniqueness, tamper/downgrade rejection, passphrase strength |
| `cloud-backup.test.ts` | Backup/list/restore round trip; asserts no plaintext on the wire |
| `wallet-nonblocking-init.test.tsx` | Phase A settles without Phase B; FastAuth dormancy |
| `wallet-storage-migration.test.ts` | Plaintext migration, no-secret logging, `clearAllData` scoping |
| `wallet-create-import.test.tsx` | `createWallet()`, `importWallet()`, metadata round trip |

### Manual QA checklist

**Cold start (criterion 1)**

1. Throttle the network to Slow 3G.
2. Launch the app.
3. Create Wallet / Import must be tappable within 1s.
4. With a stored wallet, the "Wallet found on this device" banner appears
   immediately; the balance fills in when Phase B lands.

**Backup and restore (criterion 2)**

1. Device A: create a wallet, tap Back up, sign in with Google, set a passphrase.
2. Device B (or a second browser profile): sign in with the same Google account,
   choose Restore from Google backup, enter the passphrase.
3. The restored wallet must show its balance and be able to sign a transfer.
4. Open devtools → Network on the web run and confirm no request body contains
   a seed word.

**FastAuth (criterion 3)**

1. With the default build, open devtools → Network.
2. Complete onboarding. There must be zero requests to `auth0.com` or any
   FastAuth relayer.

**Log hygiene**

Grep the console output for a known seed word — expect no hits.

---

## Rollback

The changes are additive and non-destructive by design:

- Legacy plaintext keys are **copied then verified** before deletion.
- Existing `seed_phrase_*` / `private_key_*` key names are unchanged.
- The metadata record is new and additive; deleting it costs a slow first paint,
  not a lost wallet.

**To roll back:** revert the PR. The previous code reads the same secure-storage
keys it always did and ignores the metadata record.

**One caveat, stated plainly:** on **web**, secrets migrated into IndexedDB are
not visible to the reverted code, which reads `localStorage`. Affected users
would need to re-import from their seed phrase or cloud backup. Native installs
are unaffected — the Keychain keys never moved. If a web rollback is likely,
revert *before* users launch the new build, or restore the plaintext copies from
IndexedDB first.
