/**
 * The builder's side: raises they are running, and the phase sign-offs
 * standing between them and the next tranche of money.
 *
 * The release of a phase has three parties on purpose, and the states below
 * are that sequence rather than a status field somebody sets:
 *
 *   the builder says a phase is finished
 *   the property manager inspects it and attests, and cannot be the builder
 *   holders get seven days to object, and enough objections hold the money
 *
 * No single party can move money on their own. A builder who could mark
 * their own phase complete would make the schedule decorative, and a
 * manager who could release without the objection window would leave
 * holders with a vote they never get to use.
 *
 * Stage 3 puts this on the raise contract. The shapes are what it will
 * return.
 */

import { SAMPLE_PROJECTS, type Project } from "./projects";

export type PhaseState =
  /** Earlier phases are not finished, so this one cannot start. */
  | "locked"
  /** Being built. Nothing to do but build it. */
  | "building"
  /** The builder says it is done and has asked for an inspection. */
  | "awaiting-inspection"
  /** The manager has signed. Holders are inside the objection window. */
  | "objection-window"
  /** Enough holders objected. The money stays put until it is resolved. */
  | "held"
  /** Paid out. */
  | "released";

export interface PhaseStatus {
  projectId: string;
  projectName: string;
  /** Index into the project's phase list. */
  index: number;
  name: string;
  /** Portion of the target this phase releases, basis points. */
  tranche: number;
  state: PhaseState;
  /** Who must inspect it. Never the builder. */
  inspector: string;
  /** Days left in the objection window. Only while that window is open. */
  daysLeft?: number;
  /** Share of holders who have objected, basis points. */
  objectionBps?: number;
  /** Objection share that holds the payment, basis points. */
  objectionThresholdBps: number;
  /** When the manager signed it off. */
  attestedOn?: string;
}

/** A quarter of holders objecting holds a payment. */
export const OBJECTION_THRESHOLD_BPS = 2500;

export const projectsOf = (builderId: string): Project[] =>
  SAMPLE_PROJECTS.filter((p) => p.builderId === builderId);

/** Money a project has released so far, atomic units. */
export function releasedSoFar(project: Project): string {
  const bps = project.phases
    .filter((p) => p.status === "done")
    .reduce((sum, p) => sum + p.tranche, 0);
  try {
    return ((BigInt(project.target) * BigInt(bps)) / 10_000n).toString();
  } catch {
    return "0";
  }
}

/** What one phase is worth, atomic units. */
export function trancheValue(project: Project, trancheBps: number): string {
  try {
    return ((BigInt(project.target) * BigInt(trancheBps)) / 10_000n).toString();
  } catch {
    return "0";
  }
}

/**
 * Every phase across this builder's live raises, in the order they need
 * attention.
 *
 * A phase sitting in the objection window is listed above one still being
 * built, because the first has a clock on it and the second does not.
 */
export function pipelineFor(builderId: string): PhaseStatus[] {
  const rows: PhaseStatus[] = [];

  for (const project of projectsOf(builderId)) {
    project.phases.forEach((phase, index) => {
      rows.push({
        projectId: project.id,
        projectName: project.name,
        index,
        name: phase.name,
        tranche: phase.tranche,
        state: stateFor(project, index),
        inspector: project.manager,
        objectionThresholdBps: OBJECTION_THRESHOLD_BPS,
        ...extrasFor(project, index),
      });
    });
  }

  return rows.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
}

const ORDER: PhaseState[] = [
  "held",
  "objection-window",
  "awaiting-inspection",
  "building",
  "released",
  "locked",
];

/**
 * The demo puts one phase in each interesting state, because a pipeline
 * where everything is simply "building" demonstrates none of the mechanism.
 */
function stateFor(project: Project, index: number): PhaseState {
  const phase = project.phases[index];
  if (phase.status === "done") return "released";

  if (phase.status === "current") {
    if (project.id === "m120") return "objection-window";
    return "awaiting-inspection";
  }

  // The one immediately after the current phase can be worked on; anything
  // beyond that is locked behind it.
  const currentIndex = project.phases.findIndex((p) => p.status === "current");
  return index === currentIndex + 1 ? "building" : "locked";
}

function extrasFor(project: Project, index: number): Partial<PhaseStatus> {
  const state = stateFor(project, index);
  if (state === "objection-window") {
    return { daysLeft: 4, objectionBps: 600, attestedOn: "28 October 2026" };
  }
  if (state === "released") {
    return { attestedOn: project.phases[index].attestedBy ? "signed off" : undefined };
  }
  return {};
}

export const PHASE_LABEL: Record<PhaseState, string> = {
  locked: "Not started",
  building: "Building",
  "awaiting-inspection": "Waiting on inspection",
  "objection-window": "Holders may object",
  held: "Payment held",
  released: "Released",
};

/** What the builder can actually do about a phase right now. */
export function actionFor(state: PhaseState): string | null {
  switch (state) {
    case "building":
      return "Mark finished and request inspection";
    case "awaiting-inspection":
      return "Chase the inspection";
    case "objection-window":
      return "Post an update for holders";
    case "held":
      return "Respond to the objections";
    default:
      return null;
  }
}
