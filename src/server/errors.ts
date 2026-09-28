import "server-only";

export type ErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_FAILED"
  | "INVALID_QUERY"
  | "FORBIDDEN_ORIGIN"
  | "POLICY_HUMAN_REQUIRED"
  | "SIGNAL_NOT_FOUND"
  | "STALE_REVISION"
  | "IDENTITY_CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PRECONDITION_FAILED"
  | "NOTHING_TO_REPAIR"
  | "RECORD_INVALID"
  | "LEDGER_UNREADABLE"
  | "LEDGER_INVALID"
  | "FIXTURE_UNREADABLE"
  | "INVARIANT_VIOLATION"
  | "WRITE_FAILED"
  | "AUDIT_FAILED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toErrorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message } },
  };
}
