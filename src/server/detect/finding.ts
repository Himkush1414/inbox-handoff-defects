import "server-only";
import type { ClassId } from "../../lib/contracts";

export interface DetectorFinding {
  classId: ClassId;
  ledgerIndex: number;
  projectId: string;
  message: string;
  details: Record<string, unknown>;
}
