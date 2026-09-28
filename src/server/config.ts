import "server-only";
import path from "node:path";

export function fixtureDir(): string {
  return process.env.INBOX_FIXTURE_DIR ?? path.join(process.cwd(), "fixture");
}

export function dataDir(): string {
  return process.env.INBOX_DATA_DIR ?? path.join(process.cwd(), "data");
}

export const SYSTEMIC_MIN_RATE = 0.5;
export const SYSTEMIC_MIN_COUNT = 5;
export const MAX_BODY_BYTES = 16384;
