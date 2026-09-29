## Summary
One-page dashboard over the server from PR #1: KPI tiles, systemic banner, ranked project rail, conflict
cards, human-first and agent-safe sections, routing-config findings, repair dialogs, audit panel.
Plus a clean-clone smoke script, a dry-run agent script and the README.

## Changes
- P7 read-only UI with loading / error / empty / locked / stale states
- P8 re-queue and add-summary through POST /api/repairs; recent changes panel
- P9 scripts/smoke.mjs, scripts/agent-repair.mjs
- P10 README, BUILD_LOG

## Verified
- `npm run verify` -> 103 tests passed (9 files), typecheck clean, production build OK
- `npm run smoke` -> SMOKE PASS
- Manual checks P7.2 a-h and P8.2 a-e (BUILD_LOG.md), re-run and re-confirmed at P10 (BUILD_LOG.md,
  "P9 re-verification" entry): `npm run agent:repair` lists exactly the 4 rows of Appendix A-5 and
  writes nothing

## Screenshots
Captured live during the P7/P8 browser verification sessions (BUILD_LOG.md) but not persisted as files
(Playwright ran from an isolated scratch directory outside the repo, per that phase's decision log, and
was cleaned up afterward). Attach when opening this PR on GitHub:
- the dashboard with Studio Ops at rank 1 (its identity-conflict cards visible)
- a conflict card (e.g. the `_ops_retro` / `_ops_retro_dup` near-duplicate)
- the re-queue dialog's before/after table for an agent-eligible row

## Not in this PR
Everything in README "What I chose not to build"
