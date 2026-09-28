import { beforeAll, describe, expect, it } from "vitest";
import { detectHD1 } from "@/server/detect/hd1-missing-summary";
import { detectHD2 } from "@/server/detect/hd2-dangling-analysis-ref";
import { detectHD3 } from "@/server/detect/hd3-dangling-source-ref";
import { detectHD4 } from "@/server/detect/hd4-analysis-without-sources";
import { buildContext, type DetectorContext } from "@/server/detect/context";
import { loadRealFixtureContext } from "./helpers/fixtureContext";
import { makeCtx, makeEntry, makeSignal, withStatus } from "./helpers/builders";

let fixtureCtx: DetectorContext;

beforeAll(async () => {
  fixtureCtx = await loadRealFixtureContext();
});

describe("HD1 missing_summary (T-10)", () => {
  it("finds exactly 27 rows on the real fixture, split by project as the spec claims", () => {
    const findings = detectHD1(fixtureCtx);
    expect(findings).toHaveLength(27);

    const byProject: Record<string, number> = {};
    for (const f of findings) byProject[f.projectId] = (byProject[f.projectId] ?? 0) + 1;
    expect(byProject).toEqual({ harborline: 9, atlas: 6, northwind: 4, quill: 4, studio_ops: 4 });
  });

  it("treats a null summary and an empty-string summary as equally blank", () => {
    const nullSummary = makeSignal({ summary: null, notes: null, status: withStatus("atlas") });
    const emptyStringSummary = makeSignal({ summary: "", notes: null, status: withStatus("atlas") });
    const ctx = makeCtx({ signals: [nullSummary, emptyStringSummary] });
    const findings = detectHD1(ctx);
    expect(findings).toHaveLength(2);
  });

  it("synthetic edge cases: whitespace summary, present summary, present notes, object summary, pending entry", () => {
    const whitespaceSummary = makeSignal({ summary: " ", notes: null, status: withStatus("atlas") });
    const presentSummary = makeSignal({ summary: "x", notes: null, status: withStatus("atlas") });
    const presentNotes = makeSignal({ summary: null, notes: "x", status: withStatus("atlas") });
    const objectSummary = makeSignal({ summary: {}, notes: null, status: withStatus("atlas") });
    const pendingEntry = makeSignal({
      summary: null,
      notes: null,
      status: withStatus("atlas", { state: "pending", analyzed_at: null, analysis_ref: null }),
    });
    const ctx = makeCtx({ signals: [whitespaceSummary, presentSummary, presentNotes, objectSummary, pendingEntry] });
    const findings = detectHD1(ctx);
    const flagged = new Set(findings.map((f) => f.ledgerIndex));
    expect(flagged.has(0)).toBe(true); // whitespace summary -> defect
    expect(flagged.has(1)).toBe(false); // present summary -> none
    expect(flagged.has(2)).toBe(false); // present notes -> none
    expect(flagged.has(3)).toBe(false); // object summary counts as present -> none
    expect(flagged.has(4)).toBe(false); // pending, not eligible -> none
    expect(findings).toHaveLength(1);
  });
});

describe("HD2 dangling_analysis_ref (T-11)", () => {
  it("finds exactly 3 rows on the real fixture, all analysis_ref run-999 beyond the recorded run log", () => {
    const { findings, verified, unverifiable } = detectHD2(fixtureCtx);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.details.ref === "run-999" && f.details.reason === "beyond_recorded_runs")).toBe(
      true,
    );
    const flagged = new Set(findings.map((f) => `${f.ledgerIndex}:${f.projectId}`));
    expect(flagged).toEqual(
      new Set(["19:northwind", "22:harborline", "26:atlas"]),
    );
    expect(verified).toBe(0);
    expect(unverifiable).toBe(24);
    expect(fixtureCtx.recordedRuns.size).toBe(45);
    expect(fixtureCtx.minRun).toBe(100);
    expect(fixtureCtx.maxRun).toBe(160);
  });

  it("classifies every synthetic ref case against runs 100-104 and 107", () => {
    const runs = [100, 101, 102, 103, 104, 107];
    const cases = [
      makeSignal({ status: withStatus("atlas", { analysis_ref: null }) }), // missing
      makeSignal({ status: withStatus("atlas", { analysis_ref: "RUN-5" }) }), // malformed (case)
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-x" }) }), // malformed (non-digit)
      makeSignal({ status: withStatus("atlas", { analysis_ref: 42 as unknown as string }) }), // malformed (not a string)
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-105" }) }), // not_in_run_log
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-104" }) }), // verified
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-99" }) }), // unverifiable (below minRun)
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-108" }) }), // beyond_recorded_runs
    ];
    const ctx = makeCtx({ signals: cases, runs });
    const { findings, verified, unverifiable } = detectHD2(ctx);

    const reasonByIndex = new Map(findings.map((f) => [f.ledgerIndex, f.details.reason]));
    expect(reasonByIndex.get(0)).toBe("missing");
    expect(reasonByIndex.get(1)).toBe("malformed");
    expect(reasonByIndex.get(2)).toBe("malformed");
    expect(reasonByIndex.get(3)).toBe("malformed");
    expect(reasonByIndex.get(4)).toBe("not_in_run_log");
    expect(reasonByIndex.has(5)).toBe(false); // verified: no finding
    expect(reasonByIndex.has(6)).toBe(false); // unverifiable: no finding
    expect(reasonByIndex.get(7)).toBe("beyond_recorded_runs");
    expect(verified).toBe(1);
    expect(unverifiable).toBe(1);
    expect(findings).toHaveLength(6); // missing + malformed×3 + not_in_run_log + beyond_recorded_runs
  });

  it("an empty run log makes every well-formed ref unverifiable, but a missing ref is still a defect", () => {
    const cases = [
      makeSignal({ status: withStatus("atlas", { analysis_ref: "run-5" }) }),
      makeSignal({ status: withStatus("atlas", { analysis_ref: null }) }),
    ];
    const ctx = makeCtx({ signals: cases, runs: [] });
    const { findings, verified, unverifiable } = detectHD2(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.details.reason).toBe("missing");
    expect(verified).toBe(0);
    expect(unverifiable).toBe(1);
    expect(ctx.maxRun).toBeNull();
  });
});

describe("HD3 dangling_source_ref (T-12)", () => {
  it("finds exactly 1 row on the real fixture, the atlas permit intake path", () => {
    const findings = detectHD3(fixtureCtx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ledgerIndex).toBe(0);
    expect(findings[0]?.projectId).toBe("atlas");
    expect(findings[0]?.details.missing).toEqual([
      "sources/granola/2026-07-06-atlas_permit_intake.md",
    ]);
  });

  it("a reviewed path that matches an existing source is not a defect", () => {
    const signal = makeSignal({
      sources: { granola_note: "sources/granola/a.md", transcript: null, recording: null },
      status: withStatus("atlas", { files_reviewed: ["sources/granola/a.md"] }),
    });
    const ctx = makeCtx({ signals: [signal] });
    expect(detectHD3(ctx)).toHaveLength(0);
  });

  it("two missing paths produce a single finding listing both", () => {
    const signal = makeSignal({
      sources: { granola_note: "sources/granola/a.md", transcript: null, recording: null },
      status: withStatus("atlas", { files_reviewed: ["sources/granola/b.md", "sources/granola/c.md"] }),
    });
    const ctx = makeCtx({ signals: [signal] });
    const findings = detectHD3(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.details.missing).toEqual(["sources/granola/b.md", "sources/granola/c.md"]);
  });
});

describe("HD4 analysis_without_sources (T-13)", () => {
  it("finds exactly 1 row on the real fixture, the northwind portal handover check", () => {
    const findings = detectHD4(fixtureCtx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ledgerIndex).toBe(12);
    expect(findings[0]?.projectId).toBe("northwind");
    expect(findings[0]?.details.sourceCount).toBe(0);
  });

  it("empty files_reviewed array is a defect", () => {
    const signal = makeSignal({ status: withStatus("atlas", { files_reviewed: [] }) });
    const ctx = makeCtx({ signals: [signal] });
    expect(detectHD4(ctx)).toHaveLength(1);
  });

  it("files_reviewed key entirely absent is a defect", () => {
    const entry = makeEntry({});
    delete (entry as Partial<typeof entry>).files_reviewed;
    const signal = makeSignal({ status: { atlas: entry } });
    const ctx = makeCtx({ signals: [signal] });
    expect(detectHD4(ctx)).toHaveLength(1);
  });

  it("a pending entry with an empty files_reviewed array is not eligible, so no defect", () => {
    const signal = makeSignal({
      status: withStatus("atlas", { state: "pending", files_reviewed: [], analyzed_at: null, analysis_ref: null }),
    });
    const ctx = makeCtx({ signals: [signal] });
    expect(detectHD4(ctx)).toHaveLength(0);
  });
});

describe("Edge case: empty ledger", () => {
  it("every HD1-HD4 detector returns no findings and eligible is 0", () => {
    const ctx = makeCtx({ signals: [] });
    expect(ctx.eligible).toBe(0);
    expect(detectHD1(ctx)).toHaveLength(0);
    expect(detectHD2(ctx).findings).toHaveLength(0);
    expect(detectHD3(ctx)).toHaveLength(0);
    expect(detectHD4(ctx)).toHaveLength(0);
  });
});

describe("Detectors do not mutate their input (T-16, HD1-HD4 slice)", () => {
  it("produce the same output whether the context is deep-frozen or not", () => {
    function deepFreeze<T>(value: T): T {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.getOwnPropertyNames(value)) {
          deepFreeze((value as Record<string, unknown>)[key]);
        }
      }
      return value;
    }

    const buildFreshContext = () =>
      buildContext({
        signals: fixtureCtx.signals.map((s) => ({ ledgerIndex: s.ledgerIndex, signal: structuredClone(s.signal) })),
        config: structuredClone(fixtureCtx.config),
        runLog: structuredClone([...fixtureCtx.runLog]),
        hints: structuredClone([...fixtureCtx.hints]),
      });

    const plain = buildFreshContext();
    const frozen = deepFreeze(buildFreshContext());

    expect(() => {
      detectHD1(frozen);
      detectHD2(frozen);
      detectHD3(frozen);
      detectHD4(frozen);
    }).not.toThrow();

    expect(detectHD1(frozen)).toEqual(detectHD1(plain));
    expect(detectHD2(frozen)).toEqual(detectHD2(plain));
    expect(detectHD3(frozen)).toEqual(detectHD3(plain));
    expect(detectHD4(frozen)).toEqual(detectHD4(plain));
  });
});
