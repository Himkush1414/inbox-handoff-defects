import "server-only";
import type { Config, RoutingHint, RunLogEntry } from "../fixture.js";
import type { RawSignal } from "../ledger/schema.js";

export interface IndexedSignal {
  ledgerIndex: number;
  signal: RawSignal;
}

export interface AnalysedRow {
  ledgerIndex: number;
  projectId: string;
}

export interface DetectorContext {
  signals: readonly IndexedSignal[];
  config: Config;
  hints: readonly RoutingHint[];
  runLog: readonly RunLogEntry[];
  validProjectIds: ReadonlySet<string>;
  recordedRuns: ReadonlySet<number>;
  minRun: number | null;
  maxRun: number | null;
  /** analysed entries across the whole ledger (eligible, per §3.6) */
  eligible: number;
  analysedEntries: readonly AnalysedRow[];
  signalByIndex: ReadonlyMap<number, RawSignal>;
}

// --- Canonical definitions (spec §3.6) ------------------------------------

export function rowKey(ledgerIndex: number, projectId: string): string {
  return `${ledgerIndex}:${projectId}`;
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function sourcePaths(signal: RawSignal): Set<string> {
  return new Set(Object.values(signal.sources).filter((v): v is string => typeof v === "string"));
}

export function identityKey(signal: RawSignal): string {
  return `${signal.date}|${signal.match_key}`;
}

export function canonicalId(signal: RawSignal): string {
  return `${signal.date}_${signal.match_key}`;
}

export function analysedEntry(ctx: DetectorContext, ledgerIndex: number, projectId: string): boolean {
  return ctx.signalByIndex.get(ledgerIndex)?.status[projectId]?.state === "analyzed";
}

export function buildContext(input: {
  signals: readonly IndexedSignal[];
  config: Config;
  runLog: readonly RunLogEntry[];
  hints: readonly RoutingHint[];
}): DetectorContext {
  const validProjectIds = new Set<string>([
    ...input.config.projects.map((p) => p.id),
    ...Object.values(input.config.fallbacks),
  ]);

  const recordedRuns = new Set<number>(input.runLog.map((r) => r.run));
  const minRun = recordedRuns.size > 0 ? Math.min(...recordedRuns) : null;
  const maxRun = recordedRuns.size > 0 ? Math.max(...recordedRuns) : null;

  const signalByIndex = new Map<number, RawSignal>();
  for (const { ledgerIndex, signal } of input.signals) signalByIndex.set(ledgerIndex, signal);

  const analysedEntries: AnalysedRow[] = [];
  for (const { ledgerIndex, signal } of input.signals) {
    for (const [projectId, entry] of Object.entries(signal.status)) {
      if (entry.state === "analyzed") analysedEntries.push({ ledgerIndex, projectId });
    }
  }

  return {
    signals: input.signals,
    config: input.config,
    hints: input.hints,
    runLog: input.runLog,
    validProjectIds,
    recordedRuns,
    minRun,
    maxRun,
    eligible: analysedEntries.length,
    analysedEntries,
    signalByIndex,
  };
}
