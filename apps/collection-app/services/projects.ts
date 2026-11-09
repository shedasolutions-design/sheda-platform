/**
 * Projects, until the raise contract exists.
 *
 * Stage 3 of the spec puts this on chain. Until then the shapes here are the
 * ones the contract will return, so the screens are written against the real
 * interface rather than against a convenient placeholder that would have to
 * be unpicked later.
 *
 * Amounts are atomic units as strings, matching the chain and `money.ts`.
 * Nothing in the app does arithmetic on them as numbers.
 */

export type DocumentStatus = "verified" | "uploaded" | "missing";

export interface ProjectDocument {
  label: string;
  status: DocumentStatus;
}

export interface Unit {
  id: string;
  label: string;
  /** Price of the whole flat, atomic units. */
  priceAtomic: string;
  /** How many shares it divides into. */
  totalShares: string;
  /** Shares already taken. */
  sharesSold: string;
  bedrooms: number;
  /** Set once the unit exists and has a vault. Absent during a raise. */
  vaultId?: string;
}

export interface Phase {
  name: string;
  /** Portion of the target released on completion, basis points. */
  tranche: number;
  status: "done" | "current" | "pending";
  attestedBy?: string;
}

export interface Project {
  id: string;
  name: string;
  builder: string;
  /** Profile in `people.ts`, so a card can open who is behind the raise. */
  builderId: string;
  /** Whether the builder's own company may also attest. See R2. */
  builderIsManager: boolean;
  manager: string;
  managerId: string;
  location: string;
  units: number;
  target: string;
  raised: string;
  daysLeft: number;
  /** The builder's own estimate. Never presented as a platform figure. */
  estimatedReturnPct: number;
  /** Cover as a proportion of the target. Zero means none was posted. */
  guaranteeBps: number;
  documents: ProjectDocument[];
  phases: Phase[];
  unitList: Unit[];
  description: string;
  /** Completed on time / completed late / abandoned, from chain events. */
  record: { completed: number; late: number; abandoned: number };
}

/**
 * Two examples with deliberately different risk shapes, so every screen is
 * exercised by something: one guaranteed and independently managed, one with
 * no cover and the builder managing their own work.
 */
export const SAMPLE_PROJECTS: Project[] = [
  {
    id: "m120",
    name: "M120 Apartments",
    builder: "Minimalist & Co",
    builderId: "minimalist",
    builderIsManager: false,
    manager: "Lagos Property Co",
    managerId: "lagos-property",
    location: "Lekki, Lagos",
    units: 5,
    target: "90000000000000",
    raised: "64000000000000",
    daysLeft: 11,
    estimatedReturnPct: 30,
    guaranteeBps: 1800,
    documents: [
      { label: "Title documents", status: "verified" },
      { label: "Planning permission", status: "verified" },
      { label: "Builder registration", status: "uploaded" },
    ],
    phases: [
      { name: "Foundation", tranche: 2000, status: "done", attestedBy: "Lagos Property Co" },
      { name: "Frame to level 6", tranche: 1500, status: "done", attestedBy: "Lagos Property Co" },
      { name: "Frame to level 11", tranche: 1500, status: "current" },
      { name: "Roofing and envelope", tranche: 2000, status: "pending" },
      { name: "Services and fit-out", tranche: 2000, status: "pending" },
      { name: "Handover", tranche: 1000, status: "pending" },
    ],
    unitList: [
      { id: "1a", label: "Unit 1A", priceAtomic: "18000000000000", totalShares: "10000", sharesSold: "6200", bedrooms: 2 },
      { id: "1b", label: "Unit 1B", priceAtomic: "18000000000000", totalShares: "10000", sharesSold: "1800", bedrooms: 2 },
      { id: "2a", label: "Unit 2A", priceAtomic: "18000000000000", totalShares: "10000", sharesSold: "9100", bedrooms: 2 },
      { id: "2b", label: "Unit 2B", priceAtomic: "18000000000000", totalShares: "10000", sharesSold: "4400", bedrooms: 2 },
      { id: "ph", label: "Penthouse", priceAtomic: "32000000000000", totalShares: "10000", sharesSold: "10000", bedrooms: 4 },
    ],
    description:
      "A residential development of 120 units with individual BQs, a mixture of 1, 2 and 3 bedroom apartments and a penthouse duplex, over 11 floors with two levels of parking.",
    record: { completed: 3, late: 1, abandoned: 0 },
  },
  {
    id: "yaba",
    name: "Yaba Student Hostel",
    builder: "Kayode Developments",
    builderId: "kayode",
    builderIsManager: true,
    manager: "Kayode Facilities",
    managerId: "kayode-facilities",
    location: "Yaba, Lagos",
    units: 24,
    target: "48000000000000",
    raised: "9600000000000",
    daysLeft: 26,
    estimatedReturnPct: 22,
    guaranteeBps: 0,
    documents: [
      { label: "Title documents", status: "verified" },
      { label: "Planning permission", status: "uploaded" },
      { label: "Builder registration", status: "missing" },
    ],
    phases: [
      { name: "Site works", tranche: 2500, status: "current" },
      { name: "Structure", tranche: 3000, status: "pending" },
      { name: "Fit-out", tranche: 3000, status: "pending" },
      { name: "Handover", tranche: 1500, status: "pending" },
    ],
    unitList: [
      { id: "b1", label: "Block A · rooms 1-8", priceAtomic: "16000000000000", totalShares: "10000", sharesSold: "2400", bedrooms: 8 },
      { id: "b2", label: "Block B · rooms 9-16", priceAtomic: "16000000000000", totalShares: "10000", sharesSold: "800", bedrooms: 8 },
      { id: "b3", label: "Block C · rooms 17-24", priceAtomic: "16000000000000", totalShares: "10000", sharesSold: "2800", bedrooms: 8 },
    ],
    description:
      "Twenty-four en-suite study rooms across three blocks, five minutes from the university gate, with a managed common room and backup power.",
    record: { completed: 1, late: 0, abandoned: 1 },
  },
];

export const getProject = (id: string) => SAMPLE_PROJECTS.find((p) => p.id === id);

/** Shares still available in a unit. */
export function sharesRemaining(unit: Unit): bigint {
  try {
    return BigInt(unit.totalShares) - BigInt(unit.sharesSold);
  } catch {
    return 0n;
  }
}

/** How full a unit is, 0-100. */
export function unitFundedPct(unit: Unit): number {
  try {
    const total = BigInt(unit.totalShares);
    if (total <= 0n) return 0;
    return Number((BigInt(unit.sharesSold) * 100n) / total);
  } catch {
    return 0;
  }
}

/**
 * What opting out would return, if the build stalled now.
 *
 * Cover is a proportion of the whole raise, so a holder recovers that same
 * proportion of what they put in, not all of it. The screens state this in
 * money rather than as a percentage, because 18% is abstract at the moment
 * someone is deciding and ₦45,000 of ₦250,000 is not.
 */
export function coverFor(amountAtomic: string, guaranteeBps: number): string {
  try {
    return ((BigInt(amountAtomic) * BigInt(guaranteeBps)) / 10_000n).toString();
  } catch {
    return "0";
  }
}
