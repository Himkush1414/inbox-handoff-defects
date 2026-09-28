import "server-only";
import { NextResponse } from "next/server";
import { readLedger } from "@/server/ledger/store";
import { toErrorResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await readLedger();
    return NextResponse.json(
      {
        ok: true,
        revision: ledger.revision,
        signalCount: ledger.raw.signals.length,
        dataFile: "data/signal-ledger.json",
        seeded: ledger.seeded,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
