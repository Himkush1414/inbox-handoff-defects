"use client";
import { useCallback, useEffect, useState } from "react";
import type { ClassId, DefectReport } from "@/lib/contracts";
import { ApiRequestError, fetchDefects } from "@/lib/api-client";
import Header from "./Header";
import KpiStrip from "./KpiStrip";
import SystemicBanner from "./SystemicBanner";
import ChecksInfo from "./ChecksInfo";
import ProjectRail from "./ProjectRail";
import ProjectPanel from "./ProjectPanel";
import ConfigPanel from "./ConfigPanel";
import {
  EmptyLedgerView,
  LoadingView,
  NetworkErrorView,
  NoDefectsView,
  ServerErrorView,
  SkippedRecordsNotice,
} from "./StateViews";

type Phase = "loading" | "ready" | "error";
type ErrorInfo = { kind: "network" } | { kind: "server"; code: string; message: string; details?: unknown };

export default function Dashboard() {
  const [report, setReport] = useState<DefectReport | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | "__config" | null>(null);
  const [classFilter, setClassFilter] = useState<ClassId | "all">("all");
  const [reviewer, setReviewer] = useState("");

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setPhase("loading");
    try {
      const data = await fetchDefects();
      setReport(data);
      setError(null);
      setPhase("ready");
      setSelectedProjectId((prev) => {
        if (prev === "__config") return prev;
        if (prev && data.projects.some((p) => p.id === prev)) return prev;
        return data.projects[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError({ kind: "server", code: err.code, message: err.message, details: err.details });
      } else {
        setError({ kind: "network" });
      }
      setPhase("error");
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (phase === "loading") {
    return (
      <main className="dashboard">
        <LoadingView />
      </main>
    );
  }

  if (phase === "error" || !report) {
    return (
      <main className="dashboard">
        {error?.kind === "network" ? (
          <NetworkErrorView onRetry={() => load(false)} />
        ) : (
          <ServerErrorView
            code={error && error.kind === "server" ? error.code : "INTERNAL"}
            message={error && error.kind === "server" ? error.message : "Unknown error"}
            details={error && error.kind === "server" ? error.details : undefined}
            onRetry={() => load(false)}
          />
        )}
      </main>
    );
  }

  const selectedProject =
    selectedProjectId && selectedProjectId !== "__config"
      ? (report.projects.find((p) => p.id === selectedProjectId) ?? null)
      : null;

  return (
    <main className="dashboard">
      <Header
        revision={report.revision}
        refreshing={refreshing}
        onRefresh={() => load(true)}
        reviewer={reviewer}
        onReviewerChange={setReviewer}
        signalCount={report.ledger.signalCount}
      />

      {report.ledger.signalCount === 0 ? (
        <EmptyLedgerView />
      ) : (
        <>
          <KpiStrip report={report} />
          <SystemicBanner patterns={report.systemic} />
          <ChecksInfo report={report} />
          <SkippedRecordsNotice records={report.ledger.skippedRecords} />

          {report.totals.humanFirst === 0 && report.totals.agentSafe === 0 ? (
            <NoDefectsView analyzedCount={report.ledger.analyzedCount} />
          ) : (
            <div className="dashboard-body">
              <ProjectRail
                projects={report.projects}
                selectedId={selectedProjectId}
                onSelect={(id) => {
                  setSelectedProjectId(id);
                  setClassFilter("all");
                }}
                configFindingsCount={report.config.length}
              />
              {selectedProjectId === "__config" ? (
                <ConfigPanel findings={report.config} />
              ) : selectedProject ? (
                <ProjectPanel project={selectedProject} classFilter={classFilter} onClassFilterChange={setClassFilter} />
              ) : null}
            </div>
          )}
        </>
      )}
    </main>
  );
}
