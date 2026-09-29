#!/usr/bin/env node
// Deletes the seeded ledger copy and audit log so the next read re-seeds.
import { rm } from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.INBOX_DATA_DIR ?? path.join(process.cwd(), "data");
const targets = ["signal-ledger.json", "audit.jsonl"];

for (const name of targets) {
  const file = path.join(dataDir, name);
  try {
    await rm(file);
    console.log(`deleted ${path.relative(process.cwd(), file)}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`not present: ${path.relative(process.cwd(), file)}`);
    } else {
      throw err;
    }
  }
}
