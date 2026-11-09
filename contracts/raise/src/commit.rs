//! Money arriving, and money going back.
//!
//! Commitments arrive through `ft_transfer_call` on the stablecoin, so the
//! transfer and the record of whose it is happen in one transaction and
//! cannot come apart. The failure in between, had they been two calls, is
//! money sitting in an escrow account with nothing saying who owns it.
//!
//! Refunds go the other way and are pulled, one investor at a time. Paying
//! everyone in a loop fits inside a gas limit until the raise is popular,
//! which is the worst possible time to discover it.

use crate::ext::{ext_ft, ext_self, ext_vault};
use crate::{
    assert_one_yocto, Raise, RaiseExt, RaiseStatus, BPS, GAS_FOR_FT_TRANSFER, GAS_FOR_MINT,
    GAS_FOR_RESOLVE, ONE_YOCTO,
};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json;
use near_sdk::{env, near, require, AccountId, Promise, PromiseError, PromiseOrValue};

/// What the app puts in `msg` when committing.
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct CommitMsg {
    pub project: String,
    pub unit: String,
}

#[near]
impl Raise {
    /// Take a commitment.
    ///
    /// Returning anything other than "0" refunds that much to the sender,
    /// which is how a NEP-141 receiver rejects money. Every refusal below
    /// returns the whole amount rather than panicking, because a panic in
    /// `ft_on_transfer` also returns the tokens but loses the reason.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let Ok(parsed) = serde_json::from_str::<CommitMsg>(&msg) else {
            env::log_str("rejected: msg is not a project and unit");
            return PromiseOrValue::Value(amount);
        };

        let Some(mut project) = self.projects_get(&parsed.project) else {
            env::log_str("rejected: no raise with that id");
            return PromiseOrValue::Value(amount);
        };

        if env::predecessor_account_id() != project.stablecoin {
            env::log_str("rejected: wrong token for this raise");
            return PromiseOrValue::Value(amount);
        }
        if project.status != RaiseStatus::Open {
            env::log_str("rejected: this raise is not taking money");
            return PromiseOrValue::Value(amount);
        }
        if env::block_timestamp() >= project.deadline_ns {
            env::log_str("rejected: this raise has closed");
            return PromiseOrValue::Value(amount);
        }

        let Some(unit) = project.unit(&parsed.unit) else {
            env::log_str("rejected: no flat with that code in this raise");
            return PromiseOrValue::Value(amount);
        };

        // Take only what is still wanted and send the rest straight back,
        // bounded by the flat as well as by the raise. Without the first
        // bound a popular flat oversubscribes, and the shares owed against
        // it would exceed the shares it divides into.
        let room = project
            .target
            .saturating_sub(project.raised)
            .min(unit.room());
        if room == 0 {
            env::log_str("rejected: that flat is already fully funded");
            return PromiseOrValue::Value(amount);
        }
        let accepted = amount.0.min(room);
        let returned = amount.0 - accepted;

        project.raised += accepted;
        if let Some(unit) = project.unit_mut(&parsed.unit) {
            unit.raised += accepted;
        }
        self.save(&parsed.project, &project);
        self.credit(&parsed.project, &sender_id, &parsed.unit, accepted);

        env::log_str(&format!(
            "committed {} by {} to {} unit {}",
            accepted, sender_id, parsed.project, parsed.unit
        ));
        PromiseOrValue::Value(U128(returned))
    }

    /// Close a raise once its deadline has passed, or as soon as it is full.
    ///
    /// Open to anyone. If this needed the builder, a builder whose raise
    /// fell short could leave it open forever and investors would never
    /// reach the state that lets them take their money back.
    pub fn close_raise(&mut self, project_id: String) {
        let mut project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Open,
            "This raise is already closed"
        );

        let full = project.raised >= project.target;
        let expired = env::block_timestamp() >= project.deadline_ns;
        require!(
            full || expired,
            "This raise is still open and has not reached its target"
        );

        if full {
            project.status = RaiseStatus::Funded;
            self.save(&project_id, &project);
            env::log_str(&format!(
                "raise_funded {} at {}",
                project_id, project.raised
            ));

            // The fee is taken once, here, and only from a raise that
            // actually succeeded. Charging a failed raise would mean
            // investors getting back less than they put in through no
            // fault of anyone they chose.
            let fee = project.raised * u128::from(project.platform_bps) / BPS;
            if fee > 0 {
                project.fee_taken = fee;
                self.save(&project_id, &project);
                let _ = ext_ft::ext(project.stablecoin.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_FOR_FT_TRANSFER)
                    .ft_transfer(
                        self.treasury.clone(),
                        U128(fee),
                        Some("platform fee".into()),
                    )
                    .then(
                        ext_self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_RESOLVE)
                            .on_fee_paid(project_id, U128(fee)),
                    );
            }
        } else {
            project.status = RaiseStatus::Failed;
            self.save(&project_id, &project);
            env::log_str(&format!(
                "raise_failed {} short by {}",
                project_id,
                project.target - project.raised
            ));
        }
    }

    #[private]
    pub fn on_fee_paid(
        &mut self,
        project_id: String,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        // The money never left, so the fee must come back off the books
        // or every phase pays out a share of a pot that is smaller than
        // the escrow really holds.
        let mut project = self.expect_project(&project_id);
        project.fee_taken = project.fee_taken.saturating_sub(amount.0);
        self.save(&project_id, &project);
        env::log_str(&format!(
            "platform fee on {} failed and was reversed",
            project_id
        ));
        false
    }

    /// Take your money back from a raise that did not reach its target.
    #[payable]
    pub fn refund(&mut self, project_id: String) -> Promise {
        assert_one_yocto();
        let project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Failed,
            "Refunds are only open on a raise that failed"
        );

        let who = env::predecessor_account_id();
        require!(
            !self.has_opted_out(&project_id, &who),
            "You have already been refunded"
        );
        let amount = self.committed_by(&project_id, &who);
        require!(amount > 0, "You did not commit to this raise");

        // Marked before the transfer, not after. The callback restores it
        // if the transfer fails; the other order lets a second call in
        // while the first is still in flight.
        self.mark_opted_out(&project_id, &who);

        ext_ft::ext(project.stablecoin.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(who.clone(), U128(amount), Some("raise refund".into()))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .on_refunded(project_id, who, U128(amount)),
            )
    }

    #[private]
    pub fn on_refunded(
        &mut self,
        project_id: String,
        who: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            let mut project = self.expect_project(&project_id);
            project.refunded += amount.0;
            self.save(&project_id, &project);
            self.clear_investor(&project_id, &who);
            return true;
        }
        // Nothing moved, so the claim has to come back or the money is
        // stranded with no one entitled to it.
        self.unmark_opted_out(&project_id, &who);
        env::log_str(&format!(
            "refund to {} on {} failed and was restored",
            who, project_id
        ));
        false
    }

    /// Turn a commitment into shares in the flat's vault.
    ///
    /// Both the share count and the vault come from this contract's own
    /// state. An earlier version took them as arguments and checked only
    /// that the caller had committed something, which let anyone who put
    /// in the smallest possible amount ask for any number of shares they
    /// liked, diluting every other holder of that flat.
    ///
    /// Claimed once. Nothing recorded the claim before, so the same
    /// commitment could be minted against repeatedly.
    #[payable]
    pub fn claim_shares(&mut self, project_id: String, unit: String) -> Promise {
        assert_one_yocto();
        let project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Funded || project.status == RaiseStatus::Delivered,
            "Shares exist once the raise is funded"
        );

        let who = env::predecessor_account_id();
        let committed = self.commitment_for(&project_id, &who, &unit);
        require!(committed > 0, "You did not commit to that flat");
        require!(
            !self.has_claimed(&project_id, &unit, &who),
            "You have already claimed your shares in that flat"
        );

        let flat = project
            .unit(&unit)
            .unwrap_or_else(|| env::panic_str("No flat with that code in this raise"));
        let vault = flat
            .vault
            .clone()
            .unwrap_or_else(|| env::panic_str("That flat has no vault yet"));

        let shares = flat.shares_for(committed);
        require!(shares > 0, "Your commitment rounds to less than one share");

        // Marked before the call. The callback restores it if the mint
        // fails; the other order leaves a window for a second claim while
        // the first is still in flight.
        self.mark_claimed(&project_id, &unit, &who);

        env::log_str(&format!(
            "shares_claimed {} {} by {} for {}",
            project_id, unit, who, shares
        ));

        ext_vault::ext(vault)
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_MINT)
            .mint_shares(who.clone(), U128(shares))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .on_shares_minted(project_id, unit, who),
            )
    }

    #[private]
    pub fn on_shares_minted(
        &mut self,
        project_id: String,
        unit: String,
        who: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        // Nothing was minted, so the claim has to come back or the holder
        // is left with a commitment they can never turn into shares.
        self.unmark_claimed(&project_id, &unit, &who);
        env::log_str(&format!(
            "share mint for {} on {} {} failed and the claim was restored",
            who, project_id, unit
        ));
        false
    }
}
