#!/usr/bin/env node
// Dry-run-by-default agent demo (spec §8.4). Only ever calls the public routes — never touches
// the ledger file directly. Requires a running server (npm run dev or npm start).
const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

const url = flagValue("url", "http://127.0.0.1:3000");
const name = flagValue("name", "repair-bot");
const apply = args.includes("--apply");

async function main() {
  const res = await fetch(`${url}/api/defects`);
  if (!res.ok) {
    console.error(`GET /api/defects failed: ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const report = await res.json();

  const rows = [];
  for (const project of report.projects) {
    for (const row of project.agentSafe) {
      rows.push({ projectId: project.id, row });
    }
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${rows.length} agent-safe row(s) found.`);
  console.log(
    `Skipped ${report.totals.humanFirst} human-first item(s): identity, routing, systemic or authoring.`,
  );
  console.log("");

  let revision = report.revision;

  for (const { projectId, row } of rows) {
    const classes = row.classes.join(",");
    if (!apply) {
      console.log(`${projectId}\t${row.signal.id}\t${classes}\twould re-queue`);
      continue;
    }

    const body = {
      op: "requeue_analysis",
      target: { signalId: row.signal.id, project: projectId },
      baseRevision: revision,
      actor: { kind: "agent", name },
      reason: `auto: ${classes}`,
    };

    const repairRes = await fetch(`${url}/api/repairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const repairBody = await repairRes.json();

    if (repairRes.status !== 200) {
      console.log(
        `${projectId}\t${row.signal.id}\t${classes}\tFAILED (${repairRes.status} ${repairBody.error?.code}: ${repairBody.error?.message})`,
      );
      process.exitCode = 1;
      return;
    }

    revision = repairBody.revision;
    console.log(`${projectId}\t${row.signal.id}\t${classes}\tre-queued (audit ${repairBody.auditId})`);
  }
}

main().catch((err) => {
  console.error(`agent-repair failed: ${err.message}`);
  process.exitCode = 1;
});
