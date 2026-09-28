#!/usr/bin/env node
// Clean-clone smoke test (spec §8.3). Proves DoD-1/DoD-3 on the committed HEAD, exactly as a
// reviewer would get it: clone -> npm ci -> build -> start -> API assertions. Never touches this
// working directory or its fixture/ or data/ - everything happens inside a fresh temp clone.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const WIN32 = process.platform === "win32";
const PORT = "3217";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_TIMEOUT_MS = 60_000;

const FIXTURE_HASHES = {
  "README.md": "4b6f4e6b03982346ca0a34830c8c9715caba67de4cf48b2b309f08f8250c6d31",
  "config.json": "be3cbecc79e39a4da7795afd172e98081f97632f2b8292f04eddada8dea71719",
  "make_fixture.py": "ebfe7f15feab2070fe4d1df5a2443bed4d0e7b787ea7ddde00038b3c26c7535f",
  "routing-hints.json": "733957eaa51ab53b69e8a8fe5f2fad2a6918285365a8834ee83ffe6bbad3c821",
  "run-log.jsonl": "b936635631c0551c8c4ffc55f022f792f5539ffd1ce9ab02b7cb83a702bcb90e",
  "signal-ledger.json": "3bcb61518d23dde6a6c6c2704de3d5def2d13e118f5d52be0da8ce6087f3d546",
};

class SmokeError extends Error {
  constructor(step, reason) {
    super(`${step}: ${reason}`);
    this.step = step;
    this.reason = reason;
  }
}

function run(step, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell: WIN32 && cmd === "npm",
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", (err) => reject(new SmokeError(step, err.message)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new SmokeError(step, `"${cmd} ${args.join(" ")}" exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollHealth(step) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastErr = "not reachable yet";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return res.json();
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await sleep(1000);
  }
  throw new SmokeError(step, `server did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s (${lastErr})`);
}

function stopServer(step, child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (WIN32) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch (err) {
    console.error(`(${step}) warning: could not stop server cleanly: ${err.message}`);
  }
}

async function main() {
  const repoRoot = process.cwd();

  // S0: warn, don't fail, if there is uncommitted work — it will not be exercised by this clone.
  try {
    const status = execSync("git status --porcelain", { cwd: repoRoot }).toString();
    if (status.trim().length > 0) {
      console.warn("SMOKE WARN: working tree has uncommitted changes; only the committed HEAD is tested:");
      console.warn(status.trim());
    }
  } catch (err) {
    console.warn(`SMOKE WARN: could not check git status: ${err.message}`);
  }

  // S1: clone the committed HEAD into a fresh temp dir.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "handoff-smoke-"));
  const cloneDir = path.join(tmp, "repo");
  let serverProc;

  try {
    await run("S1-clone", "git", ["clone", "--quiet", repoRoot, cloneDir]);

    // S2: install and build, exactly the commands a reviewer's README would tell them to run.
    await run("S2-install", "npm", ["ci"], { cwd: cloneDir });
    await run("S2-build", "npm", ["run", "build"], { cwd: cloneDir });

    // S3: start the production server directly via node (so killing the PID kills the server —
    // spawning through npm/next's own wrapper would leave an orphaned child, see BUILD_LOG M-17).
    serverProc = spawn(
      process.execPath,
      [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1"],
      { cwd: cloneDir, env: { ...process.env, PORT }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let serverLog = "";
    serverProc.stdout.on("data", (d) => (serverLog += d));
    serverProc.stderr.on("data", (d) => (serverLog += d));

    const health = await pollHealth("S3-start").catch((err) => {
      throw new SmokeError(err.step, `${err.reason}\n--- server output (tail) ---\n${serverLog.slice(-2000)}`);
    });

    // S4: health + defects report match Appendix A-8 exactly.
    if (health.signalCount !== 77) throw new SmokeError("S4-health", `signalCount ${health.signalCount} !== 77`);
    if (health.seeded !== true) throw new SmokeError("S4-health", `seeded ${health.seeded} !== true`);

    const defectsRes = await fetch(`${BASE_URL}/api/defects`);
    if (!defectsRes.ok) throw new SmokeError("S4-defects", `GET /api/defects returned ${defectsRes.status}`);
    const report = await defectsRes.json();

    const expectedClasses = ["HD5=4", "HD6=1", "HD2=3", "HD3=1", "HD4=1", "HD1=27"];
    const actualClasses = report.classes.map((c) => `${c.id}=${c.count}`);
    if (JSON.stringify(actualClasses) !== JSON.stringify(expectedClasses)) {
      throw new SmokeError("S4-defects", `classes ${JSON.stringify(actualClasses)} !== ${JSON.stringify(expectedClasses)}`);
    }
    const expectedTotals = { humanFirst: 23, agentSafe: 4, identityConflicts: 4, configFindings: 1 };
    if (JSON.stringify(report.totals) !== JSON.stringify(expectedTotals)) {
      throw new SmokeError("S4-defects", `totals ${JSON.stringify(report.totals)} !== ${JSON.stringify(expectedTotals)}`);
    }
    const expectedOrder = ["studio_ops", "harborline", "northwind", "atlas", "quill"];
    const actualOrder = report.projects.map((p) => p.id);
    if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
      throw new SmokeError("S4-defects", `project order ${JSON.stringify(actualOrder)} !== ${JSON.stringify(expectedOrder)}`);
    }

    // S5: a malformed body is rejected; an agent may not repair a systemic (human-first) row.
    const badJsonRes = await fetch(`${BASE_URL}/api/repairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const badJsonBody = await badJsonRes.json();
    if (badJsonRes.status !== 400 || badJsonBody.error?.code !== "INVALID_JSON") {
      throw new SmokeError("S5-invalid-json", `expected 400 INVALID_JSON, got ${badJsonRes.status} ${badJsonBody.error?.code}`);
    }

    const revisionBeforeAgentAttempt = health.revision;
    const blockedRes = await fetch(`${BASE_URL}/api/repairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "requeue_analysis",
        target: { signalId: "2026-07-07_harborline_weekly_sync", project: "harborline" },
        baseRevision: revisionBeforeAgentAttempt,
        actor: { kind: "agent", name: "smoke-bot" },
      }),
    });
    const blockedBody = await blockedRes.json();
    if (blockedRes.status !== 403 || blockedBody.error?.code !== "POLICY_HUMAN_REQUIRED") {
      throw new SmokeError("S5-policy", `expected 403 POLICY_HUMAN_REQUIRED, got ${blockedRes.status} ${blockedBody.error?.code}`);
    }

    // S6: an agent-safe repair succeeds; verify its effect and that fixture/ is untouched.
    const preS6Revision = revisionBeforeAgentAttempt;
    const okRes = await fetch(`${BASE_URL}/api/repairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "requeue_analysis",
        target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
        baseRevision: preS6Revision,
        actor: { kind: "agent", name: "smoke-bot" },
        reason: "auto: smoke test",
      }),
    });
    const okBody = await okRes.json();
    if (okRes.status !== 200) throw new SmokeError("S6-repair", `expected 200, got ${okRes.status} ${JSON.stringify(okBody)}`);

    const afterReport = await fetch(`${BASE_URL}/api/defects`).then((r) => r.json());
    const hd3 = afterReport.classes.find((c) => c.id === "HD3")?.count;
    if (hd3 !== 0) throw new SmokeError("S6-repair", `expected HD3 count 0 after repair, got ${hd3}`);
    if (afterReport.totals.agentSafe !== 3) {
      throw new SmokeError("S6-repair", `expected agentSafe 3 after repair, got ${afterReport.totals.agentSafe}`);
    }

    const auditAfter = await fetch(`${BASE_URL}/api/audit`).then((r) => r.json());
    if (auditAfter.total !== 1) throw new SmokeError("S6-audit", `expected audit total 1, got ${auditAfter.total}`);

    for (const [name, expectedHash] of Object.entries(FIXTURE_HASHES)) {
      const bytes = readFileSync(path.join(cloneDir, "fixture", name));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== expectedHash) {
        throw new SmokeError("S6-fixture", `${name} hash ${actualHash} !== ${expectedHash} (fixture/ must never be written)`);
      }
    }

    // S7: repeating the write with the now-stale (pre-S6) revision must be rejected.
    const staleRes = await fetch(`${BASE_URL}/api/repairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "requeue_analysis",
        target: { signalId: "2026-07-06_atlas_permit_intake", project: "atlas" },
        baseRevision: preS6Revision,
        actor: { kind: "agent", name: "smoke-bot" },
      }),
    });
    const staleBody = await staleRes.json();
    if (staleRes.status !== 409 || staleBody.error?.code !== "STALE_REVISION") {
      throw new SmokeError("S7-stale", `expected 409 STALE_REVISION, got ${staleRes.status} ${staleBody.error?.code}`);
    }

    console.log("SMOKE PASS");
    process.exitCode = 0;
  } catch (err) {
    if (err instanceof SmokeError) {
      console.error(`SMOKE FAIL: ${err.step} ${err.reason}`);
    } else {
      console.error(`SMOKE FAIL: unexpected ${err.stack ?? err.message}`);
    }
    process.exitCode = 1;
  } finally {
    // S8
    stopServer("S8-stop", serverProc);
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch (err) {
      console.error(`(S8-cleanup) warning: could not remove ${tmp}: ${err.message}`);
    }
  }
}

main();
