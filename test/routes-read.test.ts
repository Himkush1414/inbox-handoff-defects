import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { readLedger, ledgerFilePath } from "@/server/ledger/store";
import { makeTempEnv, type TempEnv } from "./helpers/tmp";

let env: TempEnv | undefined;

afterEach(async () => {
  if (env) {
    await env.cleanup();
    env = undefined;
  }
});

describe("GET /api/defects (T-35)", () => {
  it("returns 200, no-store, and the Appendix A-8 totals on a fresh temp env", async () => {
    env = await makeTempEnv();
    const { GET } = await import("@/app/api/defects/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.totals).toEqual({ humanFirst: 23, agentSafe: 4, identityConflicts: 4, configFindings: 1 });
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual([
      "studio_ops",
      "harborline",
      "northwind",
      "atlas",
      "quill",
    ]);
  });
});

describe("GET /api/defects and /api/health error handling (T-36)", () => {
  it("returns a 500 LEDGER_UNREADABLE envelope for /api/defects when the data ledger is corrupt", async () => {
    env = await makeTempEnv();
    await readLedger(); // seed
    await writeFile(ledgerFilePath(), "not json{", "utf8");

    const { GET } = await import("@/app/api/defects/route");
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("LEDGER_UNREADABLE");
  });

  it("returns 200 with signalCount 77 for /api/health on a good env", async () => {
    env = await makeTempEnv();
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.signalCount).toBe(77);
    expect(body.ok).toBe(true);
  });
});
