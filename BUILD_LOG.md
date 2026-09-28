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
- Commits: (this phase's commit follows this entry)
