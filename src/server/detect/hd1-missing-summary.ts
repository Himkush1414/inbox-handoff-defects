import "server-only";
import { isBlank, type DetectorContext } from "./context";
import type { DetectorFinding } from "./finding";

/** HD1 · missing_summary · analysed entries whose summary and notes are both empty (spec §3.7). */
export function detectHD1(ctx: DetectorContext): DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const { ledgerIndex, projectId } of ctx.analysedEntries) {
    const signal = ctx.signalByIndex.get(ledgerIndex);
    if (!signal) continue;
    const entry = signal.status[projectId];
    if (!entry) continue;

    if (isBlank(signal.summary) && isBlank(signal.notes)) {
      findings.push({
        classId: "HD1",
        ledgerIndex,
        projectId,
        message: `Analysed on ${entry.analyzed_at ?? "an unknown date"}; summary and notes are both empty.`,
        details: { analyzedAt: entry.analyzed_at ?? null, analysisRef: entry.analysis_ref ?? null },
      });
    }
  }

  return findings;
}
