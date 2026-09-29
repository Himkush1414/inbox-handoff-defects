# Handoff-defect dashboard

A local control-plane view for Inbox: which analysed signals were never handed off cleanly, per project,
ranked, with every defect labelled "human first" or "agent may repair". Built for the Supanova Labs task.

## Run it

Needs Node.js 22.12+ (22 or 24 LTS) and npm. No accounts, keys or services.

    npm ci
    npm run dev        # open http://127.0.0.1:3000

The first request copies `fixture/signal-ledger.json` into `data/` (gitignored); every write goes to that copy.

| Command                            | What it does                                                     |
|-------------------------------------|--------------------------------------------------------------------|
| `npm test`                          | unit, route and architecture tests                                 |
| `npm run verify`                    | typecheck + tests + production build                               |
| `npm run smoke`                     | fresh clone -> npm ci -> build -> start -> API checks (minutes)    |
| `npm run build && npm start`        | production mode on http://127.0.0.1:3000                           |
| `npm run reset-data`                | restore the ledger copy and clear the audit log                    |
| `npm run agent:repair [-- --apply]` | play the agent: list (or apply) what policy lets it repair         |

## Ten-second tour

Three KPI tiles (23 human-first, 4 agent-safe, 4 identity conflicts) sit above a systemic banner explaining
that 27 of 27 analysed entries are missing a summary. Below that, a ranked project rail (studio_ops first —
it holds an identity conflict, which always outranks everything else) opens onto per-project conflict cards,
a "needs a human" section and an "agent may repair" section, each row carrying its evidence and its lane.

## Defect classes

| Class | Rule (short) | In the fixture | Who acts |
|---|---|---|---|
| HD1 · missing_summary | Analysed entry with blank summary and blank notes | 27 (harborline 9, atlas 6, northwind 4, quill 4, studio_ops 4) — systemic (27/27) | Human today (systemic); agent re-queue only once isolated |
| HD2 · dangling_analysis_ref | `analysis_ref` doesn't resolve against the recorded run log | 3, all `beyond_recorded_runs` (run-999 > max run-160) | Agent, when isolated and identity is unambiguous |
| HD3 · dangling_source_ref | A reviewed file is no longer among the signal's sources | 1 (atlas, `2026-07-06_atlas_permit_intake`) | Agent, same conditions |
| HD4 · analysis_without_sources | Marked analysed with zero files reviewed | 1 (northwind, `2026-07-15_portal_handover_check`) | Agent, same conditions |
| HD5 · identity_conflict | Records share an id or identity key (date + match key) | 4 groups / 8 records: 3 exact-id collisions, 1 near-duplicate | Human, always — write-locked, no merge tool |
| HD6 · dangling_project_ref | A project id in the ledger or routing hints isn't a known project | 1 (routing hint #3, `drafting` → `quil`, suggestion `quill`) | Human, always, via a reviewed config change |

## Architecture

    browser (src/components) --fetch--> /api/* route handlers --> src/server (import "server-only")
                                                                     |- reads fixture/ (never written)
                                                                     '- reads/writes data/ (one guarded path)

The server owns detection, grouping, ranking and policy; the browser only owns selection, filtering and
dialogs. This keeps one source of truth for what an agent calling the API is allowed to do and what the UI
shows a human — the two can never disagree, because neither computes anything the other doesn't already get
from the server.

## The guarded write path

`POST /api/repairs` is the only code path that changes `data/signal-ledger.json`. Every request runs through
sixteen ordered checks before anything touches disk: request shape (origin, content type, size, JSON parse,
schema) first, then — inside a single in-process write lock — a fresh read of the ledger with a revision
check (stale writes are rejected with the current revision so the caller can reload), target resolution
(no match, multiple matches, and an identity-conflict target are each their own error), the precondition that
the row is actually analysed and actually eligible for the requested op, and the human/agent policy gate. Only
then is the change applied to a deep clone, checked against an invariant (nothing else in the ledger moved),
written atomically, and recorded to the audit log with a before-image — if the audit write fails, the ledger
write is rolled back rather than left half-done. The first failure at any step returns its error and writes
nothing.

## The product decision

The ledger has one word for the end of analysis — `status.state = "analyzed"` — but nothing says what that
claim must be backed by, or whether an unbacked one gets its evidence supplied or its claim withdrawn. The
data forces the question: all 27 analysed entries lack a summary, 3 cite a run that cannot exist, 1 cites a
file the signal no longer has, and 1 reviewed no files at all. Patching the gap (writing a plausible summary
or run) was rejected — it fabricates evidence the ledger would then assert. Flagging only was rejected — every
consumer keeps trusting a claim nobody backed. A new state was rejected — that's not this dashboard's contract
to change. The chosen definition: **handed off** = analyzed AND summary present AND analysis_ref resolves AND
every reviewed file is still on the signal AND at least one file reviewed. An entry failing any clause is a
defect with exactly two repairs — retract (re-queue to pending, agent-eligible when isolated) or complete (a
human writes the summary) — and nothing ever invents a reference.

## What an agent may auto-repair, and what a human must always see first

An agent may retract a claim the ledger can't back up. It may never invent content, touch identity, change
routing, or paper over a pattern. An agent may repair a defect only when all five hold:

1. **Deterministic** — the correct change follows from the data alone.
2. **Retracting, not authoring** — it withdraws an unsupported claim; it never writes prose or guesses a reference.
3. **Scoped** — it changes one project's own status key and nothing else.
4. **Reversible and audited** — a before-image lands in the audit log; humans see it in "Recent changes".
5. **Isolated** — its class isn't systemic (≥ 50% of eligible and ≥ 5 count trips this) and the target's identity is unambiguous.

| Class | Who acts | Operation | Why |
|---|---|---|---|
| HD2 analysis run not found | Agent (when isolated, identity unique) | `requeue_analysis` | A run that cannot exist is not evidence; withdrawing the claim is mechanical. |
| HD3 reviewed file not on signal | Agent (same conditions) | `requeue_analysis` | The analysis cites evidence the signal no longer has. |
| HD4 analysed from nothing | Agent (same conditions) | `requeue_analysis` | Zero files reviewed is not an analysis. |
| HD1 missing summary | Agent re-queue only while isolated; human today (27/27 is systemic). Writing the summary: always human. | `requeue_analysis` / `set_summary` | At 100% the pipeline is broken; auto re-queueing would turn the dashboard green and hide the cause. |
| HD5 identity conflict | Human, always. Nobody repairs it in the dashboard. | none (write-locked) | The detector owns identity; repairing one twin leaves the other diverged, and merging changes identity, which must never happen silently. |
| HD6 unknown project id | Human, always, via a reviewed config change. | none | Routing decides which client's project a meeting lands in; an "obvious" fix like `quil` → `quill` is exactly how data ends up in the wrong client's folder. |
| Any systemic class | Human first. | — | A pattern is a bug upstream, not N chores. |

Today's numbers: 4 records are agent-safe; 23 items need a human first (4 identity conflicts + 18 rows + 1
routing finding). Enforcement lives on the server, so an agent calling the API gets the same answer the UI
shows.

## What the data says that the brief did not

- **C1** — The brief said 6 signals were analysed with no summary; the data says 27 of 27. Root cause:
  `make_fixture.py` creates every signal with `summary=None` and `notes=None`, and the seeding line
  `for s in analysed[:6]: s["notes"] = None` changes nothing that wasn't already `None`.
- **C2** — The brief said 1 near-duplicate pair; the data has 4 identity groups (8 records) — one seeded twin
  (`..._ops_retro_dup`) plus 3 accidental exact-id collisions, because ids are `{date}_{title}` and the
  generator can draw the same title twice on one day.
- **C3** — Not mentioned in the brief: 1 reviewed file missing from a signal's sources, and 1 analysis with
  zero files reviewed — the seeded "quiet feed" step nulls `granola_note` after analysis.
- **C4** — The brief implies `analysis_ref` points at an analysis run; no analysis-run registry ships, only
  `run-log.jsonl`'s ingest runs 100–160 — there is nothing else to resolve a ref against.

## What I chose not to build

- **N1** — Merge/de-duplicate tool: identity is detector-owned; the dashboard must never change identity.
- **N2** — Routing-hint editor: routing decides which client's project a meeting lands in; config changes go through code review, not a button.
- **N3** — AI summary drafting: no keys allowed; drafting is Inbox's AI step, then human approval.
- **N4** — Auth/accounts: prohibited by the brief; actor is declared, not authenticated.
- **N5** — Feed-health, failed-run, unrouted-triage views: other missions; none is a handoff defect.
- **N6** — Undo button: audit keeps the before-image; undo is a second write op and more surface.
- **N7** — Bulk actions in the UI: every write is one guarded op; bulk is an agent looping the same route.
- **N8** — Database (SQLite etc.): 77 records, one writer; native modules risk the clean-clone install.
- **N9** — Real-time push/websockets: refresh plus a revision check is enough.
- **N10** — Pagination, search, charts, dark mode: 77 signals; a list is faster to read than a chart.
- **N11** — Audit of denied agent attempts: a useful next step, not needed to answer the question.

## What I would do next

1. Add time (or a source hash) to the signal identity upstream; it dissolves 3 of the 4 conflicts.
2. AI-drafted summaries into an approval queue, never straight into the ledger.
3. Record denied agent attempts in the audit trail.

## Time spent

About 6 hours total, across two sessions (28-29 Sept 2026): spec review, git setup, and reviewing each
phase.

## How I worked with the agent

Spec first (phases, acceptance criteria, expected values from an independent reference implementation),
then Claude Code phase by phase, each verified before commit. BUILD_LOG.md records what was caught.
