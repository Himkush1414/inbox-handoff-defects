export function LoadingView() {
  return (
    <div className="state-view" aria-busy="true">
      <p>Reading ledger…</p>
    </div>
  );
}

export function NetworkErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-view">
      <p>Can&apos;t reach the server at /api/defects. Is npm run dev running?</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function ServerErrorView({
  code,
  message,
  details,
  onRetry,
}: {
  code: string;
  message: string;
  details?: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="state-view">
      <p>
        Couldn&apos;t read the ledger — {code}: {message}
      </p>
      {details !== undefined ? <pre>{JSON.stringify(details, null, 2)}</pre> : null}
      {(code === "LEDGER_UNREADABLE" || code === "LEDGER_INVALID") && (
        <p>Run npm run reset-data to restore the seeded copy.</p>
      )}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function EmptyLedgerView() {
  return <p>The ledger has no signals yet.</p>;
}

export function NoDefectsView({ analyzedCount }: { analyzedCount: number }) {
  return <p>No handoff defects. All {analyzedCount} analysed entries have a summary and references that resolve.</p>;
}

export function SkippedRecordsNotice({
  records,
}: {
  records: { ledgerIndex: number; id: string | null; issues: string[] }[];
}) {
  if (records.length === 0) return null;
  return (
    <details className="notice-amber">
      <summary>{records.length} ledger record(s) failed validation and were skipped</summary>
      <ul>
        {records.map((r) => (
          <li key={r.ledgerIndex}>
            #{r.ledgerIndex} {r.id ?? "(no id)"}: {r.issues.join("; ")}
          </li>
        ))}
      </ul>
    </details>
  );
}
