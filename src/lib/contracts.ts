// Shared types + labels, no I/O. Safe to import from the browser.

export type ClassId = "HD1" | "HD2" | "HD3" | "HD4" | "HD5" | "HD6";
export type Severity = "blocker" | "high" | "medium";
export type Lane = "human_first" | "agent_safe";
export type RepairOp = "requeue_analysis" | "set_summary";
export type ActorKind = "human" | "agent";

export interface ClassSummary {
  id: ClassId;
  key: string;
  label: string;
  description: string;
  severity: Severity;
  count: number; // entries (HD1-4), groups (HD5), findings (HD6)
  affectedRecords: number;
  eligible: number | null;
  rate: number | null;
  systemic: boolean;
}

export interface StatusView {
  state: string;
  analyzedAt: string | null;
  filesReviewed: string[];
  analysisRef: string | null; // non-string refs rendered via JSON.stringify
}

export interface SignalView {
  ledgerIndex: number;
  id: string;
  title: string;
  date: string;
  time: string;
  attendees: string[];
  projects: string[];
  sources: Record<string, string | null>;
  hasSummary: boolean;
  status: StatusView | null; // status[project] for the row's project
}

export interface Evidence {
  classId: ClassId;
  message: string;
  details: Record<string, unknown>;
}

export interface ActionView {
  op: RepairOp;
  label: string;
  allowedFor: ActorKind[];
  disabledReason: string | null;
}

export interface DefectRow {
  rowKey: string;
  project: string;
  signal: SignalView;
  classes: ClassId[];
  severity: Severity;
  lane: Lane;
  laneReason: string;
  evidence: Evidence[];
  actions: ActionView[];
}

export interface ConflictMember {
  rowKey: string;
  project: string;
  signal: SignalView;
  otherClasses: ClassId[];
  idMatchesRule: boolean;
}

export interface ConflictGroup {
  groupId: string; // "HD5:" + sorted member ledger indices joined by ","
  kind: "exact_id_collision" | "near_duplicate" | "id_format_mismatch";
  message: string;
  sharedSourcePaths: string[];
  members: ConflictMember[];
}

export interface ProjectGroup {
  id: string;
  name: string;
  type: "client" | "product" | "internal" | "fallback" | "unknown";
  rank: number;
  counts: {
    identityConflicts: number;
    humanFirst: number;
    agentSafe: number;
    analyzed: number;
    handedOff: number;
  };
  identityConflicts: ConflictGroup[];
  humanFirst: DefectRow[];
  agentSafe: DefectRow[];
}

export interface ConfigFinding {
  findingKey: string;
  classId: "HD6";
  site: "routing_hint" | "signal_projects" | "status_key_unknown" | "status_key_not_routed";
  ref: string;
  suggestion: string | null;
  message: string;
  location:
    | { file: "routing-hints.json"; index: number }
    | { file: "signal-ledger.json"; ledgerIndex: number; signalId: string };
}

export interface SystemicPattern {
  classId: ClassId;
  count: number;
  eligible: number;
  rate: number;
  message: string;
}

export interface DefectReport {
  revision: string;
  generatedAt: string;
  ledger: {
    version: number;
    signalCount: number;
    analyzedCount: number;
    handedOffCount: number;
    skippedRecords: { ledgerIndex: number; id: string | null; issues: string[] }[];
  };
  analysisRunCheck: {
    recordedRunCount: number;
    minRun: number | null;
    maxRun: number | null;
    verified: number;
    unverifiable: number;
    flagged: number;
  };
  classes: ClassSummary[]; // always all six, in order HD5, HD6, HD2, HD3, HD4, HD1
  systemic: SystemicPattern[];
  totals: { humanFirst: number; agentSafe: number; identityConflicts: number; configFindings: number };
  projects: ProjectGroup[]; // ranked; every config project present even when clean
  config: ConfigFinding[];
}

export const CLASS_META: Record<
  ClassId,
  { key: string; label: string; description: string; severity: Severity }
> = {
  HD1: {
    key: "missing_summary",
    label: "Missing summary",
    description: "Marked analysed, but neither summary nor notes has any text.",
    severity: "medium",
  },
  HD2: {
    key: "dangling_analysis_ref",
    label: "Analysis run not found",
    description: "analysis_ref is missing, malformed, or points at a run that can't exist.",
    severity: "high",
  },
  HD3: {
    key: "dangling_source_ref",
    label: "Reviewed file not on signal",
    description: "The analysis cites a file the signal no longer lists as a source.",
    severity: "high",
  },
  HD4: {
    key: "analysis_without_sources",
    label: "Analysed from nothing",
    description: "Marked analysed with zero files reviewed.",
    severity: "high",
  },
  HD5: {
    key: "identity_conflict",
    label: "Identity conflict",
    description: "Two or more records share an id, or a date and match_key.",
    severity: "blocker",
  },
  HD6: {
    key: "dangling_project_ref",
    label: "Unknown project id",
    description: "A reference to a project id that is not in config.json.",
    severity: "high",
  },
};
