//! The arithmetic that decides who gets paid what.
//!
//! These are the rows of the risk register that can be proven without a
//! network: R5 (cost does not grow with holders), R6 (a buyer does not
//! collect income earned before they arrived), R23 (rounding loses nothing).

use crate::{Vault, BPS};
use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, Gas, NearToken};

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn ctx(predecessor: AccountId, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        // One mock context stands in for a whole test, including the
        // thousand-holder setup, so it needs more gas than a single
        // transaction would. This is the harness budget, not a contract
        // limit: on chain each mint is its own transaction with its own gas.
        .prepaid_gas(Gas::from_tgas(100_000));
    testing_env!(b.build());
}

/// A vault with no fees, so the arithmetic under test is only the split.
fn vault() -> Vault {
    ctx(acc("gov.testnet"), 0);
    Vault::new(
        "M120 Unit 1B".to_string(),
        "M120-1B".to_string(),
        acc("market.testnet"),
        U64(13),
        acc("usdt.testnet"),
        acc("manager.testnet"),
        acc("gov.testnet"),
        acc("treasury.testnet"),
        0,
        0,
        0,
        None,
    )
}

fn vault_with_fees(manager_bps: u32, reserve_bps: u32, platform_bps: u32) -> Vault {
    ctx(acc("gov.testnet"), 0);
    Vault::new(
        "M120 Unit 1B".to_string(),
        "M120-1B".to_string(),
        acc("market.testnet"),
        U64(13),
        acc("usdt.testnet"),
        acc("manager.testnet"),
        acc("gov.testnet"),
        acc("treasury.testnet"),
        manager_bps,
        reserve_bps,
        platform_bps,
        None,
    )
}

#[test]
fn rent_splits_in_proportion_to_shares() {
    let mut v = vault();
    v.internal_mint(&acc("ada.testnet"), 7_000);
    v.internal_mint(&acc("bola.testnet"), 3_000);

    v.credit_holders(1_000_000);

    assert_eq!(v.claimable(acc("ada.testnet")).0, 700_000);
    assert_eq!(v.claimable(acc("bola.testnet")).0, 300_000);
}

#[test]
fn a_buyer_does_not_collect_income_earned_before_they_arrived() {
    // R6. The bug this guards is silent: it favours whoever trades most and
    // is noticed by the person it robbed.
    let mut v = vault();
    v.internal_mint(&acc("ada.testnet"), 10_000);

    // Ada holds alone while the first rent arrives.
    v.credit_holders(500_000);

    // Ada then sells half to Bola.
    v.internal_transfer(&acc("ada.testnet"), &acc("bola.testnet"), 5_000);

    assert_eq!(
        v.claimable(acc("ada.testnet")).0,
        500_000,
        "Ada keeps everything earned while she held it all"
    );
    assert_eq!(
        v.claimable(acc("bola.testnet")).0,
        0,
        "Bola earns nothing for a period before he held anything"
    );

    // The next month they split it evenly.
    v.credit_holders(400_000);
    assert_eq!(v.claimable(acc("ada.testnet")).0, 700_000);
    assert_eq!(v.claimable(acc("bola.testnet")).0, 200_000);
}

#[test]
fn a_seller_keeps_what_they_earned_before_selling_everything() {
    let mut v = vault();
    v.internal_mint(&acc("ada.testnet"), 1_000);
    v.credit_holders(90_000);
    v.internal_transfer(&acc("ada.testnet"), &acc("bola.testnet"), 1_000);

    assert_eq!(v.claimable(acc("ada.testnet")).0, 90_000);
    assert_eq!(v.ft_balance_of(acc("ada.testnet")).0, 0);
}

#[test]
fn rounding_never_pays_out_more_than_came_in() {
    // R23, and the half of it that actually matters. Three holders and an
    // amount that never divides by three: the accumulator carries its
    // remainder forward, but each holder's own division still truncates, and
    // that last fraction stays in the vault.
    //
    // So the invariant is not exact conservation. It is that the vault can
    // never owe more than it received, and that the shortfall stays bounded
    // instead of growing with the number of payments. A naive accumulator
    // that dropped its remainder would lose up to one unit *per payment*;
    // this loses under one unit per holder, once, however long it runs.
    let mut v = vault();
    let holders = ["a.testnet", "b.testnet", "c.testnet"];
    for h in holders {
        v.internal_mint(&acc(h), 1);
    }

    let payments = 100u128;
    let each = 10u128; // 10 / 3 never divides evenly
    for _ in 0..payments {
        v.credit_holders(each);
    }

    let received = payments * each;
    let distributed: u128 = holders.iter().map(|n| v.claimable(acc(n)).0).sum();

    assert!(
        distributed <= received,
        "the vault promised {} having received {}",
        distributed,
        received
    );
    assert!(
        received - distributed < holders.len() as u128,
        "shortfall of {} over {} payments is more than sub-unit truncation",
        received - distributed,
        payments
    );
}

#[test]
fn income_arriving_before_any_shares_exist_is_not_lost() {
    let mut v = vault();
    v.credit_holders(1_000);
    assert_eq!(v.acc_per_share, 0, "nothing to divide by yet");

    v.internal_mint(&acc("ada.testnet"), 100);
    v.credit_holders(0);
    // The held amount joins the first real credit.
    v.credit_holders(1_000);
    assert_eq!(v.claimable(acc("ada.testnet")).0, 2_000);
}

#[test]
fn fees_come_off_the_top_and_always_add_back_to_the_whole() {
    let mut v = vault_with_fees(800, 500, 100); // 8% manager, 5% reserve, 1% platform
    v.internal_mint(&acc("ada.testnet"), 1_000);

    let to_holders = v.split_fees(1_000_000);

    assert_eq!(v.owed_manager, 80_000);
    assert_eq!(v.reserve, 50_000);
    assert_eq!(v.owed_treasury, 10_000);
    assert_eq!(to_holders, 860_000);
    assert_eq!(
        v.owed_manager + v.reserve + v.owed_treasury + to_holders,
        1_000_000,
        "the parts reconstruct the whole whichever way rounding fell"
    );
}

#[test]
#[should_panic(expected = "more than 30% of rent")]
fn fees_cannot_be_set_high_enough_to_leave_holders_nothing() {
    vault_with_fees(2_000, 1_000, 500);
}

#[test]
#[should_panic(expected = "Share supply is frozen")]
fn no_shares_can_be_minted_once_the_raise_closes() {
    // R20. Dilution after people have bought is indistinguishable from theft.
    let mut v = vault();
    ctx(acc("gov.testnet"), 1);
    v.freeze_supply();
    v.mint_shares(acc("ada.testnet"), U128(1));
}

#[test]
fn ownership_is_reported_in_basis_points() {
    let mut v = vault();
    v.internal_mint(&acc("ada.testnet"), 1_250);
    v.internal_mint(&acc("bola.testnet"), 8_750);
    assert_eq!(v.ownership_bps(acc("ada.testnet")), 1_250);
    assert_eq!(v.ownership_bps(acc("bola.testnet")), 8_750);
    assert_eq!(
        v.ownership_bps(acc("ada.testnet")) + v.ownership_bps(acc("bola.testnet")),
        BPS
    );
}

#[test]
fn claiming_is_not_double_counted() {
    let mut v = vault();
    v.internal_mint(&acc("ada.testnet"), 100);
    v.credit_holders(1_000);

    // Settling twice must not pay twice.
    v.settle(&acc("ada.testnet"));
    v.settle(&acc("ada.testnet"));
    assert_eq!(v.claimable(acc("ada.testnet")).0, 1_000);
}

#[test]
fn a_thousand_holders_still_reconcile() {
    // R5. The point is less the assertion than that crediting income does no
    // work per holder at all: this runs in constant time regardless.
    let mut v = vault();
    for i in 0..1_000u32 {
        // near-sdk's mock caps a single context at the protocol's
        // max_gas_burnt. On chain each mint is its own transaction; here the
        // loop shares one budget, so refresh it periodically. Storage is
        // carried across `testing_env!`, so the vault state is untouched.
        if i % 10 == 0 {
            ctx(acc("gov.testnet"), 0);
        }
        let who: AccountId = format!("h{}.testnet", i).parse().unwrap();
        v.internal_mint(&who, 10);
    }
    ctx(acc("gov.testnet"), 0);
    v.credit_holders(10_000_000);

    let total: u128 = (0..1_000u32)
        .map(|i| {
            let who: AccountId = format!("h{}.testnet", i).parse().unwrap();
            v.claimable(who).0
        })
        .sum();
    assert_eq!(total + v.dust / crate::PRECISION, 10_000_000);
}

// ---- a flat with a known share count: every investor is treated alike ----

/// A vault for a flat that divides into 10,000 shares, as the raise sets it.
fn capped_vault() -> Vault {
    ctx(acc("gov.testnet"), 0);
    Vault::new(
        "M120 Unit 1B".to_string(),
        "M120-1B".to_string(),
        acc("market.testnet"),
        U64(13),
        acc("usdt.testnet"),
        acc("manager.testnet"),
        acc("gov.testnet"),
        acc("treasury.testnet"),
        0,
        0,
        0,
        Some(U128(10_000)),
    )
}

#[test]
fn a_late_claimer_keeps_the_rent_their_shares_earned_before_they_claimed() {
    // Ada owns 70% and claims at once; Bola owns 30% and claims only after
    // rent has come in. Bola must still get 30% of it, and Ada no more
    // than her 70%.
    let mut v = capped_vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(7_000));

    v.credit_holders(1_000_000);

    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("bola.testnet"), U128(3_000));

    assert_eq!(v.claimable(acc("ada.testnet")).0, 700_000);
    assert_eq!(v.claimable(acc("bola.testnet")).0, 300_000);
}

#[test]
fn claiming_early_takes_nothing_from_anyone_else() {
    // Only Ada has claimed. She still gets only her 70%; the other 30%
    // waits for whoever owns it.
    let mut v = capped_vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(7_000));
    v.credit_holders(1_000_000);
    assert_eq!(v.claimable(acc("ada.testnet")).0, 700_000);
}

#[test]
#[should_panic(expected = "more shares than the flat divides into")]
fn no_more_shares_can_be_issued_than_the_flat_divides_into() {
    let mut v = capped_vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(7_000));
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("bola.testnet"), U128(3_001));
}

#[test]
fn a_transfer_after_issue_still_does_not_hand_over_past_rent() {
    // Rent earned before a sale stays with the seller (R6 still holds).
    let mut v = capped_vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(10_000));
    v.credit_holders(1_000_000);
    v.internal_transfer(&acc("ada.testnet"), &acc("bola.testnet"), 5_000);
    assert_eq!(v.claimable(acc("ada.testnet")).0, 1_000_000);
    assert_eq!(v.claimable(acc("bola.testnet")).0, 0);
}

#[test]
#[should_panic(expected = "Redeeming takes every share")]
fn the_first_claimer_cannot_redeem_the_flat_before_everyone_has_claimed() {
    // Ada holds every share minted so far (7,000) but the flat divides into
    // 10,000. She must not be able to take the whole flat.
    let mut v = capped_vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(7_000));
    v.custody = crate::Custody::Held {
        token_id: "13".to_string(),
    };
    ctx(acc("ada.testnet"), 1);
    let _ = v.redeem();
}

// ---- v5: the share market and replacing the manager ------------------------

fn ft_call(v: &mut Vault, from: &str, amount: u128, msg: &str) -> u128 {
    ctx(acc("usdt.testnet"), 0);
    match v.ft_on_transfer(acc(from), U128(amount), msg.to_string()) {
        near_sdk::PromiseOrValue::Value(left) => left.0,
        _ => panic!("expected a value"),
    }
}

fn two_holders() -> Vault {
    let mut v = vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(600));
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("bode.testnet"), U128(400));
    v
}

#[test]
fn a_listed_share_sells_for_the_price_less_two_percent() {
    let mut v = two_holders();
    ctx(acc("ada.testnet"), 0);
    let id = v.list_shares(U128(100), U128(1_000));
    // 150 shares' worth sent; only 100 are listed, so 50,000 comes back.
    let left = ft_call(
        &mut v,
        "chi.testnet",
        150_000,
        &format!(r#"{{"buy":{}}}"#, id),
    );
    assert_eq!(left, 50_000);
    assert_eq!(v.ft_balance_of(acc("chi.testnet")).0, 100);
    assert_eq!(v.ft_balance_of(acc("ada.testnet")).0, 500);
    assert_eq!(v.locked_shares(acc("ada.testnet")).0, 0);
    // 2% of 100,000 waits for the treasury; the rest has gone to Ada.
    assert_eq!(v.get_owed_treasury().0, 2_000);
    assert_eq!(v.get_info().last_accounted.0, 2_000);
    assert!(v.get_listings(None, None).is_empty());
}

#[test]
#[should_panic(expected = "listed for sale")]
fn listed_shares_cannot_be_moved() {
    let mut v = two_holders();
    ctx(acc("ada.testnet"), 0);
    v.list_shares(U128(600), U128(1_000));
    ctx(acc("ada.testnet"), 1);
    v.ft_transfer(acc("chi.testnet"), U128(1), None);
}

#[test]
fn rent_earned_before_a_sale_stays_with_the_seller() {
    let mut v = two_holders();
    ctx(acc("ada.testnet"), 0);
    let id = v.list_shares(U128(600), U128(10));
    // 1,000 of rent arrives while the shares are listed.
    v.credit_holders(1_000);
    ft_call(
        &mut v,
        "chi.testnet",
        6_000,
        &format!(r#"{{"buy":{}}}"#, id),
    );
    assert_eq!(v.claimable(acc("ada.testnet")).0, 600);
    assert_eq!(v.claimable(acc("chi.testnet")).0, 0);
}

#[test]
fn a_buy_offer_is_filled_by_a_holder() {
    let mut v = two_holders();
    let left = ft_call(
        &mut v,
        "chi.testnet",
        5_500,
        r#"{"offer":{"shares":"5","price_per_share":"1000"}}"#,
    );
    assert_eq!(left, 500);
    ctx(acc("bode.testnet"), 1);
    v.sell_to_offer(0, U128(3));
    assert_eq!(v.ft_balance_of(acc("chi.testnet")).0, 3);
    assert_eq!(v.get_offers(None, None)[0].1.shares.0, 2);
    assert_eq!(v.get_owed_treasury().0, 60);
}

#[test]
fn market_money_is_never_counted_as_rent() {
    let mut v = two_holders();
    ft_call(
        &mut v,
        "chi.testnet",
        5_000,
        r#"{"offer":{"shares":"5","price_per_share":"1000"}}"#,
    );
    // The offer's 5,000 is booked, so a sync seeing it credits nothing.
    assert_eq!(v.get_info().last_accounted.0, 5_000);
}

#[test]
fn more_than_half_of_the_shares_replace_the_manager() {
    let mut v = two_holders();
    ctx(acc("ada.testnet"), 0);
    v.vote_manager(acc("okon.testnet"), 700);
    ctx(acc("anyone.testnet"), 0);
    v.apply_manager_vote(acc("okon.testnet"), 700);
    let info = v.get_info();
    assert_eq!(info.manager, acc("okon.testnet"));
    assert_eq!(info.manager_bps, 700);
}

#[test]
#[should_panic(expected = "more than half")]
fn half_of_the_shares_is_not_enough() {
    let mut v = vault();
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("ada.testnet"), U128(500));
    ctx(acc("gov.testnet"), 1);
    v.mint_shares(acc("bode.testnet"), U128(500));
    ctx(acc("ada.testnet"), 0);
    v.vote_manager(acc("okon.testnet"), 700);
    ctx(acc("anyone.testnet"), 0);
    v.apply_manager_vote(acc("okon.testnet"), 700);
}
