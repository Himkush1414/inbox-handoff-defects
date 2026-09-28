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
- Commits: (this phase's commit follows this entry)
