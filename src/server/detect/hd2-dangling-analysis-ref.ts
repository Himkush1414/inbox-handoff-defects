import "server-only";
import type { DetectorContext } from "./context.js";
import type { DetectorFinding } from "./finding.js";

export interface HD2Result {
  findings: DetectorFinding[];
  verified: number;
  unverifiable: number;
}

const RUN_REF = /^run-(\d+)$/;

/** HD2 · dangling_analysis_ref · analysis_ref missing, malformed, or pointing at a run that can't exist (spec §3.7). */
export function detectHD2(ctx: DetectorContext): HD2Result {
  const findings: DetectorFinding[] = [];
  let verified = 0;
  let unverifiable = 0;

  for (const { ledgerIndex, projectId } of ctx.analysedEntries) {
    const signal = ctx.signalByIndex.get(ledgerIndex);
    if (!signal) continue;
    const entry = signal.status[projectId];
    if (!entry) continue;
    const ref = entry.analysis_ref;

    if (ref === null || ref === undefined) {
      findings.push(makeFinding(ledgerIndex, projectId, ref, "missing", ctx));
      continue;
    }

    const match = typeof ref === "string" ? RUN_REF.exec(ref) : null;
    if (typeof ref !== "string" || !match) {
      findings.push(makeFinding(ledgerIndex, projectId, ref, "malformed", ctx));
      continue;
    }

    const n = Number(match[1]);
    if (ctx.maxRun === null) {
      unverifiable++;
    } else if (n > ctx.maxRun) {
      findings.push(makeFinding(ledgerIndex, projectId, ref, "beyond_recorded_runs", ctx));
    } else if (ctx.minRun !== null && n >= ctx.minRun && !ctx.recordedRuns.has(n)) {
      findings.push(makeFinding(ledgerIndex, projectId, ref, "not_in_run_log", ctx));
    } else if (ctx.minRun !== null && n < ctx.minRun) {
      unverifiable++;
    } else {
      verified++;
    }
  }

  return { findings, verified, unverifiable };
}

function makeFinding(
  ledgerIndex: number,
  projectId: string,
  ref: unknown,
  reason: "missing" | "malformed" | "beyond_recorded_runs" | "not_in_run_log",
  ctx: DetectorContext,
): DetectorFinding {
  const reasonText: Record<typeof reason, string> = {
    missing: "analysis_ref is missing.",
    malformed: `analysis_ref "${String(ref)}" is not a well-formed run reference.`,
    beyond_recorded_runs: `analysis_ref "${String(ref)}" points at a run beyond the recorded range.`,
    not_in_run_log: `analysis_ref "${String(ref)}" was not recorded in the run log.`,
  };
  return {
    classId: "HD2",
    ledgerIndex,
    projectId,
    message: reasonText[reason],
    details: { ref: ref ?? null, reason, minRun: ctx.minRun, maxRun: ctx.maxRun },
  };
}
