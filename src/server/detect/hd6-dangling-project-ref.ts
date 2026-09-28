import "server-only";
import type { DetectorContext } from "./context";

export type HD6Site = "routing_hint" | "signal_projects" | "status_key_unknown" | "status_key_not_routed";

export type HD6Location =
  | { file: "routing-hints.json"; index: number }
  | { file: "signal-ledger.json"; ledgerIndex: number; signalId: string };

export interface HD6Finding {
  classId: "HD6";
  site: HD6Site;
  ref: string;
  suggestion: string | null;
  message: string;
  location: HD6Location;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[a.length]![b.length]!;
}

/** Closest config project id by Levenshtein distance <= 2, only if the minimum is unique (spec §3.7). */
export function suggestProjectId(ref: string, configProjectIds: readonly string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const id of configProjectIds) {
    const d = levenshtein(ref, id);
    if (d > 2) continue;
    if (d < bestDist) {
      bestDist = d;
      best = id;
      tie = false;
    } else if (d === bestDist) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/** HD6 · dangling_project_ref · a reference to a project id that is not in config.json (spec §3.7). */
export function detectHD6(ctx: DetectorContext): HD6Finding[] {
  const configProjectIds = ctx.config.projects.map((p) => p.id);
  const findings: HD6Finding[] = [];

  ctx.hints.forEach((hint, index) => {
    if (!ctx.validProjectIds.has(hint.project)) {
      findings.push({
        classId: "HD6",
        site: "routing_hint",
        ref: hint.project,
        suggestion: suggestProjectId(hint.project, configProjectIds),
        message: `routing-hints.json #${index + 1}: "${hint.match}" routes to unknown project "${hint.project}".`,
        location: { file: "routing-hints.json", index },
      });
    }
  });

  for (const { ledgerIndex, signal } of ctx.signals) {
    for (const projectId of signal.projects) {
      if (!ctx.validProjectIds.has(projectId)) {
        findings.push({
          classId: "HD6",
          site: "signal_projects",
          ref: projectId,
          suggestion: suggestProjectId(projectId, configProjectIds),
          message: `Signal references unknown project "${projectId}".`,
          location: { file: "signal-ledger.json", ledgerIndex, signalId: signal.id },
        });
      }
    }

    for (const statusKey of Object.keys(signal.status)) {
      if (!ctx.validProjectIds.has(statusKey)) {
        findings.push({
          classId: "HD6",
          site: "status_key_unknown",
          ref: statusKey,
          suggestion: suggestProjectId(statusKey, configProjectIds),
          message: `Status entry references unknown project "${statusKey}".`,
          location: { file: "signal-ledger.json", ledgerIndex, signalId: signal.id },
        });
      } else if (!signal.projects.includes(statusKey)) {
        findings.push({
          classId: "HD6",
          site: "status_key_not_routed",
          ref: statusKey,
          suggestion: null,
          message: `Status entry "${statusKey}" is not among this signal's routed projects.`,
          location: { file: "signal-ledger.json", ledgerIndex, signalId: signal.id },
        });
      }
    }
  }

  return findings;
}
