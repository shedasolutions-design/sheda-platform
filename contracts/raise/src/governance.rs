//! Investors' say: choosing the manager, leaving a round, approving a
//! builder's own company.
//!
//! Three decisions that used to sit with Sheda or nobody now sit with the
//! people whose money is in the raise.
//!
//! **Choosing the manager.** The builder suggests up to three property
//! managers, each with their fee. Investors vote as they commit, weighted by
//! money, and the most-voted candidate is fixed as manager when the round
//! fills. The manager inspects every phase and runs the flats afterwards, so
//! it is the decision that matters most after choosing the building.
//!
//! **Leaving a round.** While a round is filling, an investor may take a
//! flat's commitment back, except in the last `WITHDRAW_CUTOFF_NS` before
//! the deadline and never once the round is full: a builder must be able to
//! count on money that is days from closing.
//!
//! **A builder's own company.** When no independent manager is available,
//! the builder's own company may be the manager. It then signs off its own
//! work, so each phase needs active approval from more than half of the
//! money before it is paid, instead of merely surviving an objection window.

use crate::ext::{ext_ft, ext_self};
use crate::{
    assert_one_yocto, Candidate, PhaseState, Raise, RaiseExt, RaiseStatus, BPS,
    GAS_FOR_FT_TRANSFER, GAS_FOR_RESOLVE, MAX_MANAGER_FEE_BPS, ONE_YOCTO, WITHDRAW_CUTOFF_NS,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, Promise, PromiseError};

#[near]
impl Raise {
    /// Set who investors may choose as manager, and the project pack's
    /// fingerprint.
    ///
    /// Owner only, and only before any money has arrived: these are terms
    /// people commit against. `candidates` are (account, fee_bps,
    /// self_managed). The builder's account may appear only flagged as
    /// self-managed, which switches the raise to approval mode.
    #[payable]
    pub fn set_terms(
        &mut self,
        project_id: String,
        candidates: Vec<(AccountId, u32, bool)>,
        pack_hash: String,
    ) {
        assert_one_yocto();
        self.assert_owner();
        let mut project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Open,
            "This raise is not open"
        );
        require!(
            project.raised == 0,
            "Money has arrived; the terms are fixed"
        );
        require!(
            !candidates.is_empty() && candidates.len() <= 3,
            "Suggest between one and three managers"
        );
        require!(pack_hash.len() <= 128, "That fingerprint is too long");

        let mut built = Vec::new();
        for (account, fee_bps, self_managed) in candidates {
            require!(
                fee_bps <= MAX_MANAGER_FEE_BPS,
                "A manager's fee is above what a vault allows"
            );
            require!(
                account != project.builder || self_managed,
                "The builder may manage only when flagged as self-managed"
            );
            require!(
                !built.iter().any(|c: &Candidate| c.account == account),
                "A manager is suggested twice"
            );
            built.push(Candidate {
                account,
                fee_bps,
                self_managed,
                votes: 0,
            });
        }
        // With one candidate there is nothing to vote on: it is the manager.
        project.manager = built[0].account.clone();
        project.manager_fee_bps = built[0].fee_bps;
        project.self_managed = built.len() == 1 && built[0].self_managed;
        project.candidates = built;
        project.pack_hash = pack_hash;
        self.save(&project_id, &project);
        env::log_str(&format!("terms_set {}", project_id));
    }

    /// Vote for, or change your vote to, one of the suggested managers.
    /// Weighted by everything you have committed to this raise.
    pub fn vote_manager(&mut self, project_id: String, candidate: AccountId) {
        let mut project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Open,
            "Voting closes when the round does"
        );
        let who = env::predecessor_account_id();
        let weight = self.committed_by(&project_id, &who);
        require!(
            weight > 0,
            "Only someone who committed to this raise may vote"
        );
        let index = project
            .candidates
            .iter()
            .position(|c| c.account == candidate)
            .unwrap_or_else(|| env::panic_str("That manager was not suggested for this raise"));
        self.move_vote(&project_id, &mut project, &who, Some(index), weight);
        self.save(&project_id, &project);
        env::log_str(&format!("vote {} {} for {}", project_id, who, candidate));
    }

    /// Take back what you committed to one flat while the round is filling.
    #[payable]
    pub fn withdraw(&mut self, project_id: String, unit: String) -> Promise {
        assert_one_yocto();
        let mut project = self.expect_project(&project_id);
        require!(
            project.status == RaiseStatus::Open,
            "This round is not filling any more"
        );
        require!(
            project.raised < project.target,
            "This round is full and about to close"
        );
        require!(
            env::block_timestamp() + WITHDRAW_CUTOFF_NS < project.deadline_ns,
            "Too close to the deadline to withdraw; the builder is counting on this money"
        );
        let who = env::predecessor_account_id();
        let amount = self.commitment_for(&project_id, &who, &unit);
        require!(amount > 0, "You have nothing committed to that flat");

        // Booked out before the transfer; the callback books it back in if
        // the transfer fails. The other order lets a second withdrawal in
        // while the first is in flight.
        self.debit(&project_id, &mut project, &who, &unit, amount);
        self.save(&project_id, &project);

        ext_ft::ext(project.stablecoin.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                who.clone(),
                U128(amount),
                Some("withdrawn from round".into()),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .on_withdrawn(project_id, unit, who, U128(amount)),
            )
    }

    #[private]
    pub fn on_withdrawn(
        &mut self,
        project_id: String,
        unit: String,
        who: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            env::log_str(&format!(
                "withdrawn {} by {} from {} unit {}",
                amount.0, who, project_id, unit
            ));
            return true;
        }
        // Nothing left the contract, so the commitment comes back exactly.
        let mut project = self.expect_project(&project_id);
        project.raised += amount.0;
        if let Some(u) = project.unit_mut(&unit) {
            u.raised += amount.0;
        }
        self.credit(&project_id, &who, &unit, amount.0);
        if let Some(i) = self.vote_of(&project_id, &who) {
            if let Some(c) = project.candidates.get_mut(i) {
                c.votes += amount.0;
            }
        }
        self.save(&project_id, &project);
        env::log_str(&format!(
            "withdrawal by {} on {} failed and was restored",
            who, project_id
        ));
        false
    }

    /// Approve a phase signed off by the builder's own company. Weighted by
    /// what you committed; more than half of the raise approving pays it.
    #[payable]
    pub fn approve(&mut self, project_id: String, phase: u32) {
        assert_one_yocto();
        let mut project = self.expect_project(&project_id);
        require!(
            project.self_managed,
            "Only a self-managed raise needs approvals"
        );
        let index = phase as usize;
        let current = Self::phase_at(&project.phases, index);
        require!(
            current.state == PhaseState::ObjectionWindow,
            "That phase is not waiting for approval"
        );
        let who = env::predecessor_account_id();
        let stake = self.committed_by(&project_id, &who);
        require!(
            stake > 0,
            "Only someone who committed to this raise may approve"
        );
        let key = Self::objection_key(&project_id, phase, &who);
        require!(
            !self.approved.get(&key).unwrap_or(false),
            "You have already approved this phase"
        );
        self.approved.insert(&key, &true);
        project.phases[index].approval_amount += stake;
        self.save(&project_id, &project);
        env::log_str(&format!(
            "approval {} phase {} by {} weight {}",
            project_id, phase, who, stake
        ));
    }

    // ---- views ----------------------------------------------------------

    /// Which manager an investor voted for, if any.
    pub fn get_vote(&self, project_id: String, account_id: AccountId) -> Option<AccountId> {
        let project = self.projects_get(&project_id)?;
        let i = self.vote_of(&project_id, &account_id)?;
        project.candidates.get(i).map(|c| c.account.clone())
    }

    pub fn has_approved(&self, project_id: String, phase: u32, account_id: AccountId) -> bool {
        self.approved
            .get(&Self::objection_key(&project_id, phase, &account_id))
            .unwrap_or(false)
    }

    /// How long before the deadline withdrawals stop, in nanoseconds.
    pub fn withdraw_cutoff_ns(&self) -> near_sdk::json_types::U64 {
        near_sdk::json_types::U64(WITHDRAW_CUTOFF_NS)
    }

    // ---- internals ------------------------------------------------------

    pub(crate) fn vote_of(&self, project_id: &str, who: &AccountId) -> Option<usize> {
        self.votes
            .get(&Self::investor_key(project_id, who))
            .map(|i| i as usize)
    }

    /// Move `weight` of an investor's vote to `to` (None removes it).
    pub(crate) fn move_vote(
        &mut self,
        project_id: &str,
        project: &mut crate::Project,
        who: &AccountId,
        to: Option<usize>,
        weight: u128,
    ) {
        if let Some(from) = self.vote_of(project_id, who) {
            if let Some(c) = project.candidates.get_mut(from) {
                c.votes = c.votes.saturating_sub(weight);
            }
        }
        match to {
            Some(i) => {
                if let Some(c) = project.candidates.get_mut(i) {
                    c.votes += weight;
                }
                self.votes
                    .insert(&Self::investor_key(project_id, who), &(i as u32));
            }
            None => {
                self.votes.remove(&Self::investor_key(project_id, who));
            }
        }
    }

    /// Take `amount` of one flat's commitment off every ledger, and off the
    /// investor's vote.
    pub(crate) fn debit(
        &mut self,
        project_id: &str,
        project: &mut crate::Project,
        who: &AccountId,
        unit: &str,
        amount: u128,
    ) {
        project.raised = project.raised.saturating_sub(amount);
        if let Some(u) = project.unit_mut(unit) {
            u.raised = u.raised.saturating_sub(amount);
        }
        let unit_key = Self::unit_key(project_id, who, unit);
        let left = self
            .commitments
            .get(&unit_key)
            .unwrap_or(0)
            .saturating_sub(amount);
        if left == 0 {
            self.commitments.remove(&unit_key);
        } else {
            self.commitments.insert(&unit_key, &left);
        }
        let investor_key = Self::investor_key(project_id, who);
        let total = self
            .by_investor
            .get(&investor_key)
            .unwrap_or(0)
            .saturating_sub(amount);
        if total == 0 {
            self.by_investor.remove(&investor_key);
        } else {
            self.by_investor.insert(&investor_key, &total);
        }
        let unit_total_key = Self::unit_total_key(project_id, unit);
        let unit_total = self
            .by_unit
            .get(&unit_total_key)
            .unwrap_or(0)
            .saturating_sub(amount);
        self.by_unit.insert(&unit_total_key, &unit_total);

        if let Some(i) = self.vote_of(project_id, who) {
            if let Some(c) = project.candidates.get_mut(i) {
                c.votes = c.votes.saturating_sub(amount);
            }
            if total == 0 {
                self.votes.remove(&investor_key);
            }
        }
    }

    /// Fix the manager when the round fills: the most-voted candidate, the
    /// earliest suggested winning a tie. Nobody voting leaves the first.
    pub(crate) fn choose_manager(project: &mut crate::Project) {
        if project.candidates.is_empty() {
            return;
        }
        let mut best = 0usize;
        for (i, c) in project.candidates.iter().enumerate() {
            if c.votes > project.candidates[best].votes {
                best = i;
            }
        }
        let chosen = project.candidates[best].clone();
        project.manager = chosen.account;
        project.manager_fee_bps = chosen.fee_bps;
        project.self_managed = chosen.self_managed;
    }

    /// Approval as a share of the raise, in basis points.
    pub(crate) fn approval_bps(project: &crate::Project, amount: u128) -> u32 {
        (amount * BPS)
            .checked_div(project.raised)
            .map(|s| s.min(BPS) as u32)
            .unwrap_or(0)
    }
}
