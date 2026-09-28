import { describe, expect, it } from "vitest";
import { buildRealReport } from "./helpers/realReport";
import { buildContext } from "@/server/detect/context";
import { runDetectors } from "@/server/detect/index";
import { buildReport } from "@/server/report";
import { makeConfig, makeCtx } from "./helpers/builders";

describe("project order and counts (T-30, Appendix A-4)", () => {
  it("matches the real fixture exactly", () => {
    const report = buildRealReport();
    const rows = report.projects.map((p) => ({
      id: p.id,
      type: p.type,
      rank: p.rank,
      identityConflicts: p.counts.identityConflicts,
      humanFirst: p.counts.humanFirst,
      agentSafe: p.counts.agentSafe,
      analyzed: p.counts.analyzed,
      handedOff: p.counts.handedOff,
    }));

    expect(rows).toEqual([
      { id: "studio_ops", type: "internal", rank: 1, identityConflicts: 2, humanFirst: 1, agentSafe: 0, analyzed: 4, handedOff: 0 },
      { id: "harborline", type: "client", rank: 2, identityConflicts: 1, humanFirst: 7, agentSafe: 1, analyzed: 9, handedOff: 0 },
      { id: "northwind", type: "client", rank: 3, identityConflicts: 1, humanFirst: 2, agentSafe: 1, analyzed: 4, handedOff: 0 },
      { id: "atlas", type: "client", rank: 4, identityConflicts: 0, humanFirst: 4, agentSafe: 2, analyzed: 6, handedOff: 0 },
      { id: "quill", type: "product", rank: 5, identityConflicts: 0, humanFirst: 4, agentSafe: 0, analyzed: 4, handedOff: 0 },
    ]);
  });
});

describe("totals and ledger counts (T-31, Appendix A-8)", () => {
  it("matches the real fixture exactly", () => {
    const report = buildRealReport();
    expect(report.ledger).toEqual({
      version: 4,
      signalCount: 77,
      analyzedCount: 27,
      handedOffCount: 0,
      skippedRecords: [],
    });
    expect(report.classes.map((c) => `${c.id}=${c.count}`)).toEqual([
      "HD5=4",
      "HD6=1",
      "HD2=3",
      "HD3=1",
      "HD4=1",
      "HD1=27",
    ]);
    expect(report.systemic).toEqual([{ classId: "HD1", count: 27, eligible: 27, rate: 1, message: expect.any(String) }]);
    expect(report.totals).toEqual({ humanFirst: 23, agentSafe: 4, identityConflicts: 4, configFindings: 1 });
    expect(report.projects.map((p) => p.id)).toEqual(["studio_ops", "harborline", "northwind", "atlas", "quill"]);
    expect(report.config).toHaveLength(1);
    expect(report.config[0]).toMatchObject({ ref: "quil", suggestion: "quill" });
  });
});

describe("row order per project (T-32, Appendix A-6)", () => {
  it("harborline human-first and agent-safe rows are in the exact spec order", () => {
    const report = buildRealReport();
    const harborline = report.projects.find((p) => p.id === "harborline")!;
    expect(harborline.humanFirst.map((r) => r.signal.id)).toEqual([
      "2026-07-07_harborline_weekly_sync",
      "2026-07-08_manifest_import_retro",
      "2026-07-09_harborline_manifest_import",
      "2026-07-16_harborline_weekly_sync",
      "2026-08-10_freight_manifest_edge_cases",
      "2026-08-27_harborline_manifest_import",
      "2026-08-28_freight_manifest_edge_cases",
    ]);
    expect(harborline.agentSafe.map((r) => r.signal.id)).toEqual(["2026-07-23_harborline_weekly_sync"]);
  });

  it("atlas human-first and agent-safe rows are in the exact spec order", () => {
    const report = buildRealReport();
    const atlas = report.projects.find((p) => p.id === "atlas")!;
    expect(atlas.humanFirst.map((r) => r.signal.id)).toEqual([
      "2026-07-30_atlas_permit_intake",
      "2026-08-04_inspection_scheduling_walkthrough",
      "2026-09-02_atlas_permit_intake",
      "2026-09-03_atlas_permit_intake",
    ]);
    expect(atlas.agentSafe.map((r) => r.signal.id)).toEqual([
      "2026-07-06_atlas_permit_intake",
      "2026-07-27_inspection_scheduling_walkthrough",
    ]);
  });
});

describe("structure (T-33)", () => {
  it("every HD5 group is listed under the correct project, rowKeys/groupIds are unique, no locked row leaks into a lane", () => {
    const report = buildRealReport();

    const groupsByProjectId = new Map(
      report.projects.map((p) => [p.id, new Set(p.identityConflicts.map((g) => g.groupId))]),
    );
    expect(groupsByProjectId.get("northwind")?.has("HD5:19,20")).toBe(true);
    expect(groupsByProjectId.get("studio_ops")?.has("HD5:27,28")).toBe(true);
    expect(groupsByProjectId.get("studio_ops")?.has("HD5:57,58")).toBe(true);
    expect(groupsByProjectId.get("harborline")?.has("HD5:50,51")).toBe(true);

    const allRowKeys = report.projects.flatMap((p) => [...p.humanFirst, ...p.agentSafe]).map((r) => r.rowKey);
    expect(new Set(allRowKeys).size).toBe(allRowKeys.length);

    const allGroupIds = report.projects.flatMap((p) => p.identityConflicts.map((g) => g.groupId));
    // groups may legitimately repeat across projects if members span projects; in the real fixture
    // every group is single-project, so distinct groupIds should equal 4 here.
    expect(new Set(allGroupIds).size).toBe(4);

    const lockedIndices = new Set([19, 20, 27, 28, 50, 51, 57, 58]);
    for (const rowKey of allRowKeys) {
      const ledgerIndex = Number(rowKey.split(":")[0]);
      expect(lockedIndices.has(ledgerIndex)).toBe(false);
    }
  });
});

describe("empty ledger (T-34)", () => {
  it("produces 5 clean projects, zero totals, no systemic patterns, and zero counts for all six classes", () => {
    const config = makeConfig();
    const ctx = buildContext({ signals: [], config, runLog: [], hints: [] });
    const detectors = runDetectors(ctx);
    const report = buildReport({
      revision: "empty",
      ledgerVersion: 4,
      rawSignalCount: 0,
      skippedRecords: [],
      ctx,
      detectors,
    });

    expect(report.projects).toHaveLength(5);
    for (const p of report.projects) {
      expect(p.counts).toEqual({ identityConflicts: 0, humanFirst: 0, agentSafe: 0, analyzed: 0, handedOff: 0 });
      expect(p.humanFirst).toEqual([]);
      expect(p.agentSafe).toEqual([]);
      expect(p.identityConflicts).toEqual([]);
    }
    expect(report.totals).toEqual({ humanFirst: 0, agentSafe: 0, identityConflicts: 0, configFindings: 0 });
    expect(report.systemic).toEqual([]);
    expect(report.classes.every((c) => c.count === 0)).toBe(true);

    // sanity check using a throwaway context builder to make sure makeCtx also works for [] input
    expect(makeCtx({ signals: [] }).eligible).toBe(0);
  });
});
