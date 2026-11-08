/**
 * The ranking is the one thing in Collections that makes a claim about a
 * person. If it is wrong, or quietly rewards the wrong thing, it misleads
 * someone deciding where to put money, so the arithmetic is pinned here
 * rather than eyeballed on a screen.
 *
 * It also lives in the app rather than on the server precisely so it can be
 * tested like this. A score arriving from a backend could only be checked
 * by trusting it.
 */

import {
  MIN_FINISHED_PROJECTS,
  MIN_MANDATE_MONTHS,
  TIER_LABEL,
  coverBps,
  finishedCount,
  freshnessLabel,
  rankEntries,
  scoreFor,
  summaryLine,
} from "@/services/collections/ranking";
import { describeApiError } from "@/services/collections/errors";
import type {
  CollectionChainRecord,
  CollectionDirectoryEntry,
  CollectionProfile,
  CollectionRole,
} from "@/services/api";

const record = (over: Partial<CollectionChainRecord> = {}): CollectionChainRecord => ({
  projects_on_time: 0,
  projects_late: 0,
  projects_abandoned: 0,
  projects_running: 0,
  total_raised: "0",
  stake_total: "0",
  stake_allocated: "0",
  stake_slashed_total: "0",
  slash_count: 0,
  units_managed: 0,
  let_months: 0,
  mandate_months: 0,
  rent_paid_out: "0",
  periods_paid_on_time: 0,
  periods_due: 0,
  disputes_upheld: 0,
  synced_at: null,
  ...over,
});

const profile = (
  role: CollectionRole,
  chain: Partial<CollectionChainRecord>,
  name = "Someone"
): CollectionProfile => ({
  id: Math.floor(Math.random() * 1e6),
  user_id: 1,
  role,
  display_name: name,
  near_account_id: "someone.testnet",
  location: "Lagos",
  about: null,
  since_year: 2021,
  part_of_group: null,
  suspended: false,
  kyc_verified: true,
  avatar_url: null,
  chain_record: record(chain),
  created_at: new Date().toISOString(),
});

const entry = (p: CollectionProfile): CollectionDirectoryEntry => ({
  profile: p,
  live_projects: 0,
});

describe("what counts as evidence", () => {
  it("does not treat a running job as a result either way", () => {
    const r = record({ projects_on_time: 2, projects_running: 5 });
    expect(finishedCount(r)).toBe(2);
  });

  it("measures cover against everything raised, running jobs included", () => {
    // Otherwise a builder improves the ratio simply by leaving raises open.
    const r = record({ total_raised: "176000000000000", stake_total: "52000000000000" });
    expect(coverBps(r)).toBe(2954);
  });

  it("reports no cover rather than dividing by zero", () => {
    expect(coverBps(record({ stake_total: "1000" }))).toBe(0);
  });
});

describe("a builder's score", () => {
  it("gives full marks for delivering everything on time with real cover behind it", () => {
    const score = scoreFor(
      profile("builder", {
        projects_on_time: 4,
        total_raised: "176000000000000",
        stake_total: "52000000000000",
      })
    );
    expect(score.total).toBe(100);
    expect(score.tier).toBe("excellent");
  });

  it("halves a late delivery rather than forgiving or failing it", () => {
    // The building did get built. Two on time and one late out of three.
    const score = scoreFor(
      profile("builder", { projects_on_time: 2, projects_late: 1 })
    );
    const delivery = score.components.find((c) => c.label === "Delivery");
    expect(delivery?.points).toBe(41.7);
    expect(delivery?.outOf).toBe(50);
  });

  it("keeps a strong builder below excellent when the cover is thin", () => {
    // 84.9, not 85. The boundary is worth holding: the gap between these
    // two words is the whole reason for showing a tier at all.
    const score = scoreFor(
      profile("builder", {
        projects_on_time: 2,
        projects_late: 1,
        projects_running: 1,
        total_raised: "340000000000000",
        stake_total: "62000000000000",
      })
    );
    expect(score.total).toBe(84.9);
    expect(score.tier).toBe("strong");
  });

  it("never lets an abandoned job produce a negative delivery score", () => {
    // (0 + 0.5 - 1) / 2 is below zero before clamping. A negative component
    // would subtract from the other two and let one walk away eat an
    // otherwise unrelated good record.
    const score = scoreFor(
      profile("builder", {
        projects_late: 1,
        projects_abandoned: 1,
        total_raised: "88000000000000",
        stake_total: "2400000000000",
        slash_count: 1,
      })
    );
    expect(score.components.find((c) => c.label === "Delivery")?.points).toBe(0);
    expect(score.total).toBe(15.2);
    expect(score.tier).toBe("weak");
  });

  it("scores a slash on its own so a good delivery record cannot bury it", () => {
    const clean = scoreFor(profile("builder", { projects_on_time: 4 }));
    const slashed = scoreFor(profile("builder", { projects_on_time: 4, slash_count: 1 }));
    expect(clean.components.find((c) => c.label === "Integrity")?.points).toBe(25);
    expect(slashed.components.find((c) => c.label === "Integrity")?.points).toBe(12.5);
    expect(slashed.total).toBeLessThan(clean.total);
  });

  it("floors integrity at zero however many slashes there are", () => {
    const score = scoreFor(profile("builder", { projects_on_time: 4, slash_count: 9 }));
    expect(score.components.find((c) => c.label === "Integrity")?.points).toBe(0);
  });

  it("adds up to the total it prints", () => {
    const score = scoreFor(
      profile("builder", {
        projects_on_time: 3,
        projects_late: 2,
        total_raised: "100000000000000",
        stake_total: "10000000000000",
      })
    );
    const sum = score.components.reduce((t, c) => t + c.points, 0);
    expect(Math.round(sum * 10) / 10).toBe(score.total);
  });
});

describe("a manager's score", () => {
  it("rewards keeping units let and paying on time", () => {
    const score = scoreFor(
      profile("manager", {
        units_managed: 48,
        let_months: 1012,
        mandate_months: 1104,
        periods_paid_on_time: 34,
        periods_due: 35,
      })
    );
    expect(score.total).toBe(95.7);
    expect(score.tier).toBe("excellent");
  });

  it("drops a manager who leaves units empty and misses rent periods", () => {
    const score = scoreFor(
      profile("manager", {
        units_managed: 24,
        let_months: 318,
        mandate_months: 504,
        periods_paid_on_time: 14,
        periods_due: 20,
        disputes_upheld: 1,
      })
    );
    expect(score.components.find((c) => c.label === "Occupancy")?.points).toBe(25.2);
    expect(score.components.find((c) => c.label === "Paying on time")?.points).toBe(24.5);
    expect(score.components.find((c) => c.label === "Conduct")?.points).toBe(12.5);
    expect(score.total).toBe(62.2);
    expect(score.tier).toBe("fair");
  });

  it("does not credit paying on time when nothing was ever due", () => {
    // A manager with no rent periods behind them has not demonstrated
    // paying on time; they have demonstrated nothing.
    const score = scoreFor(
      profile("manager", { mandate_months: 24, let_months: 24, periods_due: 0 })
    );
    expect(score.components.find((c) => c.label === "Paying on time")?.points).toBe(0);
  });
});

describe("too little history", () => {
  it("refuses to score a builder with fewer than two finished jobs", () => {
    // The honest answer for a new builder is that nobody knows yet. A
    // middling score would be an invention and a low one a penalty for
    // being new.
    const score = scoreFor(profile("builder", { projects_running: 1 }));
    expect(score.tier).toBe("unrated");
    expect(score.total).toBe(0);
    expect(score.unratedBecause).toContain(`at least ${MIN_FINISHED_PROJECTS}`);
  });

  it("refuses to score a manager with under a year of mandates", () => {
    const score = scoreFor(profile("manager", { mandate_months: 3 }));
    expect(score.tier).toBe("unrated");
    expect(score.unratedBecause).toContain(`at least ${MIN_MANDATE_MONTHS}`);
  });

  it("says so in words rather than showing a zero", () => {
    expect(TIER_LABEL.unrated).toBe("Not rated yet");
  });

  it("treats a profile with no chain record as unrated, not as perfect", () => {
    // An absent cache must never read as a clean record.
    const bare = { ...profile("builder", {}), chain_record: null };
    expect(scoreFor(bare).tier).toBe("unrated");
  });
});

describe("the directory order", () => {
  const good = profile("builder", { projects_on_time: 4 }, "Adeyemi Builders");
  const middling = profile("builder", { projects_on_time: 2, projects_late: 1 }, "Minimalist");
  const poor = profile(
    "builder",
    { projects_late: 1, projects_abandoned: 1, slash_count: 1 },
    "Kayode"
  );
  const fresh = profile("builder", { projects_running: 1 }, "Harbour Works");

  it("puts the best first", () => {
    const order = rankEntries([poor, good, middling].map(entry)).map(
      (r) => r.entry.profile.display_name
    );
    expect(order.slice(0, 3)).toEqual(["Adeyemi Builders", "Minimalist", "Kayode"]);
  });

  it("places every unrated profile after every ranked one, with no number", () => {
    const ranked = rankEntries([fresh, good, middling].map(entry));
    expect(ranked[ranked.length - 1].entry.profile.display_name).toBe("Harbour Works");
    // Last in the list but carrying no position: a number there would read
    // as "worst" when what it means is "no evidence".
    expect(ranked[ranked.length - 1].rank).toBeNull();
  });

  it("numbers the ranked ones from one with no gaps", () => {
    const ranks = rankEntries([good, middling, poor, fresh].map(entry))
      .filter((r) => r.rank !== null)
      .map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("orders an empty directory without complaining", () => {
    expect(rankEntries([])).toEqual([]);
  });
});

describe("how stale the counts are", () => {
  it("says plainly when nothing has ever been read from the chain", () => {
    expect(freshnessLabel(record())).toBe("Not yet read from the chain");
  });

  it("reports age in the largest unit that still reads naturally", () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(freshnessLabel(record({ synced_at: ago(30_000) }))).toContain("just now");
    expect(freshnessLabel(record({ synced_at: ago(20 * 60_000) }))).toContain("20 minutes");
    expect(freshnessLabel(record({ synced_at: ago(3 * 3_600_000) }))).toContain("3 hours");
    expect(freshnessLabel(record({ synced_at: ago(2 * 86_400_000) }))).toContain("2 days");
  });
});

describe("the one line a card shows", () => {
  it("summarises a builder by what they finished and what backs them", () => {
    const p = profile("builder", {
      projects_on_time: 3,
      projects_late: 1,
      total_raised: "100000000000000",
      stake_total: "30000000000000",
    });
    expect(summaryLine(p)).toBe("4 finished · 30% cover");
  });

  it("summarises a manager by how full their units are", () => {
    const p = profile("manager", { units_managed: 48, let_months: 50, mandate_months: 100 });
    expect(summaryLine(p)).toBe("48 units · 50% let");
  });
});

describe("what a failed request says on screen", () => {
  // The first build of this showed "[object Object]" to the reader,
  // because FastAPI returns a body and `new Error(body)` stringifies it.
  // An error message that names nothing is worse than none: it tells the
  // reader nothing and whoever is debugging it less.
  it("uses FastAPI's own detail when there is one", () => {
    expect(describeApiError({ detail: "Not Found" }, "fallback")).toBe("Not Found");
  });

  it("joins the field errors from a validation failure", () => {
    const body = {
      detail: [
        { loc: ["body", "slug"], msg: "String should have at least 2 characters" },
        { loc: ["body", "units"], msg: "Input should be greater than 0" },
      ],
    };
    expect(describeApiError(body, "fallback")).toBe(
      "String should have at least 2 characters. Input should be greater than 0"
    );
  });

  it("passes a plain string through", () => {
    expect(describeApiError("Network request failed", "fallback")).toBe(
      "Network request failed"
    );
  });

  it("never renders an object", () => {
    for (const odd of [{}, { detail: {} }, null, undefined, 42, [], { detail: [] }]) {
      const out = describeApiError(odd, "Could not load that.");
      expect(out).toBe("Could not load that.");
      expect(out).not.toContain("object Object");
    }
  });
});
