import "server-only";
import { CLASS_META, type ActionView, type ClassId, type Lane } from "../lib/contracts";

export const SYSTEMIC_MIN_RATE = 0.5;
export const SYSTEMIC_MIN_COUNT = 5;
export const MAX_BODY_BYTES = 16384;

/** Systemic ⇔ eligible > 0 ∧ count/eligible ≥ 0.5 ∧ count ≥ 5 (spec §4.7.3, §4.9.1). */
export function isSystemic(count: number, eligible: number): boolean {
  return eligible > 0 && count / eligible >= SYSTEMIC_MIN_RATE && count >= SYSTEMIC_MIN_COUNT;
}

/** A row is agent_safe iff it has at least one HD1-HD4 class that is not systemic (spec §4.7.4). */
export function laneFor(classes: readonly ClassId[], systemicByClass: ReadonlyMap<ClassId, boolean>): Lane {
  const hasNonSystemic = classes.some((c) => !(systemicByClass.get(c) ?? false));
  return hasNonSystemic ? "agent_safe" : "human_first";
}

export interface ClassStats {
  count: number;
  eligible: number;
}

/**
 * The class that explains the lane: for agent_safe, the first (severity-ordered) non-systemic
 * class; for human_first, the first (severity-ordered) systemic class (spec §4.9.4).
 */
export function primaryClassFor(
  classes: readonly ClassId[],
  lane: Lane,
  systemicByClass: ReadonlyMap<ClassId, boolean>,
): ClassId {
  const wantSystemic = lane === "human_first";
  const found = classes.find((c) => (systemicByClass.get(c) ?? false) === wantSystemic);
  return found ?? classes[0]!;
}

export function laneReasonFor(params: {
  lane: Lane;
  primaryClass: ClassId;
  projectId: string;
  stats: ClassStats;
}): string {
  const label = CLASS_META[params.primaryClass].label;
  if (params.lane === "agent_safe") {
    return `Isolated ${label}: re-queueing is deterministic, touches only status.${params.projectId}, and is reversible from the audit log.`;
  }
  return `${label} affects ${params.stats.count} of ${params.stats.eligible} analysed entries: a pipeline problem, so agent repair is off.`;
}

/** actionsFor(row) — spec §4.9.2. Only actions that are available at all are returned. */
export function actionsFor(params: { classes: readonly ClassId[]; lane: Lane }): ActionView[] {
  const actions: ActionView[] = [
    {
      op: "requeue_analysis",
      label: "Re-queue analysis",
      allowedFor: params.lane === "agent_safe" ? ["human", "agent"] : ["human"],
      disabledReason: null,
    },
  ];
  if (params.classes.includes("HD1")) {
    actions.push({ op: "set_summary", label: "Add summary", allowedFor: ["human"], disabledReason: null });
  }
  return actions;
}
