"use client";

import React from "react";
import type { LlmMode, RunSummaryResponse } from "@/lib/server-types";

export interface AgentFeedEvent {
  id: number;
  event: string;
  run_id: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

export type EngineMode = LlmMode | "legacy";

interface AgentActivityPanelProps {
  mode: EngineMode;
  runId: string | null;
  runStatus: string;
  fallbackNotice: string | null;
  escalationReason: string | null;
  events: AgentFeedEvent[];
  summary: RunSummaryResponse | null;
  onCancel: () => void;
  onReconnect: () => void;
}

export function AgentActivityPanel({
  mode,
  runId,
  runStatus,
  fallbackNotice,
  escalationReason,
  events,
  summary,
  onCancel,
  onReconnect,
}: AgentActivityPanelProps) {
  const retriesTotal = summary
    ? Object.values(summary.retries).reduce((acc, n) => acc + n, 0)
    : 0;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto bg-[#0a0a0f] text-slate-200 text-sm">
      {/* Header status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-400">Engine:</span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
            {mode === "legacy" ? "Legacy Single-Call" : `CrewAI (${mode})`}
          </span>
          {runId && (
            <span className="text-xs font-mono text-slate-400">
              {runId} · {runStatus}
            </span>
          )}
          {retriesTotal > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs">
              Retries: {retriesTotal}/3
            </span>
          )}
        </div>

        {runId && mode !== "legacy" && (
          <div className="flex items-center gap-2">
            <button
              onClick={onReconnect}
              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs"
            >
              Reconnect / Refresh
            </button>
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs"
            >
              Cancel Run
            </button>
          </div>
        )}
      </div>

      {fallbackNotice && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <strong>Provider Fallback:</strong> {fallbackNotice}
        </div>
      )}

      {escalationReason && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-1">
          <div className="font-semibold">Escalated to Human</div>
          <div>{escalationReason}</div>
        </div>
      )}

      {/* Live SSE Event Feed */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Agent Activity ({events.length})
        </h3>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500">
            {mode === "legacy"
              ? "Running on legacy single-call Gemini path."
              : "Waiting for agent events..."}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-2 text-xs p-2 rounded bg-white/[0.03] border border-white/5"
              >
                <span className="font-mono text-indigo-300 shrink-0">{ev.event}</span>
                <span className="text-slate-300 flex-1">{ev.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Results */}
      {summary && summary.test_results.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Sandbox QA Results ({summary.test_results.length})
          </h3>
          <div className="space-y-1.5">
            {summary.test_results.map((tr) => (
              <div
                key={tr.id}
                className="p-2 rounded bg-white/[0.03] border border-white/5 text-xs flex items-center justify-between gap-2"
              >
                <span className="font-mono">{tr.check_name}</span>
                <span
                  className={
                    tr.status === "passed"
                      ? "text-emerald-400"
                      : tr.status === "blocked" || tr.status === "skipped"
                      ? "text-amber-400"
                      : "text-rose-400"
                  }
                >
                  {tr.status.toUpperCase()} ({tr.duration_ms}ms)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Defects */}
      {summary && summary.defects.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Defects ({summary.defects.length})
          </h3>
          <div className="space-y-2">
            {summary.defects.map((d) => (
              <div
                key={d.id}
                className="p-2.5 rounded bg-rose-500/5 border border-rose-500/20 text-xs space-y-1"
              >
                <div className="flex justify-between font-mono text-rose-300">
                  <span>
                    {d.id} · {d.failing_check}
                  </span>
                  <span>
                    {d.owner ?? "unassigned"} ({d.status})
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-[11px] text-slate-300 font-mono max-h-24 overflow-y-auto">
                  {d.evidence}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
