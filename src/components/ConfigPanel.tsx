import type { ConfigFinding } from "@/lib/contracts";

export default function ConfigPanel({ findings }: { findings: ConfigFinding[] }) {
  return (
    <section className="project-panel" aria-label="Routing config">
      <header className="project-panel-header">
        <h2>Routing config</h2>
      </header>
      {findings.length === 0 ? (
        <p>No routing-config findings.</p>
      ) : (
        <ul>
          {findings.map((f) => (
            <li key={f.findingKey} className="defect-row">
              <div className="mono">
                {f.location.file}
                {f.location.file === "routing-hints.json" ? ` #${f.location.index + 1}` : ` (${f.location.signalId})`}
              </div>
              <p>{f.message}</p>
              {f.suggestion && <p className="muted">Closest project id: {f.suggestion}</p>}
              <p className="muted">Edit routing-hints.json through code review. Not editable here.</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
