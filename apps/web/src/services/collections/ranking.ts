/**
 * How a builder or a manager is ranked.
 *
 * This file is deliberately the client's and not the server's. A score
 * beside someone's name on a platform where people commit money is not
 * decoration, and the product tells people Sheda does not adjust these
 * numbers. That claim only holds if the scoring lives somewhere a reader
 * can audit, computing from counts the chain already published, rather
 * than arriving from a server as a figure to be trusted.
 *
 * Three rules follow from that and run through everything below.
 *
 * 1. Only facts the chain records are inputs. Raises completed, completed
 *    late, abandoned; stake posted and stake slashed; rent credited; months
 *    a unit sat empty. No survey, no editorial judgement, nothing self
 *    reported. The backend caches these counts; it does not invent them.
 * 2. Every component is returned with the input that produced it, so a
 *    profile can show its working instead of handing down a verdict.
 * 3. Below a minimum history there is no score at all. A builder with one
 *    finished project is not excellent and is not poor, and a rank built on
 *    a sample that small misleads in whichever direction it lands.
 */

import type {
  CollectionChainRecord,
  CollectionDirectoryEntry,
  CollectionProfile,
  CollectionRole,
} from "@/services/api";

export type Tier = "excellent" | "strong" | "fair" | "weak" | "unrated";

export interface ScoreComponent {
  label: string;
  points: number;
  outOf: number;
  /** The fact this was computed from, in words a reader can check. */
  basis: string;
}

export interface Score {
  total: number;
  tier: Tier;
  components: ScoreComponent[];
  /** Set when there is too little history to rank. Says what is missing. */
  unratedBecause?: string;
}

/**
 * A builder needs two finished jobs before a score means anything, and a
 * manager needs a year of mandates.
 */
export const MIN_FINISHED_PROJECTS = 2;
export const MIN_MANDATE_MONTHS = 12;

/** Full marks for cover at this ratio of everything ever raised. */
const COVER_FOR_FULL_MARKS_BPS = 2500;

export const TIER_LABEL: Record<Tier, string> = {
  excellent: "Excellent",
  strong: "Strong",
  fair: "Fair",
  weak: "Weak",
  unrated: "Not rated yet",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 10) / 10;

function tierFor(total: number): Tier {
  if (total >= 85) return "excellent";
  if (total >= 70) return "strong";
  if (total >= 55) return "fair";
  return "weak";
}

const EMPTY: CollectionChainRecord = {
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
};

export const recordOf = (profile: CollectionProfile): CollectionChainRecord =>
  profile.chain_record ?? EMPTY;

/** Jobs with an outcome. A running job is not evidence either way. */
export const finishedCount = (r: CollectionChainRecord): number =>
  r.projects_on_time + r.projects_late + r.projects_abandoned;

/**
 * Cover posted as a proportion of everything ever raised, in basis points.
 *
 * Computed over the whole book including live raises, so a builder cannot
 * improve the ratio simply by leaving raises open.
 */
export function coverBps(r: CollectionChainRecord): number {
  try {
    const raised = BigInt(r.total_raised || "0");
    if (raised <= 0n) return 0;
    return Number((BigInt(r.stake_total || "0") * 10_000n) / raised);
  } catch {
    return 0;
  }
}

function scoreBuilder(r: CollectionChainRecord): Score {
  const done = finishedCount(r);
  if (done < MIN_FINISHED_PROJECTS) {
    return {
      total: 0,
      tier: "unrated",
      components: [],
      unratedBecause: `${done} finished ${
        done === 1 ? "project" : "projects"
      } on Sheda. A rank needs at least ${MIN_FINISHED_PROJECTS}.`,
    };
  }

  // Delivery. A late job still produced the building, so it counts for half.
  // An abandoned one counts against, because the alternative lets a builder
  // dilute a walk away simply by opening more raises. Clamped at zero so a
  // failure cannot turn negative and eat the other two components.
  const deliveryRatio = clamp(
    (r.projects_on_time + 0.5 * r.projects_late - r.projects_abandoned) / done,
    0,
    1
  );
  const delivery = deliveryRatio * 50;

  // Cover. Stake posted is the only part of a promise that costs the person
  // making it anything, which is why it carries a quarter of the score.
  const cover = clamp(coverBps(r) / COVER_FOR_FULL_MARKS_BPS, 0, 1) * 25;

  // Integrity. Money actually taken from them for a failure. A heavier fact
  // than a late handover, scored on its own so a good delivery record cannot
  // bury it.
  const integrity = Math.max(0, 25 - 12.5 * r.slash_count);

  const components: ScoreComponent[] = [
    {
      label: "Delivery",
      points: round(delivery),
      outOf: 50,
      basis: `${r.projects_on_time} on time, ${r.projects_late} late, ${r.projects_abandoned} abandoned, of ${done} finished`,
    },
    {
      label: "Cover posted",
      points: round(cover),
      outOf: 25,
      basis: `${(coverBps(r) / 100).toFixed(1)}% of everything raised is backed by their own stake`,
    },
    {
      label: "Integrity",
      points: round(integrity),
      outOf: 25,
      basis:
        r.slash_count === 0
          ? "No stake has ever been slashed"
          : `Stake slashed ${r.slash_count} ${r.slash_count === 1 ? "time" : "times"}`,
    },
  ];

  const total = round(components.reduce((sum, c) => sum + c.points, 0));
  return { total, tier: tierFor(total), components };
}

function scoreManager(r: CollectionChainRecord): Score {
  if (r.mandate_months < MIN_MANDATE_MONTHS) {
    return {
      total: 0,
      tier: "unrated",
      components: [],
      unratedBecause: `${r.mandate_months} months of mandates. A rank needs at least ${MIN_MANDATE_MONTHS}.`,
    };
  }

  // Occupancy and rent are the two things this score is mostly made of.
  // With neither indexed, every manager would score as weak on the same
  // missing data, which reads as a verdict on them rather than a gap in
  // what Sheda has read. Wait for the first rent period instead.
  if (r.periods_due === 0) {
    return {
      total: 0,
      tier: "unrated",
      components: [],
      unratedBecause:
        "No rent periods have been indexed for their mandates yet. A rank needs at least one.",
    };
  }

  // Occupancy. The one thing a holder feels directly, because an empty flat
  // pays nothing however well it is looked after.
  const occupancy = clamp(r.let_months / r.mandate_months, 0, 1) * 40;

  // Paying on time. Rent that arrives but is never credited is rent the
  // holder does not have, so a missed period is a failure even where no
  // money went astray.
  const payRatio =
    r.periods_due > 0 ? clamp(r.periods_paid_on_time / r.periods_due, 0, 1) : 0;
  const paying = payRatio * 35;

  const conduct = Math.max(0, 25 - 12.5 * r.disputes_upheld);

  const components: ScoreComponent[] = [
    {
      label: "Occupancy",
      points: round(occupancy),
      outOf: 40,
      basis: `Let for ${r.let_months} of ${r.mandate_months} unit months under mandate`,
    },
    {
      label: "Paying on time",
      points: round(paying),
      outOf: 35,
      basis: `${r.periods_paid_on_time} of ${r.periods_due} rent periods credited without a gap`,
    },
    {
      label: "Conduct",
      points: round(conduct),
      outOf: 25,
      basis:
        r.disputes_upheld === 0
          ? "No dispute has been upheld against them"
          : `${r.disputes_upheld} dispute${r.disputes_upheld === 1 ? "" : "s"} upheld by a holder vote`,
    },
  ];

  const total = round(components.reduce((sum, c) => sum + c.points, 0));
  return { total, tier: tierFor(total), components };
}

export function scoreFor(profile: CollectionProfile): Score {
  const record = recordOf(profile);
  return profile.role === "builder" ? scoreBuilder(record) : scoreManager(record);
}

export interface RankedEntry {
  entry: CollectionDirectoryEntry;
  score: Score;
  /** Null where there is not enough history to place them. */
  rank: number | null;
}

/**
 * Order a directory, best first, with every unrated profile after every
 * ranked one.
 *
 * Unrated sits last not because it is bad but because the list is ordered
 * by evidence and there is none yet. Placing those profiles among the
 * scores would invent a standing they have not earned, and giving them a
 * position at the bottom would read as "worst" when it means "no one
 * knows".
 */
export function rankEntries(entries: CollectionDirectoryEntry[]): RankedEntry[] {
  const scored = entries.map((entry) => ({ entry, score: scoreFor(entry.profile) }));

  const rated: RankedEntry[] = scored
    .filter((s) => s.score.tier !== "unrated")
    .sort((a, b) => b.score.total - a.score.total)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const unrated: RankedEntry[] = scored
    .filter((s) => s.score.tier === "unrated")
    .sort((a, b) => a.entry.profile.display_name.localeCompare(b.entry.profile.display_name))
    .map((s) => ({ ...s, rank: null }));

  return [...rated, ...unrated];
}

/**
 * How stale the counts behind a score are.
 *
 * Shown rather than hidden. A rank computed from a cache nobody has
 * refreshed in a week is still worth seeing, but only if the reader knows
 * that is what they are looking at.
 */
export function freshnessLabel(record: CollectionChainRecord): string {
  if (!record.synced_at) return "Not yet read from the chain";
  const ms = Date.now() - new Date(record.synced_at).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return "Read from the chain just now";
  if (minutes < 60) return `Read from the chain ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Read from the chain ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Read from the chain ${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The one line a card uses to summarise what a profile has actually done. */
export function summaryLine(profile: CollectionProfile): string {
  const r = recordOf(profile);
  if (profile.role === "builder") {
    return `${finishedCount(r)} finished · ${(coverBps(r) / 100).toFixed(0)}% cover`;
  }
  const occupancy =
    r.mandate_months > 0 ? Math.round((r.let_months / r.mandate_months) * 100) : 0;
  return `${r.units_managed} units · ${occupancy}% let`;
}

export const ROLE_LABEL: Record<CollectionRole, string> = {
  builder: "Builder",
  manager: "Property manager",
};
