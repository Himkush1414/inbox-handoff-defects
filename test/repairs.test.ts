import { afterEach, describe, expect, it } from "vitest";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readLedger, ledgerFilePath, type Io } from "@/server/ledger/store";
import { readAudit, auditFilePath, type AuditIo, type AuditFileHandle } from "@/server/audit";
import { readConfig, readRoutingHints, readRunLog } from "@/server/fixture";
import { buildContext } from "@/server/detect/context";
import { runDetectors } from "@/server/detect/index";
import { buildReport } from "@/server/report";
import { applyRepair } from "@/server/repairs/apply";
import { RepairRequest } from "@/server/repairs/schema";
import { makeTempEnv, type TempEnv } from "./helpers/tmp";

let env: TempEnv | undefined;

afterEach(async () => {
  if (env) {
    await env.cleanup();
    env = undefined;
  }
});

async function currentRevision(): Promise<string> {
  return (await readLedger()).revision;
}

async function buildCurrentReport() {
  const ledger = await readLedger();
  const [config, hints, runLog] = await Promise.all([readConfig(), readRoutingHints(), readRunLog()]);
  const signals = ledger.validIndices.map((i) => ({
    ledgerIndex: i,
    signal: ledger.raw.signals[i] as import("@/server/ledger/schema").RawSignal,
  }));
  const ctx = buildContext({ signals, config, runLog, hints });
  const detectors = runDetectors(ctx);
  return buildReport({
    revision: ledger.revision,
    ledgerVersion: ledger.raw.version,
    rawSignalCount: ledger.raw.signals.length,
    skippedRecords: ledger.skippedRecords,
    ctx,
    detectors,
  });
}

function human(name = "Reviewer") {
  return { kind: "human" as const, name };
}
function agentActor(name = "repair-bot") {
  return { kind: "agent" as const, name };
}

const VALID_BASE = {
  target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
  baseRevision: "3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546",
  actor: { kind: "agent" as const, name: "repair-bot" },
};

describe("RepairRequest schema (T-40)", () => {
  it("rejects an unknown top-level key", () => {
    const result = RepairRequest.safeParse({ op: "requeue_analysis", ...VALID_BASE, extra: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects target.id in place of target.signalId", () => {
    const result = RepairRequest.safeParse({
      op: "requeue_analysis",
      ...VALID_BASE,
      target: { id: "x", project: "atlas" },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an op that is not "requeue_analysis" or "set_summary"', () => {
    const result = RepairRequest.safeParse({ ...VALID_BASE, op: "nuke" });
    expect(result.success).toBe(false);
  });

  it("rejects a 19-character summary (min 20)", () => {
    const result = RepairRequest.safeParse({
      op: "set_summary",
      ...VALID_BASE,
      summary: "a".repeat(19),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a summary containing a control character", () => {
    const result = RepairRequest.safeParse({
      op: "set_summary",
      ...VALID_BASE,
      summary: `${"a".repeat(20)}\u0007`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 65-character actor name (max 64)", () => {
    const result = RepairRequest.safeParse({
      op: "requeue_analysis",
      ...VALID_BASE,
      actor: { kind: "agent", name: "a".repeat(65) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects actor.kind "robot"', () => {
    const result = RepairRequest.safeParse({
      op: "requeue_analysis",
      ...VALID_BASE,
      actor: { kind: "robot", name: "x" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 63-character baseRevision (must be 64 hex chars)", () => {
    const result = RepairRequest.safeParse({
      op: "requeue_analysis",
      ...VALID_BASE,
      baseRevision: "a".repeat(63),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed requeue_analysis request", () => {
    const result = RepairRequest.safeParse({ op: "requeue_analysis", ...VALID_BASE, reason: "auto: test" });
    expect(result.success).toBe(true);
  });
});

describe("T-41: agent requeue on an agent-safe row", () => {
  it("succeeds, touches only that status entry, and writes exactly one audit line", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    const before = await readFile(ledgerFilePath(), "utf8");

    const result = await applyRepair({
      op: "requeue_analysis",
      target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
      baseRevision,
      actor: agentActor(),
      reason: "auto: HD3 dangling source ref",
    });

    expect(result.ok).toBe(true);
    expect(result.change.path).toBe("signals[0].status.atlas");
    expect(result.revision).not.toBe(baseRevision);

    // only signals[0] changed
    const after = JSON.parse(await readFile(ledgerFilePath(), "utf8"));
    const beforeParsed = JSON.parse(before);
    for (let i = 0; i < beforeParsed.signals.length; i++) {
      if (i === 0) continue;
      expect(after.signals[i]).toEqual(beforeParsed.signals[i]);
    }
    expect(after.signals[0].status.atlas.state).toBe("pending");
    expect(after.signals[0].status.atlas.analyzed_at).toBeNull();
    expect(after.signals[0].status.atlas.files_reviewed).toEqual([]);
    expect(after.signals[0].status.atlas.analysis_ref).toBeNull();

    // Appendix A-7 row 1
    const report = await buildCurrentReport();
    expect(report.classes.map((c) => `${c.id}=${c.count}`)).toEqual(
      expect.arrayContaining(["HD1=26", "HD2=3", "HD3=0", "HD4=1"]),
    );
    expect(report.totals.humanFirst).toBe(23);
    expect(report.totals.agentSafe).toBe(3);
    expect(report.ledger.analyzedCount).toBe(26);
    const atlas = report.projects.find((p) => p.id === "atlas")!;
    expect(atlas.counts).toMatchObject({ humanFirst: 4, agentSafe: 1, analyzed: 5 });

    // audit trail
    const audit = await readAudit(20);
    expect(audit.total).toBe(1);
    expect(audit.entries[0]).toMatchObject({
      actor: { kind: "agent", name: "repair-bot" },
      op: "requeue_analysis",
      target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas", ledgerIndex: 0 },
      reason: "auto: HD3 dangling source ref",
      revisionBefore: baseRevision,
      revisionAfter: result.revision,
      change: { path: "signals[0].status.atlas" },
    });
  });
});

describe("T-42: agent requeue on a human-first (systemic) row is blocked", () => {
  it("returns 403-shaped POLICY_HUMAN_REQUIRED, leaves the ledger byte-identical, and writes no audit entry", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    const before = await readFile(ledgerFilePath(), "utf8");

    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-07_harborline_weekly_sync", project: "harborline" },
        baseRevision,
        actor: agentActor(),
      }),
    ).rejects.toMatchObject({ code: "POLICY_HUMAN_REQUIRED", status: 403 });

    const after = await readFile(ledgerFilePath(), "utf8");
    expect(after).toBe(before);
    const audit = await readAudit(20);
    expect(audit.total).toBe(0);
  });
});

describe("T-43: the same repair by a human succeeds", () => {
  it("matches Appendix A-7 row 2", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();

    const result = await applyRepair({
      op: "requeue_analysis",
      target: { signalId: "2026-07-07_harborline_weekly_sync", project: "harborline" },
      baseRevision,
      actor: human(),
    });
    expect(result.ok).toBe(true);

    const report = await buildCurrentReport();
    expect(report.classes.find((c) => c.id === "HD1")?.count).toBe(26);
    expect(report.totals.humanFirst).toBe(22);
    const harborline = report.projects.find((p) => p.id === "harborline")!;
    expect(harborline.counts.humanFirst).toBe(6);
    expect(harborline.counts.analyzed).toBe(8);
  });
});

describe("T-44: identity-conflict targets are always rejected, before any policy check", () => {
  it("a signal id shared by two records -> 409 IDENTITY_CONFLICT with ledgerIndices", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-22_northwind_supply_portal_walkthrough", project: "northwind" },
        baseRevision,
        actor: human(),
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT", status: 409, details: { ledgerIndices: [19, 20] } });
  });

  it("a unique id that is still an HD5 group member -> 409 IDENTITY_CONFLICT with groupId", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-27_ops_retro_dup", project: "studio_ops" },
        baseRevision,
        actor: human(),
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT", status: 409, details: { groupId: "HD5:27,28" } });
  });
});

describe("T-45: not-found, wrong project, and wrong state", () => {
  it("an unknown signal id -> 404 SIGNAL_NOT_FOUND", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2099-01-01_does_not_exist", project: "atlas" },
        baseRevision,
        actor: human(),
      }),
    ).rejects.toMatchObject({ code: "SIGNAL_NOT_FOUND", status: 404 });
  });

  it("a project not on the signal -> 422 PRECONDITION_FAILED", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-06_atlas_permit_intake", project: "quill" },
        baseRevision,
        actor: human(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", status: 422 });
  });

  it("a pending (not analysed) entry -> 422 PRECONDITION_FAILED", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "set_summary",
        target: { signalId: "2026-07-23_portal_handover_check", project: "northwind" },
        baseRevision,
        actor: human(),
        summary: "A long enough summary text for validation.",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", status: 422 });
  });
});

describe("T-46: set_summary policy, success, and re-application", () => {
  const target = { signalId: "2026-08-06_quill_editor_shaping", project: "quill" };

  it("an agent may never set_summary -> 403 POLICY_HUMAN_REQUIRED", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "set_summary",
        target,
        baseRevision,
        actor: agentActor(),
        summary: "A long enough summary text for validation.",
      }),
    ).rejects.toMatchObject({ code: "POLICY_HUMAN_REQUIRED", status: 403 });
  });

  it("a human writing a valid summary succeeds, normalising CRLF and trimming (Appendix A-7 row 3)", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    // applyRepair() expects already-validated input (the route runs RepairRequest.safeParse()
    // before the lock, per spec's W1-W5/W6-W16 split) — go through the schema here too, so the
    // CRLF-normalise-and-trim transform actually runs, matching real request handling.
    const parsed = RepairRequest.parse({
      op: "set_summary",
      target,
      baseRevision,
      actor: human(),
      summary: " Line one\r\nline two of the summary ",
    });
    const result = await applyRepair(parsed);
    expect(result.ok).toBe(true);
    expect(result.change.after).toBe("Line one\nline two of the summary");

    const report = await buildCurrentReport();
    expect(report.classes.find((c) => c.id === "HD1")?.count).toBe(26);
    expect(report.totals.humanFirst).toBe(22);
    expect(report.ledger.handedOffCount).toBe(1);
    const quill = report.projects.find((p) => p.id === "quill")!;
    expect(quill.counts.humanFirst).toBe(3);
    expect(quill.counts.handedOff).toBe(1);

    // Applying set_summary again on the now-clean row: HD1 no longer applies -> PRECONDITION_FAILED
    const nextRevision = await currentRevision();
    await expect(
      applyRepair({
        op: "set_summary",
        target,
        baseRevision: nextRevision,
        actor: human(),
        summary: "Another perfectly valid summary text.",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", status: 422 });

    // requeue on the same now-zero-defect row: nothing left to retract -> NOTHING_TO_REPAIR
    await expect(
      applyRepair({ op: "requeue_analysis", target, baseRevision: nextRevision, actor: human() }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_REPAIR", status: 422 });
  });
});

describe("T-47: a stale baseRevision is rejected", () => {
  it("returns 409 STALE_REVISION with the real current revision", async () => {
    env = await makeTempEnv();
    const real = await currentRevision();
    const stale = "0".repeat(64);
    await expect(
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
        baseRevision: stale,
        actor: human(),
      }),
    ).rejects.toMatchObject({ code: "STALE_REVISION", status: 409, details: { currentRevision: real } });
  });
});

describe("T-48: concurrent writes with the same baseRevision", () => {
  it("exactly one succeeds and the other gets STALE_REVISION", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();

    const results = await Promise.allSettled([
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
        baseRevision,
        actor: agentActor(),
      }),
      applyRepair({
        op: "requeue_analysis",
        target: { signalId: "2026-07-15_portal_handover_check", project: "northwind" },
        baseRevision,
        actor: agentActor(),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "STALE_REVISION" });

    const audit = await readAudit(20);
    expect(audit.total).toBe(1);
  });
});

describe("T-49: an audit-write failure rolls the ledger back atomically", () => {
  it("500 AUDIT_FAILED, ledger bytes restored to pre-request state, no leftover .tmp files", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    const before = await readFile(ledgerFilePath(), "utf8");

    const brokenAuditIo: AuditIo = {
      open: async () => {
        const handle: AuditFileHandle = {
          appendFile: async () => {
            throw new Error("simulated disk full");
          },
          sync: async () => undefined,
          close: async () => undefined,
        };
        return handle;
      },
    };

    await expect(
      applyRepair(
        {
          op: "requeue_analysis",
          target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
          baseRevision,
          actor: agentActor(),
        },
        { auditIo: brokenAuditIo },
      ),
    ).rejects.toMatchObject({ code: "AUDIT_FAILED", status: 500 });

    const after = await readFile(ledgerFilePath(), "utf8");
    expect(after).toBe(before);

    const dataFiles = await readdir(env.dataDir);
    expect(dataFiles.filter((f) => f.endsWith(".tmp"))).toEqual([]);

    const audit = await readAudit(20);
    expect(audit.total).toBe(0);
  });
});

describe("T-49b: a ledger write failure never leaves a partial file", () => {
  it("500 WRITE_FAILED, ledger bytes unchanged, no audit entry, no leftover .tmp", async () => {
    env = await makeTempEnv();
    const baseRevision = await currentRevision();
    const before = await readFile(ledgerFilePath(), "utf8");

    const brokenLedgerIo: Io = {
      open: async (p, flags) => {
        const { nodeIo } = await import("@/server/ledger/store");
        return nodeIo.open(p, flags);
      },
      rename: async () => {
        const err = new Error("EPERM") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      },
      rm: async (p, opts) => {
        const { nodeIo } = await import("@/server/ledger/store");
        return nodeIo.rm(p, opts);
      },
    };

    await expect(
      applyRepair(
        {
          op: "requeue_analysis",
          target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
          baseRevision,
          actor: agentActor(),
        },
        { ledgerIo: brokenLedgerIo },
      ),
    ).rejects.toMatchObject({ code: "WRITE_FAILED", status: 500 });

    const after = await readFile(ledgerFilePath(), "utf8");
    expect(after).toBe(before);
    const dataFiles = await readdir(env.dataDir);
    expect(dataFiles.filter((f) => f.endsWith(".tmp"))).toEqual([]);
    const audit = await readAudit(20);
    expect(audit.total).toBe(0);
  });
});

describe("T-50: unknown keys on the raw record survive a write", () => {
  it("an x_extra key on the signal and on its status entry are preserved after a requeue", async () => {
    env = await makeTempEnv();
    await readLedger(); // seed
    const raw = JSON.parse(await readFile(ledgerFilePath(), "utf8"));
    raw.signals[0].x_extra = "keep-me";
    raw.signals[0].status.atlas.x_extra_on_entry = "keep-me-too";
    const mutatedBytes = JSON.stringify(raw, null, 2) + "\n";
    await writeFile(ledgerFilePath(), mutatedBytes, "utf8");
    const baseRevision = createHash("sha256").update(mutatedBytes).digest("hex");

    await applyRepair({
      op: "requeue_analysis",
      target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
      baseRevision,
      actor: human(),
    });

    const after = JSON.parse(await readFile(ledgerFilePath(), "utf8"));
    expect(after.signals[0].x_extra).toBe("keep-me");
    expect(after.signals[0].status.atlas.x_extra_on_entry).toBe("keep-me-too");
    expect(after.signals[0].status.atlas.state).toBe("pending");
  });
});

describe("T-52: the repo's real fixture/ is never touched by any write-path test", () => {
  it("SHA-256 of all 6 fixture files still matches Appendix C", async () => {
    const EXPECTED: Record<string, string> = {
      "README.md": "4b6f4e6b03982346ca0a34830c8c9715caba67de4cf48b2b309f08f8250c6d31",
      "config.json": "be3cbecc79e39a4da7795afd172e98081f97632f2b8292f04eddada8dea71719",
      "make_fixture.py": "ebfe7f15feab2070fe4d1df5a2443bed4d0e7b787ea7ddde00038b3c26c7535f",
      "routing-hints.json": "733957eaa51ab53b69e8a8fe5f2fad2a6918285365a8834ee83ffe6bbad3c821",
      "run-log.jsonl": "b936635631c0551c8c4ffc55f022f792f5539ffd1ce9ab02b7cb83a702bcb90e",
      "signal-ledger.json": "3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546",
    };
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const bytes = await readFile(`${process.cwd()}/fixture/${name}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    }
  });
});
