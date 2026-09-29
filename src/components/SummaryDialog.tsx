"use client";
import { useEffect, useRef, useState } from "react";
import type { DefectRow } from "@/lib/contracts";
import { describeRepairError, postRepair } from "@/lib/api-client";

export default function SummaryDialog({
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
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const trimmedLength = summary.trim().length;
  const canSave = trimmedLength >= 20 && trimmedLength <= 2000 && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await postRepair({
        op: "set_summary",
        target: { signalId: row.signal.id, project: row.project },
        baseRevision: revision,
        actor: { kind: "human", name: reviewerName },
        summary,
      });
      onDone(`Summary saved · audit ${result.auditId.slice(0, 8)}`);
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
      <h2>Add handoff summary</h2>
      <p>
        <strong>{row.signal.title}</strong> · {row.signal.date} · {row.project}
      </p>

      <label className="dialog-field">
        Summary
        <textarea rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
      </label>
      <p className="muted tabular">{summary.length} / 2000 · minimum 20</p>
      <p className="muted">Plain text. Write what the project team needs to pick this up.</p>

      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={() => dialogRef.current?.close()} disabled={submitting}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSave}>
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </dialog>
  );
}
