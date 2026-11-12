//! Handing the marketplace to the signing council.
//!
//! After `set_owner`, the council (a multisig on chain) is the only owner and
//! admin: the old single key can no longer resolve disputes, withdraw or
//! appoint admins, and only the owner can appoint admins at all.

use near_workspaces::types::NearToken;
use serde_json::json;

#[tokio::test]
async fn ownership_and_the_admin_role_move_to_the_council_together(
) -> Result<(), Box<dyn std::error::Error>> {
    let wasm = near_workspaces::compile_project("./").await?;
    let sandbox = near_workspaces::sandbox().await?;
    let contract = sandbox.dev_deploy(&wasm).await?;
    let council = sandbox.dev_create_account().await?;
    let stranger = sandbox.dev_create_account().await?;

    contract
        .call("new")
        .args_json(json!({ "media_url": "https://example.com/i.png", "supported_stablecoins": [] }))
        .transact()
        .await?
        .into_result()?;

    // Needs exactly one yocto.
    let no_deposit = contract
        .call("set_owner")
        .args_json(json!({ "new_owner": council.id() }))
        .transact()
        .await?;
    assert!(
        no_deposit.is_failure(),
        "set_owner must require 1 yoctoNEAR"
    );

    // Only the owner may hand it over.
    let by_stranger = stranger
        .call(contract.id(), "set_owner")
        .args_json(json!({ "new_owner": stranger.id() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(
        by_stranger.is_failure(),
        "a stranger must not take ownership"
    );

    contract
        .call("set_owner")
        .args_json(json!({ "new_owner": council.id() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    let owner: String = contract
        .view("get_owner_id")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(owner, council.id().to_string());

    let council_admin: bool = contract
        .view("is_admin")
        .args_json(json!({ "account_id": council.id() }))
        .await?
        .json()?;
    assert!(council_admin, "the council becomes an admin");

    let old_admin: bool = contract
        .view("is_admin")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert!(!old_admin, "the old single key stops being an admin");

    // The old key can no longer appoint admins; the council can.
    let old_adds = contract
        .call("add_admin")
        .args_json(json!({ "new_admin_id": stranger.id() }))
        .transact()
        .await?;
    assert!(
        old_adds.is_failure(),
        "the old owner must not appoint admins"
    );

    council
        .call(contract.id(), "add_admin")
        .args_json(json!({ "new_admin_id": stranger.id() }))
        .transact()
        .await?
        .into_result()?;

    // An admin who is not the owner cannot appoint further admins.
    let admin_adds = stranger
        .call(contract.id(), "add_admin")
        .args_json(json!({ "new_admin_id": stranger.id() }))
        .transact()
        .await?;
    assert!(admin_adds.is_failure(), "only the owner appoints admins");

    Ok(())
}
