import "server-only";
import { NextResponse } from "next/server";
import { readLedger } from "@/server/ledger/store";
import { readConfig, readRoutingHints, readRunLog } from "@/server/fixture";
import { buildContext, type IndexedSignal } from "@/server/detect/context";
import { runDetectors } from "@/server/detect/index";
import { buildReport } from "@/server/report";
import { toErrorResponse } from "@/server/errors";
import type { RawSignal } from "@/server/ledger/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [ledger, config, hints, runLog] = await Promise.all([
      readLedger(),
      readConfig(),
      readRoutingHints(),
      readRunLog(),
    ]);

    const signals: IndexedSignal[] = ledger.validIndices.map((ledgerIndex) => ({
      ledgerIndex,
      signal: ledger.raw.signals[ledgerIndex] as RawSignal,
    }));

    const ctx = buildContext({ signals, config, runLog, hints });
    const detectors = runDetectors(ctx);
    const report = buildReport({
      revision: ledger.revision,
      ledgerVersion: ledger.raw.version,
      rawSignalCount: ledger.raw.signals.length,
      skippedRecords: ledger.skippedRecords,
      ctx,
      detectors,
    });

    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
