import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "@/server/errors";
import { atomicWrite, ledgerFilePath, nodeIo, readLedger, type Io } from "@/server/ledger/store";
import { makeTempEnv, type TempEnv } from "./helpers/tmp";

let env: TempEnv | undefined;

afterEach(async () => {
  if (env) {
    await env.cleanup();
    env = undefined;
  }
});

describe("readLedger (T-02, T-03)", () => {
  it("seeds the data copy on first read and not on the second", async () => {
    env = await makeTempEnv();
    const first = await readLedger();
    expect(first.seeded).toBe(true);
    const fixtureBytes = await readFile(path.join(env.fixtureDir, "signal-ledger.json"));
    expect(Buffer.compare(first.bytes, fixtureBytes)).toBe(0);

    const second = await readLedger();
    expect(second.seeded).toBe(false);
  });

  it("computes revision as sha256 of the exact bytes, matching the fixture hash when freshly seeded", async () => {
    env = await makeTempEnv();
    const result = await readLedger();
    const expected = createHash("sha256").update(result.bytes).digest("hex");
    expect(result.revision).toBe(expected);
    expect(result.revision).toBe("3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546");
  });

  it("revision changes after an atomic write", async () => {
    env = await makeTempEnv();
    const before = await readLedger();
    const mutated = before.bytes.toString("utf8").replace('"version": 4', '"version": 4 ');
    await atomicWrite(ledgerFilePath(), mutated);
    const after = await readLedger();
    expect(after.revision).not.toBe(before.revision);
  });
});

describe("readLedger error handling (T-04, T-05)", () => {
  it("throws LEDGER_UNREADABLE when the data ledger is not JSON", async () => {
    env = await makeTempEnv();
    await readLedger(); // seed
    await writeFile(ledgerFilePath(), "not json{", "utf8");

    await expect(readLedger()).rejects.toMatchObject({
      code: "LEDGER_UNREADABLE",
      status: 500,
      details: expect.objectContaining({ file: "data/signal-ledger.json" }),
    });
  });

  it("throws LEDGER_INVALID when version is not 4", async () => {
    env = await makeTempEnv();
    await readLedger(); // seed
    await writeFile(ledgerFilePath(), JSON.stringify({ version: 3, signals: [] }), "utf8");

    await expect(readLedger()).rejects.toMatchObject({ code: "LEDGER_INVALID", status: 500 });
  });
});

describe("readLedger skips invalid records (T-06)", () => {
  it("skips a record with no status and a non-string date, keeps the rest", async () => {
    env = await makeTempEnv();
    await readLedger(); // seed
    const raw = JSON.parse(await readFile(ledgerFilePath(), "utf8"));
    delete raw.signals[1].status;
    raw.signals[1].date = 7;
    await writeFile(ledgerFilePath(), JSON.stringify(raw), "utf8");

    const result = await readLedger();
    expect(result.skippedRecords).toHaveLength(1);
    expect(result.skippedRecords[0]?.ledgerIndex).toBe(1);
    expect(result.validIndices).toHaveLength(76);
    expect(result.validIndices).not.toContain(1);
  });
});

describe("atomicWrite retry behaviour (T-07)", () => {
  async function scratchFile() {
    const dir = await mkdtemp(path.join(tmpdir(), "handoff-atomic-"));
    const file = path.join(dir, "target.json");
    await writeFile(file, "before", "utf8");
    return { dir, file };
  }

  it("rejects, leaves the target unchanged, and cleans up the tmp file when rename always fails", async () => {
    const { dir, file } = await scratchFile();
    const io: Io = {
      ...nodeIo,
      rename: async () => {
        const err = new Error("EPERM") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      },
    };

    await expect(atomicWrite(file, "after", io)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("before");
    const leftovers = (await readdir(dir)).filter((n) => n.endsWith(".tmp"));
    expect(leftovers).toHaveLength(0);
  });

  it("resolves once rename succeeds after transient failures", async () => {
    const { file } = await scratchFile();
    let attempts = 0;
    const io: Io = {
      ...nodeIo,
      rename: async (oldPath, newPath) => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("EBUSY") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return nodeIo.rename(oldPath, newPath);
      },
    };

    await atomicWrite(file, "after", io);
    expect(attempts).toBe(3);
    expect(await readFile(file, "utf8")).toBe("after");
  });
});

// sanity: AppError shape used across the tests above
describe("AppError", () => {
  it("carries code, status and details", () => {
    const err = new AppError("LEDGER_INVALID", 500, "bad ledger", { file: "x" });
    expect(err.code).toBe("LEDGER_INVALID");
    expect(err.status).toBe(500);
    expect(err.details).toEqual({ file: "x" });
  });
});
