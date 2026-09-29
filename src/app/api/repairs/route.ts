import "server-only";
import { NextResponse } from "next/server";
import { AppError, toErrorResponse } from "@/server/errors";
import { MAX_BODY_BYTES } from "@/server/policy";
import { RepairRequest } from "@/server/repairs/schema";
import { applyRepair } from "@/server/repairs/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // W1: cross-origin POSTs are blocked; same-origin or header-less requests (curl, scripts) pass.
    const originHeader = req.headers.get("origin");
    if (originHeader) {
      const hostHeader = req.headers.get("host") ?? new URL(req.url).host;
      let originHost = "";
      try {
        originHost = new URL(originHeader).host;
      } catch {
        // malformed Origin header: treat as mismatched, not as absent
      }
      if (originHost !== hostHeader) {
        throw new AppError("FORBIDDEN_ORIGIN", 403, "Cross-origin requests are not allowed.");
      }
    }

    // W2
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415, "Content-Type must be application/json.");
    }

    // W3
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body is too large.");
    }
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body is too large.");
    }

    // W4
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AppError("INVALID_JSON", 400, "Request body is not valid JSON.");
    }

    // W5
    const result = RepairRequest.safeParse(parsed);
    if (!result.success) {
      throw new AppError("VALIDATION_FAILED", 400, "The request does not match the expected shape.", {
        issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    // W6-W16
    const repairResult = await applyRepair(result.data);
    return NextResponse.json(repairResult, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
