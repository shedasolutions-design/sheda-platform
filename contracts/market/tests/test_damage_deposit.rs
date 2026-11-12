mod common;

use near_workspaces::types::NearToken;
use serde_json::json;

// Security deposits
// ---------------------------------------------------------------------------
//
// A tenant pays rent and a deposit in one transfer. The rent is the landlord's
// once they accept; the deposit stays with the contract for the tenancy and is
// the tenant's again afterwards, unless the landlord claims against it inside a
// window that closes on its own.
//
// That window is what makes the arrangement safe in both directions. Before the
// lease ends there is nothing to claim. Once it closes the tenant can take the
// money back whether the landlord cooperates or not. Neither side can strand
// the other's funds by going quiet.
//
// Asserted here: the collection, the split, the accounting and the guards. The
// successful refund unlocks a month of block time after the lease ends, which
// the sandbox cannot fast-forward through, so it is covered by the guard that
// refuses it early rather than by waiting it out.

const DEPOSIT: u128 = 50_000_000; // 50 USDT alongside 250 rent

/// Rent and deposit arrive together and are then kept apart: the landlord is
/// paid the rent, the contract keeps the deposit.
#[tokio::test]
async fn test_deposit_is_collected_and_held_separately() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let property_id = fx.mint_rental_with_deposit(DEPOSIT).await?;
    let landlord_before = fx.ft_balance(fx.seller.id()).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, DEPOSIT).await?;

    let bids = fx
        .contract
        .view("get_bids_for_property")
        .args_json(json!({ "property_id": property_id }))
        .await?
        .json::<Vec<serde_json::Value>>()?;
    let bid = bids
        .iter()
        .find(|b| b["id"].as_u64() == Some(bid_id))
        .expect("bid not found");
    assert_eq!(
        bid["bid_amount"].as_str(),
        Some(common::BID_AMOUNT.to_string().as_str()),
        "the bid should record the rent alone, not rent plus deposit",
    );
    assert_eq!(
        bid["damage_deposit"].as_str(),
        Some(DEPOSIT.to_string().as_str()),
        "the deposit should be recorded separately on the bid",
    );

    fx.seller
        .call(fx.contract.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    assert_eq!(
        fx.ft_balance(fx.seller.id()).await? - landlord_before,
        common::BID_AMOUNT,
        "the landlord should receive the rent and none of the deposit",
    );

    let property = fx.property(property_id).await?;
    let lease = &property["active_lease"];
    assert_eq!(
        lease["escrow_held"].as_str(),
        Some(DEPOSIT.to_string().as_str()),
        "the lease should hold the deposit, and nothing the contract does not have",
    );
    assert!(
        lease["damage_claim_deadline"].as_u64().unwrap() > lease["end_time"].as_u64().unwrap(),
        "the claim window should open when the lease ends, not before",
    );

    Ok(())
}

/// The deposit belongs to the tenancy, not the term. Renewing must not take a
/// second one — only the last would ever be given back.
#[tokio::test]
async fn test_renewal_does_not_charge_a_second_deposit() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let property_id = fx.mint_rental_with_deposit(DEPOSIT).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, DEPOSIT).await?;
    fx.seller
        .call(fx.contract.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // A renewal sends rent only — the deposit already on the lease is the same
    // deposit, and the contract should recognise the sitting tenant.
    let renewal = fx.place_bid_with_deposit(property_id, 0).await?;
    let bids = fx
        .contract
        .view("get_bids_for_property")
        .args_json(json!({ "property_id": property_id }))
        .await?
        .json::<Vec<serde_json::Value>>()?;
    let bid = bids
        .iter()
        .find(|b| b["id"].as_u64() == Some(renewal))
        .expect("renewal bid not found");
    assert_eq!(
        bid["damage_deposit"].as_str(),
        Some("0"),
        "a renewal must not stack a second deposit on the tenant",
    );

    Ok(())
}

/// The guards that give the window its meaning: nothing to claim before the
/// lease ends, nothing to reclaim while the landlord can still act, and nobody
/// but the landlord may claim at all.
#[tokio::test]
async fn test_claim_and_refund_are_gated() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let property_id = fx.mint_rental_with_deposit(DEPOSIT).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, DEPOSIT).await?;
    fx.seller
        .call(fx.contract.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let lease_id = fx.property(property_id).await?["active_lease"]["id"]
        .as_u64()
        .expect("lease id");

    let early = fx
        .seller
        .call(fx.contract.id(), "raise_damage_claim")
        .args_json(json!({
            "lease_id": lease_id,
            "amount": DEPOSIT.to_string(),
            "reason": "scuffed floor",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(
        early.is_failure(),
        "a claim raised during the tenancy must be refused",
    );
    assert!(
        format!("{:?}", early.into_result().unwrap_err()).contains("has not ended"),
        "the refusal should say the lease is still running",
    );

    // The other half of the bargain: the tenant cannot take the deposit back
    // while the landlord still has time to claim.
    let grab = fx
        .buyer
        .call(fx.contract.id(), "refund_damage_deposit")
        .args_json(json!({ "lease_id": lease_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(
        grab.is_failure(),
        "reclaiming before the window closes must be refused",
    );
    assert!(
        format!("{:?}", grab.into_result().unwrap_err()).contains("still open"),
        "the refusal should say the claim window has not closed",
    );

    let stranger = fx
        .buyer
        .call(fx.contract.id(), "raise_damage_claim")
        .args_json(json!({ "lease_id": lease_id, "amount": "1", "reason": "mine now" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(
        stranger.is_failure(),
        "only the property owner may claim against the deposit",
    );

    Ok(())
}

/// A deposit on a sale makes no sense: there is no tenant to collect it from
/// and nobody to hand it back to. Refused outright rather than stored as a
/// figure that is never charged — which is how `damage_escrow` sat at zero
/// through every listing this contract ever had.
#[tokio::test]
async fn test_deposit_rejected_on_a_sale_listing() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let outcome = fx
        .seller
        .call(fx.contract.id(), "mint_property")
        .args_json(json!({
            "title": "Sale with a deposit",
            "description": "Should not be possible",
            "media_uri": "https://example.com/p.png",
            "price": common::BID_AMOUNT.to_string(),
            "is_for_sale": true,
            "lease_duration_days": null,
            "damage_deposit_required": DEPOSIT.to_string(),
        }))
        .deposit(common::mint_deposit())
        .max_gas()
        .transact()
        .await?;

    assert!(
        outcome.is_failure(),
        "a sale listing must not be able to demand a security deposit",
    );

    Ok(())
}

/// A lease runs for exactly the number of days it was listed for.
///
/// The term used to be stored in 30-day months, so anything the client offered
/// below a month was rounded up to one: a seven-day let became a thirty-day
/// let, and a "year" was 360 days. The client lets a seller pick days, months
/// or years, so the contract stores the finest of those and every choice is
/// exact.
#[tokio::test]
async fn test_lease_runs_for_exactly_the_days_listed() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    // Seven days — a term the month-based field could not express at all.
    let property_id = fx.mint_rental_for_days(7).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, 0).await?;
    fx.seller
        .call(fx.contract.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let property = fx.property(property_id).await?;
    assert_eq!(
        property["lease_duration_days"].as_u64(),
        Some(7),
        "the listing should report the term it was created with",
    );

    let lease = &property["active_lease"];
    let days = (lease["end_time"].as_u64().unwrap() - lease["start_time"].as_u64().unwrap())
        / (24 * 60 * 60 * 1_000_000_000);
    assert_eq!(days, 7, "a seven-day let must run seven days, not thirty");

    Ok(())
}

/// A renewal extends the lease by the term that was listed, not thirty times
/// it.
///
/// When the term moved from months to days, two of the three places that
/// multiplied it were labelled "lease duration" and one "renewal duration".
/// The first two were converted and the third was missed, so a renewal went on
/// multiplying a day count by a 30-day month: renewing a one-year let added
/// thirty years to it. Nothing in the contract rejected that — the arithmetic
/// is valid, it is just wrong — and it only surfaced when a lease was renewed
/// end to end against a real node.
#[tokio::test]
async fn test_renewal_extends_by_the_listed_term() -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let property_id = fx.mint_rental_for_days(30).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, 0).await?;
    fx.seller
        .call(fx.contract.id(), "accept_bid")
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let before = fx.property(property_id).await?["active_lease"]["end_time"]
        .as_u64()
        .expect("end_time");

    let renewal = fx.place_bid_with_deposit(property_id, 0).await?;
    fx.seller
        .call(fx.contract.id(), "accept_lease_renewal")
        .args_json(json!({ "bid_id": renewal, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let lease = fx.property(property_id).await?["active_lease"].clone();
    let after = lease["end_time"].as_u64().expect("end_time");
    let added_days = (after - before) / (24 * 60 * 60 * 1_000_000_000);
    assert_eq!(
        added_days, 30,
        "a 30-day renewal must add 30 days, not {added_days}",
    );

    // The window to claim against the deposit moves with the new end date, or
    // it would lapse part-way through a renewed tenancy.
    assert!(
        lease["damage_claim_deadline"].as_u64().unwrap() > after,
        "the claim deadline should follow the extended lease",
    );

    Ok(())
}

// A bid that ends without a lease starting owes the tenant everything they
// sent. Every refund path returned the rent alone, so the deposit stayed in
// the contract for good (found cancelling a rental bid on testnet).

async fn refund_case(cancel: &str, as_seller: bool, accept_first: bool) -> common::TestResult {
    let worker = near_workspaces::sandbox().await?;
    let fx = common::setup(&worker).await?;

    let property_id = fx.mint_rental_with_deposit(DEPOSIT).await?;
    let tenant_before = fx.ft_balance(fx.buyer.id()).await?;
    let bid_id = fx.place_bid_with_deposit(property_id, DEPOSIT).await?;
    assert_eq!(
        fx.ft_balance(fx.buyer.id()).await?,
        tenant_before - common::BID_AMOUNT - DEPOSIT,
        "placing the bid should take rent and deposit",
    );

    if accept_first {
        // The escrow path, which the app uses: the money stays in the
        // contract until the deal completes.
        fx.seller
            .call(fx.contract.id(), "accept_bid_with_escrow")
            .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
    }

    let caller = if as_seller { &fx.seller } else { &fx.buyer };
    caller
        .call(fx.contract.id(), cancel)
        .args_json(json!({ "bid_id": bid_id, "property_id": property_id }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    assert_eq!(
        fx.ft_balance(fx.buyer.id()).await?,
        tenant_before,
        "{cancel}: the tenant should get rent and deposit back",
    );
    Ok(())
}

#[tokio::test]
async fn test_cancelled_rental_bid_returns_the_deposit() -> common::TestResult {
    refund_case("cancel_bid", false, false).await
}

#[tokio::test]
async fn test_rejected_rental_bid_returns_the_deposit() -> common::TestResult {
    refund_case("reject_bid", true, false).await
}

#[tokio::test]
async fn test_cancelled_accepted_rental_bid_returns_the_deposit() -> common::TestResult {
    refund_case("buyer_cancel_accepted_bid", false, true).await
}
