import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { api } from "../api/client";
import type { DeadLetterOut } from "../types";

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

interface Props { items: DeadLetterOut[]; onReplayed: () => void; }

export function DeadLetterTable({ items, onReplayed }: Props) {
  const [replaying, setReplaying] = useState<Set<string>>(new Set());
  const [replayed, setReplayed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleReplay = async (id: string) => {
    if (replaying.has(id) || replayed.has(id)) return;
    setReplaying(p => new Set(p).add(id));
    setError(null);
    try {
      await api.replayDeadLetter(id);
      setReplayed(p => new Set(p).add(id));
      onReplayed();
    } catch {
      setError("replay failed — check backend logs");
    } finally {
      setReplaying(p => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  if (items.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
          <AlertCircle size={20} className="text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium">No dead letters yet</p>
        <p className="text-gray-600 text-sm">Events that exhaust all retry attempts will appear here.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {error && (
        <div className="px-5 py-3 bg-red-950/40 border-b border-red-900/40 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="table-header">Event Type</th>
            <th className="table-header">Workflow</th>
            <th className="table-header">Service</th>
            <th className="table-header">Last Error</th>
            <th className="table-header">Age</th>
            <th className="table-header">Status</th>
            <th className="table-header pr-4">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map(dl => (
            <tr key={dl.id} className="table-row">
              <td className="table-cell font-mono text-xs font-semibold text-white">{dl.event_type}</td>
              <td className="table-cell">
                <Link to={`/workflows/${dl.workflow_id}`} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-mono text-xs group">
                  {dl.workflow_id.slice(0, 20)}…
                  <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </td>
              <td className="table-cell text-gray-500 text-xs">{dl.service_name}</td>
              <td className="table-cell max-w-xs">
                <span className="text-red-400 text-xs font-mono truncate block max-w-[220px]" title={dl.last_error ?? ""}>
                  {dl.last_error ?? "–"}
                </span>
              </td>
              <td className="table-cell text-gray-500 text-xs whitespace-nowrap" title={fmtTime(dl.created_at)}>
                {ago(dl.created_at)}
              </td>
              <td className="table-cell">
                {dl.replayed_at || replayed.has(dl.id) ? (
                  <span className="badge bg-purple-950/60 text-purple-400 border border-purple-800/30">
                    replayed
                  </span>
                ) : (
                  <span className="badge bg-rose-950/60 text-rose-400 border border-rose-800/30">
                    dead
                  </span>
                )}
              </td>
              <td className="table-cell pr-4">
                {dl.replayed_at || replayed.has(dl.id) ? (
                  <span className="text-xs text-gray-600">replayed {ago(dl.replayed_at!)}</span>
                ) : (
                  <button
                    onClick={() => handleReplay(dl.id)}
                    disabled={replaying.has(dl.id)}
                    className="btn-success flex items-center gap-1.5"
                  >
                    <RefreshCw size={11} className={replaying.has(dl.id) ? "animate-spin" : ""} />
                    {replaying.has(dl.id) ? "Replaying…" : "Replay"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
