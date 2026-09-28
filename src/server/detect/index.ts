import "server-only";
import type { DetectorContext } from "./context.js";
import { detectHD1 } from "./hd1-missing-summary.js";
import { detectHD2 } from "./hd2-dangling-analysis-ref.js";
import { detectHD3 } from "./hd3-dangling-source-ref.js";
import { detectHD4 } from "./hd4-analysis-without-sources.js";
import { detectHD5, type ConflictGroupResult } from "./hd5-identity-conflict.js";
import { detectHD6, type HD6Finding } from "./hd6-dangling-project-ref.js";
import type { DetectorFinding } from "./finding.js";

export interface RunCheckStats {
  recordedRunCount: number;
  minRun: number | null;
  maxRun: number | null;
  verified: number;
  unverifiable: number;
  flagged: number;
}

export interface RunDetectorsResult {
  findings: DetectorFinding[]; // HD1-HD4
  groups: ConflictGroupResult[]; // HD5
  config: HD6Finding[]; // HD6, placed in report.config per spec §3.7
  runCheck: RunCheckStats;
}

export function runDetectors(ctx: DetectorContext): RunDetectorsResult {
  const hd1 = detectHD1(ctx);
  const hd2 = detectHD2(ctx);
  const hd3 = detectHD3(ctx);
  const hd4 = detectHD4(ctx);
  const hd5 = detectHD5(ctx);
  const hd6 = detectHD6(ctx);

  return {
    findings: [...hd1, ...hd2.findings, ...hd3, ...hd4],
    groups: hd5,
    config: hd6,
    runCheck: {
      recordedRunCount: ctx.recordedRuns.size,
      minRun: ctx.minRun,
      maxRun: ctx.maxRun,
      verified: hd2.verified,
      unverifiable: hd2.unverifiable,
      flagged: hd2.findings.length,
    },
  };
}

export { detectHD1, detectHD2, detectHD3, detectHD4, detectHD5, detectHD6 };
