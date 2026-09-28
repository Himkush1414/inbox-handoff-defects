import { readFile } from "node:fs/promises";
import path from "node:path";
import { Root, Signal, type RawSignal } from "@/server/ledger/schema";
import { buildContext, type DetectorContext, type IndexedSignal } from "@/server/detect/context";
import type { Config, RoutingHint, RunLogEntry } from "@/server/fixture";

/**
 * Builds a DetectorContext straight from the repo's real fixture/ files, read-only.
 * Does not go through ledger/store.ts, so it never touches data/ (spec §8.1.2 only
 * requires makeTempEnv() for tests that read/write the seeded ledger copy).
 */
export async function loadRealFixtureContext(): Promise<DetectorContext> {
  const fixtureDir = path.join(process.cwd(), "fixture");

  const ledgerRaw: unknown = JSON.parse(await readFile(path.join(fixtureDir, "signal-ledger.json"), "utf8"));
  const root = Root.parse(ledgerRaw);

  const signals: IndexedSignal[] = [];
  (root.signals as unknown[]).forEach((record, ledgerIndex) => {
    const result = Signal.safeParse(record);
    if (result.success) signals.push({ ledgerIndex, signal: result.data as RawSignal });
  });

  const config = JSON.parse(await readFile(path.join(fixtureDir, "config.json"), "utf8")) as Config;
  const hints = JSON.parse(await readFile(path.join(fixtureDir, "routing-hints.json"), "utf8")) as RoutingHint[];
  const runLogText = await readFile(path.join(fixtureDir, "run-log.jsonl"), "utf8");
  const runLog: RunLogEntry[] = runLogText
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RunLogEntry);

  return buildContext({ signals, config, runLog, hints });
}
