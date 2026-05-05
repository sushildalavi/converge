import { useCallback } from "react";
import { Skull } from "lucide-react";
import { api } from "../api/client";
import { DeadLetterTable } from "../components/DeadLetterTable";
import { usePolling } from "../hooks/usePolling";

export default function DeadLetters() {
  const loader = useCallback(() => api.listDeadLetters(100), []);
  const { data, loading, error, refresh } = usePolling(loader, 5000);

  const pending = (data ?? []).filter(d => !d.replayed_at).length;
  const replayed = (data ?? []).filter(d => !!d.replayed_at).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Skull size={22} className="text-rose-500" /> Dead Letter Queue
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Events that exhausted all retry attempts</p>
        </div>
        {data && data.length > 0 && (
          <div className="flex gap-3">
            <div className="card px-4 py-2 text-center">
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-lg font-bold text-rose-400">{pending}</p>
            </div>
            <div className="card px-4 py-2 text-center">
              <p className="text-xs text-gray-500">Replayed</p>
              <p className="text-lg font-bold text-purple-400">{replayed}</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-gray-500 text-sm py-4">Loading…</div>
      )}

      {data && <DeadLetterTable items={data} onReplayed={refresh} />}
    </div>
  );
}
