import type { RawEntry, RawSignal } from "@/server/ledger/schema";
import type { Config, RoutingHint, RunLogEntry } from "@/server/fixture";
import { buildContext, type DetectorContext, type IndexedSignal } from "@/server/detect/context";

let counter = 0;

export function makeEntry(overrides: Partial<RawEntry> = {}): RawEntry {
  return {
    state: "analyzed",
    analyzed_at: "2026-07-01",
    files_reviewed: ["sources/granola/example.md"],
    analysis_ref: "run-50",
    ...overrides,
  };
}

export function makeSignal(overrides: Partial<RawSignal> = {}): RawSignal {
  counter++;
  const date = overrides.date ?? "2026-07-01";
  const matchKey = overrides.match_key ?? `synthetic_signal_${counter}`;
  return {
    id: `${date}_${matchKey}`,
    match_key: matchKey,
    type: "meeting",
    title: "Synthetic signal",
    date,
    time: "10:00",
    attendees: ["a@example.com"],
    projects: ["studio_ops"],
    summary: null,
    notes: null,
    expected_files: [],
    status: {},
    sources: { granola_note: "sources/granola/example.md", transcript: null, recording: null },
    ...overrides,
  };
}

export function withStatus(projectId: string, entry: Partial<RawEntry> = {}): Record<string, RawEntry> {
  return { [projectId]: makeEntry(entry) };
}

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    projects: [
      { id: "northwind", name: "Northwind", type: "client", keywords: [], domains: [], emails: [], active: true },
      { id: "harborline", name: "Harborline", type: "client", keywords: [], domains: [], emails: [], active: true },
      { id: "quill", name: "Quill", type: "product", keywords: [], domains: [], emails: [], active: true },
      { id: "atlas", name: "Atlas", type: "client", keywords: [], domains: [], emails: [], active: true },
      { id: "studio_ops", name: "Studio Ops", type: "internal", keywords: [], domains: [], emails: [], active: true },
    ],
    internal_domains: [],
    fallbacks: { unrouted: "internal_unsorted", unknown_project: "unclassified" },
    feed_freshness_threshold_days: 3,
    ...overrides,
  };
}

export function makeCtx(input: {
  signals: RawSignal[];
  runs?: number[];
  hints?: RoutingHint[];
  config?: Config;
}): DetectorContext {
  const indexed: IndexedSignal[] = input.signals.map((signal, ledgerIndex) => ({ ledgerIndex, signal }));
  const runLog: RunLogEntry[] = (input.runs ?? []).map((run) => ({
    run,
    started_at: "2026-01-01T00:00:00Z",
    status: "ok",
    error: null,
    counts: {},
    feeds: {},
  }));
  return buildContext({
    signals: indexed,
    config: input.config ?? makeConfig(),
    runLog,
    hints: input.hints ?? [],
  });
}
