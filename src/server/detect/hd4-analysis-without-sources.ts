import "server-only";
import { sourcePaths, type DetectorContext } from "./context";
import type { DetectorFinding } from "./finding";

/** HD4 · analysis_without_sources · analysed with zero files reviewed (spec §3.7). */
export function detectHD4(ctx: DetectorContext): DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const { ledgerIndex, projectId } of ctx.analysedEntries) {
    const signal = ctx.signalByIndex.get(ledgerIndex);
    if (!signal) continue;
    const entry = signal.status[projectId];
    if (!entry) continue;

    if (!Array.isArray(entry.files_reviewed) || entry.files_reviewed.length === 0) {
      findings.push({
        classId: "HD4",
        ledgerIndex,
        projectId,
        message: `Marked analysed with no files reviewed; the signal has ${sourcePaths(signal).size} source(s).`,
        details: { sourceCount: sourcePaths(signal).size },
      });
    }
  }

  return findings;
}
