"use client";
import { useEffect, useState } from "react";
import { fetchAudit, type AuditEntryView } from "@/lib/api-client";

function formatChange(e: AuditEntryView): string {
  if (e.op === "requeue_analysis") {
    const before = e.change.before as { state?: string } | null;
    return `${before?.state ?? "?"} → pending`;
  }
  const after = typeof e.change.after === "string" ? e.change.after : "";
  return `summary added (${after.length} chars)`;
}

export default function AuditPanel({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<AuditEntryView[]>([]);
  const [total, setTotal] = useState(0);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await fetchAudit(20);
      setEntries(data.entries);
      setTotal(data.total);
      setError(null);
    } catch {
      setError("Couldn't load recent changes.");
    }
  }

  useEffect(() => {
    // Spec §5.1.2: fetch when first opened AND after every successful write — a write that
    // happens before the panel has ever been opened must still update the visible count.
    if (opened || refreshKey > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, refreshKey]);

  return (
    <details className="audit-panel" onToggle={(e) => setOpened((e.target as HTMLDetailsElement).open)}>
      <summary>Recent changes ({total})</summary>
      {error ? (
        <div>
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <p>No changes yet. Every repair, by a person or an agent, appears here with before and after.</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.auditId}>
              <span className="mono">{new Date(e.at).toLocaleString()}</span> ·{" "}
              <span className={`lane-badge lane-${e.actor.kind === "agent" ? "agent_safe" : "human_first"}`}>
                {e.actor.kind}
              </span>{" "}
              {e.actor.name} · {e.op} · {e.target.signalId}/{e.target.project}
              <div className="muted">{formatChange(e)}</div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
