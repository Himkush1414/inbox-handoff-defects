import "server-only";
import { sourcePaths, type DetectorContext } from "./context";
import type { DetectorFinding } from "./finding";

/** HD3 · dangling_source_ref · a reviewed file the signal no longer lists as a source (spec §3.7). Ledger-internal only. */
export function detectHD3(ctx: DetectorContext): DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const { ledgerIndex, projectId } of ctx.analysedEntries) {
    const signal = ctx.signalByIndex.get(ledgerIndex);
    if (!signal) continue;
    const entry = signal.status[projectId];
    if (!entry) continue;

    const paths = sourcePaths(signal);
    const reviewed = entry.files_reviewed ?? [];
    const missing = reviewed.filter((f) => !paths.has(f));

    if (missing.length > 0) {
      findings.push({
        classId: "HD3",
        ledgerIndex,
        projectId,
        message: `Reviewed ${missing.length} file(s) this signal no longer lists as a source: ${missing.join(", ")}`,
        details: { missing },
      });
    }
  }

  return findings;
}
