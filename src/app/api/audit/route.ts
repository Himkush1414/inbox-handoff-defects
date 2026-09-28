import "server-only";
import { NextResponse } from "next/server";
import { AppError, toErrorResponse } from "@/server/errors";
import { readAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    let limit = 20;
    if (limitParam !== null) {
      const n = Number(limitParam);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        throw new AppError("INVALID_QUERY", 400, "limit must be an integer between 1 and 100.");
      }
      limit = n;
    }
    const result = await readAudit(limit);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
