import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { detectHD1 } from "@/server/detect/hd1-missing-summary";
import { detectHD2 } from "@/server/detect/hd2-dangling-analysis-ref";
import { detectHD3 } from "@/server/detect/hd3-dangling-source-ref";
import { detectHD4 } from "@/server/detect/hd4-analysis-without-sources";
import { detectHD5 } from "@/server/detect/hd5-identity-conflict";
import { detectHD6, suggestProjectId } from "@/server/detect/hd6-dangling-project-ref";
import { runDetectors } from "@/server/detect/index";
import { buildContext, type DetectorContext } from "@/server/detect/context";
import { loadRealFixtureContext } from "./helpers/fixtureContext";
import { makeConfig, makeCtx, makeEntry, makeSignal, withStatus } from "./helpers/builders";

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

describe("HD5 identity_conflict (T-14)", () => {
  it("finds exactly 4 groups on the real fixture, matching Appendix A-3", () => {
    const groups = detectHD5(fixtureCtx);
    expect(groups).toHaveLength(4);
    const byId = new Map(groups.map((g) => [g.groupId, g]));

    const g1 = byId.get("HD5:19,20");
    expect(g1?.kind).toBe("exact_id_collision");
    expect(g1?.sharedSourcePaths).toHaveLength(1);

    const g2 = byId.get("HD5:27,28");
    expect(g2?.kind).toBe("near_duplicate");
    expect(g2?.sharedSourcePaths).toHaveLength(3);
    expect(g2?.members.find((m) => m.ledgerIndex === 28)?.idMatchesRule).toBe(false);
    expect(g2?.members.find((m) => m.ledgerIndex === 27)?.idMatchesRule).toBe(true);

    const g3 = byId.get("HD5:50,51");
    expect(g3?.kind).toBe("exact_id_collision");
    expect(g3?.sharedSourcePaths).toHaveLength(2);

    const g4 = byId.get("HD5:57,58");
    expect(g4?.kind).toBe("exact_id_collision");
    expect(g4?.sharedSourcePaths).toHaveLength(2);

    // 0 standalone id_format_mismatch groups in the real fixture (spec §3.7)
    expect(groups.some((g) => g.kind === "id_format_mismatch")).toBe(false);
  });

  it("synthetic: same id with a different match_key is still exact_id_collision", () => {
    const a = makeSignal({ id: "shared-id", match_key: "alpha", date: "2026-01-01" });
    const b = makeSignal({ id: "shared-id", match_key: "beta", date: "2026-01-02" });
    const groups = detectHD5(makeCtx({ signals: [a, b] }));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("exact_id_collision");
    expect(groups[0]?.members).toHaveLength(2);
  });

  it("synthetic: A~B by id and B~C by identityKey merge into one 3-member near_duplicate group", () => {
    const a = makeSignal({ id: "chain-id", date: "2026-02-01", match_key: "topic1" });
    const b = makeSignal({ id: "chain-id", date: "2026-02-05", match_key: "topic2" });
    const c = makeSignal({ id: "different-id", date: "2026-02-05", match_key: "topic2" });
    const groups = detectHD5(makeCtx({ signals: [a, b, c] }));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toHaveLength(3);
    expect(groups[0]?.kind).toBe("near_duplicate");
  });

  it("synthetic: a lone record whose id breaks the canonical {date}_{match_key} rule is its own id_format_mismatch group", () => {
    const lone = makeSignal({ id: "totally-different-id", date: "2026-03-01", match_key: "solo_topic" });
    const groups = detectHD5(makeCtx({ signals: [lone] }));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("id_format_mismatch");
    expect(groups[0]?.members).toHaveLength(1);
  });

  it("synthetic: unique records with canonical ids produce no groups", () => {
    const a = makeSignal({ date: "2026-04-01", match_key: "alpha" });
    const b = makeSignal({ date: "2026-04-02", match_key: "beta" });
    expect(detectHD5(makeCtx({ signals: [a, b] }))).toHaveLength(0);
  });
});

describe("HD6 dangling_project_ref (T-15)", () => {
  it("finds exactly 1 finding on the real fixture: routing hint #3, drafting -> quil, suggestion quill", () => {
    const findings = detectHD6(fixtureCtx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      site: "routing_hint",
      ref: "quil",
      suggestion: "quill",
      location: { file: "routing-hints.json", index: 2 },
    });
  });

  it("signal_projects: an unknown project id in signal.projects is flagged", () => {
    const signal = makeSignal({ projects: ["ghost"] });
    const findings = detectHD6(makeCtx({ signals: [signal] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.site).toBe("signal_projects");
    expect(findings[0]?.ref).toBe("ghost");
  });

  it("status_key_unknown: an unknown project id used as a status key is flagged", () => {
    const signal = makeSignal({ projects: ["atlas"], status: withStatus("ghost") });
    const findings = detectHD6(makeCtx({ signals: [signal] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.site).toBe("status_key_unknown");
    expect(findings[0]?.ref).toBe("ghost");
  });

  it("status_key_not_routed: a valid project id as a status key that isn't in signal.projects is flagged", () => {
    const signal = makeSignal({ projects: ["atlas"], status: withStatus("harborline") });
    const findings = detectHD6(makeCtx({ signals: [signal] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.site).toBe("status_key_not_routed");
    expect(findings[0]?.ref).toBe("harborline");
    expect(findings[0]?.suggestion).toBeNull();
  });

  it("a fallback id like internal_unsorted is valid and produces no finding", () => {
    const signal = makeSignal({ projects: ["internal_unsorted"], status: withStatus("internal_unsorted") });
    expect(detectHD6(makeCtx({ signals: [signal] }))).toHaveLength(0);
  });

  it("suggestion is null when no config id is within Levenshtein distance 2", () => {
    const signal = makeSignal({ projects: ["zzzz"] });
    const findings = detectHD6(makeCtx({ signals: [signal] }));
    expect(findings[0]?.suggestion).toBeNull();
  });

  it("suggestion is null when two config ids are equidistant (no unique minimum)", () => {
    const config = makeConfig({
      projects: [
        { id: "cat", name: "Cat", type: "client", keywords: [], domains: [], emails: [], active: true },
        { id: "car", name: "Car", type: "client", keywords: [], domains: [], emails: [], active: true },
      ],
      fallbacks: { unrouted: "internal_unsorted", unknown_project: "unclassified" },
    });
    // "cab" is distance 1 from both "cat" and "car"
    expect(suggestProjectId("cab", ["cat", "car"])).toBeNull();
    const signal = makeSignal({ projects: ["cab"] });
    const findings = detectHD6(makeCtx({ signals: [signal], config }));
    expect(findings[0]?.suggestion).toBeNull();
  });
});

describe("All six detectors do not mutate their input (T-16)", () => {
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

  it("produce the same output whether the context is deep-frozen or not, and never throw", () => {
    const plain = buildFreshContext();
    const frozen = deepFreeze(buildFreshContext());

    expect(() => {
      detectHD1(frozen);
      detectHD2(frozen);
      detectHD3(frozen);
      detectHD4(frozen);
      detectHD5(frozen);
      detectHD6(frozen);
    }).not.toThrow();

    expect(detectHD1(frozen)).toEqual(detectHD1(plain));
    expect(detectHD2(frozen)).toEqual(detectHD2(plain));
    expect(detectHD3(frozen)).toEqual(detectHD3(plain));
    expect(detectHD4(frozen)).toEqual(detectHD4(plain));
    expect(detectHD5(frozen)).toEqual(detectHD5(plain));
    expect(detectHD6(frozen)).toEqual(detectHD6(plain));
  });
});

describe("No hard-coded fixture values in src/ (T-17)", () => {
  it("src/ never mentions run-999, the quil typo, or a fixture-specific 2026-0x date literal", () => {
    const srcDir = path.join(process.cwd(), "src");
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8");
          if (/run-999/.test(text) || /\bquil\b/.test(text) || /2026-0\d-\d\d/.test(text)) {
            offenders.push(path.relative(process.cwd(), full));
          }
        }
      }
    }
    walk(srcDir);

    expect(offenders).toEqual([]);
  });
});

describe("runDetectors aggregates all six classes (integration, real fixture)", () => {
  it("matches every Appendix A count in one pass", () => {
    const result = runDetectors(fixtureCtx);
    expect(result.findings.filter((f) => f.classId === "HD1")).toHaveLength(27);
    expect(result.findings.filter((f) => f.classId === "HD2")).toHaveLength(3);
    expect(result.findings.filter((f) => f.classId === "HD3")).toHaveLength(1);
    expect(result.findings.filter((f) => f.classId === "HD4")).toHaveLength(1);
    expect(result.groups).toHaveLength(4);
    expect(result.config).toHaveLength(1);
    expect(result.runCheck).toEqual({
      recordedRunCount: 45,
      minRun: 100,
      maxRun: 160,
      verified: 0,
      unverifiable: 24,
      flagged: 3,
    });
  });
});
