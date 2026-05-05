import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, User, Zap } from "lucide-react";
import type { WorkflowTimelineEventOut } from "../types";
import { EventStatusBadge } from "./EventStatusBadge";

function fmtMs(ms: number | null): string {
  if (ms == null) return "–";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", { hour12: false });
}

const connectorColor: Record<string, string> = {
  succeeded:    "border-emerald-700",
  failed:       "border-red-700",
  retrying:     "border-orange-700",
  dead_lettered:"border-rose-700",
  processing:   "border-yellow-700",
  queued:       "border-blue-700",
};

const dotColor: Record<string, string> = {
  succeeded:    "bg-emerald-500 ring-emerald-500/20",
  failed:       "bg-red-500 ring-red-500/20",
  retrying:     "bg-orange-500 ring-orange-500/20",
  dead_lettered:"bg-rose-600 ring-rose-600/20",
  processing:   "bg-yellow-500 ring-yellow-500/20",
  queued:       "bg-blue-500 ring-blue-500/20",
};

export function WorkflowTimeline({ events }: { events: WorkflowTimelineEventOut[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-0">
      {events.map((ev, idx) => {
        const isLast = idx === events.length - 1;
        const isExpanded = expanded.has(ev.id);
        const totalMs = ev.attempts.reduce((s, a) => s + (a.duration_ms ?? 0), 0);

        return (
          <div key={ev.id} className="flex gap-4">
            {/* connector column */}
            <div className="flex flex-col items-center w-8 shrink-0">
              <div className={`w-3 h-3 rounded-full ring-4 mt-5 ${dotColor[ev.status] ?? "bg-gray-600 ring-gray-600/20"} shrink-0`} />
              {!isLast && (
                <div className={`flex-1 w-px border-l-2 border-dashed mt-1 ${connectorColor[ev.status] ?? "border-gray-700"} min-h-[2rem]`} />
              )}
            </div>

            {/* content */}
            <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
              <div className="card mb-0 overflow-hidden">
                {/* header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/40 transition-colors"
                  onClick={() => ev.attempts.length > 0 && toggle(ev.id)}
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-semibold text-white truncate">{ev.event_type}</span>
                    <EventStatusBadge status={ev.status} />
                    <span className="text-xs text-gray-600 hidden sm:block">{ev.service_name}</span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {ev.attempt_count > 1 && (
                      <span className="text-xs text-orange-400 font-medium flex items-center gap-1">
                        <Zap size={11} /> {ev.attempt_count} attempts
                      </span>
                    )}
                    <span className="text-xs text-gray-600 flex items-center gap-1">
                      <Clock size={11} /> {fmtMs(totalMs || null)}
                    </span>
                    <span className="text-xs text-gray-600">{fmtTime(ev.created_at)}</span>
                    {ev.attempts.length > 0 && (
                      <span className="text-gray-600">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    )}
                  </div>
                </div>

                {/* error */}
                {ev.last_error && (
                  <div className="px-4 py-2 bg-red-950/30 border-t border-red-900/30">
                    <p className="text-xs text-red-400 font-mono leading-relaxed">{ev.last_error}</p>
                  </div>
                )}

                {/* expanded attempts */}
                {isExpanded && ev.attempts.length > 0 && (
                  <div className="border-t border-gray-800">
                    <div className="px-4 py-2 bg-gray-800/30">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attempt History</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="table-header pl-4">#</th>
                          <th className="table-header">Status</th>
                          <th className="table-header">Duration</th>
                          <th className="table-header">Worker</th>
                          <th className="table-header">Started</th>
                          <th className="table-header pr-4">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ev.attempts.map(a => (
                          <tr key={a.id} className="table-row">
                            <td className="table-cell pl-4 font-mono text-gray-500">{a.attempt_number}</td>
                            <td className="table-cell"><EventStatusBadge status={a.status} size="xs" /></td>
                            <td className="table-cell font-mono text-xs">{fmtMs(a.duration_ms)}</td>
                            <td className="table-cell">
                              <span className="flex items-center gap-1 text-gray-500 text-xs">
                                <User size={10} />{a.worker_name ?? "–"}
                              </span>
                            </td>
                            <td className="table-cell text-xs text-gray-600">{fmtTime(a.started_at)}</td>
                            <td className="table-cell pr-4 max-w-xs">
                              {a.error_message
                                ? <span className="text-red-400 text-xs font-mono truncate block">{a.error_message}</span>
                                : <span className="text-gray-700 text-xs">–</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
