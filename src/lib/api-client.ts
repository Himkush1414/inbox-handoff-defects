import type { DefectReport } from "./contracts";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(err: ApiErrorBody) {
    super(err.message);
    this.code = err.code;
    this.details = err.details;
  }
}

export async function fetchDefects(): Promise<DefectReport> {
  const res = await fetch("/api/defects", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new ApiRequestError(body.error);
  return body as DefectReport;
}
