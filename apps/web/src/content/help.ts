/**
 * The Help Center: the full explanations behind the short notes on screens.
 *
 * Every rule here is the one the contracts and server enforce on mainnet
 * (testnet shortens a few waits so the flows can be tried; the copy never
 * describes those). When a rule changes in code, change it here too.
 * Sources: contracts/market (offers, escrow, cancellations, deposits,
 * disputes, fees), contracts/raise and services/collections (Invest),
 * services/backend (accounts, codes, profiles).
 */

export interface HelpSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  /** One line, shown in lists and under the title. */
  summary: string;
  category: HelpCategory;
  sections: HelpSection[];
  related?: string[];
}

export type HelpCategory = "Buying and renting" | "Selling and letting" | "Invest" | "Wallet and account" | "Policies";

export const HELP_CATEGORIES: HelpCategory[] = [
  "Buying and renting",
  "Selling and letting",
  "Invest",
  "Wallet and account",
  "Policies",
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ---- Buying and renting -------------------------------------------------
  {
    slug: "how-buying-works",
    title: "How buying and renting works",
    summary: "From Buy now to the keys, with your money in escrow the whole way.",
    category: "Buying and renting",
    sections: [
      {
        paragraphs: [
          "Every deal on Sheda follows the same order, so you always know what comes next and where your money is.",
        ],
      },
      {
        heading: "The steps",
        bullets: [
          "Choose Buy now or Rent now at the listed price, or Make an offer if the seller accepts offers.",
          "Your money is locked in escrow, a smart contract. It does not go to the seller.",
          "The seller accepts or rejects. If they reject, your money comes straight back.",
          "Once accepted, Book appointment to inspect the property, at a time the seller has made available.",
          "After the inspection, the seller sends the agreement and documents. You read them in the app.",
          "Accept the agreement and the deal is agreed. The payment is released to the seller after a 24-hour hold.",
        ],
      },
      {
        heading: "You can see every step",
        paragraphs: [
          "Your deals are under History, with the step you're on and who needs to act next. Chat with the other side from the deal at any point.",
        ],
      },
    ],
    related: ["escrow", "cancellations-and-refunds", "renting-and-deposits"],
  },
  {
    slug: "escrow",
    title: "How your money is protected",
    summary: "Escrow holds your payment until the deal is done, not the seller.",
    category: "Buying and renting",
    sections: [
      {
        paragraphs: [
          "When you choose Buy now, Rent now or Make an offer, the money goes into escrow: a smart contract on the NEAR blockchain. Neither the seller nor Sheda can spend it.",
          "It moves only by the contract's rules: back to you if the deal doesn't go ahead, or to the seller once you've accepted the agreement and the 24-hour hold has passed.",
        ],
      },
      {
        heading: "Always pay through Sheda",
        paragraphs: [
          "Escrow only protects money paid in the app. Never pay a seller or agent directly, by bank transfer or in cash, for a property listed on Sheda.",
        ],
      },
      {
        heading: "If something goes wrong",
        paragraphs: [
          "From the moment your offer is accepted until the payment is released, either side can raise a dispute from the deal. The payment then stays in escrow while Sheda reviews it.",
        ],
      },
    ],
    related: ["cancellations-and-refunds", "fees"],
  },
  {
    slug: "cancellations-and-refunds",
    title: "Cancellations and refunds",
    summary: "When you can walk away, and how your money comes back.",
    category: "Buying and renting",
    sections: [
      {
        heading: "Before the seller accepts",
        bullets: [
          "Cancel your offer at any time and get all your money back.",
          "An offer that isn't accepted within 7 days expires. Reclaim your money from the deal in History.",
          "If the seller rejects your offer, or accepts someone else's, your money comes back to you.",
        ],
      },
      {
        heading: "After the seller accepts",
        bullets: [
          "Until the seller sends the agreement, you can still cancel for a full refund. The property goes back on the market.",
          "When the agreement arrives, you can reject it and cancel. You get a full refund, and the agreement is withdrawn.",
        ],
      },
      {
        heading: "Once you accept the agreement",
        paragraphs: [
          "Accepting the agreement is your commitment, so the deal can't be cancelled from then on. The payment goes to the seller after a 24-hour hold. If something is wrong before then, raise a dispute.",
        ],
      },
      {
        heading: "Refunds are free",
        paragraphs: ["Sheda takes nothing from money returned to you."],
      },
    ],
    related: ["escrow", "how-buying-works"],
  },
  {
    slug: "renting-and-deposits",
    title: "Renting and your deposit",
    summary: "Your deposit waits in escrow and comes back when the lease ends.",
    category: "Buying and renting",
    sections: [
      {
        paragraphs: [
          "A rental is paid as the rent plus a refundable deposit, shown on the listing. Both go into escrow when you choose Rent now.",
        ],
      },
      {
        heading: "Getting your deposit back",
        bullets: [
          "When the lease ends, the landlord has 7 days to claim against the deposit for damage.",
          "If they don't, the deposit is yours to take back, and nobody can stop it.",
          "If they do, Sheda reviews the claim. Whatever isn't awarded to the landlord goes back to you.",
        ],
      },
      {
        heading: "Renewing",
        paragraphs: ["You can ask to renew before the lease ends. The landlord accepts the renewal in the app."],
      },
    ],
    related: ["escrow", "cancellations-and-refunds"],
  },

  // ---- Selling and letting ------------------------------------------------
  {
    slug: "selling-on-sheda",
    title: "Selling and letting on Sheda",
    summary: "List, accept an offer, show the property, send the agreement, get paid.",
    category: "Selling and letting",
    sections: [
      {
        heading: "The steps",
        bullets: [
          "List the property with photos, price and details. It's recorded on the blockchain as yours.",
          "Buyers and tenants pay into escrow with Buy now, Rent now or an offer. You see the money is there before you do anything.",
          "Accept the offer you want. The others are returned to their buyers automatically.",
          "The buyer books an appointment to inspect, within the viewing hours you publish.",
          "Send the agreement and documents from the deal.",
          "When the buyer accepts, your payment arrives after a 24-hour hold, less Sheda's 2% fee.",
        ],
      },
      {
        heading: "Publish your viewing hours",
        paragraphs: ["Buyers can only book an appointment in hours you've made available. Set them under Viewing Hours."],
      },
    ],
    related: ["fees", "escrow"],
  },
  {
    slug: "fees",
    title: "Fees",
    summary: "2% of completed deals, paid by the seller or landlord. Nothing on refunds.",
    category: "Selling and letting",
    sections: [
      {
        heading: "On the marketplace",
        paragraphs: [
          "Sheda takes 2% of each completed sale or rental payment, from the amount paid to the seller or landlord. Buyers and tenants pay the listed price and nothing more.",
        ],
      },
      {
        heading: "On Invest",
        bullets: [
          "2% of a raise, only once it fills.",
          "From rent: the manager's fee (shown on their profile), 5% kept in a repair reserve for the flat, and 2% to Sheda.",
          "2% of share sales between holders.",
        ],
      },
      {
        heading: "Never on refunds",
        paragraphs: ["Money returned to you, from a cancelled offer, a rejected agreement or a raise that doesn't fill, is returned in full."],
      },
      {
        heading: "Network costs",
        paragraphs: ["Blockchain transactions cost a tiny amount of NEAR in network fees. Your Sheda wallet is funded for these when it's created."],
      },
    ],
    related: ["how-buying-works", "how-a-raise-works"],
  },

  // ---- Invest ---------------------------------------------------------------
  {
    slug: "how-a-raise-works",
    title: "How Invest works",
    summary: "Buy shares in one specific flat, and earn its rent.",
    category: "Invest",
    sections: [
      {
        paragraphs: [
          "On Invest you buy shares in a single flat, often before it's built. The rent that flat earns is shared between its holders, in proportion to their shares.",
        ],
      },
      {
        heading: "How a raise runs",
        bullets: [
          "A builder opens a raise for a building: its flats, a target, a minimum investment and a schedule of building phases.",
          "You choose a flat and an amount, and vote for the property manager you want.",
          "Your money waits in the raise contract, not with the builder.",
          "While the round fills you can take your money out, except in its last 7 days or once it's full.",
          "If the round misses its deadline, everyone gets all their money back.",
          "When it fills, the manager with the most votes is chosen and building begins, paid phase by phase.",
        ],
      },
      {
        heading: "Before you invest",
        paragraphs: [
          "Read the project pack: the builder's full document of title, approvals, costs, timeline and agreements. A raise can't open without one, and its fingerprint is recorded so it can't be swapped later.",
        ],
      },
    ],
    related: ["phases-and-objections", "invest-risks", "builder-ranking", "fees"],
  },
  {
    slug: "phases-and-objections",
    title: "How the money is released",
    summary: "Phase by phase, after inspection, with 7 days for holders to object.",
    category: "Invest",
    sections: [
      {
        bullets: [
          "The builder says a phase is finished.",
          "The property manager inspects it in person and signs it off.",
          "Holders then have 7 days to object.",
          "If a quarter of the money in the raise objects, the payment is held and the build stops.",
          "Otherwise that phase's share of the raise is paid to the builder.",
        ],
      },
      {
        heading: "When the builder manages its own flats",
        paragraphs: [
          "If the builder's own company is the manager, it would be signing off its own work. So each payment instead needs approval from more than half of the money in the raise.",
        ],
      },
      {
        heading: "If the build stops",
        paragraphs: [
          "Holders take back what hasn't been paid to the builder yet, plus a share of the stake the builder posted. Money already paid for finished phases can't be recovered.",
        ],
      },
    ],
    related: ["how-a-raise-works", "invest-risks"],
  },
  {
    slug: "builder-ranking",
    title: "How builders and managers are ranked",
    summary: "Ranks come from their record on the blockchain, worked out in the open.",
    category: "Invest",
    sections: [
      {
        paragraphs: [
          "Every builder and manager profile shows the record behind its rank: jobs finished on time, late or abandoned, the stake they've posted, and anything ever taken from it. The rank is worked out in the app from those facts, so you can check it.",
        ],
      },
      {
        heading: "Not rated yet",
        paragraphs: [
          "A rank needs at least 2 finished projects on Sheda. Until then a profile reads Not rated yet. That isn't good or bad: there just isn't enough history.",
        ],
      },
      {
        heading: "Licences and papers",
        paragraphs: [
          "Builders can add their licences and registration documents to their profile. If none are shown, ask the builder for them before you invest.",
        ],
      },
    ],
    related: ["identity-checks", "how-a-raise-works"],
  },
  {
    slug: "invest-risks",
    title: "Risks of investing",
    summary: "Read these before you put money into a raise.",
    category: "Invest",
    sections: [
      {
        bullets: [
          "The builder may be late or fail. Money already paid for finished phases can't be recovered.",
          "Rent is the builder's estimate, not a promise. Months without a tenant earn nothing.",
          "The manager matters: read their pledge and fee. Holders of more than half a flat's shares can replace them.",
          "Your shares may be slow to sell, and may sell for less than you paid.",
          "Blockchain transactions can't be reversed once confirmed.",
          "If you lose access to your wallet, you lose access to your shares and rent. Back it up.",
          "Smart contracts are tested, but no software is free of risk.",
          "Sheda does not guarantee any return, rent or resale price.",
        ],
      },
    ],
    related: ["phases-and-objections", "wallet-and-backups"],
  },

  // ---- Wallet and account ---------------------------------------------------
  {
    slug: "wallet-and-backups",
    title: "Your wallet and backups",
    summary: "Your wallet lives on your device. Back it up so you never lose it.",
    category: "Wallet and account",
    sections: [
      {
        paragraphs: [
          "Your Sheda wallet is created for you and kept in this browser or device, not on Sheda's servers. That's what keeps it yours. It also means you need a backup.",
        ],
      },
      {
        heading: "Two ways to back up",
        bullets: [
          "Google backup: an encrypted copy saved to your Google account, locked with a backup password only you know.",
          "Recovery phrase: 12 words that restore the wallet anywhere. Write them down and keep them offline.",
        ],
      },
      {
        heading: "Your backup password can't be reset",
        paragraphs: [
          "Nobody, including Sheda, can unlock your backup without it. If you forget it while your wallet is still on a device, set a new one under Backup & recovery. Test it now and then.",
        ],
      },
      {
        heading: "Signing in on a new device",
        paragraphs: [
          "Sign in, then restore your wallet from your Google backup or your recovery phrase. Don't create a new wallet: your deals and money stay with the one you have.",
        ],
      },
    ],
    related: ["account-security"],
  },
  {
    slug: "account-security",
    title: "Keeping your account safe",
    summary: "Codes by email protect sign-ins and every important change.",
    category: "Wallet and account",
    sections: [
      {
        bullets: [
          "Signing in on a new device needs a code sent to your email. That device is then remembered for 30 days.",
          "Viewing your wallet keys, setting a transaction PIN, changing your email and deleting your account all need your password or an emailed code.",
          "Sheda staff will never ask for your codes, password, PIN or recovery phrase.",
          "If an email says your Sheda email was changed and it wasn't you, reply to it straight away.",
        ],
      },
    ],
    related: ["wallet-and-backups", "privacy"],
  },
  {
    slug: "identity-checks",
    title: "Identity checks",
    summary: "A verified badge means the person proved who they are with official ID.",
    category: "Wallet and account",
    sections: [
      {
        paragraphs: [
          "People can verify their identity in the app with an official ID. Once verified, a badge shows on their profile and listings.",
          "Verification shows who someone is, not how well they've done. A builder's rank, based on their record, is separate.",
        ],
      },
    ],
    related: ["builder-ranking", "privacy"],
  },

  // ---- Policies ---------------------------------------------------------------
  {
    slug: "privacy",
    title: "Your profile and privacy",
    summary: "What others can see about you, and when.",
    category: "Policies",
    sections: [
      {
        bullets: [
          "Your name, photo, username, location, agency and rating are on your profile for other Sheda users.",
          "Your email and phone number are shown only to someone you have an appointment with, so you can reach each other.",
          "Details you add, like your work and languages, are shown to the people you choose when you add them.",
          "Your payment details, appointments and viewing hours are never shown on your profile.",
        ],
      },
    ],
    related: ["account-security"],
  },
  {
    slug: "terms",
    title: "Terms of use",
    summary: "The short version of the rules everyone on Sheda agrees to.",
    category: "Policies",
    sections: [
      {
        bullets: [
          "List only properties you own or are authorised to sell or let, with honest photos and details.",
          "Pay and agree deals through Sheda, so escrow protects both sides.",
          "Treat everyone with respect, without discrimination.",
          "Keep your account and wallet secure. Blockchain transactions can't be reversed.",
          "Sheda runs the marketplace and checks the documents it marks as verified. It doesn't guarantee any return, rent or resale price on Invest.",
        ],
      },
      {
        heading: "Questions",
        paragraphs: ["Email support@sheda.app and the team will help."],
      },
    ],
    related: ["privacy", "fees"],
  },
];

export function helpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

/** Where a screen's "Read more" goes. */
export const helpHref = (slug: string) => `/help/${slug}`;
