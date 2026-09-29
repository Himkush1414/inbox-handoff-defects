import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// T-01: fixture/ must stay byte-identical to Supanova's pack (spec Appendix C).
const EXPECTED_HASHES: Record<string, string> = {
  "README.md": "4b6f4e6b03982346ca0a34830c8c9715caba67de4cf48b2b309f08f8250c6d31",
  "config.json": "be3cbecc79e39a4da7795afd172e98081f97632f2b8292f04eddada8dea71719",
  "make_fixture.py": "ebfe7f15feab2070fe4d1df5a2443bed4d0e7b787ea7ddde00038b3c26c7535f",
  "routing-hints.json": "733957eaa51ab53b69e8a8fe5f2fad2a6918285365a8834ee83ffe6bbad3c821",
  "run-log.jsonl": "b936635631c0551c8c4ffc55f022f792f5539ffd1ce9ab02b7cb83a702bcb90e",
  "signal-ledger.json": "3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546",
};

describe("fixture integrity (T-01)", () => {
  for (const [name, expected] of Object.entries(EXPECTED_HASHES)) {
    it(`fixture/${name} matches Appendix C`, () => {
      const bytes = readFileSync(path.join(process.cwd(), "fixture", name));
      const actual = createHash("sha256").update(bytes).digest("hex");
      expect(actual).toBe(expected);
    });
  }
});
