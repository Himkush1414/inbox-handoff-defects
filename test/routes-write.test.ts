import { afterEach, describe, expect, it } from "vitest";
import { appendFile } from "node:fs/promises";
import { readLedger } from "@/server/ledger/store";
import { auditFilePath } from "@/server/audit";
import { applyRepair } from "@/server/repairs/apply";
import { makeTempEnv, type TempEnv } from "./helpers/tmp";

let env: TempEnv | undefined;

afterEach(async () => {
  if (env) {
    await env.cleanup();
    env = undefined;
  }
});

const VALID_BODY = {
  op: "requeue_analysis",
  target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
  baseRevision: "3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546",
  actor: { kind: "agent", name: "repair-bot" },
};

describe("POST /api/repairs request-level rejections (T-51)", () => {
  it("415 UNSUPPORTED_MEDIA_TYPE for text/plain", async () => {
    env = await makeTempEnv();
    const { POST } = await import("@/app/api/repairs/route");
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("413 PAYLOAD_TOO_LARGE for a body over 16384 bytes", async () => {
    env = await makeTempEnv();
    const { POST } = await import("@/app/api/repairs/route");
    const bigReason = "x".repeat(17000);
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, reason: bigReason }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("403 FORBIDDEN_ORIGIN when Origin's host does not match the request host", async () => {
    env = await makeTempEnv();
    const { POST } = await import("@/app/api/repairs/route");
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("400 INVALID_JSON for an unparseable body", async () => {
    env = await makeTempEnv();
    const { POST } = await import("@/app/api/repairs/route");
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("400 VALIDATION_FAILED with an issues array for well-formed JSON in the wrong shape", async () => {
    env = await makeTempEnv();
    const { POST } = await import("@/app/api/repairs/route");
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(body.error.details.issues.length).toBeGreaterThan(0);
  });

  it("a well-formed same-origin request succeeds end to end through the real route handler", async () => {
    env = await makeTempEnv();
    const ledger = await readLedger();
    const { POST } = await import("@/app/api/repairs/route");
    const req = new Request("http://127.0.0.1:3000/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, baseRevision: ledger.revision }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.change.path).toBe("signals[0].status.atlas");
  });
});

describe("GET /api/audit (T-53)", () => {
  it("limit=0 -> 400 INVALID_QUERY", async () => {
    env = await makeTempEnv();
    const { GET } = await import("@/app/api/audit/route");
    const req = new Request("http://127.0.0.1:3000/api/audit?limit=0");
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_QUERY");
  });

  it("after one write, total is 1, newest first; a corrupt line is counted separately", async () => {
    env = await makeTempEnv();
    const baseRevision = (await readLedger()).revision;
    await applyRepair({
      op: "requeue_analysis",
      target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
      baseRevision,
      actor: { kind: "human", name: "Reviewer" },
    });

    const { GET } = await import("@/app/api/audit/route");
    const res1 = await GET(new Request("http://127.0.0.1:3000/api/audit"));
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.total).toBe(1);
    expect(body1.corruptLines).toBe(0);
    expect(body1.entries[0].target.signalId).toBe("2026-07-06_atlas_permit_intake");

    await appendFile(auditFilePath(), "not json\n", "utf8");
    const res2 = await GET(new Request("http://127.0.0.1:3000/api/audit"));
    const body2 = await res2.json();
    expect(body2.total).toBe(1);
    expect(body2.corruptLines).toBe(1);
  });
});
