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
- Commits: (this phase's commit follows this entry)
