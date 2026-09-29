import { describe, expect, it } from "vitest";
import { actionsFor, isSystemic } from "@/server/policy";
import { buildRealReport } from "./helpers/realReport";
import { runDetectors } from "@/server/detect/index";
import { buildReport } from "@/server/report";
import { makeCtx, makeSignal, withStatus } from "./helpers/builders";

describe("isSystemic (T-20)", () => {
  it.each([
    [27, 27, true],
    [3, 27, false],
    [5, 10, true],
    [4, 8, false],
    [0, 0, false],
  ])("isSystemic(%i, %i) === %s", (count, eligible, expected) => {
    expect(isSystemic(count, eligible)).toBe(expected);
  });
});

describe("lanes (T-21)", () => {
  it("agent-safe rows on the real fixture are exactly Appendix A-5", () => {
    const report = buildRealReport();
    const agentSafeIds = report.projects
      .flatMap((p) => p.agentSafe)
      .map((r) => `${r.signal.ledgerIndex}:${r.project}`)
      .sort();
    expect(agentSafeIds).toEqual(["0:atlas", "12:northwind", "22:harborline", "26:atlas"].sort());
    expect(report.totals.agentSafe).toBe(4);
  });

  it("synthetic: an isolated HD1 (1 of 6 analysed, not systemic) makes the row agent_safe", () => {
    // 6 analysed signals, only 1 blank -> HD1 count 1, eligible 6: 1/6 < 0.5, not systemic.
    const blank = makeSignal({ summary: null, notes: null, status: withStatus("atlas") });
    const filled = Array.from({ length: 5 }, () => makeSignal({ summary: "x", status: withStatus("atlas") }));
    const ctx = makeCtx({ signals: [blank, ...filled] });
    const detectors = runDetectors(ctx);
    const report = buildReport({
      revision: "r",
      ledgerVersion: 4,
      rawSignalCount: 6,
      skippedRecords: [],
      ctx,
      detectors,
    });

    const row = report.projects.flatMap((p) => [...p.agentSafe, ...p.humanFirst]).find((r) => r.signal.ledgerIndex === 0);
    expect(row?.classes).toEqual(["HD1"]);
    expect(row?.lane).toBe("agent_safe");
  });
});

describe("actionsFor (T-22)", () => {
  it("agent_safe row with HD1: requeue allowed for human+agent, summary for human only", () => {
    const actions = actionsFor({ classes: ["HD3", "HD1"], lane: "agent_safe" });
    expect(actions).toEqual([
      { op: "requeue_analysis", label: "Re-queue analysis", allowedFor: ["human", "agent"], disabledReason: null },
      { op: "set_summary", label: "Add summary", allowedFor: ["human"], disabledReason: null },
    ]);
  });

  it("human_first HD1-only row: requeue allowed for human only, summary for human only", () => {
    const actions = actionsFor({ classes: ["HD1"], lane: "human_first" });
    expect(actions).toEqual([
      { op: "requeue_analysis", label: "Re-queue analysis", allowedFor: ["human"], disabledReason: null },
      { op: "set_summary", label: "Add summary", allowedFor: ["human"], disabledReason: null },
    ]);
  });
});
