"use client";
import { CLASS_META, type ClassId, type ProjectGroup } from "@/lib/contracts";

export default function ClassFilter({
  project,
  value,
  onChange,
}: {
  project: ProjectGroup;
  value: ClassId | "all";
  onChange: (value: ClassId | "all") => void;
}) {
  const rows = [...project.humanFirst, ...project.agentSafe];
  const present: ClassId[] = [];
  if (project.identityConflicts.length > 0) present.push("HD5");
  for (const r of rows) for (const c of r.classes) if (!present.includes(c)) present.push(c);

  const totalCount = project.counts.identityConflicts + project.counts.humanFirst + project.counts.agentSafe;

  function countFor(id: ClassId): number {
    if (id === "HD5") return project.counts.identityConflicts;
    return rows.filter((r) => r.classes.includes(id)).length;
  }

  return (
    <div className="class-filter" role="group" aria-label="Filter by class">
      <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")}>
        All {totalCount}
      </button>
      {present.map((id) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {CLASS_META[id].label} {countFor(id)}
        </button>
      ))}
    </div>
  );
}
