import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fixtureDir } from "./config";
import { AppError } from "./errors";

export interface ProjectConfig {
  id: string;
  name: string;
  type: string;
  keywords: string[];
  domains: string[];
  emails: string[];
  active: boolean;
}

export interface Config {
  projects: ProjectConfig[];
  internal_domains: string[];
  fallbacks: { unrouted: string; unknown_project: string };
  feed_freshness_threshold_days: number;
}

export interface RoutingHint {
  type: string;
  match: string;
  project: string;
  note: string;
  by: string;
  on: string;
}

export interface RunLogEntry {
  run: number;
  started_at: string;
  status: string;
  error: string | null;
  counts: Record<string, number>;
  feeds: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function readConfig(): Promise<Config> {
  const file = path.join(fixtureDir(), "config.json");
  let parsed: unknown;
  try {
    const text = await readFile(file, "utf8");
    parsed = JSON.parse(text);
  } catch (err) {
    throw new AppError("FIXTURE_UNREADABLE", 500, "Could not read config.json", {
      file: "config.json",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  if (
    !isPlainObject(parsed) ||
    !Array.isArray(parsed.projects) ||
    !isPlainObject(parsed.fallbacks) ||
    typeof (parsed.fallbacks as Record<string, unknown>).unrouted !== "string" ||
    typeof (parsed.fallbacks as Record<string, unknown>).unknown_project !== "string"
  ) {
    throw new AppError("FIXTURE_UNREADABLE", 500, "config.json has an unexpected shape", {
      file: "config.json",
    });
  }
  return parsed as unknown as Config;
}

export async function readRoutingHints(): Promise<RoutingHint[]> {
  const file = path.join(fixtureDir(), "routing-hints.json");
  let parsed: unknown;
  try {
    const text = await readFile(file, "utf8");
    parsed = JSON.parse(text);
  } catch (err) {
    throw new AppError("FIXTURE_UNREADABLE", 500, "Could not read routing-hints.json", {
      file: "routing-hints.json",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  if (!Array.isArray(parsed) || parsed.some((h) => !isPlainObject(h) || typeof h.project !== "string")) {
    throw new AppError("FIXTURE_UNREADABLE", 500, "routing-hints.json has an unexpected shape", {
      file: "routing-hints.json",
    });
  }
  return parsed as unknown as RoutingHint[];
}

export async function readRunLog(): Promise<RunLogEntry[]> {
  const file = path.join(fixtureDir(), "run-log.jsonl");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    throw new AppError("FIXTURE_UNREADABLE", 500, "Could not read run-log.jsonl", {
      file: "run-log.jsonl",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const entries: RunLogEntry[] = [];
  lines.forEach((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new AppError("FIXTURE_UNREADABLE", 500, "run-log.jsonl has a malformed line", {
        file: "run-log.jsonl",
        line: index + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (!isPlainObject(parsed) || typeof parsed.run !== "number" || typeof parsed.status !== "string") {
      throw new AppError("FIXTURE_UNREADABLE", 500, "run-log.jsonl has an unexpected shape", {
        file: "run-log.jsonl",
        line: index + 1,
      });
    }
    entries.push(parsed as unknown as RunLogEntry);
  });
  return entries;
}
