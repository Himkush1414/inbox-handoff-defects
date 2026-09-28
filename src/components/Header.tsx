"use client";
import ReviewerField from "./ReviewerField";

export default function Header({
  revision,
  refreshing,
  onRefresh,
  reviewer,
  onReviewerChange,
  signalCount,
}: {
  revision: string;
  refreshing: boolean;
  onRefresh: () => void;
  reviewer: string;
  onReviewerChange: (value: string) => void;
  signalCount: number;
}) {
  return (
    <header className="app-header">
      <div className="app-header-top">
        <h1 title={revision}>Handoff defects</h1>
        <ReviewerField value={reviewer} onChange={onReviewerChange} />
        <span className="mono muted">rev {revision.slice(0, 8)}</span>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="app-header-explainer">
        Analysed signals that were not handed off cleanly, by project. {signalCount} signals · data/ copy
      </p>
      <div aria-live="polite" className="sr-only">
        {refreshing ? "Refreshing…" : ""}
      </div>
    </header>
  );
}
