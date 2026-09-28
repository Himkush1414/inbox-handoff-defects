import { CLASS_META, type DefectRow as DefectRowType } from "@/lib/contracts";

export default function DefectRow({ row }: { row: DefectRowType }) {
  return (
    <li className="defect-row">
      <div className="defect-row-line1">
        <span className="mono tabular">
          {row.signal.date} {row.signal.time}
        </span>
        <span className="defect-row-title">{row.signal.title}</span>
        <span className="mono muted truncate" title={row.signal.id}>
          {row.signal.id}
        </span>
      </div>

      <div className="defect-row-classes">
        {row.classes.map((c) => (
          <span key={c} className={`chip severity-${CLASS_META[c].severity}`}>
            {CLASS_META[c].label} · {CLASS_META[c].severity}
          </span>
        ))}
      </div>

      <div className="defect-row-evidence">
        {row.evidence.map((e) => (
          <p key={e.classId}>{e.message}</p>
        ))}
      </div>

      <div className="defect-row-footer">
        <span className={`lane-badge lane-${row.lane}`}>
          {row.lane === "agent_safe" ? "Agent may repair" : "Human first"}
        </span>
        <span className="muted">{row.laneReason}</span>
        <div className="defect-row-actions">
          {row.actions
            .filter((a) => a.allowedFor.includes("human"))
            .map((a) => (
              <button key={a.op} type="button" disabled title="Repair actions arrive in the next phase">
                {a.label}
              </button>
            ))}
        </div>
      </div>
    </li>
  );
}
