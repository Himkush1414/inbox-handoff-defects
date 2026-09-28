import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("architecture: browser code never touches the ledger directly (T-60)", () => {
  it("no file in src/components or src/app (excluding src/app/api) imports server internals or JSON data", () => {
    const apiDir = path.join(ROOT, "src", "app", "api");
    const files = [
      ...walk(path.join(ROOT, "src", "components")),
      ...walk(path.join(ROOT, "src", "app")).filter((f) => !f.startsWith(apiDir)),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const bad =
        /from\s+["']@\/server/.test(text) ||
        /from\s+["']server-only["']/.test(text) ||
        /from\s+["']node:fs/.test(text) ||
        /from\s+["'][^"']+\.json["']/.test(text) ||
        /fixture\//.test(text) ||
        /signal-ledger/.test(text);
      if (bad) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});

describe("architecture: only store/audit/fixture touch node:fs (T-61)", () => {
  const allowed = new Set(
    ["ledger/store.ts", "audit.ts", "fixture.ts"].map((p) => path.join(ROOT, "src", "server", p)),
  );

  it("no other src/server file imports node:fs directly", () => {
    const files = walk(path.join(ROOT, "src", "server"));
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const touchesFs = /from\s+["']node:fs/.test(text) || /require\(\s*["']node:fs/.test(text);
      if (touchesFs && !allowed.has(file)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("fixture.ts has no write calls", () => {
    const text = fs.readFileSync(path.join(ROOT, "src", "server", "fixture.ts"), "utf8");
    expect(/writeFile|appendFile|\brm\(|unlink|rename\(/.test(text)).toBe(false);
  });
});

describe("architecture: every src/server file starts with server-only (T-62)", () => {
  it('first non-empty line is exactly import "server-only";', () => {
    const files = walk(path.join(ROOT, "src", "server"));
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
      if (firstLine.trim() !== 'import "server-only";') offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});

describe("architecture: dependency allowlist (T-64)", () => {
  it("package.json declares exactly the allowed dependencies", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ["next", "react", "react-dom", "server-only", "zod"].sort(),
    );
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(
      ["@types/node", "@types/react", "@types/react-dom", "typescript", "vitest"].sort(),
    );
  });
});
