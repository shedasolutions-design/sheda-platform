// @ts-nocheck
//
// Test file.
//
// The ranking is the one thing in this app that makes a claim about a
// person. If it is wrong, or if it quietly rewards the wrong thing, it
// misleads someone deciding where to put money, so the arithmetic is
// pinned here rather than eyeballed on a screen.
import {
  PEOPLE,
  TIER_LABEL,
  coverBps,
  finished,
  getPerson,
  ranked,
  scoreFor,
  totalRaised,
  worksWith,
} from "../services/people";

const by = (id) => getPerson(id);

describe("what counts as evidence", () => {
  it("does not treat a job still running as a result either way", () => {
    const minimalist = by("minimalist");
    expect(minimalist.record).toHaveLength(4);
    expect(finished(minimalist)).toHaveLength(3);
  });

  it("counts everything ever raised, running jobs included, as the base for cover", () => {
    // Cover is a promise against the whole book, not only the closed part
    // of it, so a builder cannot improve the ratio by leaving raises open.
    expect(totalRaised(by("adeyemi"))).toBe("176000000000000");
    expect(coverBps(by("adeyemi"))).toBe(2954);
  });
});

describe("a builder's score", () => {
  it("gives full marks to a builder who delivered everything on time and posted real cover", () => {
    const score = scoreFor(by("adeyemi"));
    expect(score.total).toBe(100);
    expect(score.tier).toBe("excellent");
  });

  it("halves a late delivery rather than forgiving or failing it", () => {
    // Two on time and one late out of three. The building did get built.
    const score = scoreFor(by("minimalist"));
    const delivery = score.components.find((c) => c.label === "Delivery");
    expect(delivery.points).toBe(41.7);
    expect(delivery.outOf).toBe(50);
  });

  it("keeps a strong builder below excellent when their cover is thin", () => {
    // 84.9, not 85. The boundary is worth holding: the difference between
    // these two words is the whole point of showing a tier at all.
    const score = scoreFor(by("minimalist"));
    expect(score.total).toBe(84.9);
    expect(score.tier).toBe("strong");
  });

  it("never lets an abandoned job produce a negative delivery score", () => {
    // One late and one abandoned scores (0 + 0.5 - 1) / 2, which is below
    // zero before clamping. A negative component would subtract from the
    // other two and let a walk away eat an unrelated good record.
    const score = scoreFor(by("kayode"));
    const delivery = score.components.find((c) => c.label === "Delivery");
    expect(delivery.points).toBe(0);
    expect(score.total).toBe(15.2);
    expect(score.tier).toBe("weak");
  });

  it("scores a slash separately so a good delivery record cannot bury it", () => {
    const integrity = scoreFor(by("kayode")).components.find((c) => c.label === "Integrity");
    expect(integrity.points).toBe(12.5);
    expect(integrity.basis).toContain("slashed 1 time");
  });

  it("adds up to the total it prints", () => {
    for (const person of PEOPLE) {
      const score = scoreFor(person);
      if (score.tier === "unrated") continue;
      const sum = score.components.reduce((t, c) => t + c.points, 0);
      expect(Math.round(sum * 10) / 10).toBe(score.total);
    }
  });
});

describe("a manager's score", () => {
  it("rewards keeping units let and paying on time", () => {
    const score = scoreFor(by("lagos-property"));
    expect(score.total).toBe(95.7);
    expect(score.tier).toBe("excellent");
  });

  it("drops a manager who leaves units empty and misses rent periods", () => {
    const score = scoreFor(by("kayode-facilities"));
    expect(score.components.find((c) => c.label === "Occupancy").points).toBe(25.2);
    expect(score.components.find((c) => c.label === "Paying on time").points).toBe(24.5);
    expect(score.total).toBe(62.2);
    expect(score.tier).toBe("fair");
  });

  it("counts an upheld dispute against conduct", () => {
    const conduct = scoreFor(by("kayode-facilities")).components.find(
      (c) => c.label === "Conduct"
    );
    expect(conduct.points).toBe(12.5);
  });
});

describe("too little history", () => {
  it("refuses to score a builder with fewer than two finished jobs", () => {
    // The honest answer for a new builder is that nobody knows yet. A
    // middling score here would be an invention, and a low one would be a
    // penalty for being new.
    const score = scoreFor(by("harbour"));
    expect(score.tier).toBe("unrated");
    expect(score.total).toBe(0);
    expect(score.unratedBecause).toContain("at least 2");
  });

  it("refuses to score a manager with under a year of mandates", () => {
    const score = scoreFor(by("riverside-fm"));
    expect(score.tier).toBe("unrated");
    expect(score.unratedBecause).toContain("at least 12");
  });

  it("says so in words rather than showing a zero", () => {
    expect(TIER_LABEL.unrated).toBe("Not rated yet");
  });
});

describe("the directory order", () => {
  it("puts the best first", () => {
    const order = ranked("builder").map((e) => e.person.id);
    expect(order.slice(0, 3)).toEqual(["adeyemi", "minimalist", "kayode"]);
  });

  it("places every unrated profile after every ranked one, with no rank number", () => {
    const builders = ranked("builder");
    const unrated = builders.filter((e) => e.rank === null);
    expect(unrated.map((e) => e.person.id)).toEqual(["harbour"]);
    // It is last in the list but carries no position, because a number
    // there would read as "worst" when it means "no evidence".
    expect(builders[builders.length - 1].rank).toBeNull();
  });

  it("numbers the ranked ones from one with no gaps", () => {
    const ranks = ranked("manager")
      .filter((e) => e.rank !== null)
      .map((e) => e.rank);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("keeps builders and managers in separate tables", () => {
    expect(ranked("builder").every((e) => e.person.kind === "builder")).toBe(true);
    expect(ranked("manager").every((e) => e.person.kind === "manager")).toBe(true);
  });
});

describe("who works with whom", () => {
  it("finds the manager attached to a builder's projects", () => {
    expect(worksWith(by("minimalist")).map((p) => p.id)).toContain("lagos-property");
  });

  it("does not list a person as working with themselves", () => {
    expect(worksWith(by("minimalist")).map((p) => p.id)).not.toContain("minimalist");
  });
});
