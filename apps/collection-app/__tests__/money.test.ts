// @ts-nocheck
//
// Test file.
//
// Money is handled as integer strings and BigInt throughout, never as
// `Number`. Above 2^53 a JavaScript number stops being exact, and a share
// count or a property price in atomic units reaches that easily, which is
// how an app ends up showing a holder a figure the chain disagrees with.
import {
  amountForShares,
  bpsToPercent,
  formatMoney,
  naira,
  ownershipBps,
  parseMoney,
  sharesForAmount,
} from "@/services/money";

describe("showing an amount", () => {
  it("groups thousands and trims trailing zeros", () => {
    expect(formatMoney("1234500")).toBe("1.23");
    expect(formatMoney("250000000000")).toBe("250,000");
    expect(formatMoney("1000000")).toBe("1");
    // A kobo figure keeps both places. Trimming this to "10,758.6" is what
    // a formatter built for numbers does, and it is not how money is read.
    expect(formatMoney("10758600000")).toBe("10,758.60");
    // Below the places on display, decimals are dropped rather than shown
    // as a misleading .00.
    expect(formatMoney("1004000")).toBe("1");
  });

  it("survives a figure larger than a JavaScript number can hold exactly", () => {
    // 2^53 is 9007199254740992. A Number round-trip would corrupt this.
    const huge = "90071992547409929999";
    expect(formatMoney(huge, 0)).toBe("90,071,992,547,409");
  });

  it("does not throw on nonsense", () => {
    expect(formatMoney("")).toBe("0");
    expect(formatMoney("not a number")).toBe("0");
  });

  it("puts the currency in front", () => {
    expect(naira("250000000000", 0)).toBe("₦250,000");
  });
});

describe("reading an amount someone typed", () => {
  it("accepts the ways people actually write money", () => {
    expect(parseMoney("250000")).toBe("250000000000");
    expect(parseMoney("₦250,000")).toBe("250000000000");
    expect(parseMoney("1.5")).toBe("1500000");
  });

  it("refuses what it cannot represent", () => {
    // More precision than the coin has is a rounding decision in disguise,
    // so it is rejected rather than silently truncated.
    expect(parseMoney("1.1234567")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(".")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});

describe("what a stake buys", () => {
  const price = "18000000000000"; // ₦18,000,000
  const shares = "10000";

  it("converts money to whole shares", () => {
    // ₦250,000 of an ₦18m flat split into 10,000 shares.
    expect(sharesForAmount("250000000000", price, shares)).toBe("138");
  });

  it("rounds down, because part of a share is not a thing", () => {
    const amount = amountForShares("1", price, shares); // one share exactly
    const justUnder = (BigInt(amount) - 1n).toString();
    expect(sharesForAmount(justUnder, price, shares)).toBe("0");
  });

  it("round-trips a whole number of shares", () => {
    const cost = amountForShares("250", price, shares);
    expect(sharesForAmount(cost, price, shares)).toBe("250");
  });

  it("returns zero rather than dividing by zero", () => {
    expect(sharesForAmount("1000", "0", shares)).toBe("0");
    expect(sharesForAmount("1000", price, "0")).toBe("0");
  });
});

describe("how much of a unit someone owns", () => {
  it("reports basis points the way the contract does", () => {
    // The contract exposes ownership_bps; computing it identically here is
    // what stops the app and the chain showing two different numbers.
    expect(ownershipBps("1250", "10000")).toBe(1250);
    expect(ownershipBps("139", "10000")).toBe(139);
  });

  it("is zero when nothing has been issued", () => {
    expect(ownershipBps("0", "0")).toBe(0);
  });

  it("reads as a percentage", () => {
    expect(bpsToPercent(1250)).toBe("12.5%");
    expect(bpsToPercent(10000)).toBe("100%");
  });
});
