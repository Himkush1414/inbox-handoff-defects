"use client";
import type { ProjectGroup } from "@/lib/contracts";

export default function ProjectRail({
  projects,
  selectedId,
  onSelect,
  configFindingsCount,
}: {
  projects: ProjectGroup[];
  selectedId: string | "__config" | null;
  onSelect: (id: string | "__config") => void;
  configFindingsCount: number;
}) {
  function countsLine(p: ProjectGroup): string {
    if (p.counts.identityConflicts === 0 && p.counts.humanFirst === 0 && p.counts.agentSafe === 0) return "Clean";
    const parts: string[] = [];
    if (p.counts.identityConflicts > 0) parts.push(`${p.counts.identityConflicts} conflict(s)`);
    parts.push(`${p.counts.humanFirst} human`);
    parts.push(`${p.counts.agentSafe} agent`);
    return parts.join(" · ");
  }

  return (
    <nav className="project-rail" aria-label="Projects">
      <ol>
        {projects.map((p) => (
          <li key={p.id}>
            <button type="button" aria-current={selectedId === p.id} onClick={() => onSelect(p.id)}>
              <span>
                <span className="rail-rank">{p.rank}</span> {p.name}
              </span>
              <span className="muted">{countsLine(p)}</span>
              <span className="muted">
                Handed off {p.counts.handedOff} of {p.counts.analyzed}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="rail-config" aria-current={selectedId === "__config"} onClick={() => onSelect("__config")}>
            Routing config {configFindingsCount}
          </button>
        </li>
      </ol>

      <label className="rail-select-label">
        <span className="sr-only">Select a project</span>
        <select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rank}. {p.name}
            </option>
          ))}
          <option value="__config">Routing config ({configFindingsCount})</option>
        </select>
      </label>
    </nav>
  );
}
