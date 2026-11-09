//! The vault as a landlord, against the real marketplace.
//!
//! The marketplace is supposed to need no knowledge that a flat has many
//! owners: the vault is an account, the NFT sits in it, and the vault makes
//! the same calls a person would. This test is the proof of that claim. It
//! deploys the actual marketplace, a real NEP-141 token and the actual vault,
//! then drives a whole tenancy through them:
//!
//!   mint -> hand the unit to the vault -> list -> bid -> accept -> sync -> claim
//!
//! The unit tests in `vault/src/tests.rs` prove the arithmetic. What they
//! cannot prove is that the arithmetic is ever reached: every call here
//! crosses a contract boundary, and a working unit test says nothing about
//! whether the marketplace accepts the vault as an owner or whether the vault
//! can pay a holder without running out of gas.
//!
//! The failure paths matter as much as the happy one. The marketplace pays a
//! landlord with plain `ft_transfer`, which can fail after the bid has already
//! been locked and the ledger debited; the vault pays holders the same way.
//! Both sides restore state in a callback. Those callbacks only run on a real
//! node, so this is the first place they are executed at all.

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};
use tokio::sync::OnceCell;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// `mint_property` charges the minter for the new NFT's storage.
const MINT_DEPOSIT: NearToken = NearToken::from_millinear(100);
const TOTAL_SUPPLY: u128 = 1_000_000_000_000;
/// 300 USDT at the six decimals the real stablecoins use.
const RENT: u128 = 300_000_000;
const TOTAL_SHARES: u128 = 10_000;
const HOLDER_A_SHARES: u128 = 6_000;
const HOLDER_B_SHARES: u128 = 4_000;

// Building the wasm binaries per test would make this file the slowest thing
// in CI. They are built once and shared by every test in the binary.
static MARKET_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();
static FT_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();
static VAULT_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();

async fn compiled(
    cell: &'static OnceCell<Vec<u8>>,
    project: &'static str,
) -> TestResult<&'static Vec<u8>> {
    if let Some(wasm) = cell.get() {
        return Ok(wasm);
    }
    let wasm = near_workspaces::compile_project(project).await?;
    // Two tests may race here. Both builds produce the same bytes, so whichever
    // wins is fine.
    let _ = cell.set(wasm);
    Ok(cell.get().expect("wasm was just set"))
}

/// Build the vault with `--no-abi` rather than through `compile_project`.
///
/// `compile_project` runs cargo-near with ABI generation on, which requires
/// every public type to implement `JsonSchema`/`BorshSchema`. The vault does
/// not carry those derives because its normal build does not run the ABI
/// step, so `compile_project` fails before producing any wasm.
///
/// `--no-abi` skips only that step. The build still goes through cargo-near's
/// `wasm-opt -O` post-pass, which is required for wasm built by Rust 1.82 and
/// newer to be deployable at all: without it nearcore rejects the module at
/// deploy time with `PrepareError(Deserialization)`.
async fn vault_wasm() -> TestResult<&'static Vec<u8>> {
    if let Some(wasm) = VAULT_WASM.get() {
        return Ok(wasm);
    }

    let artifact = tokio::task::spawn_blocking(|| {
        let status = std::process::Command::new("cargo")
            .args([
                "near",
                "build",
                "non-reproducible-wasm",
                "--no-abi",
                "--manifest-path",
                "vault/Cargo.toml",
            ])
            .current_dir("../")
            .status()?;
        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "building the vault wasm failed",
            ));
        }
        Ok::<_, std::io::Error>(std::path::PathBuf::from(
            "../target/near/sheda_collection_vault/sheda_collection_vault.wasm",
        ))
    })
    .await??;

    let wasm = tokio::fs::read(artifact).await?;
    let _ = VAULT_WASM.set(wasm);
    Ok(VAULT_WASM.get().expect("vault wasm was just set"))
}

struct Fixture {
    market: Contract,
    ft: Contract,
    vault: Contract,
    seller: Account,
    tenant: Account,
    holder_a: Account,
    holder_b: Account,
    property_id: u64,
}

async fn subaccount(root: &Account, name: &str) -> TestResult<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?)
}

async fn register(ft: &Contract, account: &AccountId) -> TestResult {
    ft.call("storage_deposit")
        .args_json(json!({ "account_id": account }))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn ft_balance(ft: &Contract, account: &AccountId) -> TestResult<u128> {
    let raw: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account }))
        .await?
        .json()?;
    Ok(raw.parse()?)
}

async fn property_view(market: &Contract, property_id: u64) -> TestResult<Value> {
    Ok(market
        .view("get_property_by_id")
        .args_json(json!({ "property_id": property_id }))
        .await?
        .json::<Option<Value>>()?
        .expect("property not found"))
}

async fn bid_view(market: &Contract, property_id: u64, bid_id: u64) -> TestResult<Value> {
    let bids: Vec<Value> = market
        .view("get_bids_for_property")
        .args_json(json!({ "property_id": property_id }))
        .await?
        .json()?;
    Ok(bids
        .into_iter()
        .find(|bid| bid["id"].as_u64() == Some(bid_id))
        .expect("bid not found"))
}

async fn claimable(vault: &Contract, account: &AccountId) -> TestResult<u128> {
    let raw: String = vault
        .view("claimable")
        .args_json(json!({ "account_id": account }))
        .await?
        .json()?;
    Ok(raw.parse()?)
}

/// What the marketplace's own books say it is holding for this token.
async fn market_ledger(fx: &Fixture) -> TestResult<u128> {
    let raw: String = fx
        .market
        .view("get_stablecoin_balance")
        .args_json(json!({ "token_account": fx.ft.id() }))
        .await?
        .json()?;
    Ok(raw.parse()?)
}

fn assert_no_failed_receipts(outcome: &ExecutionFinalResult, what: &str) {
    let failures = outcome.receipt_failures();
    assert!(failures.is_empty(), "{} failed: {:#?}", what, failures);
}

/// Build the world: a funded token, a real marketplace, one rental unit, and
/// a vault that holds every share of it.
///
/// `vault_registered` and `holders_registered` exist for the failure tests.
/// Registration on a NEP-141 token is what makes a transfer succeed, so
/// leaving one out is how a payout is made to fail without mocking anything.
async fn setup(
    worker: &Worker<Sandbox>,
    vault_registered: bool,
    holders_registered: bool,
) -> TestResult<Fixture> {
    let root = worker.root_account()?;

    let ft_owner = subaccount(&root, "ftowner").await?;
    let ft = worker
        .dev_deploy(compiled(&FT_WASM, "./tests/fixtures/ft").await?)
        .await?;
    ft.call("new")
        .args_json(json!({
            "owner_id": ft_owner.id(),
            "total_supply": TOTAL_SUPPLY.to_string(),
        }))
        .transact()
        .await?
        .into_result()?;

    let market = worker
        .dev_deploy(compiled(&MARKET_WASM, "./").await?)
        .await?;
    market
        .call("new")
        .args_json(json!({
            "media_url": "https://example.com/sheda-icon.png",
            "supported_stablecoins": [ft.id()],
        }))
        .transact()
        .await?
        .into_result()?;

    let seller = subaccount(&root, "seller").await?;
    let tenant = subaccount(&root, "tenant").await?;
    let holder_a = subaccount(&root, "holdera").await?;
    let holder_b = subaccount(&root, "holderb").await?;

    // The unit exists first; the vault is created for its id. That order is
    // the real one: a raise creates the vault once the unit has been minted.
    let property_id: u64 = seller
        .call(market.id(), "mint_property")
        .args_json(json!({
            "title": "M120 Apartments Unit 1B",
            "description": "A one-bedroom held through a vault",
            "media_uri": "https://example.com/unit-1b.png",
            "price": RENT.to_string(),
            "is_for_sale": false,
            "lease_duration_days": 30u64,
            "damage_deposit_required": null,
        }))
        .deposit(MINT_DEPOSIT)
        .max_gas()
        .transact()
        .await?
        .json()?;

    let vault = worker.dev_deploy(vault_wasm().await?).await?;
    vault
        .call("new")
        .args_json(json!({
            "name": "M120 Apartments Unit 1B",
            "symbol": "M120-1B",
            "marketplace": market.id(),
            "property_id": property_id.to_string(),
            "stablecoin": ft.id(),
            "manager": seller.id(),
            "governor": seller.id(),
            "treasury": seller.id(),
            "manager_bps": 0,
            "reserve_bps": 0,
            "platform_bps": 0,
        }))
        .transact()
        .await?
        .into_result()?;

    // The marketplace holds escrow itself, so it needs a registered balance
    // just like a person does.
    let mut to_register: Vec<&AccountId> = vec![seller.id(), tenant.id(), market.id()];
    if holders_registered {
        to_register.push(holder_a.id());
        to_register.push(holder_b.id());
    }
    if vault_registered {
        to_register.push(vault.id());
    }
    for account in to_register {
        register(&ft, account).await?;
    }

    ft_owner
        .call(ft.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": tenant.id(),
            "amount": (RENT * 2).to_string(),
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    for (who, amount) in [(&holder_a, HOLDER_A_SHARES), (&holder_b, HOLDER_B_SHARES)] {
        seller
            .call(vault.id(), "mint_shares")
            .args_json(json!({ "to": who.id(), "amount": amount.to_string() }))
            .deposit(ONE_YOCTO)
            .transact()
            .await?
            .into_result()?;
    }
    seller
        .call(vault.id(), "freeze_supply")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // Hand the unit to the vault the only way the marketplace offers: NEP-171
    // `nft_transfer_call`. The vault's `nft_on_transfer` records custody and
    // returns false, which is how it says it is keeping the token.
    let handed_over = seller
        .call(market.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": vault.id(),
            "token_id": property_id.to_string(),
            "approval_id": null,
            "memo": null,
            "msg": "",
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&handed_over, "nft_transfer_call to the vault");

    let info: Value = vault.view("get_info").await?.json()?;
    assert_eq!(
        info["custody"]["Held"]["token_id"],
        json!(property_id.to_string()),
        "the vault should have taken custody of unit {}",
        property_id
    );

    // The vault is now the landlord and asks the marketplace to list the unit
    // on its terms. The marketplace should see nothing unusual: the predecessor
    // is simply another account that owns the property.
    let listed = seller
        .call(vault.id(), "list_for_rent")
        .args_json(json!({
            "price": RENT.to_string(),
            "lease_duration_days": 30u32,
            "damage_deposit": null,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&listed, "list_for_rent through the vault");

    let property = property_view(&market, property_id).await?;
    assert_eq!(
        property["price"],
        json!(RENT.to_string()),
        "the vault's rent should be the marketplace's price"
    );
    assert_eq!(property["lease_duration_days"], json!(30));

    Ok(Fixture {
        market,
        ft,
        vault,
        seller,
        tenant,
        holder_a,
        holder_b,
        property_id,
    })
}

/// A tenant pays one month's rent into the marketplace's escrow.
async fn place_lease_bid(fx: &Fixture) -> TestResult<u64> {
    let before: u64 = fx.market.view("get_bid_counter").await?.json()?;

    fx.tenant
        .call(fx.ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": fx.market.id(),
            "amount": RENT.to_string(),
            "msg": json!({
                "property_id": fx.property_id,
                "action": "Lease",
                "stablecoin_token": fx.ft.id(),
            })
            .to_string(),
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let after: u64 = fx.market.view("get_bid_counter").await?.json()?;
    assert_eq!(
        after,
        before + 1,
        "ft_transfer_call refunded the bid instead of recording it"
    );
    Ok(before)
}

async fn claim(fx: &Fixture, who: &Account) -> TestResult {
    let outcome = who
        .call(fx.vault.id(), "claim")
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&outcome, "claim");
    Ok(())
}

/// The whole point: the marketplace pays the vault like any landlord, and the
/// vault divides that rent among the people who own it.
#[tokio::test]
async fn test_vault_leases_the_unit_and_splits_the_rent() -> TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = setup(&worker, true, true).await?;

    let bid_id = place_lease_bid(&fx).await?;

    // The manager instructs the vault; the vault accepts under its own name.
    // This is the call that used to be impossible with 80 Tgas attached: the
    // marketplace schedules 30 Tgas for the rent transfer and 50 for its
    // callback, leaving nothing for the accept itself.
    let accepted = fx
        .seller
        .call(fx.vault.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id.to_string() }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&accepted, "accept_bid through the vault");

    assert_eq!(
        ft_balance(&fx.ft, fx.vault.id()).await?,
        RENT,
        "the rent should land in the vault, not the seller"
    );
    assert_eq!(
        ft_balance(&fx.ft, fx.seller.id()).await?,
        0,
        "with no fees configured the manager is owed nothing"
    );
    assert_eq!(
        market_ledger(&fx).await?,
        0,
        "the marketplace should have paid the whole bid out"
    );

    let property = property_view(&fx.market, fx.property_id).await?;
    assert_eq!(
        property["active_lease"]["tenant_id"],
        json!(fx.tenant.id().to_string())
    );
    assert!(
        property["active_lease"]["active"]
            .as_bool()
            .unwrap_or(false),
        "the marketplace should consider the unit let"
    );
    assert_eq!(
        bid_view(&fx.market, fx.property_id, bid_id).await?["status"],
        json!("Completed")
    );

    // The marketplace pays with plain `ft_transfer`, which notifies nobody.
    // A holder (not the manager) has to go and look.
    let synced = fx
        .holder_a
        .call(fx.vault.id(), "sync_income")
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&synced, "sync_income");

    let info: Value = fx.vault.view("get_info").await?.json()?;
    assert_eq!(info["last_accounted"], json!(RENT.to_string()));

    let a_share = RENT * HOLDER_A_SHARES / TOTAL_SHARES;
    let b_share = RENT * HOLDER_B_SHARES / TOTAL_SHARES;
    assert_eq!(claimable(&fx.vault, fx.holder_a.id()).await?, a_share);
    assert_eq!(claimable(&fx.vault, fx.holder_b.id()).await?, b_share);

    claim(&fx, &fx.holder_a).await?;
    assert_eq!(ft_balance(&fx.ft, fx.holder_a.id()).await?, a_share);
    assert_eq!(claimable(&fx.vault, fx.holder_a.id()).await?, 0);
    assert_eq!(ft_balance(&fx.ft, fx.vault.id()).await?, RENT - a_share);

    claim(&fx, &fx.holder_b).await?;
    assert_eq!(ft_balance(&fx.ft, fx.holder_b.id()).await?, b_share);
    assert_eq!(ft_balance(&fx.ft, fx.vault.id()).await?, 0);
    assert_eq!(claimable(&fx.vault, fx.holder_b.id()).await?, 0);

    Ok(())
}

/// A rent transfer that fails must not eat the bid.
///
/// The marketplace marks the bid accepted and debits its ledger before asking
/// the token to pay. When the token refuses (here, because the vault was never
/// registered), the callback has to put both back. Without it the tenant's
/// money sits in the contract against a bid nobody can retry, reject or
/// cancel.
#[tokio::test]
async fn test_failed_rent_payment_returns_the_bid_to_pending() -> TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = setup(&worker, false, true).await?;
    let tenant_before = ft_balance(&fx.ft, fx.tenant.id()).await?;
    let bid_id = place_lease_bid(&fx).await?;

    let accepted = fx
        .seller
        .call(fx.vault.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id.to_string() }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert!(
        !accepted.receipt_failures().is_empty(),
        "paying an unregistered vault should have failed a receipt"
    );

    assert_eq!(
        bid_view(&fx.market, fx.property_id, bid_id).await?["status"],
        json!("Pending"),
        "a failed payment must put the bid back in play"
    );
    assert!(
        property_view(&fx.market, fx.property_id).await?["active_lease"].is_null(),
        "no lease should exist when the rent was never paid"
    );
    assert_eq!(
        market_ledger(&fx).await?,
        RENT,
        "the marketplace's ledger must be restored"
    );
    assert_eq!(ft_balance(&fx.ft, fx.market.id()).await?, RENT);
    assert_eq!(ft_balance(&fx.ft, fx.vault.id()).await?, 0);
    assert_eq!(
        ft_balance(&fx.ft, fx.tenant.id()).await?,
        tenant_before - RENT,
        "the rent stays in escrow, ready to be paid on a retry"
    );

    let nft: Value = fx
        .market
        .view("nft_token")
        .args_json(json!({ "token_id": fx.property_id.to_string() }))
        .await?
        .json()?;
    assert_eq!(
        nft["owner_id"],
        json!(fx.vault.id().to_string()),
        "the unit must not move when the rent cannot be paid"
    );

    Ok(())
}

/// A failed payout must put the entitlement back.
///
/// `claim` erases the holder's settled balance and decrements the accounted
/// figure before the transfer happens. If the token then refuses to pay, the
/// money is still in the vault but the holder's claim on it is gone. The
/// callback is the only thing that stands between a failed transfer and a
/// silent loss.
#[tokio::test]
async fn test_failed_claim_restores_the_holder_entitlement() -> TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = setup(&worker, true, false).await?;

    let bid_id = place_lease_bid(&fx).await?;
    let accepted = fx
        .seller
        .call(fx.vault.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id.to_string() }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&accepted, "accept_bid through the vault");

    let synced = fx
        .holder_a
        .call(fx.vault.id(), "sync_income")
        .max_gas()
        .transact()
        .await?;
    assert_no_failed_receipts(&synced, "sync_income");

    let a_share = RENT * HOLDER_A_SHARES / TOTAL_SHARES;
    let b_share = RENT * HOLDER_B_SHARES / TOTAL_SHARES;
    assert_eq!(claimable(&fx.vault, fx.holder_a.id()).await?, a_share);

    let claimed = fx
        .holder_a
        .call(fx.vault.id(), "claim")
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert!(
        !claimed.receipt_failures().is_empty(),
        "paying an unregistered holder should have failed a receipt"
    );

    assert_eq!(
        claimable(&fx.vault, fx.holder_a.id()).await?,
        a_share,
        "a failed payout must restore what it was paying"
    );
    assert_eq!(
        ft_balance(&fx.ft, fx.vault.id()).await?,
        RENT,
        "no tokens should have left the vault"
    );
    assert_eq!(ft_balance(&fx.ft, fx.holder_a.id()).await?, 0);

    let info: Value = fx.vault.view("get_info").await?.json()?;
    assert_eq!(
        info["last_accounted"],
        json!(RENT.to_string()),
        "the restored entitlement must still be accounted for"
    );
    assert_eq!(
        claimable(&fx.vault, fx.holder_b.id()).await?,
        b_share,
        "one holder's failed claim must not touch another's"
    );

    Ok(())
}
