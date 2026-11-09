/**
 * Builders and property managers, and how they are ranked.
 *
 * A score next to someone's name on a platform where people commit money is
 * not decoration. Read as authoritative, a number nobody can account for is
 * worse than no number, so three rules hold throughout:
 *
 * 1. Only facts the chain already records feed the score. Raises completed,
 *    completed late, abandoned; stake posted and stake slashed; phases
 *    attested; rent credited; months a unit sat empty. No survey, no
 *    editorial judgement, nothing self reported.
 * 2. Every component is published with the input that produced it, so the
 *    profile can show its working rather than hand down a verdict.
 * 3. Below a minimum history there is no score at all. A builder with one
 *    finished project is not excellent and is not poor, and a rank built on
 *    a sample that small misleads in whichever direction it lands. Those
 *    profiles read "Not rated yet" and say what is still missing.
 *
 * Stage 3 moves the inputs on chain. These shapes are what the contract will
 * return, so the screens are written against the real interface now.
 */

export type PersonKind = "builder" | "manager";

/** A finished or running job, as the chain saw it. */
export interface TrackRecordEntry {
  projectId: string;
  name: string;
  location: string;
  /** Total raised for it, atomic units. */
  raised: string;
  year: number;
  outcome: "on-time" | "late" | "abandoned" | "running";
  /** Months past the published handover date. Only for a late delivery. */
  monthsLate?: number;
}

/** Stake held against a profile, mirroring the stake registry's Profile. */
export interface StakeProfile {
  total: string;
  allocated: string;
  free: string;
  slashedTotal: string;
  slashCount: number;
}

/** What a manager's mandates have actually done. */
export interface ManagementRecord {
  unitsManaged: number;
  /** Unit months let, against unit months under mandate. */
  letMonths: number;
  mandateMonths: number;
  /** Rent passed through to holders, atomic units. */
  rentPaidOut: string;
  /** Income periods credited without a gap, against periods due. */
  periodsPaidOnTime: number;
  periodsDue: number;
  /** Disputes a holder vote upheld against them. */
  disputesUpheld: number;
}

export interface Person {
  id: string;
  name: string;
  kind: PersonKind;
  accountId: string;
  location: string;
  /** Year they first raised or took a mandate on Sheda. */
  since: number;
  about: string;
  record: TrackRecordEntry[];
  stake: StakeProfile;
  /** Managers only. Absent for builders. */
  management?: ManagementRecord;
  /** Set where the manager belongs to the builder's own group. See R2. */
  partOfGroup?: string;
}

// ---- scoring ---------------------------------------------------------------

export type Tier = "excellent" | "strong" | "fair" | "weak" | "unrated";

export interface ScoreComponent {
  label: string;
  /** Points awarded, out of `outOf`. */
  points: number;
  outOf: number;
  /** The fact this was computed from, in words a reader can check. */
  basis: string;
}

export interface Score {
  total: number;
  tier: Tier;
  components: ScoreComponent[];
  /** Set when there is too little history to rank. Explains what is missing. */
  unratedBecause?: string;
}

/**
 * A builder needs two finished jobs before a score means anything, and a
 * manager needs a year of mandates. Below that the honest output is that
 * there is nothing yet to go on.
 */
const MIN_FINISHED_PROJECTS = 2;
const MIN_MANDATE_MONTHS = 12;

/** Full marks for cover at this ratio of everything ever raised. */
const COVER_FOR_FULL_MARKS_BPS = 2500;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 10) / 10;

function tierFor(total: number): Tier {
  if (total >= 85) return "excellent";
  if (total >= 70) return "strong";
  if (total >= 55) return "fair";
  return "weak";
}

export const TIER_LABEL: Record<Tier, string> = {
  excellent: "Excellent",
  strong: "Strong",
  fair: "Fair",
  weak: "Weak",
  unrated: "Not rated yet",
};

/** Jobs that have an outcome. A running job is not evidence either way. */
export const finished = (p: Person) => p.record.filter((r) => r.outcome !== "running");

/**
 * Cover posted, as a proportion of everything this builder has ever raised,
 * in basis points. The stake registry reports the same ratio per project;
 * this is the profile wide version a directory can sort on.
 */
export function coverBps(person: Person): number {
  try {
    const raised = person.record.reduce((sum, r) => sum + BigInt(r.raised), 0n);
    if (raised <= 0n) return 0;
    return Number((BigInt(person.stake.total) * 10_000n) / raised);
  } catch {
    return 0;
  }
}

function scoreBuilder(person: Person): Score {
  const done = finished(person);
  const onTime = done.filter((r) => r.outcome === "on-time").length;
  const late = done.filter((r) => r.outcome === "late").length;
  const abandoned = done.filter((r) => r.outcome === "abandoned").length;

  if (done.length < MIN_FINISHED_PROJECTS) {
    return {
      total: 0,
      tier: "unrated",
      components: [],
      unratedBecause: `${done.length} finished ${
        done.length === 1 ? "project" : "projects"
      } on Sheda. A rank needs at least ${MIN_FINISHED_PROJECTS}.`,
    };
  }

  // Delivery. A late job still produced the building, so it counts for half.
  // An abandoned one counts against, because the alternative lets a builder
  // dilute a walk away simply by opening more raises.
  const deliveryRatio = clamp((onTime + 0.5 * late - abandoned) / done.length, 0, 1);
  const delivery = deliveryRatio * 50;

  // Cover. Stake posted is the only part of a promise that costs the person
  // making it anything, which is why it carries a quarter of the score.
  const cover = clamp(coverBps(person) / COVER_FOR_FULL_MARKS_BPS, 0, 1) * 25;

  // Integrity. Money actually taken from them for a failure. A heavier fact
  // than a late handover, scored on its own so a good delivery record cannot
  // bury it.
  const integrity = Math.max(0, 25 - 12.5 * person.stake.slashCount);

  const components: ScoreComponent[] = [
    {
      label: "Delivery",
      points: round(delivery),
      outOf: 50,
      basis: `${onTime} on time, ${late} late, ${abandoned} abandoned, of ${done.length} finished`,
    },
    {
      label: "Cover posted",
      points: round(cover),
      outOf: 25,
      basis: `${(coverBps(person) / 100).toFixed(1)}% of everything raised is backed by their own stake`,
    },
    {
      label: "Integrity",
      points: round(integrity),
      outOf: 25,
      basis:
        person.stake.slashCount === 0
          ? "No stake has ever been slashed"
          : `Stake slashed ${person.stake.slashCount} ${
              person.stake.slashCount === 1 ? "time" : "times"
            }`,
    },
  ];

  const total = round(components.reduce((sum, c) => sum + c.points, 0));
  return { total, tier: tierFor(total), components };
}

function scoreManager(person: Person): Score {
  const m = person.management;
  if (!m || m.mandateMonths < MIN_MANDATE_MONTHS) {
    return {
      total: 0,
      tier: "unrated",
      components: [],
      unratedBecause: `${m?.mandateMonths ?? 0} months of mandates. A rank needs at least ${MIN_MANDATE_MONTHS}.`,
    };
  }

  // Occupancy. The one thing a holder feels directly, because an empty flat
  // pays nothing however well it is looked after.
  const occupancyRatio = clamp(m.letMonths / m.mandateMonths, 0, 1);
  const occupancy = occupancyRatio * 40;

  // Paying on time. Rent that arrives but is never credited is rent the
  // holder does not have, so a missed period counts as a failure even where
  // no money went astray.
  const payRatio = m.periodsDue > 0 ? clamp(m.periodsPaidOnTime / m.periodsDue, 0, 1) : 0;
  const paying = payRatio * 35;

  const conduct = Math.max(0, 25 - 12.5 * m.disputesUpheld);

  const components: ScoreComponent[] = [
    {
      label: "Occupancy",
      points: round(occupancy),
      outOf: 40,
      basis: `Let for ${m.letMonths} of ${m.mandateMonths} unit months under mandate`,
    },
    {
      label: "Paying on time",
      points: round(paying),
      outOf: 35,
      basis: `${m.periodsPaidOnTime} of ${m.periodsDue} rent periods credited without a gap`,
    },
    {
      label: "Conduct",
      points: round(conduct),
      outOf: 25,
      basis:
        m.disputesUpheld === 0
          ? "No dispute has been upheld against them"
          : `${m.disputesUpheld} dispute${m.disputesUpheld === 1 ? "" : "s"} upheld by a holder vote`,
    },
  ];

  const total = round(components.reduce((sum, c) => sum + c.points, 0));
  return { total, tier: tierFor(total), components };
}

export function scoreFor(person: Person): Score {
  return person.kind === "builder" ? scoreBuilder(person) : scoreManager(person);
}

export interface RankedPerson {
  person: Person;
  score: Score;
  /** Null where there is not enough history to place them. */
  rank: number | null;
}

/**
 * Ranked, best first, with every unrated profile after every ranked one.
 *
 * Unrated sits last not because it is bad but because the list is ordered by
 * evidence and there is none yet. Placing those profiles among the scores
 * would invent a standing they have not earned.
 */
export function ranked(kind: PersonKind): RankedPerson[] {
  const scored = PEOPLE.filter((p) => p.kind === kind).map((person) => ({
    person,
    score: scoreFor(person),
  }));

  const rated: RankedPerson[] = scored
    .filter((s) => s.score.tier !== "unrated")
    .sort((a, b) => b.score.total - a.score.total)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const unrated: RankedPerson[] = scored
    .filter((s) => s.score.tier === "unrated")
    .sort((a, b) => a.person.name.localeCompare(b.person.name))
    .map((s) => ({ ...s, rank: null }));

  return [...rated, ...unrated];
}

export const getPerson = (id: string) => PEOPLE.find((p) => p.id === id);

/** Everyone else attached to a project this person has worked on. */
export function worksWith(person: Person): Person[] {
  const shared = new Set(person.record.map((r) => r.projectId));
  return PEOPLE.filter(
    (other) => other.id !== person.id && other.record.some((r) => shared.has(r.projectId))
  );
}

/** Total raised across every job, atomic units. */
export function totalRaised(person: Person): string {
  try {
    return person.record.reduce((sum, r) => sum + BigInt(r.raised), 0n).toString();
  } catch {
    return "0";
  }
}

// ---- sample data -----------------------------------------------------------

export const PEOPLE: Person[] = [
  {
    id: "minimalist",
    name: "Minimalist & Co",
    kind: "builder",
    accountId: "minimalist.shedauser.testnet",
    location: "Lekki, Lagos",
    since: 2021,
    about:
      "A residential developer working across Lekki and Ikoyi, mostly mid rise apartment blocks. Four raises on Sheda since 2021.",
    record: [
      { projectId: "m120", name: "M120 Apartments", location: "Lekki, Lagos", raised: "90000000000000", year: 2026, outcome: "running" },
      { projectId: "ikoyi-heights", name: "Ikoyi Heights", location: "Ikoyi, Lagos", raised: "120000000000000", year: 2024, outcome: "on-time" },
      { projectId: "lekki-terraces", name: "Lekki Terraces", location: "Lekki, Lagos", raised: "76000000000000", year: 2023, outcome: "on-time" },
      { projectId: "oniru-court", name: "Oniru Court", location: "Victoria Island, Lagos", raised: "54000000000000", year: 2022, outcome: "late", monthsLate: 4 },
    ],
    stake: {
      total: "62000000000000",
      allocated: "16200000000000",
      free: "45800000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
  },
  {
    id: "kayode",
    name: "Kayode Developments",
    kind: "builder",
    accountId: "kayode.shedauser.testnet",
    location: "Yaba, Lagos",
    since: 2023,
    about:
      "Student housing and small infill sites around Yaba and Akoka. Manages its own completed buildings through a sister company.",
    record: [
      { projectId: "yaba", name: "Yaba Student Hostel", location: "Yaba, Lagos", raised: "48000000000000", year: 2026, outcome: "running" },
      { projectId: "akoka-rooms", name: "Akoka Rooms", location: "Akoka, Lagos", raised: "22000000000000", year: 2024, outcome: "late", monthsLate: 7 },
      { projectId: "sabo-annexe", name: "Sabo Annexe", location: "Sabo, Lagos", raised: "18000000000000", year: 2023, outcome: "abandoned" },
    ],
    stake: {
      total: "2400000000000",
      allocated: "0",
      free: "2400000000000",
      slashedTotal: "9000000000000",
      slashCount: 1,
    },
  },
  {
    id: "adeyemi",
    name: "Adeyemi Builders",
    kind: "builder",
    accountId: "adeyemi.shedauser.testnet",
    location: "Ibadan",
    since: 2020,
    about:
      "The longest running builder on Sheda. Low rise estates in Ibadan and Abeokuta, every one handed over on the published date.",
    record: [
      { projectId: "bodija-estate", name: "Bodija Estate", location: "Ibadan", raised: "64000000000000", year: 2025, outcome: "on-time" },
      { projectId: "jericho-villas", name: "Jericho Villas", location: "Ibadan", raised: "48000000000000", year: 2023, outcome: "on-time" },
      { projectId: "oluyole-row", name: "Oluyole Row", location: "Ibadan", raised: "36000000000000", year: 2022, outcome: "on-time" },
      { projectId: "abeokuta-close", name: "Abeokuta Close", location: "Abeokuta", raised: "28000000000000", year: 2021, outcome: "on-time" },
    ],
    stake: {
      total: "52000000000000",
      allocated: "0",
      free: "52000000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
  },
  {
    id: "harbour",
    name: "Harbour Works",
    kind: "builder",
    accountId: "harbour.shedauser.testnet",
    location: "Port Harcourt",
    since: 2026,
    about:
      "New to Sheda. Waterfront apartments in Port Harcourt, with a first raise opening this quarter.",
    record: [
      { projectId: "harbour-one", name: "Harbour One", location: "Port Harcourt", raised: "40000000000000", year: 2026, outcome: "running" },
    ],
    stake: {
      total: "8000000000000",
      allocated: "0",
      free: "8000000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
  },
  {
    id: "lagos-property",
    name: "Lagos Property Co",
    kind: "manager",
    accountId: "lagosproperty.shedauser.testnet",
    location: "Lagos",
    since: 2021,
    about:
      "Letting and facilities management across Lekki, Ikoyi and Victoria Island. Independent of every builder it signs off for.",
    record: [
      { projectId: "m120", name: "M120 Apartments", location: "Lekki, Lagos", raised: "90000000000000", year: 2026, outcome: "running" },
      { projectId: "ikoyi-heights", name: "Ikoyi Heights", location: "Ikoyi, Lagos", raised: "120000000000000", year: 2024, outcome: "on-time" },
      { projectId: "lekki-terraces", name: "Lekki Terraces", location: "Lekki, Lagos", raised: "76000000000000", year: 2023, outcome: "on-time" },
    ],
    stake: {
      total: "18000000000000",
      allocated: "6000000000000",
      free: "12000000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
    management: {
      unitsManaged: 48,
      letMonths: 1012,
      mandateMonths: 1104,
      rentPaidOut: "284000000000",
      periodsPaidOnTime: 34,
      periodsDue: 35,
      disputesUpheld: 0,
    },
  },
  {
    id: "kayode-facilities",
    name: "Kayode Facilities",
    kind: "manager",
    accountId: "kayodefm.shedauser.testnet",
    location: "Yaba, Lagos",
    since: 2024,
    about: "Facilities arm of Kayode Developments, managing the buildings that group puts up.",
    partOfGroup: "Kayode Developments",
    record: [
      { projectId: "yaba", name: "Yaba Student Hostel", location: "Yaba, Lagos", raised: "48000000000000", year: 2026, outcome: "running" },
      { projectId: "akoka-rooms", name: "Akoka Rooms", location: "Akoka, Lagos", raised: "22000000000000", year: 2024, outcome: "late", monthsLate: 7 },
    ],
    stake: {
      total: "3000000000000",
      allocated: "1200000000000",
      free: "1800000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
    management: {
      unitsManaged: 24,
      letMonths: 318,
      mandateMonths: 504,
      rentPaidOut: "41000000000",
      periodsPaidOnTime: 14,
      periodsDue: 20,
      disputesUpheld: 1,
    },
  },
  {
    id: "citiwide",
    name: "Citiwide Facilities",
    kind: "manager",
    accountId: "citiwide.shedauser.testnet",
    location: "Ibadan",
    since: 2022,
    about:
      "Manages the Ibadan and Abeokuta estates, with an in house maintenance team rather than subcontractors.",
    record: [
      { projectId: "bodija-estate", name: "Bodija Estate", location: "Ibadan", raised: "64000000000000", year: 2025, outcome: "on-time" },
      { projectId: "jericho-villas", name: "Jericho Villas", location: "Ibadan", raised: "48000000000000", year: 2023, outcome: "on-time" },
    ],
    stake: {
      total: "14000000000000",
      allocated: "4000000000000",
      free: "10000000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
    management: {
      unitsManaged: 36,
      letMonths: 742,
      mandateMonths: 864,
      rentPaidOut: "176000000000",
      periodsPaidOnTime: 27,
      periodsDue: 28,
      disputesUpheld: 0,
    },
  },
  {
    id: "riverside-fm",
    name: "Riverside FM",
    kind: "manager",
    accountId: "riverside.shedauser.testnet",
    location: "Port Harcourt",
    since: 2026,
    about: "Taking its first mandate on Sheda with Harbour One.",
    record: [
      { projectId: "harbour-one", name: "Harbour One", location: "Port Harcourt", raised: "40000000000000", year: 2026, outcome: "running" },
    ],
    stake: {
      total: "2000000000000",
      allocated: "0",
      free: "2000000000000",
      slashedTotal: "0",
      slashCount: 0,
    },
    management: {
      unitsManaged: 0,
      letMonths: 0,
      mandateMonths: 3,
      rentPaidOut: "0",
      periodsPaidOnTime: 0,
      periodsDue: 0,
      disputesUpheld: 0,
    },
  },
];
