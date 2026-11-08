/**
 * The arithmetic that decides whether a raise can be opened at all.
 *
 * The phase schedule is the part worth testing hardest. A schedule that
 * does not release exactly the whole raise either strands money in escrow
 * with no phase that frees it, or promises the builder money the raise
 * never collected, and both only surface near handover when the terms can
 * no longer be changed.
 */

import {
  BPS_TOTAL,
  scheduleBalances,
  schedulePercent,
  sharePrice,
  slugify,
  trancheBps,
  tranchesToBps,
} from "@/services/collections/raiseDraft";

const phases = (...percents: string[]) =>
  percents.map((tranche, i) => ({ name: `Phase ${i + 1}`, tranche }));

describe("the phase schedule", () => {
  it("accepts a schedule that releases exactly the whole raise", () => {
    expect(scheduleBalances(phases("20", "30", "30", "20"))).toBe(true);
    expect(schedulePercent(phases("20", "30", "30", "20"))).toBe(100);
  });

  it("refuses a schedule that leaves money stranded in escrow", () => {
    expect(scheduleBalances(phases("20", "30", "30"))).toBe(false);
    expect(schedulePercent(phases("20", "30", "30"))).toBe(80);
  });

  it("refuses a schedule that promises more than the raise collects", () => {
    expect(scheduleBalances(phases("40", "40", "40"))).toBe(false);
    expect(schedulePercent(phases("40", "40", "40"))).toBe(120);
  });

  it("judges the basis points that get sent, not the decimals typed", () => {
    // This is the case the first version got wrong. These three sum to
    // exactly 100 as decimals, so a check on the percentages shows a green
    // 100% and submits. Each rounds to 3333 basis points, the total sent is
    // 9999, and the server rejects it with a figure the form never showed.
    const awkward = phases("33.333", "33.333", "33.334");
    expect(awkward.reduce((sum, p) => sum + parseFloat(p.tranche), 0)).toBeCloseTo(100, 9);
    expect(tranchesToBps(awkward)).toEqual([3333, 3333, 3333]);
    expect(scheduleBalances(awkward)).toBe(false);
    // And the form shows the real figure rather than the decimal one.
    expect(schedulePercent(awkward)).toBe(99.99);
  });

  it("allows halves and quarters of a percent, which are the ones people use", () => {
    expect(scheduleBalances(phases("33.33", "33.33", "33.34"))).toBe(true);
    expect(scheduleBalances(phases("12.5", "12.5", "25", "50"))).toBe(true);
  });

  it("treats anything unparsable as nothing rather than NaN", () => {
    // A half-typed figure must not make the total NaN, which compares
    // false against everything and would disable the button with no
    // explanation of which phase is at fault.
    expect(trancheBps("")).toBe(0);
    expect(trancheBps("abc")).toBe(0);
    expect(trancheBps("-5")).toBe(0);
    expect(schedulePercent(phases("50", ""))).toBe(50);
  });

  it("knows the denominator both sides agree on", () => {
    expect(BPS_TOTAL).toBe(10_000);
  });
});

describe("the id derived from a name", () => {
  it("matches what the backend will accept", () => {
    const pattern = /^[a-z0-9][a-z0-9-]*$/;
    for (const name of [
      "M120 Apartments",
      "Yaba Student Hostel",
      "  Lekki Terraces  ",
      "Ikoyi Heights (Phase 2)",
      "Block A & B",
    ]) {
      expect(slugify(name)).toMatch(pattern);
    }
  });

  it("does not leave a trailing or leading separator", () => {
    expect(slugify("Ikoyi Heights (Phase 2)")).toBe("ikoyi-heights-phase-2");
    expect(slugify("  Lekki  ")).toBe("lekki");
    expect(slugify("Block A & B")).toBe("block-a-b");
  });

  it("stays inside the column it is stored in", () => {
    expect(slugify("A".repeat(200)).length).toBeLessThanOrEqual(48);
  });
});

describe("what a single share costs", () => {
  it("divides the whole price by the share count", () => {
    // 18,000,000 naira at six decimals over 10,000 shares.
    expect(sharePrice("18000000000000", "10000")).toBe("1800000000");
  });

  it("floors rather than rounding up", () => {
    // A share cannot cost a fraction of the smallest unit the coin has,
    // and rounding up would price the unit above what it is worth.
    expect(sharePrice("10001", "10000")).toBe("1");
  });

  it("returns nothing rather than dividing by zero", () => {
    expect(sharePrice("18000000000000", "0")).toBeNull();
    expect(sharePrice("18000000000000", "")).toBeNull();
    expect(sharePrice(null, "10000")).toBeNull();
  });

  it("handles a price past what a JavaScript number holds exactly", () => {
    // 2**53 is about 9.0e15. A large raise crosses it, and through a
    // number the result would come back wrong rather than merely rounded.
    const huge = "90071992547409920000";
    expect(sharePrice(huge, "10000")).toBe("9007199254740992");
  });
});
