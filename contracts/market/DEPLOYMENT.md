# Deploying the marketplace contract

Nothing is deployed from a laptop. The workflows at the repository root own
every deploy, so the binary on chain is one CI built from a commit and anyone
can rebuild it.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/market-test.yml` | called by the deploy jobs | fmt, clippy, sandbox tests, wasm build |
| `.github/workflows/deploy-market-production.yml` | push to `main` touching `contracts/market/**` (or manual) | deploys to production |
| `.github/workflows/deploy-market-staging.yml` | pull request touching the same paths | deploys to a per-PR subaccount |
| `.github/workflows/undeploy-market-staging.yml` | pull request closed | deletes the per-PR subaccount |

Pushes that do not touch the contract paths (mobile, backend, docs) do not
redeploy a live contract.

## Required repository variables and secrets

Set these under **Settings → Secrets and variables → Actions**.

| Name | Kind | Example |
| --- | --- | --- |
| `NEAR_CONTRACT_PRODUCTION_NETWORK` | variable | `testnet` |
| `NEAR_CONTRACT_PRODUCTION_ACCOUNT_ID` | variable | `market.shedauser.testnet` |
| `NEAR_CONTRACT_PRODUCTION_ACCOUNT_PRIVATE_KEY` | secret | `<account>:<ed25519 key>` |
| `NEAR_CONTRACT_STAGING_NETWORK` | variable | `testnet` |
| `NEAR_CONTRACT_STAGING_ACCOUNT_ID` | variable | `shedauser.testnet` (the parent that creates `gh-<PR>.` accounts) |
| `NEAR_CONTRACT_STAGING_ACCOUNT_PUBLIC_KEY` | variable | public key of the staging account |
| `NEAR_CONTRACT_STAGING_ACCOUNT_PRIVATE_KEY` | secret | private key for that public key |
| `NEAR_CONTRACT_MEDIA_URL` | variable | base URL passed to `new()` |
| `NEAR_CONTRACT_SUPPORTED_STABLECOINS` | variable | JSON array passed to `new()` |

## First deploy

An account with no contract needs `new()`, not code. Run the production
workflow manually (`Actions → Deploy market to production → Run workflow`) on
the target ref with `initialize=true`. Deploying code alone to a fresh account
"works" and leaves every method panicking, because the state does not exist and
the contract is `PanicOnDefault`.

`new()` asserts the account has no state, so it cannot wipe a live contract by
accident. The workflow also refuses to run it on an account that already
answers `get_version`.

## Routine deploys

A push to `main` that only changes code deploys with `without-init-call`. That
is safe only while the serialized state layout is unchanged.

**Borsh is positional.** Adding, removing or reordering a field in
`ShedaContract` changes the layout, and code deployed over the old state will
fail to deserialize — every method panics. When that happens, add a migration
and run the workflow manually with `run_migration=true`; it deploys with
`with-init-call migrate`.

The workflow does not leave that to memory. Before deploying it compares the
live contract's `get_version` with the version this commit builds and refuses a
code-only deploy when they differ. Both `version:` literals in
`src/lib.rs` (in `new()` and `migrate()`) must agree, or the comparison is
ambiguous and the job fails.

After every deploy it calls `get_version` again. That is a plain view over the
state struct, so it only answers when the stored state and the new code agree.

## Staging

Every pull request gets `gh-<number>.<staging account>`. The account is
recreated on each push rather than reused, because the deploy runs `new()` and
a second push would hit "already initialized". Recreating makes the preview an
honest reflection of the PR and returns the balance to the parent on the way
through. The undeploy workflow deletes it when the PR closes and treats a
missing account as success.

## Reproducible build

The marketplace crate is a member of the `contracts` cargo workspace, so every
deploy names its manifest explicitly:

```bash
cargo near build reproducible-wasm --manifest-path contracts/market/Cargo.toml
```

The workspace is pinned to Rust 1.86.0 (`contracts/rust-toolchain.toml`)
because NEAR's VM rejects wasm built by 1.87 and newer, and `Cargo.lock` is
committed so CI resolves the same `near-sdk` (5.24.1) every time.

The deploy jobs pass `--skip-git-remote-check`. This repository is private, and
the check otherwise insists on cloning the commit from a public remote so
SourceScan can verify the wasm; it fails when it cannot. The build is still the
pinned-docker reproducible build.

To build locally, run from the repository root (not from `contracts/market`)
so the workspace root and its lockfile are what the build sees.
