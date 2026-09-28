import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { AppError } from "../errors";
import { readLedger, atomicWrite, withWriteLock, ledgerFilePath, type Io } from "../ledger/store";
import { Signal, type RawSignal } from "../ledger/schema";
import { readConfig, readRoutingHints, readRunLog } from "../fixture";
import { buildContext, type IndexedSignal } from "../detect/context";
import { runDetectors } from "../detect/index";
import { isSystemic, laneFor } from "../policy";
import { appendAudit, type AuditEntry, type AuditIo } from "../audit";
import type { ClassId, RepairOp } from "../../lib/contracts";
import type { RepairRequestInput } from "./schema";

export interface ApplyRepairDeps {
  ledgerIo?: Io;
  auditIo?: AuditIo;
}

export interface RepairResult {
  ok: true;
  auditId: string;
  revision: string;
  change: { path: string; before: unknown; after: unknown };
}

const HD1_4: ClassId[] = ["HD1", "HD2", "HD3", "HD4"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false;
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * W13: same root keys and signal count; every other record deep-equal; the target's other keys
 * deep-equal; other status keys deep-equal. Throws INVARIANT_VIOLATION on any surprise.
 */
function assertOnlyAllowedChanges(
  before: { version: number; signals: unknown[] },
  after: { version: number; signals: unknown[] },
  allowed: { ledgerIndex: number; op: RepairOp; project: string },
): void {
  const violation = () =>
    new AppError("INVARIANT_VIOLATION", 500, "The repair would change more than the allowed field.");

  if (!deepEqual(Object.keys(before).sort(), Object.keys(after).sort())) throw violation();
  if (before.signals.length !== after.signals.length) throw violation();

  before.signals.forEach((record, i) => {
    if (i === allowed.ledgerIndex) return;
    if (!deepEqual(record, after.signals[i])) throw violation();
  });

  const b = before.signals[allowed.ledgerIndex];
  const a = after.signals[allowed.ledgerIndex];
  if (!isRecord(b) || !isRecord(a)) throw violation();

  const bKeys = Object.keys(b).sort();
  const aKeys = Object.keys(a).sort();
  if (!deepEqual(bKeys, aKeys)) throw violation();

  for (const key of bKeys) {
    if (allowed.op === "set_summary" && key === "summary") continue;
    if (allowed.op === "requeue_analysis" && key === "status") {
      const bStatus = b.status;
      const aStatus = a.status;
      if (!isRecord(bStatus) || !isRecord(aStatus)) throw violation();
      const bStatusKeys = Object.keys(bStatus).sort();
      const aStatusKeys = Object.keys(aStatus).sort();
      if (!deepEqual(bStatusKeys, aStatusKeys)) throw violation();
      for (const sk of bStatusKeys) {
        if (sk === allowed.project) continue;
        if (!deepEqual(bStatus[sk], aStatus[sk])) throw violation();
      }
      continue;
    }
    if (!deepEqual(b[key], a[key])) throw violation();
  }
}

export async function applyRepair(request: RepairRequestInput, deps: ApplyRepairDeps = {}): Promise<RepairResult> {
  return withWriteLock(async () => {
    // W7
    const ledger = await readLedger();
    if (ledger.revision !== request.baseRevision) {
      throw new AppError("STALE_REVISION", 409, "The ledger changed since this revision was read.", {
        currentRevision: ledger.revision,
      });
    }

    // W8: resolve target.signalId
    const matches: number[] = [];
    ledger.raw.signals.forEach((record, i) => {
      if (isRecord(record) && record.id === request.target.signalId) matches.push(i);
    });
    if (matches.length === 0) {
      throw new AppError("SIGNAL_NOT_FOUND", 404, "That record is no longer in the ledger.");
    }
    if (matches.length > 1) {
      throw new AppError("IDENTITY_CONFLICT", 409, "This id is shared by more than one record.", {
        ledgerIndices: matches,
      });
    }
    const ledgerIndex = matches[0]!;
    const recordResult = Signal.safeParse(ledger.raw.signals[ledgerIndex]);
    if (!recordResult.success) {
      throw new AppError("RECORD_INVALID", 422, "This record does not match the expected shape.", {
        issues: recordResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const signal: RawSignal = recordResult.data;

    // Build context from the SAME bytes just read, for the identity-conflict and row-class checks.
    const [config, hints, runLog] = await Promise.all([readConfig(), readRoutingHints(), readRunLog()]);
    const signals: IndexedSignal[] = ledger.validIndices.map((i) => ({
      ledgerIndex: i,
      signal: ledger.raw.signals[i] as RawSignal,
    }));
    const ctx = buildContext({ signals, config, runLog, hints });
    const detectors = runDetectors(ctx);

    // W9
    const lockedGroup = detectors.groups.find((g) => g.members.some((m) => m.ledgerIndex === ledgerIndex));
    if (lockedGroup) {
      throw new AppError("IDENTITY_CONFLICT", 409, "This record is locked by an identity conflict.", {
        groupId: lockedGroup.groupId,
      });
    }

    // W10
    const project = request.target.project;
    if (!signal.projects.includes(project) || signal.status[project]?.state !== "analyzed") {
      throw new AppError("PRECONDITION_FAILED", 422, "This project is not an analysed entry on this signal.");
    }
    const rowClasses = detectors.findings
      .filter((f) => f.ledgerIndex === ledgerIndex && f.projectId === project)
      .map((f) => f.classId);
    // W10 resolution (see BUILD_LOG P5 entry): the spec bundles "set_summary needs HD1" and
    // "requeue needs >=1 HD1-4" under two codes without a literal 1:1 mapping. T-46's expected
    // values resolve it: set_summary without HD1 -> PRECONDITION_FAILED (the row no longer meets
    // the precondition for writing a summary); requeue with zero classes -> NOTHING_TO_REPAIR
    // (there is nothing at all left to retract).
    if (request.op === "set_summary" && !rowClasses.includes("HD1")) {
      throw new AppError("PRECONDITION_FAILED", 422, "This row has no missing summary to fix.");
    }
    if (request.op === "requeue_analysis" && rowClasses.length === 0) {
      throw new AppError("NOTHING_TO_REPAIR", 422, "This row has no handoff defect to repair.");
    }

    // W11
    if (request.op === "set_summary" && request.actor.kind !== "human") {
      throw new AppError("POLICY_HUMAN_REQUIRED", 403, "Adding a summary is a human-only action.", {
        reason: "set_summary is human-only",
      });
    }
    if (request.op === "requeue_analysis" && request.actor.kind === "agent") {
      const systemicByClass = new Map<ClassId, boolean>();
      for (const c of HD1_4) {
        const count = detectors.findings.filter((f) => f.classId === c).length;
        systemicByClass.set(c, isSystemic(count, ctx.eligible));
      }
      const lane = laneFor(rowClasses, systemicByClass);
      if (lane !== "agent_safe") {
        throw new AppError("POLICY_HUMAN_REQUIRED", 403, "This class is systemic; only a human may repair it.", {
          reason: "not agent-safe",
        });
      }
    }

    // W12: mutate a clone of the untouched raw JSON (never the Zod-parsed output — unknown keys survive).
    const before = ledger.raw as { version: number; signals: unknown[] };
    const after = structuredClone(before) as { version: number; signals: Record<string, unknown>[] };
    const targetBefore = before.signals[ledgerIndex] as Record<string, unknown>;
    const targetAfter = after.signals[ledgerIndex] as Record<string, unknown>;

    let changePath: string;
    let changeBefore: unknown;
    let changeAfter: unknown;

    if (request.op === "requeue_analysis") {
      const statusBefore = (targetBefore.status as Record<string, unknown>)[project];
      const newEntry = {
        ...(statusBefore as object),
        state: "pending",
        analyzed_at: null,
        files_reviewed: [],
        analysis_ref: null,
      };
      (targetAfter.status as Record<string, unknown>)[project] = newEntry;
      changePath = `signals[${ledgerIndex}].status.${project}`;
      changeBefore = statusBefore;
      changeAfter = newEntry;
    } else {
      changeBefore = targetBefore.summary;
      targetAfter.summary = request.summary;
      changePath = `signals[${ledgerIndex}].summary`;
      changeAfter = request.summary;
    }

    // W13
    assertOnlyAllowedChanges(before, after, { ledgerIndex, op: request.op, project });

    // W14
    const newBytes = `${JSON.stringify(after, null, 2)}\n`;
    try {
      await atomicWrite(ledgerFilePath(), newBytes, deps.ledgerIo);
    } catch (err) {
      throw new AppError("WRITE_FAILED", 500, "Could not write the ledger. The ledger is unchanged.", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const newRevision = createHash("sha256").update(Buffer.from(newBytes, "utf8")).digest("hex");

    // W15
    const auditId = randomUUID();
    const entry: AuditEntry = {
      auditId,
      at: new Date().toISOString(),
      actor: request.actor,
      op: request.op,
      target: { signalId: request.target.signalId, project, ledgerIndex },
      reason: request.op === "requeue_analysis" ? (request.reason ?? null) : null,
      revisionBefore: ledger.revision,
      revisionAfter: newRevision,
      change: { path: changePath, before: changeBefore, after: changeAfter },
    };
    try {
      await appendAudit(entry, deps.auditIo);
    } catch (err) {
      await atomicWrite(ledgerFilePath(), ledger.bytes.toString("utf8"), deps.ledgerIo).catch(() => undefined);
      throw new AppError("AUDIT_FAILED", 500, "Could not record the audit entry; the ledger was rolled back.", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // W16
    return {
      ok: true as const,
      auditId,
      revision: newRevision,
      change: { path: changePath, before: changeBefore, after: changeAfter },
    };
  });
}
