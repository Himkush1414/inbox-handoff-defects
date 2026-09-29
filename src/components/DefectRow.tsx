import { CLASS_META, type ActionView, type DefectRow as DefectRowType } from "@/lib/contracts";

export default function DefectRow({
  row,
  reviewerValid,
  onAction,
}: {
  row: DefectRowType;
  reviewerValid: boolean;
  onAction: (row: DefectRowType, op: ActionView["op"]) => void;
}) {
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
        {row.lane === "agent_safe" ? (
          // Row-specific: this is the only place this exact reason appears, so show it in full.
          <span className="muted">{row.laneReason}</span>
        ) : (
          // Every human_first row is human_first because ALL its classes are systemic (see
          // laneFor()), so this sentence always restates a pattern the banner above already
          // announced once. Collapse it here; the full text is still one hover away.
          <span className="muted" title={row.laneReason}>
            pipeline pattern — see banner above
          </span>
        )}
        <div className="defect-row-actions">
          {row.actions
            .filter((a) => a.allowedFor.includes("human"))
            .map((a) => {
              const agentEligible = a.allowedFor.includes("agent");
              return (
                <button
                  key={a.op}
                  type="button"
                  className={agentEligible ? "action-agent-eligible" : undefined}
                  disabled={!reviewerValid}
                  title={reviewerValid ? (agentEligible ? `${a.label} (also agent-eligible)` : a.label) : 'Enter your name in "Acting as" first.'}
                  onClick={() => onAction(row, a.op)}
                >
                  {a.label}
                </button>
              );
            })}
        </div>
        {!reviewerValid && <p className="muted dialog-hint">Enter your name in &quot;Acting as&quot; first.</p>}
      </div>
    </li>
  );
}
