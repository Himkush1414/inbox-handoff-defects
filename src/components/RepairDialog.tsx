"use client";
import { useEffect, useRef, useState } from "react";
import type { DefectRow } from "@/lib/contracts";
import { describeRepairError, postRepair } from "@/lib/api-client";

export default function RepairDialog({
  row,
  revision,
  reviewerName,
  onCancel,
  onDone,
}: {
  row: DefectRow;
  revision: string;
  reviewerName: string;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const status = row.signal.status;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await postRepair({
        op: "requeue_analysis",
        target: { signalId: row.signal.id, project: row.project },
        baseRevision: revision,
        actor: { kind: "human", name: reviewerName },
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onDone(`Re-queued · audit ${result.auditId.slice(0, 8)}`);
    } catch (err) {
      const { message, closeDialog } = describeRepairError(err);
      if (closeDialog) {
        onDone(message);
      } else {
        setError(message);
        setSubmitting(false);
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="repair-dialog"
      onClose={onCancel}
      onCancel={(e) => {
        if (submitting) e.preventDefault();
      }}
    >
      <h2>Re-queue analysis?</h2>
      <p>
        <strong>{row.signal.title}</strong> · {row.signal.date} · {row.project}
      </p>

      <table className="before-after">
        <thead>
          <tr>
            <th></th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>state</td>
            <td>{status?.state ?? "—"}</td>
            <td>pending</td>
          </tr>
          <tr>
            <td>analyzed_at</td>
            <td>{status?.analyzedAt ?? "—"}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>files_reviewed</td>
            <td className="tabular">{status?.filesReviewed.length ?? 0}</td>
            <td className="tabular">0</td>
          </tr>
          <tr>
            <td>analysis_ref</td>
            <td>{status?.analysisRef ?? "—"}</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <p className="muted">
        This withdraws the &quot;analyzed&quot; claim so Inbox analyses the signal again. The
        before-image is kept in the audit log.
      </p>

      <label className="dialog-field">
        Reason (optional)
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
      </label>

      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={() => dialogRef.current?.close()} disabled={submitting}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Re-queue"}
        </button>
      </div>
    </dialog>
  );
}
