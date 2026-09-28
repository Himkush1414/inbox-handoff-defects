import type { DefectReport } from "@/lib/contracts";

export default function KpiStrip({ report }: { report: DefectReport }) {
  const { totals, ledger } = report;
  return (
    <div className="kpi-strip">
      <div className="kpi-tile">
        <div className="kpi-value tabular">{totals.humanFirst}</div>
        <div className="kpi-label">need a human first</div>
        <div className="kpi-caption">
          Identity conflicts, pipeline patterns, routing, and anything that needs writing.
        </div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-value tabular">{totals.agentSafe}</div>
        <div className="kpi-label">an agent may repair</div>
        <div className="kpi-caption">Isolated broken references. Re-queueing them is safe and audited.</div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-value tabular">
          {ledger.handedOffCount} of {ledger.analyzedCount}
        </div>
        <div className="kpi-label">fully handed off</div>
        <div className="kpi-caption">Analysed, with a summary and references that resolve.</div>
      </div>
    </div>
  );
}
