// @ts-nocheck — Test file with Jest mocks
//
// Regression test for the history tabs rendering the wrong card.
//
// HistoryList used to pick its card with a nested ternary that had no
// "cancelled" branch, so the Cancelled tab fell through to OngoingCard — the
// card built to drive a *live* bid/escrow flow. SellerActivities was worse:
// it passed no cardType at all, so every one of its tabs rendered
// OngoingCard. A rejected bid and a running escrow are different records and
// must not share a card.
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";

jest.mock("@/components/history/OngoingCard", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>ONGOING_CARD</Text> };
});
jest.mock("@/components/history/ActiveCard", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>ACTIVE_CARD</Text> };
});
jest.mock("@/components/history/ExpireCard", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>EXPIRE_CARD</Text> };
});
jest.mock("@/components/history/CancelledCard", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>CANCELLED_CARD</Text> };
});

import TransactionList from "@/components/history/HistoryList";

const transaction = { key: "1:1" };

function renderWith(cardType) {
  let tree;
  act(() => {
    tree = renderer.create(
      <TransactionList
        transactions={[transaction]}
        onPhaseUpdate={jest.fn()}
        cardType={cardType}
      />
    );
  });
  return JSON.stringify(tree.toJSON());
}

describe("history card routing", () => {
  it("renders CancelledCard for the Cancelled tab, not the live-flow card", () => {
    const output = renderWith("cancelled");
    expect(output).toContain("CANCELLED_CARD");
    expect(output).not.toContain("ONGOING_CARD");
  });

  it("routes each remaining tab to its own card", () => {
    expect(renderWith("ongoing")).toContain("ONGOING_CARD");
    expect(renderWith("active")).toContain("ACTIVE_CARD");
    expect(renderWith("expired")).toContain("EXPIRE_CARD");
  });

  it("falls back to OngoingCard when no card type is given", () => {
    let tree;
    act(() => {
      tree = renderer.create(
        <TransactionList transactions={[transaction]} onPhaseUpdate={jest.fn()} />
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain("ONGOING_CARD");
  });

  it("renders nothing for an empty list", () => {
    let tree;
    act(() => {
      tree = renderer.create(
        <TransactionList transactions={[]} onPhaseUpdate={jest.fn()} cardType="cancelled" />
      );
    });
    expect(tree.toJSON()).toBeNull();
  });
});
