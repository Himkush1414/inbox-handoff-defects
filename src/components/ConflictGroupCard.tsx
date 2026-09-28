import { CLASS_META, type ConflictGroup } from "@/lib/contracts";

const KIND_LABEL: Record<ConflictGroup["kind"], string> = {
  exact_id_collision: "Exact id collision",
  near_duplicate: "Near-duplicate",
  id_format_mismatch: "Id format mismatch",
};

export default function ConflictGroupCard({ group }: { group: ConflictGroup }) {
  return (
    <div className="conflict-card">
      <div className="conflict-card-header">
        <strong>{KIND_LABEL[group.kind]}</strong>
        <span className="muted">{group.message}</span>
      </div>

      <div className="conflict-members">
        {group.members.map((m) => {
          const sourceNames = Object.entries(m.signal.sources)
            .filter(([, v]) => v)
            .map(([k]) => k);
          return (
            <div className="conflict-member" key={m.rowKey}>
              <div className="mono">
                {m.signal.time} {m.signal.title}
              </div>
              <div className="muted">
                {m.signal.attendees.length} attendee{m.signal.attendees.length === 1 ? "" : "s"}
              </div>
              <div className="muted">{sourceNames.length > 0 ? sourceNames.join(", ") : "no sources"}</div>
              <div className="muted">
                {m.signal.status ? `${m.signal.status.state}${m.signal.status.analysisRef ? ` · ${m.signal.status.analysisRef}` : ""}` : "no status"}
                {m.otherClasses.length > 0 && <> · +{m.otherClasses.map((c) => CLASS_META[c].label).join(", ")}</>}
              </div>
              {!m.idMatchesRule && <div className="muted">id breaks the {"{date}_{match_key}"} rule</div>}
            </div>
          );
        })}
      </div>

      {group.sharedSourcePaths.length > 0 && (
        <p className="muted">Shared sources: {group.sharedSourcePaths.join(", ")}</p>
      )}

      <p className="lock-note">Locked: identity conflict. Resolve it in the detector before repairing.</p>
    </div>
  );
}
