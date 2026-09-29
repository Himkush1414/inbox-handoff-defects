import "server-only";
import path from "node:path";
import fsp from "node:fs/promises";
import { dataDir } from "./config";
import type { ActorKind, RepairOp } from "../lib/contracts";

export interface AuditEntry {
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

export function auditFilePath(): string {
  return path.join(dataDir(), "audit.jsonl");
}

export interface AuditFileHandle {
  appendFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AuditIo {
  open(path: string, flags: string): Promise<AuditFileHandle>;
}

export const nodeAuditIo: AuditIo = {
  open: (p, flags) => fsp.open(p, flags) as unknown as Promise<AuditFileHandle>,
};

// appendAudit: open(auditFile, "a") -> appendFile(JSON.stringify(entry) + "\n") -> sync -> close.
export async function appendAudit(entry: AuditEntry, io: AuditIo = nodeAuditIo): Promise<void> {
  await fsp.mkdir(dataDir(), { recursive: true });
  const handle = await io.open(auditFilePath(), "a");
  try {
    await handle.appendFile(`${JSON.stringify(entry)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export interface ReadAuditResult {
  entries: AuditEntry[];
  total: number;
  corruptLines: number;
}

export async function readAudit(limit: number): Promise<ReadAuditResult> {
  let text: string;
  try {
    text = await fsp.readFile(auditFilePath(), "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], total: 0, corruptLines: 0 };
    }
    throw err;
  }

  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const parsed: AuditEntry[] = [];
  let corruptLines = 0;
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as AuditEntry);
    } catch {
      corruptLines++;
    }
  }

  const newestFirst = [...parsed].reverse();
  return { entries: newestFirst.slice(0, limit), total: parsed.length, corruptLines };
}
