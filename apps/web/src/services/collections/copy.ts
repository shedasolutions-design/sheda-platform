/**
 * Words Invest shows in more than one place: the manager's starting pledge,
 * the risks of investing, and the short explanations behind each "i".
 * Kept together so the same thing is never explained two different ways.
 */

/** A starting point for a manager's pledge. They edit it to their terms. */
export const PLEDGE_TEMPLATE = `My pledge to investors

1. Inspecting the building
- I inspect each building phase in person before signing it off.
- I sign off only work that is finished to the plans in the project pack.
- I post photos of what I inspected with every sign-off.

2. Managing the finished flats
- I find tenants and list each flat on Sheda within 14 days of handover.
- I collect rent and pay it into the flat's vault within 5 days of receiving it.
- I handle repairs and maintenance, paid from the vault's reserve where needed.
- I post a report for holders every month: who is renting, what was paid, what was spent.

3. My fee
- My fee is the percentage of rent shown on my profile. I take nothing else.

4. If I fall short
- Holders may replace me if more than half of a flat's shares vote to.
- I hand over keys, tenant details and records within 14 days of being replaced.
`;

export interface RiskItem {
  title: string;
  body: string;
}

/** The risks every investor should read before putting money in. */
export const INVEST_RISKS: RiskItem[] = [
  {
    title: "The builder may be late or fail",
    body: "Money is paid to the builder phase by phase, only after the manager inspects each phase and holders have had time to object. If building stops, holders take back what was not yet paid, plus a share of the builder's stake. Money already paid for finished phases cannot be recovered.",
  },
  {
    title: "Rent is an estimate, not a promise",
    body: "The rent range is the builder's own estimate. Rent only starts once a flat is finished and let, and months without a tenant earn nothing.",
  },
  {
    title: "The manager matters",
    body: "The manager signs off building work and runs the flats afterwards. Read their pledge and fee. Holders can replace a manager if more than half of a flat's shares vote to.",
  },
  {
    title: "Your shares may be slow to sell",
    body: "You can offer your shares to other people on Sheda, but nobody is obliged to buy them, and the price you get may be lower than you paid.",
  },
  {
    title: "Blockchain transactions cannot be reversed",
    body: "Payments and share transfers are final once confirmed. Check the details before you sign.",
  },
  {
    title: "Your wallet holds your shares",
    body: "If you lose access to your wallet, you lose access to your shares and rent. Back it up.",
  },
  {
    title: "Smart contracts can have faults",
    body: "The contracts holding the money are tested, but no software is free of risk.",
  },
  {
    title: "Sheda does not guarantee any return",
    body: "Sheda runs the marketplace and checks documents it marks as verified. It does not guarantee any return, rent or resale price.",
  },
];

/** The short explanations behind each "i" on Invest. */
export const INFO = {
  shares:
    "Each flat is divided into equal shares. Owning shares means owning that part of the flat and its rent.",
  ownership: "Your shares as a percentage of the whole flat.",
  escrow:
    "Your money waits in the raise contract, not with the builder. If the round does not fill, you get it all back.",
  manager:
    "The manager inspects and signs off each building phase, then finds tenants, collects rent and looks after the flats.",
  fees: "From rent: the manager's fee, 5% kept in a repair reserve, and 2% to Sheda. Sheda also takes 2% of a raise only once it fills, and nothing from refunds.",
  pack: "The builder's full document: title, approvals, costs, timeline, rent research, what you own, and every agreement. Its fingerprint is recorded so it cannot be swapped later.",
  selfManaged:
    "The builder's own company will manage these flats and sign off its own building work. Each phase payment then needs more than half of investors to approve it.",
  resale: "You can offer your shares to other people on Sheda. Any rent earned before a sale stays yours.",
} as const;

export const PROJECT_TYPE_TEXT: Record<string, string> = {
  off_plan: "Off-plan",
  under_construction: "Under construction",
  completed: "Completed, ready to rent",
};
