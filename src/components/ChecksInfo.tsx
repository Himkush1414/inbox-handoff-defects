import { CLASS_META, type ClassId, type DefectReport } from "@/lib/contracts";

const ORDER: ClassId[] = ["HD1", "HD2", "HD3", "HD4", "HD5", "HD6"];

export default function ChecksInfo({ report }: { report: DefectReport }) {
  const { analysisRunCheck } = report;
  return (
    <details className="checks-info">
      <summary>About these checks</summary>
      <dl>
        {ORDER.map((id) => (
          <div key={id}>
            <dt>
              <strong>{CLASS_META[id].label}</strong>
            </dt>
            <dd>{CLASS_META[id].description}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Analysis refs are checked against the run log (runs {analysisRunCheck.minRun}–{analysisRunCheck.maxRun},{" "}
        {analysisRunCheck.recordedRunCount} recorded). {analysisRunCheck.unverifiable} refs are older than the log
        and can&apos;t be verified; {analysisRunCheck.flagged} point beyond it.
      </p>
    </details>
  );
}
