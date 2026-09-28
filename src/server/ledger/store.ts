import "server-only";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { dataDir, fixtureDir } from "../config.js";
import { AppError } from "../errors.js";
import { Root, Signal } from "./schema.js";

const LEDGER_FILE_NAME = "signal-ledger.json";

export interface SkippedRecord {
  ledgerIndex: number;
  id: string | null;
  issues: string[];
}

export interface ReadLedgerResult {
  bytes: Buffer;
  raw: { version: number; signals: unknown[] };
  revision: string;
  seeded: boolean;
  validIndices: number[];
  skippedRecords: SkippedRecord[];
}

function ledgerFile(): string {
  return path.join(dataDir(), LEDGER_FILE_NAME);
}

/**
 * Ensures data/signal-ledger.json exists, seeding it byte-for-byte from the
 * fixture on first read. Returns true iff this call performed the seed.
 */
async function ensureSeeded(): Promise<boolean> {
  const dir = dataDir();
  await fsp.mkdir(dir, { recursive: true });
  const src = path.join(fixtureDir(), LEDGER_FILE_NAME);
  const dst = ledgerFile();
  try {
    await fsp.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
    return true;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw err;
  }
}

export async function readLedger(): Promise<ReadLedgerResult> {
  const seeded = await ensureSeeded();

  let bytes: Buffer;
  try {
    bytes = await fsp.readFile(ledgerFile());
  } catch (err) {
    throw new AppError("LEDGER_UNREADABLE", 500, "Could not read the ledger file", {
      file: "data/signal-ledger.json",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    throw new AppError("LEDGER_UNREADABLE", 500, "The ledger is not valid JSON", {
      file: "data/signal-ledger.json",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const rootResult = Root.safeParse(parsed);
  if (!rootResult.success) {
    throw new AppError("LEDGER_INVALID", 500, "The ledger does not match the expected shape", {
      file: "data/signal-ledger.json",
      issues: rootResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }

  const raw = rootResult.data as { version: number; signals: unknown[] };
  const validIndices: number[] = [];
  const skippedRecords: SkippedRecord[] = [];

  raw.signals.forEach((record, ledgerIndex) => {
    const result = Signal.safeParse(record);
    if (result.success) {
      validIndices.push(ledgerIndex);
    } else {
      const id =
        typeof record === "object" && record !== null && "id" in record && typeof (record as { id: unknown }).id === "string"
          ? (record as { id: string }).id
          : null;
      skippedRecords.push({
        ledgerIndex,
        id,
        issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  });

  const revision = createHash("sha256").update(bytes).digest("hex");

  return { bytes, raw, revision, seeded, validIndices, skippedRecords };
}

// --- Write lock --------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn); // serialise every write in this process
  chain = run.catch(() => undefined);
  return run;
}

// --- Atomic write --------------------------------------------------------

export interface IoFileHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface Io {
  open(path: string, flags: string): Promise<IoFileHandle>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, opts?: { force?: boolean }): Promise<void>;
}

export const nodeIo: Io = {
  open: (p, flags) => fsp.open(p, flags) as unknown as Promise<IoFileHandle>,
  rename: (oldPath, newPath) => fsp.rename(oldPath, newPath),
  rm: (p, opts) => fsp.rm(p, opts),
};

const RETRYABLE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(tmp: string, file: string, io: Io): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await io.rename(tmp, file);
      return;
    } catch (err) {
      const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      const retryable = code !== undefined && RETRYABLE_CODES.has(code);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      await sleep(50 * attempt);
    }
  }
}

export async function atomicWrite(file: string, data: string, io: Io = nodeIo): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`; // same directory => same volume
  try {
    const handle = await io.open(tmp, "wx");
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmp, file, io); // up to 5 tries on EPERM/EACCES/EBUSY, wait 50ms * attempt
  } catch (err) {
    // (Windows: AV/indexer can briefly lock the target)
    await io.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export function ledgerFilePath(): string {
  return ledgerFile();
}
