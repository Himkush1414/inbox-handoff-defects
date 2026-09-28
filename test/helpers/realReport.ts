import { readFileSync } from "node:fs";
import path from "node:path";
import { Root, Signal, type RawSignal } from "@/server/ledger/schema";
import { buildContext, type IndexedSignal } from "@/server/detect/context";
import { runDetectors } from "@/server/detect/index";
import { buildReport } from "@/server/report";
import type { Config, RoutingHint, RunLogEntry } from "@/server/fixture";
import type { DefectReport } from "@/lib/contracts";

/** Runs the full detect -> report pipeline against the repo's real fixture/, read-only. */
export function buildRealReport(): DefectReport {
  const fixtureDir = path.join(process.cwd(), "fixture");

  const ledgerRaw: unknown = JSON.parse(readFileSync(path.join(fixtureDir, "signal-ledger.json"), "utf8"));
  const root = Root.parse(ledgerRaw);

  const signals: IndexedSignal[] = [];
  const skippedRecords: { ledgerIndex: number; id: string | null; issues: string[] }[] = [];
  (root.signals as unknown[]).forEach((record, ledgerIndex) => {
    const result = Signal.safeParse(record);
    if (result.success) signals.push({ ledgerIndex, signal: result.data as RawSignal });
    else skippedRecords.push({ ledgerIndex, id: null, issues: result.error.issues.map((i) => i.message) });
  });

  const config = JSON.parse(readFileSync(path.join(fixtureDir, "config.json"), "utf8")) as Config;
  const hints = JSON.parse(readFileSync(path.join(fixtureDir, "routing-hints.json"), "utf8")) as RoutingHint[];
  const runLog: RunLogEntry[] = readFileSync(path.join(fixtureDir, "run-log.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RunLogEntry);

  const ctx = buildContext({ signals, config, runLog, hints });
  const detectors = runDetectors(ctx);
  return buildReport({
    revision: "test-revision",
    ledgerVersion: root.version,
    rawSignalCount: (root.signals as unknown[]).length,
    skippedRecords,
    ctx,
    detectors,
  });
}
