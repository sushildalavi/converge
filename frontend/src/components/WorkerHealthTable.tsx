import { Activity, AlertTriangle, Circle, Power } from "lucide-react";
import type { WorkerOut } from "../types";

function ago(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatusPill({ status, isStale }: { status: string; isStale: boolean }) {
  const effective = isStale ? "stale" : status;
  const map: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    active:  { icon: <Activity size={11} className="animate-pulse" />, color: "text-emerald-400", bg: "bg-emerald-950/50 border-emerald-800/40" },
    busy:    { icon: <Activity size={11} className="animate-pulse" />, color: "text-yellow-400",  bg: "bg-yellow-950/50 border-yellow-800/40" },
    stale:   { icon: <AlertTriangle size={11} />,                      color: "text-orange-400",  bg: "bg-orange-950/50 border-orange-800/40" },
    stopped: { icon: <Power size={11} />,                              color: "text-gray-500",    bg: "bg-gray-900 border-gray-700" },
    crashed: { icon: <AlertTriangle size={11} />,                      color: "text-red-400",     bg: "bg-red-950/50 border-red-800/40" },
  };
  const c = map[effective] ?? map.stopped;
  return (
    <span className={`badge border text-[11px] ${c.color} ${c.bg} flex items-center gap-1 w-fit`}>
      {c.icon} {effective}
    </span>
  );
}

export function WorkerHealthTable({ workers }: { workers: WorkerOut[] }) {
  if (!workers.length) {
    return (
      <div className="card p-12 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
          <Circle size={20} className="text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium">No workers registered</p>
        <p className="text-gray-600 text-sm">Start the worker service to see activity here.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="table-header">Worker</th>
            <th className="table-header">Status</th>
            <th className="table-header">Last Heartbeat</th>
            <th className="table-header">Current Event</th>
          </tr>
        </thead>
        <tbody>
          {workers.map(w => (
            <tr key={w.id} className="table-row">
              <td className="table-cell">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${
                    w.is_stale ? "bg-orange-500" :
                    w.status === "active" ? "bg-emerald-500 animate-pulse" :
                    w.status === "crashed" ? "bg-red-500" : "bg-gray-600"
                  }`} />
                  <span className="font-mono text-sm text-white">{w.worker_name}</span>
                </div>
              </td>
              <td className="table-cell"><StatusPill status={w.status} isStale={w.is_stale} /></td>
              <td className="table-cell text-gray-500 text-sm">{ago(w.last_heartbeat_at)}</td>
              <td className="table-cell">
                {w.current_event_id
                  ? <span className="font-mono text-xs text-indigo-400">{w.current_event_id.slice(0, 12)}…</span>
                  : <span className="text-gray-700 text-xs">idle</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
