import type { ActorKind, DefectReport, RepairOp } from "./contracts";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(err: ApiErrorBody) {
    super(err.message);
    this.code = err.code;
    this.details = err.details;
  }
}

export async function fetchDefects(): Promise<DefectReport> {
  const res = await fetch("/api/defects", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new ApiRequestError(body.error);
  return body as DefectReport;
}

export interface RepairRequestBody {
  op: RepairOp;
  target: { signalId: string; project: string };
  baseRevision: string;
  actor: { kind: "human"; name: string };
  reason?: string;
  summary?: string;
}

export interface RepairSuccess {
  ok: true;
  auditId: string;
  revision: string;
  change: { path: string; before: unknown; after: unknown };
}

export async function postRepair(body: RepairRequestBody): Promise<RepairSuccess> {
  const res = await fetch("/api/repairs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new ApiRequestError(json.error);
  return json as RepairSuccess;
}

export interface AuditEntryView {
  auditId: string;
  at: string;
  actor: { kind: ActorKind; name: string };
  op: RepairOp;
  target: { signalId: string; project: string; ledgerIndex: number };
  reason: string | null;
  revisionBefore: string;
  revisionAfter: string;
  change: { path: string; before: unknown; after: unknown };
}

export interface AuditResponse {
  entries: AuditEntryView[];
  total: number;
  corruptLines: number;
}

export async function fetchAudit(limit = 20): Promise<AuditResponse> {
  const res = await fetch(`/api/audit?limit=${limit}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new ApiRequestError(body.error);
  return body as AuditResponse;
}

/**
 * Maps a repair failure to the plain-language message + follow-up behaviour from spec §5.6's
 * response table. Never surfaces a raw error code or JSON to the person using the dialog — only
 * the server's own human-readable `message` field, wrapped in a fixed template per code family.
 */
export function describeRepairError(err: unknown): { message: string; closeDialog: boolean } {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "VALIDATION_FAILED": {
        const issues = err.details?.issues as { path: (string | number)[]; message: string }[] | undefined;
        const first = issues?.[0];
        return {
          message: first ? `Not saved: ${first.path.join(".")}: ${first.message}` : `Not saved: ${err.message}`,
          closeDialog: false,
        };
      }
      case "STALE_REVISION":
        return {
          message: "The ledger changed since you loaded it. Reloaded; check the row and try again.",
          closeDialog: true,
        };
      case "IDENTITY_CONFLICT":
        return { message: "This record is locked by an identity conflict.", closeDialog: true };
      case "PRECONDITION_FAILED":
      case "NOTHING_TO_REPAIR":
        return { message: `Nothing to change: ${err.message}`, closeDialog: true };
      case "SIGNAL_NOT_FOUND":
        return { message: "That record is no longer in the ledger.", closeDialog: true };
      case "POLICY_HUMAN_REQUIRED":
      case "FORBIDDEN_ORIGIN":
        return { message: `Not allowed: ${err.message}`, closeDialog: false };
      default:
        return { message: `Not saved: ${err.message}. The ledger is unchanged.`, closeDialog: false };
    }
  }
  return { message: "Server not reachable. Nothing was saved.", closeDialog: false };
}
