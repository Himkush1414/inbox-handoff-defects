import "server-only";
import {
  CLASS_META,
  type ClassId,
  type ClassSummary,
  type ConfigFinding,
  type ConflictGroup,
  type ConflictMember,
  type DefectReport,
  type DefectRow,
  type Evidence,
  type ProjectGroup,
  type Severity,
  type SignalView,
  type StatusView,
  type SystemicPattern,
} from "../lib/contracts";
import { isBlank, type DetectorContext } from "./detect/context";
import type { RunDetectorsResult } from "./detect/index";
import type { DetectorFinding } from "./detect/finding";
import type { ConflictGroupResult } from "./detect/hd5-identity-conflict";
import type { RawSignal } from "./ledger/schema";
import { actionsFor, isSystemic, laneFor, laneReasonFor, primaryClassFor } from "./policy";

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, high: 1, medium: 2 };
const PROJECT_TYPE_RANK: Record<ProjectGroup["type"], number> = {
  client: 0,
  product: 1,
  internal: 2,
  fallback: 3,
  unknown: 4,
};

function severityRank(classId: ClassId): number {
  return SEVERITY_ORDER[CLASS_META[classId].severity];
}

function rowKey(ledgerIndex: number, projectId: string): string {
  return `${ledgerIndex}:${projectId}`;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toSignalView(ledgerIndex: number, signal: RawSignal, projectId: string): SignalView {
  const entry = signal.status[projectId];
  const status: StatusView | null = entry
    ? {
        state: entry.state,
        analyzedAt: entry.analyzed_at ?? null,
        filesReviewed: entry.files_reviewed ?? [],
        analysisRef:
          entry.analysis_ref === null || entry.analysis_ref === undefined
            ? null
            : typeof entry.analysis_ref === "string"
              ? entry.analysis_ref
              : JSON.stringify(entry.analysis_ref),
      }
    : null;

  return {
    ledgerIndex,
    id: signal.id,
    title: signal.title,
    date: signal.date,
    time: signal.time,
    attendees: signal.attendees,
    projects: signal.projects,
    sources: signal.sources,
    hasSummary: !isBlank(signal.summary),
    status,
  };
}

function sortClasses(classes: readonly ClassId[]): ClassId[] {
  return [...new Set(classes)].sort((a, b) => severityRank(a) - severityRank(b) || a.localeCompare(b));
}

function conflictGroupMessage(kind: ConflictGroupResult["kind"], members: ConflictGroupResult["members"]): string {
  if (kind === "exact_id_collision") {
    return `${members.length} records share the id "${members[0]!.signal.id}".`;
  }
  if (kind === "near_duplicate") {
    return `${members.length} records share the same date and title but different ids.`;
  }
  return `This record's id does not match the {date}_{match_key} rule.`;
}

export function buildReport(input: {
  revision: string;
  ledgerVersion: number;
  rawSignalCount: number;
  skippedRecords: { ledgerIndex: number; id: string | null; issues: string[] }[];
  ctx: DetectorContext;
  detectors: RunDetectorsResult;
}): DefectReport {
  const { ctx, detectors } = input;

  // 4.7.1: locked = every ledger index that is a member of any HD5 group.
  const locked = new Set<number>();
  for (const group of detectors.groups) for (const m of group.members) locked.add(m.ledgerIndex);

  // 4.7.2: split HD1-HD4 findings into unlocked rows vs. locked (-> otherClasses on group members).
  const findingsByRow = new Map<string, DetectorFinding[]>();
  const otherClassesByRow = new Map<string, ClassId[]>();
  for (const finding of detectors.findings) {
    const key = rowKey(finding.ledgerIndex, finding.projectId);
    if (locked.has(finding.ledgerIndex)) {
      const list = otherClassesByRow.get(key) ?? [];
      list.push(finding.classId);
      otherClassesByRow.set(key, list);
    } else {
      const list = findingsByRow.get(key) ?? [];
      list.push(finding);
      findingsByRow.set(key, list);
    }
  }

  // 4.7.3: systemic per HD1-HD4 class, counted over the WHOLE ledger (locked included).
  const HD1_4: ClassId[] = ["HD1", "HD2", "HD3", "HD4"];
  const countByClass = new Map<ClassId, number>();
  const recordsByClass = new Map<ClassId, Set<number>>();
  for (const c of HD1_4) {
    countByClass.set(c, 0);
    recordsByClass.set(c, new Set());
  }
  for (const finding of detectors.findings) {
    countByClass.set(finding.classId, (countByClass.get(finding.classId) ?? 0) + 1);
    recordsByClass.get(finding.classId)!.add(finding.ledgerIndex);
  }
  const eligible = ctx.eligible;
  const systemicByClass = new Map<ClassId, boolean>();
  for (const c of HD1_4) systemicByClass.set(c, isSystemic(countByClass.get(c) ?? 0, eligible));

  // --- Build unlocked DefectRows -----------------------------------------
  interface RowBuild {
    row: DefectRow;
    severityRankValue: number;
    classesLength: number;
    ageDate: string;
    id: string;
    time: string;
    ledgerIndex: number;
    projectId: string;
  }

  const rowBuilds: RowBuild[] = [];
  for (const [key, findingsForRow] of findingsByRow) {
    const [ledgerIndexStr, projectId] = key.split(":") as [string, string];
    const ledgerIndex = Number(ledgerIndexStr);
    const signal = ctx.signalByIndex.get(ledgerIndex)!;
    const entry = signal.status[projectId]!;
    const classes = sortClasses(findingsForRow.map((f) => f.classId));
    // classes is severity-sorted ascending (most severe first), so classes[0] carries the row's severity.
    const rowSeverity: Severity = CLASS_META[classes[0]!].severity;

    const lane = laneFor(classes, systemicByClass);
    const primaryClass = primaryClassFor(classes, lane, systemicByClass);
    const laneReason = laneReasonFor({
      lane,
      primaryClass,
      projectId,
      stats: { count: countByClass.get(primaryClass) ?? 0, eligible },
    });

    const evidence: Evidence[] = classes.map((classId) => {
      const finding = findingsForRow.find((f) => f.classId === classId)!;
      return { classId, message: finding.message, details: finding.details };
    });

    const row: DefectRow = {
      rowKey: key,
      project: projectId,
      signal: toSignalView(ledgerIndex, signal, projectId),
      classes,
      severity: rowSeverity,
      lane,
      laneReason,
      evidence,
      actions: actionsFor({ classes, lane }),
    };

    rowBuilds.push({
      row,
      severityRankValue: severityRank(classes[0]!),
      classesLength: classes.length,
      ageDate: entry.analyzed_at ?? signal.date,
      id: signal.id,
      time: signal.time,
      ledgerIndex,
      projectId,
    });
  }

  // 4.7.6: row order inside each lane.
  rowBuilds.sort(
    (a, b) =>
      a.severityRankValue - b.severityRankValue ||
      b.classesLength - a.classesLength ||
      a.ageDate.localeCompare(b.ageDate) ||
      a.id.localeCompare(b.id) ||
      a.time.localeCompare(b.time) ||
      a.ledgerIndex - b.ledgerIndex,
  );

  // --- Build ConflictGroups (HD5) -----------------------------------------
  const conflictGroups: ConflictGroup[] = detectors.groups.map((g) => {
    const sortedMembers = [...g.members].sort(
      (a, b) => a.signal.time.localeCompare(b.signal.time) || a.signal.id.localeCompare(b.signal.id) || a.ledgerIndex - b.ledgerIndex,
    );
    const members: ConflictMember[] = sortedMembers.map((m) => {
      const projectId = m.signal.projects[0]!;
      const key = rowKey(m.ledgerIndex, projectId);
      return {
        rowKey: key,
        project: projectId,
        signal: toSignalView(m.ledgerIndex, m.signal, projectId),
        otherClasses: sortClasses(otherClassesByRow.get(key) ?? []),
        idMatchesRule: m.idMatchesRule,
      };
    });
    return {
      groupId: g.groupId,
      kind: g.kind,
      message: conflictGroupMessage(g.kind, g.members),
      sharedSourcePaths: g.sharedSourcePaths,
      members,
    };
  });

  // --- Config findings (HD6) ----------------------------------------------
  const config: ConfigFinding[] = detectors.config.map((f) => {
    const findingKey =
      f.location.file === "routing-hints.json"
        ? `HD6:routing_hint:${f.location.index}`
        : `HD6:${f.site}:${f.location.ledgerIndex}:${f.ref}`;
    return {
      findingKey,
      classId: "HD6",
      site: f.site,
      ref: f.ref,
      suggestion: f.suggestion,
      message: f.message,
      location: f.location,
    };
  });

  // --- Projects (4.7.8, 4.7.9) ---------------------------------------------
  const projectMeta = new Map<string, { type: ProjectGroup["type"]; name: string }>();
  for (const p of ctx.config.projects) projectMeta.set(p.id, { type: p.type as ProjectGroup["type"], name: p.name });
  const fallbackIds = new Set(Object.values(ctx.config.fallbacks));

  function projectTypeFor(id: string): ProjectGroup["type"] {
    const meta = projectMeta.get(id);
    if (meta) return meta.type;
    return fallbackIds.has(id) ? "fallback" : "unknown";
  }

  const projectIds = new Set<string>(ctx.config.projects.map((p) => p.id));
  for (const rb of rowBuilds) projectIds.add(rb.projectId);
  for (const g of conflictGroups) for (const m of g.members) projectIds.add(m.project);

  const analyzedByProject = new Map<string, number>();
  for (const e of ctx.analysedEntries) analyzedByProject.set(e.projectId, (analyzedByProject.get(e.projectId) ?? 0) + 1);

  const handedOffByProject = new Map<string, number>();
  for (const e of ctx.analysedEntries) {
    if (locked.has(e.ledgerIndex)) continue;
    if (findingsByRow.has(rowKey(e.ledgerIndex, e.projectId))) continue;
    handedOffByProject.set(e.projectId, (handedOffByProject.get(e.projectId) ?? 0) + 1);
  }

  const projects: ProjectGroup[] = [...projectIds].map((id) => {
    const meta = projectMeta.get(id);
    const humanFirstRows = rowBuilds.filter((rb) => rb.projectId === id && rb.row.lane === "human_first").map((rb) => rb.row);
    const agentSafeRows = rowBuilds.filter((rb) => rb.projectId === id && rb.row.lane === "agent_safe").map((rb) => rb.row);
    const groupsForProject = conflictGroups.filter((g) => g.members.some((m) => m.project === id));

    return {
      id,
      name: meta?.name ?? id,
      type: projectTypeFor(id),
      rank: 0, // assigned after sort
      counts: {
        identityConflicts: groupsForProject.length,
        humanFirst: humanFirstRows.length,
        agentSafe: agentSafeRows.length,
        analyzed: analyzedByProject.get(id) ?? 0,
        handedOff: handedOffByProject.get(id) ?? 0,
      },
      identityConflicts: groupsForProject,
      humanFirst: humanFirstRows,
      agentSafe: agentSafeRows,
    };
  });

  projects.sort(
    (a, b) =>
      b.counts.identityConflicts - a.counts.identityConflicts ||
      b.counts.humanFirst - a.counts.humanFirst ||
      b.counts.humanFirst + b.counts.agentSafe - (a.counts.humanFirst + a.counts.agentSafe) ||
      PROJECT_TYPE_RANK[a.type] - PROJECT_TYPE_RANK[b.type] ||
      a.id.localeCompare(b.id),
  );
  projects.forEach((p, i) => (p.rank = i + 1));

  // --- Class summaries (always all six, fixed order) -----------------------
  const classOrder: ClassId[] = ["HD5", "HD6", "HD2", "HD3", "HD4", "HD1"];
  const classes: ClassSummary[] = classOrder.map((id) => {
    if (id === "HD5") {
      const affected = detectors.groups.reduce((sum, g) => sum + g.members.length, 0);
      return {
        id,
        ...CLASS_META[id],
        count: detectors.groups.length,
        affectedRecords: affected,
        eligible: null,
        rate: null,
        systemic: false,
      };
    }
    if (id === "HD6") {
      const affected = new Set(
        detectors.config.filter((f) => f.location.file === "signal-ledger.json").map((f) => (f.location as { ledgerIndex: number }).ledgerIndex),
      ).size;
      return {
        id,
        ...CLASS_META[id],
        count: detectors.config.length,
        affectedRecords: affected,
        eligible: null,
        rate: null,
        systemic: false,
      };
    }
    const count = countByClass.get(id) ?? 0;
    const affected = recordsByClass.get(id)?.size ?? 0;
    const rate = eligible > 0 ? round4(count / eligible) : null;
    return {
      id,
      ...CLASS_META[id],
      count,
      affectedRecords: affected,
      eligible,
      rate,
      systemic: systemicByClass.get(id) ?? false,
    };
  });

  const systemic: SystemicPattern[] = classes
    .filter((c) => c.systemic)
    .map((c) => ({
      classId: c.id,
      count: c.count,
      eligible: c.eligible!,
      rate: c.rate!,
      message: `${c.count} of ${c.eligible} analysed entries show ${c.label.toLowerCase()}. This is a pattern, not a per-row fix — agent repair is off for this class.`,
    }));

  const totals = {
    humanFirst: detectors.groups.length + rowBuilds.filter((rb) => rb.row.lane === "human_first").length + config.length,
    agentSafe: rowBuilds.filter((rb) => rb.row.lane === "agent_safe").length,
    identityConflicts: detectors.groups.length,
    configFindings: config.length,
  };

  const handedOffCount = [...handedOffByProject.values()].reduce((a, b) => a + b, 0);

  return {
    revision: input.revision,
    generatedAt: new Date().toISOString(),
    ledger: {
      version: input.ledgerVersion,
      signalCount: input.rawSignalCount,
      analyzedCount: eligible,
      handedOffCount,
      skippedRecords: input.skippedRecords,
    },
    analysisRunCheck: {
      recordedRunCount: detectors.runCheck.recordedRunCount,
      minRun: detectors.runCheck.minRun,
      maxRun: detectors.runCheck.maxRun,
      verified: detectors.runCheck.verified,
      unverifiable: detectors.runCheck.unverifiable,
      flagged: detectors.runCheck.flagged,
    },
    classes,
    systemic,
    totals,
    projects,
    config,
  };
}
