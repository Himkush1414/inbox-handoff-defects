import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TempEnv {
  root: string;
  fixtureDir: string;
  dataDir: string;
  cleanup: () => Promise<void>;
}

/**
 * A temp copy of fixture/ plus an empty data dir, with INBOX_FIXTURE_DIR and
 * INBOX_DATA_DIR pointed at them. Never touches the repo's own fixture/ or data/.
 */
export async function makeTempEnv(): Promise<TempEnv> {
  const root = await mkdtemp(path.join(tmpdir(), "handoff-test-"));
  const fixtureDir = path.join(root, "fixture");
  const dataDir = path.join(root, "data");
  await cp(path.join(process.cwd(), "fixture"), fixtureDir, { recursive: true });

  const prevFixture = process.env.INBOX_FIXTURE_DIR;
  const prevData = process.env.INBOX_DATA_DIR;
  process.env.INBOX_FIXTURE_DIR = fixtureDir;
  process.env.INBOX_DATA_DIR = dataDir;

  return {
    root,
    fixtureDir,
    dataDir,
    cleanup: async () => {
      if (prevFixture === undefined) delete process.env.INBOX_FIXTURE_DIR;
      else process.env.INBOX_FIXTURE_DIR = prevFixture;
      if (prevData === undefined) delete process.env.INBOX_DATA_DIR;
      else process.env.INBOX_DATA_DIR = prevData;
      await rm(root, { recursive: true, force: true });
    },
  };
}
