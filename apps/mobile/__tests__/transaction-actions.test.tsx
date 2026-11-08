// @ts-nocheck — Test file with Jest mocks
//
// Locks the deal-lifecycle action matrix: for every phase, the party whose
// turn it is must be offered the action that advances the deal, and the other
// party must not be. These are the buttons that drive the on-chain calls
// (accept/reject bid, release & confirm documents, release payment, complete,
// dispute), so a card silently rendering no actions strands a live deal with
// funds in escrow and no way forward.
//
// Guards specifically against tab/card routing regressions: the Cancelled tab
// used to fall through to this card, and SellerActivities rendered every tab
// with it.
import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    walletState: { account: { accountId: "seller.testnet" } },
    getAuthorizedPrivateKey: jest.fn(),
    currentNetwork: "testnet",
  }),
}));
jest.mock("@/contexts/ApiContext", () => ({
  useApi: () => ({ sendTransactionUpdate: jest.fn(), getUserByWallet: jest.fn() }),
}));
jest.mock("@/contexts/NotificationContext", () => ({
  useNotifications: () => ({ addNotification: jest.fn() }),
}));
jest.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatPrice: (n) => `$${n}`, formatUsd: (n) => `$${n}` }),
}));
jest.mock("@/hooks/useExchangeRates", () => ({
  useExchangeRates: () => ({ ngnPerUsd: 1500, nearUsd: 3 }),
}));
jest.mock("@/hooks/useTransactionToast", () => ({
  useTransactionToast: () => ({ run: jest.fn() }),
}));
jest.mock("@/services/nearContract", () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
  NearContractService: { parseContractError: (m) => m },
}));
jest.mock("@/components/common/PriceDisplay", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>price</Text> };
});
jest.mock("@/components/common/Icon", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>icon</Text> };
});
jest.mock("@/components/common/ProfileVisibilityCard", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>profile</Text> };
});
jest.mock("@/components/RatingModal", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>rating-modal</Text> };
});

import OngoingCard from "@/components/history/OngoingCard";
import ActiveCard from "@/components/history/ActiveCard";
import { TransactionPhase } from "@/types/transaction";
import { Action, BidStatus } from "@/types/contract";

const HOUR = 60 * 60 * 1000;

function makeTransaction(phase, role, over = {}) {
  return {
    key: "1:1",
    phase,
    role,
    updatedAt: Date.now(),
    // Well clear of the 24h escrow timelock so "Release Payment" is unlocked.
    completedAt: Date.now() - 48 * HOUR,
    bid: {
      id: 1,
      property_id: 1,
      bidder_id: "buyer.testnet",
      bid_amount: "1500000000",
      stablecoin_token: "usdc.fakes.testnet",
      action: Action.Purchase,
      created_at: Date.now() * 1e6,
      status: BidStatus.Pending,
      // 24h+ in the past, so the escrow timelock has elapsed.
      escrow_release_after: (Date.now() - 48 * HOUR) * 1e6,
      // Bid expiry still in the future — not an expired bid.
      expires_at: (Date.now() + 72 * HOUR) * 1e6,
      ...over.bid,
    },
    property: {
      id: 1,
      owner_id: "seller.testnet",
      description: "3-bed in Lekki",
      metadata_uri: "",
      is_for_sale: true,
      price: "1500000000",
      lease_duration_months: null,
      damage_deposit_required: "0",
      active_lease: null,
      timestamp: Date.now() * 1e6,
      sold: null,
      stablecoin_token: "usdc.fakes.testnet",
      ...over.property,
    },
    propertyDetails: null,
    ...over,
  };
}

function labelsFor(phase, role, over) {
  let tree;
  act(() => {
    tree = renderer.create(
      <OngoingCard
        transaction={makeTransaction(phase, role, over)}
        onPhaseUpdate={jest.fn()}
      />
    );
  });
  return JSON.stringify(tree.toJSON());
}

describe("seller actions per phase", () => {
  it("can accept or reject a new bid", () => {
    const out = labelsFor(TransactionPhase.BID_PENDING, "seller");
    expect(out).toContain("Accept Bid");
    expect(out).toContain("Reject");
  });

  it("can accept or reject a booked appointment", () => {
    const out = labelsFor(TransactionPhase.APPOINTMENT_BOOKED, "seller");
    expect(out).toContain("Accept Appointment");
    expect(out).toContain("Reject");
  });

  it("can release documents once the appointment is confirmed", () => {
    expect(labelsFor(TransactionPhase.APPOINTMENT_ACCEPTED, "seller")).toContain(
      "Release Documents"
    );
  });

  it("can complete the deal after payment is released", () => {
    expect(labelsFor(TransactionPhase.PAYMENT_RELEASED, "seller")).toContain("Complete");
  });

  it("can raise a dispute once documents are confirmed", () => {
    expect(labelsFor(TransactionPhase.DOCS_CONFIRMED, "seller")).toContain("Raise Dispute");
  });

  it("is not offered the buyer's actions while waiting", () => {
    const out = labelsFor(TransactionPhase.DOCS_RELEASED, "seller");
    expect(out).not.toContain("Confirm Documents");
    expect(out).not.toContain("Release Payment");
  });
});

describe("buyer actions per phase", () => {
  it("can cancel a bid that has not expired", () => {
    const out = labelsFor(TransactionPhase.BID_PENDING, "buyer");
    expect(out).toContain("Cancel Bid");
    expect(out).not.toContain("Reclaim Funds");
  });

  it("is offered a refund instead once the bid has expired", () => {
    // Funds sit in escrow past expiry and nothing refunds them automatically,
    // so "Cancel Bid" would understate what the buyer actually needs here.
    const out = labelsFor(TransactionPhase.BID_PENDING, "buyer", {
      bid: { expires_at: (Date.now() - HOUR) * 1e6 },
    });
    expect(out).toContain("Reclaim Funds");
    expect(out).not.toContain("Cancel Bid");
  });

  it("can book an appointment once the bid is accepted", () => {
    expect(labelsFor(TransactionPhase.BID_ACCEPTED, "buyer")).toContain("Book Appointment");
  });

  it("can confirm documents once they are released", () => {
    expect(labelsFor(TransactionPhase.DOCS_RELEASED, "buyer")).toContain("Confirm Documents");
  });

  it("can release payment once the escrow timelock has elapsed", () => {
    expect(labelsFor(TransactionPhase.DOCS_CONFIRMED, "buyer")).toContain("Release Payment");
  });

  it("cannot release payment while the escrow is still locked", () => {
    const out = labelsFor(TransactionPhase.DOCS_CONFIRMED, "buyer", {
      bid: { escrow_release_after: (Date.now() + 12 * HOUR) * 1e6 },
    });
    expect(out).not.toContain("Release Payment");
  });

  it("can complete the deal after releasing payment", () => {
    expect(labelsFor(TransactionPhase.PAYMENT_RELEASED, "buyer")).toContain("Complete");
  });

  it("is not offered the seller's actions while waiting", () => {
    const out = labelsFor(TransactionPhase.APPOINTMENT_ACCEPTED, "buyer");
    expect(out).not.toContain("Release Documents");
    expect(out).not.toContain("Accept Bid");
  });
});

describe("phase-to-tab reachability", () => {
  // useTransactions derives `ongoing` by exclusion, so any phase it does not
  // exclude reaches OngoingCard and keeps its actions. PAYMENT_RELEASED is the
  // one that matters: it is ALSO in `completed` (the Active tab), whose card
  // has no Complete button — so Ongoing is the only place the deal can be
  // finished from, for both roles.
  const excludedFromOngoing = [
    TransactionPhase.COMPLETED,
    TransactionPhase.BID_REJECTED,
    TransactionPhase.CANCELLED,
    TransactionPhase.DISPUTED,
  ];

  it("keeps PAYMENT_RELEASED in the Ongoing tab so it can still be completed", () => {
    expect(excludedFromOngoing).not.toContain(TransactionPhase.PAYMENT_RELEASED);
    expect(labelsFor(TransactionPhase.PAYMENT_RELEASED, "seller")).toContain("Complete");
    expect(labelsFor(TransactionPhase.PAYMENT_RELEASED, "buyer")).toContain("Complete");
  });

  it("offers no lifecycle actions on a disputed deal", () => {
    // Escrow is frozen; resolve_dispute is contract-owner only and has no UI.
    const out = labelsFor(TransactionPhase.DISPUTED, "seller");
    expect(out).not.toContain("Complete");
    expect(out).not.toContain("Accept Bid");
  });
});

describe("ActiveCard actions", () => {
  function activeLabels(role) {
    let tree;
    act(() => {
      tree = renderer.create(
        <ActiveCard
          transaction={makeTransaction(TransactionPhase.COMPLETED, role)}
          onPhaseUpdate={jest.fn()}
        />
      );
    });
    return JSON.stringify(tree.toJSON());
  }

  it("lets the buyer rate a completed deal", () => {
    // The rating action used to be gated on `phase === DISPUTED`, which this
    // card can never see (its tab only ever holds COMPLETED), so the entry
    // point and the RatingModal behind it were both unreachable.
    expect(activeLabels("buyer")).toContain("Rate Property");
  });

  it("gives the seller details rather than a rating prompt", () => {
    const out = activeLabels("seller");
    expect(out).toContain("View Details");
    expect(out).not.toContain("Rate Property");
  });

  it("offers Raise Dispute to both parties", () => {
    expect(activeLabels("buyer")).toContain("Raise Dispute");
    expect(activeLabels("seller")).toContain("Raise Dispute");
  });
});
