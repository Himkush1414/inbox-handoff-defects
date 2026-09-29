"use client";
import { CLASS_META, type ActionView, type ClassId, type DefectRow as DefectRowType, type ProjectGroup } from "@/lib/contracts";
import ClassFilter from "./ClassFilter";
import ConflictGroupCard from "./ConflictGroupCard";
import DefectRow from "./DefectRow";

export default function ProjectPanel({
  project,
  classFilter,
  onClassFilterChange,
  reviewerValid,
  onAction,
}: {
  project: ProjectGroup;
  classFilter: ClassId | "all";
  onClassFilterChange: (value: ClassId | "all") => void;
  reviewerValid: boolean;
  onAction: (row: DefectRowType, op: ActionView["op"]) => void;
}) {
  const isClean =
    project.counts.identityConflicts === 0 && project.counts.humanFirst === 0 && project.counts.agentSafe === 0;

  const showConflicts = classFilter === "all" || classFilter === "HD5";
  const showRows = classFilter !== "HD5";
  const rowMatches = (r: { classes: ClassId[] }) => classFilter === "all" || r.classes.includes(classFilter as ClassId);

  const humanRows = showRows ? project.humanFirst.filter(rowMatches) : [];
  const agentRows = showRows ? project.agentSafe.filter(rowMatches) : [];
  const conflictsToShow = showConflicts ? project.identityConflicts : [];

  const nothingMatchesFilter =
    classFilter !== "all" && conflictsToShow.length === 0 && humanRows.length === 0 && agentRows.length === 0;

  const handedOffLine =
    project.counts.analyzed === 0
      ? "No analysed signals yet."
      : `${project.counts.handedOff} of ${project.counts.analyzed} analysed fully handed off`;

  return (
    <section className="project-panel" aria-label={project.name}>
      <header className="project-panel-header">
        <h2>
          {project.name} · {project.type} · rank {project.rank}
        </h2>
        <span className="muted" title="Handed off = analysed, with a summary and references that resolve — not the same as repaired.">
          {handedOffLine}
        </span>
      </header>

      {isClean ? (
        <p>
          {project.counts.analyzed === 0
            ? "No analysed signals yet."
            : `Nothing to fix in ${project.name}: ${project.counts.analyzed} analysed, ${project.counts.handedOff} handed off.`}
        </p>
      ) : (
        <>
          <ClassFilter project={project} value={classFilter} onChange={onClassFilterChange} />

          {nothingMatchesFilter ? (
            <div>
              {/* nothingMatchesFilter already implies classFilter !== "all"; TS narrows it here. */}
              <p>
                No {CLASS_META[classFilter].label} in {project.name}.
              </p>
              <button type="button" onClick={() => onClassFilterChange("all")}>
                Clear filter
              </button>
            </div>
          ) : (
            <>
              {project.identityConflicts.length > 0 && showConflicts && (
                <div>
                  <h3>Identity conflicts — fix upstream first ({conflictsToShow.length})</h3>
                  {conflictsToShow.map((g) => (
                    <ConflictGroupCard key={g.groupId} group={g} />
                  ))}
                </div>
              )}

              {showRows && (
                <div>
                  <h3>Needs a human ({humanRows.length})</h3>
                  {humanRows.length === 0 ? (
                    <p>Nothing needs a human here.</p>
                  ) : (
                    <ul>
                      {humanRows.map((r) => (
                        <DefectRow key={r.rowKey} row={r} reviewerValid={reviewerValid} onAction={onAction} />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {showRows && (
                <div>
                  <h3>Agent may repair ({agentRows.length})</h3>
                  {agentRows.length === 0 ? (
                    <p>Nothing here: every defect in {project.name} needs a human.</p>
                  ) : (
                    <ul>
                      {agentRows.map((r) => (
                        <DefectRow key={r.rowKey} row={r} reviewerValid={reviewerValid} onAction={onAction} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
