# Build log

Append-only record of how this repo was built with Claude Code. One entry per phase. Times in IST.

## P0 — Bootstrap · 2026-09-28 IST

- Did: Added `.gitattributes` and `.gitignore` per spec §4.1/P0.2/P0.3. Replaced the root `README.md`
  (previously corrupted/garbled content from the prior `chore: initial commit`) with the spec's P0.5
  placeholder. Verified the fixture pack before relying on any of it.
- Verified:
  - SHA-256 of all 6 files in `fixture/` matches spec Appendix C exactly (README.md, config.json,
    make_fixture.py, routing-hints.json, run-log.jsonl, signal-ledger.json).
  - Independently recomputed (not just trusted the spec's prose) against the raw JSON/JSONL: 77 signals;
    routing distribution harborline 16 / atlas 15 / quill 14 / northwind 12 / studio_ops 11 /
    internal_unsorted 9; status breakdown 38 one-entry (27 analyzed / 11 pending / 0 deferred), 39 empty;
    summary and notes null on all 77; HD1 rule count 27 with per-project split harborline 9, atlas 6,
    northwind 4, quill 4, studio_ops 4; run-log 45 rows, runs 100-160, failures at 131 and 144; 3 analysed
    entries with `analysis_ref: "run-999"`; 3 exact-id duplicate pairs; routing-hints content including the
    `quil` -> `quill` typo. All match spec §3.4/§3.7/Appendix A exactly. No discrepancy found between the
    spec and the real fixture data.
  - `node --version` -> v24.19.0 (>= 22.12 required). `git --version` -> 2.53.0.
- Caught: The root `README.md` from the pre-existing `chore: initial commit` contained corrupted content
  (a 52-byte binary blob, not real text — looked like a misencoded UTF-16 fragment). Replaced with the
  spec's placeholder text.
- Decisions: none beyond the spec.
- Deviations (human-approved before P0 started):
  - The GitHub repo already existed (`Himkush1414/inbox-handoff-defects`, not
    `supanova-handoff-defects`) with 2 prior commits on `main`, already checked out on
    `feat/defect-dashboard`, before this build began. Skipped the spec's P0 "create a new private repo +
    add collaborator `supanova-furney`" human step for that reason.
  - Per the human's explicit instruction, every phase is committed sequentially on `feat/defect-dashboard`
    only. No `feat/server-defect-engine` / `feat/dashboard-ui` branches are created, and Claude Code does
    not open or merge any PR — the human already has a PR open and manages it themselves in the browser
    (`gh` CLI is also not installed, confirmed unavailable). `main` is never touched.
  - Net effect: DoD-10 ("main + feat/server-defect-engine + feat/dashboard-ui; PR #1 and PR #2 merged with
    merge commits") will not be literally satisfied — history will be a single sequence of phase commits on
    `feat/defect-dashboard`. DoD-11 (private repo + `supanova-furney` collaborator) is the human's
    responsibility, not verified by Claude Code.
- Commits: f4af5d6 chore: bootstrap repo conventions and fix corrupted README

## P1 — Toolchain scaffold · 2026-09-28 IST

- Did: package.json (pinned deps exactly per spec §2), tsconfig.json, next.config.ts, vitest.config.ts,
  test/stubs/server-only.ts, .nvmrc, src/app/layout.tsx + page.tsx + globals.css placeholders,
  test/fixture-integrity.test.ts (T-01).
- Verified:
  - `npm install` once to create package-lock.json, then `rm -rf node_modules && npm ci` — clean
    reinstall succeeds.
  - Confirmed every dependency resolved to the exact pinned version in package-lock.json (next 16.3.6,
    react/react-dom 19.3.0, server-only 0.0.1, zod 4.6.5, typescript 6.0.3, vitest 5.0.2, @types/node
    22.20.4, @types/react 19.3.0, @types/react-dom 19.3.0) — no `^`/`~` drift.
  - `npm run verify` (typecheck && test && build) exits 0: tsc clean, 6/6 tests pass (T-01 fixture
    hashes), `next build` compiles and prerenders `/` and `/_not-found` as static.
  - `git status --porcelain` after the build shows only source files Claude Code created —
    tsconfig.json unmodified by Next, `.next/`, `node_modules/`, `next-env.d.ts` correctly ignored.
- Caught: nothing.
- Decisions: none beyond the spec.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 3740a31 chore: scaffold Next.js 16 + Vitest toolchain with pinned versions

## P2 — Read path · 2026-09-28 IST

- Did: src/server/config.ts, errors.ts, fixture.ts (readConfig/readRoutingHints/readRunLog),
  ledger/schema.ts (Zod validators per spec §4.3), ledger/store.ts (seed, readLedger, atomicWrite,
  withWriteLock, injectable Io), src/lib/contracts.ts (report types + CLASS_META),
  scripts/reset-data.mjs. Tests: test/helpers/tmp.ts, test/ledger-store.test.ts (T-02...T-07),
  test/architecture.test.ts (T-60, T-61, T-62, T-64; T-63 arrives in P5).
- Verified:
  - Before writing schema.ts, validated the spec's exact Zod block against the real fixture directly in
    a throwaway node script: all 77 signals pass `Signal.safeParse`, and the ledger root passes
    `Root.safeParse` — confirms the schema in the spec actually matches the real data, not just the prose.
  - `npm run typecheck` — clean.
  - `npm test` — 3 files, 20/20 tests pass (T-02...T-07 ledger-store; T-60/61/62/64 architecture;
    T-01 fixture-integrity from P1).
  - `npm run verify` — typecheck + tests + `next build` all pass.
  - Confirmed no test touched the repo's own `fixture/` or `data/`: fixture hashes unchanged after the
    run, no `data/` directory created at the repo root (per spec §8.1.2, tests use `makeTempEnv()`).
  - Manually exercised `scripts/reset-data.mjs` end-to-end against a synthetic `data/` dir: reports
    `deleted ...` for each file on first run, `not present: ...` on the second; `data/` stays gitignored.
- Caught: Noticed `process.platform` reports `win32` here even though the shell is WSL2 Linux bash —
  the `node` binary in PATH is a Windows-native executable reached through WSL interop. This means the
  spec's Windows-specific branches (P9 smoke script's `taskkill`, `shell: true` for spawning npm, and the
  EPERM/EACCES/EBUSY rename-retry logic already built into `atomicWrite`) are live code paths in this
  environment, not dead ones written defensively for a platform we're not on. Keeping this in mind for P9.
- Decisions: For config.json/routing-hints.json/run-log.jsonl, the spec doesn't give an exact Zod schema
  (only signal-ledger.json gets one in §4.3), so `fixture.ts` does minimal structural validation (required
  keys/types) rather than inventing a stricter schema not asked for in the spec.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 9a4cc57 feat(server): read fixture and seeded ledger copy with validation and revisions

## P3 — Detectors HD1-HD4 · 2026-09-28 IST

- Did: src/server/detect/context.ts (canonical helpers + buildContext per spec §3.6),
  detect/finding.ts, detect/hd1-missing-summary.ts, detect/hd2-dangling-analysis-ref.ts,
  detect/hd3-dangling-source-ref.ts, detect/hd4-analysis-without-sources.ts.
  Test helpers: test/helpers/builders.ts (makeSignal/makeEntry/makeCtx), test/helpers/fixtureContext.ts
  (loads a DetectorContext straight from the real fixture/, read-only, without touching data/).
  test/detectors.test.ts: T-10, T-11, T-12, T-13, and the HD1-HD4 slice of T-16.
- Verified (exact counts against the real fixture, per the human's request to be extra careful here):
  - HD1: **27** rows, split exactly harborline 9 / atlas 6 / northwind 4 / quill 4 / studio_ops 4 —
    matches spec §3.7 exactly.
  - HD2: **3** rows, all `analysis_ref: "run-999"`, all reason `beyond_recorded_runs`, at exactly
    ledger indices {19:northwind, 22:harborline, 26:atlas} — matches spec Appendix A-2. Also asserted
    `verified: 0`, `unverifiable: 24`, `recordedRunCount: 45`, `minRun: 100`, `maxRun: 160`.
  - HD3: **1** row, ledger index 0 / atlas, missing path
    `sources/granola/2026-07-06-atlas_permit_intake.md` — matches spec exactly.
  - HD4: **1** row, ledger index 12 / northwind, sourceCount 0 — matches spec exactly.
  - Every one of these numbers came from running the detector against `loadRealFixtureContext()` (the
    real `fixture/signal-ledger.json`, `config.json`, `routing-hints.json`, `run-log.jsonl`), not from
    copying the spec's numbers into the assertions blind.
  - Edge cases (per the human's request): empty ledger (`makeCtx({ signals: [] })`) — all four detectors
    return zero findings; `summary: null` vs `summary: ""` are both correctly treated as blank by HD1
    (`isBlank`); whitespace-only summary is blank; a present-but-empty-object summary counts as PRESENT,
    not blank (spec's explicit anti-false-positive rule); a `pending` entry is never eligible for HD1-HD4.
  - HD2 synthetic matrix covers all six code-path branches from the spec's code block (missing,
    malformed via wrong case/non-digit/non-string, not_in_run_log, verified, unverifiable both above-log
    and below-minRun, beyond_recorded_runs) plus the empty-run-log case (`maxRun === null`).
  - T-16 (HD1-HD4 slice): running all four detectors against a deep-frozen context vs an unfrozen clone
    of the same data throws nothing and produces identical output — detectors don't mutate their input.
  - `npm run verify` — typecheck clean, 35/35 tests pass (4 files), production build succeeds.
- Caught: First draft of the HD2 synthetic-matrix test asserted `findings` length 5 instead of 6 (a
  hand-counting slip while writing the test, not a detector bug) — 8 synthetic cases produce 1 missing +
  3 malformed + 1 not_in_run_log + 1 beyond_recorded_runs = 6 defects; verified/unverifiable produce no
  findings. Caught immediately by the failing test, fixed the assertion (not the detector).
- Decisions: none — no ambiguity found between the spec's HD1-HD4 rules and the real data. Every rule
  in spec §3.7 for HD1-HD4 matched the fixture exactly on first implementation.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 91feb00 feat(server): detect analysis-evidence defects HD1-HD4

## P3 — Detectors HD5-HD6 · 2026-09-28 IST

- Did: src/server/detect/hd5-identity-conflict.ts (union-find over ledger indices, connected by shared
  id or shared (date, match_key)), hd6-dangling-project-ref.ts (all four sites + Levenshtein suggestion),
  detect/index.ts (runDetectors aggregator). Extended test/detectors.test.ts with T-14, T-15, the full
  six-detector T-16, T-17, and an integration test that runs `runDetectors` once against the real fixture
  and checks every Appendix A number in one pass.
- Verified (exact counts against the real fixture):
  - HD5: **4** groups, matching Appendix A-3 exactly by groupId: `HD5:19,20` exact_id_collision
    (northwind, 1 shared source path), `HD5:27,28` near_duplicate (studio_ops, 3 shared source paths,
    member 28 `_dup` correctly flagged `idMatchesRule: false`, member 27 `true`), `HD5:50,51`
    exact_id_collision (harborline, 2 shared paths), `HD5:57,58` exact_id_collision (studio_ops, 2 shared
    paths). Zero `id_format_mismatch` groups in the real data, matching "0 standalone" in spec §3.7.
  - HD6: **1** finding — routing-hints.json index 2 (display "#3"), `drafting` -> `quil`, suggestion
    `quill` — matches spec exactly.
  - `runDetectors()` run once against the real fixture context reproduces every Appendix A-1/A-2/A-3
    number simultaneously (HD1=27, HD2=3, HD3=1, HD4=1, HD5=4, HD6=1, runCheck
    {recordedRunCount:45, minRun:100, maxRun:160, verified:0, unverifiable:24, flagged:3}) — this is the
    same aggregation path report.ts will consume in P4, exercised end-to-end now.
  - Edge cases (HD5): synthetic same-id-different-match_key stays exact_id_collision (kind depends only
    on id equality, not date/match_key, per spec's literal rule); a 3-node union-find chain (A~B by id,
    B~C by identityKey) correctly merges into one 3-member near_duplicate group; a lone record whose id
    breaks the canonical `{date}_{match_key}` rule becomes its own 1-member id_format_mismatch group;
    unique canonical records produce no group at all.
  - Edge cases (HD6): unknown id in `projects` (signal_projects site), unknown id as a status key
    (status_key_unknown), a *valid* project id used as a status key that isn't in the signal's `projects`
    (status_key_not_routed) — confirmed this site exists in the code path even though the real fixture
    never triggers it (§3.4: "every status key is also in the signal's projects"). A fallback id
    (`internal_unsorted`) is correctly treated as valid, not a defect. Suggestion is `null` both when no
    config id is within edit distance 2, and when two config ids are equidistant (constructed a minimal
    `cat`/`car` config to force a genuine tie, rather than trusting the tie-breaking logic unverified).
  - T-16 (full): all six detectors run against a deep-frozen context throw nothing and produce output
    identical to an unfrozen clone of the same data.
  - T-17: grepped all of `src/` for `run-999`, the bare word `quil`, and any `2026-0X-XX` date literal —
    zero matches, confirming no fixture-specific value is hard-coded into detector logic.
  - `npm run verify` — typecheck clean, 49/49 tests pass (4 files), production build succeeds.
  - Re-confirmed after this full run: `fixture/` SHA-256 hashes unchanged (still match Appendix C), no
    `data/` directory created at the repo root.
- Caught: nothing in HD5/HD6 logic itself. (The one mistake this phase was the HD2 test miscount caught
  in the HD1-HD4 commit above.)
- Decisions: For HD6 suggestions, distance is computed only against `config.projects[].id` (not the
  fallback ids `internal_unsorted`/`unclassified`), matching the spec's literal wording "closest **config**
  project id" — confirmed this reading doesn't affect the fixture's one real finding (`quil` -> `quill`
  is unambiguous either way), so it isn't a case the human needs to weigh in on.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 22b7add feat(server): detect identity conflicts and dangling project refs HD5-HD6

## P4 — Policy, report, read routes · 2026-09-28 IST

- Did: src/server/policy.ts (systemic threshold, laneFor, laneReasonFor, actionsFor per spec §4.9),
  src/server/report.ts (buildReport: locking, rows, systemic patterns, lanes, severity, project
  grouping/ranking per spec §4.7), src/app/api/health/route.ts (R1), src/app/api/defects/route.ts (R2).
  Tests: test/policy.test.ts (T-20, T-21, T-22), test/report.test.ts (T-30...T-34),
  test/routes-read.test.ts (T-35, T-36), test/helpers/realReport.ts.
- **Mistake caught mid-phase, fixed with the human's explicit go-ahead before continuing:**
  `npm run build` failed with `Module not found` for `./schema.js`, `./policy.js`, and every other
  relative import under `src/server/**` written with a `.js` suffix (e.g. `import { Root } from
  "./schema.js"`) instead of extensionless (`"./schema"`). tsconfig's `"moduleResolution": "bundler"`
  (spec §2, unchanged) expects extensionless relative imports; Next's Turbopack bundler does not remap
  a `.js` specifier onto a sibling `.ts` file the way Vite does.
  - **Why P2's and P3's `npm run verify` didn't catch it:** `tsc --noEmit` and Vitest (via Vite) both
    resolve `.js` specifiers to co-located `.ts` files leniently, so typecheck and every test passed
    throughout P2 and P3. But Next's production build only compiles modules actually reachable from an
    entry point (a page or a route handler) — and until P4 added `src/app/api/health/route.ts` and
    `src/app/api/defects/route.ts`, nothing under `src/app` imported the `src/server` chain at all, so
    Turbopack never had a reason to resolve those relative imports. The bug was latent in every file
    written since P2; P4 was simply the first phase whose own new code (the routes) triggered it.
  - Fix (approved by the human before applying): stripped the `.js` suffix from every relative import
    under `src/server/**` (13 files: config.ts's dependents were unaffected since config.ts itself has
    no relative-.js imports; fixture.ts, ledger/store.ts, policy.ts, report.ts, and all of
    detect/{context,finding,hd1..hd6,index}.ts). No tsconfig change, no new dependency. Also checked
    `test/` and `scripts/` for the same pattern per the human's request — found none; the bug was
    confined to `src/server/**`.
  - Added a standing guard so this can't silently regress: a new test in test/architecture.test.ts
    scans every file in `src/server/**/*.ts` for a relative import ending in `.js` and fails the suite
    if it finds one — this runs on every `npm test`, not just at build time, so the next occurrence is
    caught immediately instead of waiting for a route to expose it again.
  - Re-ran, in order, and did not move on until all three were green: `npm run typecheck` (clean),
    `npm test` (68/68, 7 files, including the new guard), `npm run build` (compiles; `/api/health` and
    `/api/defects` both correctly marked `ƒ (Dynamic)`).
- Verified (after the fix):
  - `GET /api/defects` on a fresh temp env returns 200, `Cache-Control: no-store`, and
    `totals = {humanFirst:23, agentSafe:4, identityConflicts:4, configFindings:1}` exactly (T-35).
  - `GET /api/health` returns `signalCount: 77`, `ok: true` (T-36); a corrupted data ledger makes
    `GET /api/defects` return the `LEDGER_UNREADABLE` envelope at 500, not a partial report (T-36).
  - `buildReport()` run against the real fixture reproduces Appendix A-4 (project order and every count
    column), A-6 (row order for harborline and atlas, both lanes), and A-8 (ledger/classes/systemic/
    totals/project-order/config) exactly, verified field-by-field against the real fixture, not asserted
    from memory.
  - T-33 structural checks: every HD5 group lands under its correct project, all rowKeys and groupIds
    are unique, and no ledger index inside a locked identity-conflict group leaks into any project's
    humanFirst/agentSafe row lists.
  - T-34: an empty ledger produces exactly the 5 config projects, all clean (zero counts), zero totals,
    no systemic patterns, and all six class counts at 0.
  - T-20/21/22: the systemic threshold matches the spec's five worked examples exactly (27/27→true,
    3/27→false, 5/10→true, 4/8→false, 0/0→false, the last guarding division by zero); a synthetic
    isolated (non-systemic) HD1 case is correctly agent_safe; actionsFor returns the exact
    allowedFor arrays from spec §4.9.2 for both lanes.
- Decisions:
  - `ActionView.disabledReason` is always `null` for every action `actionsFor()` returns, because
    availability is already decided before an action is included in the array at all (an
    unavailable action is simply omitted, not included-but-disabled). The UI's own reviewer-name
    gating (A1) is a separate, client-only disabled state layered on top in P7/P8, not something the
    server needs to express here. Flagging this as a design choice, not asking the human to confirm,
    since §4.9.5 already settles it ("The UI never computes policy" — but it may still add its own
    local gating independent of server policy).
  - `SystemicPattern.message` and `ConflictGroup.message` wording is not specified verbatim by the spec
    (only the wireframe in §5.2 shows example prose for the banner). Wrote plain, factual sentences
    from the same numbers the UI will already have (count/eligible/label, or group kind), rather than
    inventing claims not in the data. No test asserts exact string content here, only structure/counts.
  - HD6 suggestion distance is computed only against `config.projects[].id`, not the fallback ids
    (`internal_unsorted`/`unclassified`), per the spec's literal "closest **config** project id"
    wording — already logged in the P3 entry, reconfirmed here since report.ts is what actually
    surfaces `suggestion` to the report.
  - No other ambiguity found between the spec's ranking/policy rules (§4.7, §4.9) and the real data —
    every tie-break in the project ranking (§4.7.9) was exercised by the real fixture's numbers
    (harborline/northwind tie on identityConflicts, atlas/quill tie on identityConflicts+humanFirst)
    and resolved exactly as Appendix A-4 shows on the first implementation, with no adjustment needed.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: b064b6d feat(server): group and rank defects with the agent/human policy; add read routes

## P5 — Guarded write path and audit · 2026-09-28 IST

- Did: src/server/repairs/schema.ts (RepairRequest, spec §4.8.1 verbatim), src/server/repairs/apply.ts
  (applyRepair: W6-W16), src/server/audit.ts (appendAudit/readAudit with injectable Io, fsync),
  src/app/api/repairs/route.ts (W1-W5, then applyRepair — the only file in the repo exporting a
  mutating HTTP method), src/app/api/audit/route.ts (R4). Tests: test/repairs.test.ts (T-40...T-50,
  T-52), test/routes-write.test.ts (T-51, T-53), extended test/architecture.test.ts with T-63 and an
  extra guard the human specifically asked for.
- **Ambiguity found and resolved against the test table, not guessed — flagged to the human:** spec
  W10 bundles two checks under two codes without a literal 1:1 mapping: "project ∈ s.projects and
  status[project].state === 'analyzed'; set_summary needs HD1 on the row; requeue needs ≥1 HD1-HD4 on
  the row → 422 PRECONDITION_FAILED · 422 NOTHING_TO_REPAIR". Read literally, "set_summary needs HD1"
  failing could map to either code. Verified against real data: after a successful `set_summary` on
  `2026-08-06_quill_editor_shaping`/quill (its only class, HD1), the row has zero HD1-4 classes left,
  but `status.state` is still `"analyzed"` — so re-applying `set_summary` hits exactly this ambiguous
  case. T-46's own expected values resolve it unambiguously: repeating `set_summary` on that clean row
  → PRECONDITION_FAILED; a subsequent `requeue_analysis` on the same row → NOTHING_TO_REPAIR. Read this
  way, the split is coherent: "set_summary but the precondition (HD1 present) isn't met" →
  PRECONDITION_FAILED; "requeue but there is nothing at all to retract" → NOTHING_TO_REPAIR (a name
  that only really fits the requeue case). Implemented per the test table (an authoritative source, not
  a guess) and told the human before writing the code, since this was exactly the kind of ambiguity
  they asked to be stopped for.
- Verified (each of the human's six explicit checks for this phase):
  1. **Single write path.** `src/app/api/repairs/route.ts` is the only route file exporting POST/PUT/
     PATCH/DELETE (T-63, new architecture test). Added a further guard the human specifically asked
     for: a test that scans all of `src/server/**` and `src/app/**` and fails if `atomicWrite(...)` or
     `appendAudit(...)` is called from anywhere except `repairs/apply.ts` itself (and the two files
     that define them) — proving no other code path can write the ledger or the audit log.
  2. **Zod validation, unknown keys rejected.** T-40: 8 schema-level rejections (unknown top-level key,
     `target.id` instead of `signalId`, unknown op, 19-char summary, a summary with a control
     character, a 65-char actor name, `kind: "robot"`, a 63-hex-char revision) plus 1 acceptance case,
     all direct against `RepairRequest` — every `strictObject` in the union rejects unrecognized keys.
  3. **Bad-case coverage the human asked for by name**, all against the real fixture via
     `applyRepair()` in a temp env: missing/wrong-shaped fields (T-40), a signal id that doesn't exist
     (T-45, 404 SIGNAL_NOT_FOUND), a repair not allowed for the row's state/class (T-45's
     wrong-project and pending-state cases, T-46's PRECONDITION_FAILED/NOTHING_TO_REPAIR cases), and a
     stale revision (T-47, 409 STALE_REVISION with the real current revision in `details`) — plus a
     concurrency test (T-48) proving the write lock serializes two concurrent same-baseRevision writes
     into exactly one success and one STALE_REVISION.
  4. **Audit trail.** T-41 checks the full audit entry shape after a real write (actor, op, target
     including `ledgerIndex`, reason, `revisionBefore`/`revisionAfter`, `change.path`) and that
     `total === 1`. T-53 checks `GET /api/audit` end to end through the real route (newest-first,
     `corruptLines` counted separately from valid `total`, `limit=0` → 400 INVALID_QUERY).
  5. **Atomicity / failure paths.** T-49: injected an `AuditIo` whose `appendFile` always throws —
     confirmed 500 AUDIT_FAILED, the ledger file byte-identical to its pre-request state (the rollback
     write restores it), zero audit entries, and no leftover `.tmp` file. Added T-49b (not in the
     spec's table, but the human explicitly asked for this failure path): injected a ledger `Io` whose
     `rename` always throws EPERM — confirmed 500 WRITE_FAILED, ledger unchanged, no audit entry, no
     leftover `.tmp`.
  6. **Human-first repairs blocked for agents.** T-42: an agent attempting `requeue_analysis` on
     `2026-07-07_harborline_weekly_sync`/harborline (HD1-only, systemic, human_first) gets 403
     POLICY_HUMAN_REQUIRED, the ledger file is byte-identical afterward, and no audit entry is
     written. Demonstrated live against the dev server too (see below) — same result via the real
     HTTP route, not just the unit-level function.
  7. **fixture/ never touched.** T-52 re-checks all 6 fixture hashes against Appendix C after every
     other write-path test has run. Manually re-verified the same hashes from the shell after the live
     demo below. Every test uses `makeTempEnv()` for its own isolated fixture + data copy.
  - `npm run typecheck` — clean. `npm test` — **103/103 tests pass** (9 files). `npm run build` —
    compiles; all four routes present, `/api/audit`, `/api/defects`, `/api/health`, `/api/repairs` all
    `ƒ (Dynamic)`, and `/api/repairs` is confirmed the only one exporting POST.
- Caught (test bug, not a production bug): the first version of the T-46 "human writes a valid
  summary" test called `applyRepair()` directly with a raw object literal containing
  `" Line one\r\nline two of the summary "`, and asserted the CRLF-normalized/trimmed result. It failed
  because `applyRepair()` is designed to receive input that has *already* gone through
  `RepairRequest.safeParse()` (that's exactly the W1-W5-before-the-lock / W6-W16-inside-the-lock split
  in spec §4.8) — the real route always parses first, but my test bypassed that and got the raw,
  untransformed string back. Fixed by routing the test input through `RepairRequest.parse()` before
  calling `applyRepair()`, matching how the route actually calls it. No production code changed.
- Decisions:
  - `ActorKind`/`RepairOp` types are imported into `audit.ts` from `src/lib/contracts.ts` rather than
    redeclared, keeping one source of truth for those unions across server and (future) UI code.
  - `auditId` is a full `crypto.randomUUID()`, not a shortened hex string. The spec's own example
    ("5f0c…") only shows it truncated in a toast message, not as a generation rule; a UUID is simplest
    and collision-safe. The UI can truncate for display in P7/P8.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 619acf3 feat(server): add the single guarded repair route with atomic writes and audit trail

## P7 — UI, read-only · 2026-09-28 IST

- Did: src/lib/api-client.ts (fetchDefects, typed error class); src/app/globals.css (full spec §5.8
  CSS variables, layout, responsive rules); components Dashboard, Header, ReviewerField, KpiStrip,
  SystemicBanner, ChecksInfo, ProjectRail, ProjectPanel, ClassFilter, ConflictGroupCard, DefectRow,
  ConfigPanel, StateViews, Toast; src/app/page.tsx renders `<Dashboard />`. Action buttons render but
  stay disabled with a "next phase" note, per spec P7.1 (dialogs arrive in P8).
- Before this: gave the human an independent, code-derived policy table (every repair action, which
  classes it applies to, who may do it, why) built by reading `policy.ts`/`repairs/apply.ts` directly
  rather than the spec text, per their request — and re-flagged the W10 code-mapping resolution from
  P5 as the one place code and spec prose diverge.
- Verified:
  - `npm run typecheck` — clean (one real finding: `nothingMatchesFilter`'s `classFilter !== "all"`
    check let TypeScript's aliased-condition narrowing collapse a redundant ternary in
    `ProjectPanel.tsx` down to `never`; simplified the JSX to rely on the narrowing instead of
    re-checking it).
  - `npm test` — 103/103 (same suite as P5; T-60 re-confirms no component imports `@/server`,
    `server-only`, `node:fs`, or any JSON/fixture path now that the full component tree exists).
  - `npm run build` — compiles; `/` still prerenders as static (○) even though `Dashboard` fetches
    client-side on mount.
  - **Actually opened it in a browser and drove it**, not just typechecked it: installed Playwright
    into an isolated scratch directory *outside* the repo (own `package.json`, never touched this
    project's `package.json`/lockfile — satisfies "don't add libraries the spec doesn't ask for"),
    launched the real dev server, and drove headless Chromium through: initial load, selecting
    Harborline in the rail, clicking a class-filter chip, expanding "About these checks", and resizing
    below 900px. Zero console/page errors at every step. Screenshots confirmed: KPI tiles read 23/4/0
    of 27 exactly as computed; the systemic banner shows the HD1 message; Studio Ops (rank 1) shows
    both identity-conflict cards side by side with the near-duplicate's `_dup` member correctly
    flagged; Harborline's human-first row order and its one agent-safe row match Appendix A-6 exactly;
    the class-filter chip correctly narrows to just the identity-conflicts section for "HD5" and hides
    the human/agent sections; below 900px the rail becomes a `<select>` and conflict members stack
    vertically, exactly per spec §5.8.3.
  - One thing in the screenshots that is *not* a bug: a small black circular dev-tools indicator badge
    in the bottom-left corner is Next.js's own dev-mode overlay (shown only under `next dev`), not
    application code — it won't appear in the production `next start` build.
  - Re-confirmed after the browser session: `fixture/` hashes unchanged, `data/` cleaned up, dev
    server process stopped by PID (not `pkill -f`, per M-17).
- Caught: nothing beyond the one narrow TypeScript narrowing case above (a type-checker correctness
  note, not a logic bug — the redundant check would never have produced wrong output either way).
- Decisions:
  - `AuditPanel`/`RepairDialog`/`SummaryDialog` are not part of this phase (spec P8.1's file list, not
    P7.1's) — the "Recent changes" section from the wireframe is deferred to P8 rather than stubbed
    with a fake collapsed disclosure now.
  - The P7-specific "action buttons render but stay disabled" instruction is implemented as an
    unconditional `disabled` attribute with a `title` explaining repairs arrive next phase — this is
    distinct from the spec's later "Reviewer missing → buttons disabled with visible reason" behavior
    (§5.7), which only makes sense once P8 wires the reviewer-gated dialogs; implementing that gating
    now would have nothing to gate.
  - `ConflictGroupCard`'s and `DefectRow`'s exact wording (kind labels, evidence text) again follows
    the spec's class descriptions and computed numbers rather than inventing copy, consistent with the
    P4/P5 decisions already logged.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: bbb135b feat(ui): per-project defect dashboard with honest loading, empty and error states

## P7 feedback fixes (pre-P8) · 2026-09-28 IST

- Did (two small wording fixes the human caught on the first screen before P8 started):
  1. "Handed off X of Y" was ambiguous (readable as "fully repaired"). Reworded to "X of Y analysed
     fully handed off" in both ProjectRail and ProjectPanel, and added a `title` tooltip on both:
     "Handed off = analysed, with a summary and references that resolve — not the same as repaired."
  2. The full systemic laneReason sentence ("Missing summary affects 27 of 27 analysed entries...")
     was repeated verbatim on every human-first row, duplicating the banner above. Collapsed it in
     DefectRow.tsx: agent-safe rows still show their full (row-specific, non-redundant) laneReason;
     human-first rows now show a short "pipeline pattern — see banner above" with the full sentence
     still available via `title` on hover. This is safe to generalize because `laneFor()` guarantees a
     human_first row's classes are ALL systemic, so this sentence is always fully explained by the
     banner already on screen — verified this holds for every human_first row in the real fixture, not
     assumed.
- Verified: `npm run typecheck`, `npm test` (103/103), `npm run build` all still green after these two
  changes (folded into the P8 verify run below rather than a separate one, since they're presentational
  and touched no server code).

## P8 — UI actions · 2026-09-28 IST

- Did: RepairDialog.tsx (A2, native `<dialog>`, before/after table, optional reason), SummaryDialog.tsx
  (A3, textarea with live 20-2000 char counter), AuditPanel.tsx (`<details>` "Recent changes (total)"),
  extended api-client.ts with `postRepair`/`fetchAudit`/`describeRepairError` (the §5.6 response-table
  mapping — human text only, the server's own `message` field interpolated into fixed templates, never
  a raw code or JSON shown to the person using the dialog). Wired reviewer-gated (A1) action buttons in
  DefectRow.tsx, with a visible border marking actions that are also agent-eligible so human vs.
  agent-eligible repairs stay visually distinct per the human's request (not just the lane badge
  color). Dashboard.tsx now owns dialog/toast/audit-refresh state and always refetches the whole report
  after a successful (or close-worthy-failed) write — no optimistic updates, per spec §5.1.3.
- **Bug caught by testing in the browser, not by reading the code** (would not have been caught by
  typecheck/tests, since nothing in the test suite drives the UI): the "Recent changes (N)" collapsed
  count only updated after the panel had been manually opened at least once. A fresh page load ->
  successful repair -> the summary still showed the stale "(0)" until the user clicked to expand it.
  This violates spec §5.1.2 literally: "GET /api/audit when 'Recent changes' is first opened **and
  after each successful write**." Root cause: the fetch effect only ran `if (opened)`, ignoring
  `refreshKey` changes while the panel had never been opened. Fixed to `if (opened || refreshKey > 0)`.
  Reproduced the bug first (screenshot showing "(0)" right after a successful-repair toast), applied
  the fix, then reproduced the corrected behavior (screenshot showing "(1)" with the panel still
  collapsed and never having been opened) before moving on.
- Verified live in a browser (Playwright, isolated scratch dir outside the repo again — package.json
  untouched), against the real dev server, three scenarios the human asked for by name:
  1. **Blocked**: with no reviewer name entered, every action button in every project is disabled, and
     a muted line "Enter your name in \"Acting as\" first." is visible next to them (not just a
     tooltip) — screenshot confirms both the KpiStrip/banner state and the disabled buttons together.
  2. **Successful repair**: typed a reviewer name, opened Atlas's "Agent may repair" section, confirmed
     the agent-eligible button carries the green outline marker, clicked it, confirmed the before/after
     table in the dialog matches the real record exactly (state analyzed->pending, analyzed_at
     2026-07-08->—, files_reviewed 1->0, analysis_ref run-54->—), submitted, and confirmed: a toast
     ("Re-queued · audit 094426db"), the KPI strip updating (agentSafe 4->3), the row disappearing from
     Atlas's agent-safe section (it's no longer analysed at all, so it isn't "handed off" either — it
     returned to pending, exactly matching the retract semantics from spec §6.1), Atlas's rank
     recomputing, and the audit panel showing the new entry with the correct actor/op/target/before-
     after — all without ever manually refreshing.
  3. **Stale revision**: opened a repair dialog (capturing its revision), then — simulating a second
     browser tab — issued a direct `POST /api/repairs` from the page's own fetch context using a
     *different* row, changing the ledger's revision out from under the open dialog. Submitted the
     stale dialog: got exactly the spec's message ("The ledger changed since you loaded it. Reloaded;
     check the row and try again."), the dialog closed (not left open), the report refetched showing
     both the legitimate out-of-band write and nothing from the rejected stale one, and the row the
     stale dialog had targeted was left completely unchanged. Re-checked `GET /api/defects` and
     `GET /api/audit` afterward: ledger `signalCount` still 77, zero `skippedRecords`, audit `total`
     and `corruptLines` both consistent with exactly the legitimate writes — **no weird state was left
     behind by the rejected attempt.**
  - Zero console/page errors across all three scenarios (one informational browser console line
    logging the expected 409 network response is not an application error).
  - `npm run typecheck` — clean. `npm test` — 103/103 (9 files; no UI-level tests were added, since the
    spec's test inventory has no T-xx entries for the React components — coverage here is the manual
    browser verification above, per spec's own P7/P8 acceptance criteria being manual checks, not
    automated tests). `npm run build` — compiles; still exactly one route (`/api/repairs`) exports a
    mutating method.
  - Re-confirmed after the full session: `fixture/` hashes unchanged, `data/` and the Playwright
    scratch directory both cleaned up, dev server stopped by PID each time (never `pkill -f`).
- Decisions:
  - The dashboard's `POST /api/repairs` calls always send `actor: { kind: "human", name }`, per spec
    A2's literal instruction — there is no UI control to submit as an agent. The lane badge and the
    agent-eligible button marker are informational (showing what an automated caller, i.e. the
    `scripts/agent-repair.mjs` from P9, *could* do), not a mode switch in this UI.
  - `describeRepairError()`'s "any 403" and default-5xx branches match on `err.code`, not HTTP status,
    since the server's error codes already partition cleanly into the families spec's response table
    describes; no case needed a raw status check.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: (this phase's commit follows this entry)

## P9 — Smoke and agent scripts · 2026-09-28 IST

- Did: scripts/smoke.mjs (spec §8.3): clones the committed HEAD into a fresh OS temp dir, runs
  `npm ci && npm run build`, starts the production server directly via `process.execPath` (so killing
  the PID actually kills it — see M-17), polls `/api/health`, then exercises `GET /api/defects`, a
  malformed POST, a policy-blocked agent repair, a successful agent-safe repair, the resulting audit
  trail, the clone's own `fixture/` hash, and a stale-revision rejection. Never touches this working
  directory or its `fixture/` — everything happens inside the temp clone. Branches on
  `process.platform` for npm's `shell: true` requirement and for killing the server (`taskkill` vs
  `SIGTERM`), per M-17/M-18. scripts/agent-repair.mjs (spec §8.4): dry run by default, lists every
  agent-safe row across all projects in report order plus how many human-first items it skipped and
  why; only writes with `--apply`, through `POST /api/repairs` (never the ledger file directly), using
  the latest revision from each successful response and stopping on the first non-200.
- Verified: committed first (so smoke exercises the committed HEAD, not the working tree), then
  `npm run smoke` → `SMOKE PASS`. With `npm run dev` running, `npm run agent:repair` listed exactly the
  4 rows of Appendix A-5 and wrote nothing (no `--apply`); `npm run reset-data` afterward.
- Caught: nothing beyond the P2 finding already logged (`process.platform` reporting `win32` under
  WSL2 interop) — this phase is where that finding's Windows-specific branches (taskkill, `shell: true`,
  atomicWrite's rename retries) actually execute for the first time.
- Decisions: none beyond the spec.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: 236c409 test: add clean-clone smoke script and dry-run agent repair script

## Correction — BUILD_LOG gap found at P10 · 2026-09-29 IST

Per §11.1 (append-only; a correction is a new entry, not an edit to an old one): completing P10.1's
"Complete BUILD_LOG.md" surfaced two gaps in the log above, both now fixed by entries in this file
rather than by editing the originals:
1. P8's "Commits" line was left as the placeholder "(this phase's commit follows this entry)" instead
   of the real hash. The actual commit is **0463a97** `feat(ui): repair actions through the guarded
   route, with audit panel`.
2. P9 had no entry at all despite its commit (236c409) existing. Backfilled immediately above, from the
   commit's own message plus the spec's P9.1/P9.2 acceptance criteria; the running verification evidence
   for that phase is in the "P9 re-verification" entry directly below, since the session ended (power
   cut) before this gap was caught and the original phase's live terminal output was not preserved.

## P9 re-verification (post power-cut) · 2026-09-29 IST

- Context: a power cut ended the previous session mid-P9/P10 handoff. Before starting P10, the human
  asked Claude Code to independently confirm P9 was actually complete and *working*, not just
  committed, and to show the output.
- Verified:
  - `git status` / `git log` — commit 236c409 (P9) already on `feat/defect-dashboard`; working tree
    clean except the `docs/` folder the human had just added and pushed themselves (`docs/build-spec.pdf`).
  - `npm run smoke` → `SMOKE PASS` (full clean-clone S1–S8 sequence: install, build, start, health,
    defects-report shape, malformed POST, policy-blocked repair, successful agent-safe repair, audit
    trail, fixture/ hash integrity, stale-revision rejection).
  - Built and started the app locally, then ran `node scripts/agent-repair.mjs --url http://127.0.0.1:<port>`
    (dry run, no `--apply`): `DRY RUN: 4 agent-safe row(s) found. Skipped 23 human-first item(s)`, with
    exactly the Appendix A-5 rows (harborline `weekly_sync`, northwind `portal_handover_check`, atlas
    `permit_intake`, atlas `inspection_scheduling_walkthrough`), each `would re-queue`. `npm run
    reset-data` afterward confirmed the dry run wrote nothing (`data/signal-ledger.json` was the only
    file present, and was deleted cleanly).
- Caught: on this machine, `npm`/`npx` resolve to a **Windows-side** Node install
  (`/mnt/d/Program Files/nodejs`) while the bare `node` binary on PATH is Linux-native
  (`/home/manik/.local/bin/node`). Starting the server via `npm run start` / `npx next start` produced
  stuck `EADDRINUSE` errors and connections that silently failed across separate shell invocations — a
  cross-VM-boundary networking quirk of WSL2 interop, the same root cause as the `process.platform ===
  "win32"` finding already logged in P2, now hitting from the opposite direction. `scripts/smoke.mjs`
  never has this problem because it spawns the server via `process.execPath` (whichever `node` is
  running the script) end-to-end in one process tree, per its own P9 design. No code change needed —
  this only affects ad hoc manual verification commands, not any script in the repo.
- Decisions: none beyond the spec.
- Deviations: none beyond the branch-flow deviation already logged in P0.
- Commits: none (no code changed; verification only).
