import { useCallback } from "react";
import { Server } from "lucide-react";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { api } from "../api/client";
import { WorkerHealthTable } from "../components/WorkerHealthTable";
import { usePolling } from "../hooks/usePolling";

export default function WorkerHealth() {
  const loader = useCallback(() => api.listWorkers(), []);
  const { data, loading, error } = usePolling(loader, 5000);

  const active = (data ?? []).filter(w => !w.is_stale && w.status === "active").length;
  const total = (data ?? []).length;
  const healthPct = total > 0 ? (active / total) * 100 : 0;
  const radialData = [{ name: "Health", value: healthPct, fill: healthPct > 80 ? "#10b981" : healthPct > 50 ? "#f97316" : "#f43f5e" }];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server size={22} className="text-indigo-400" /> Worker Health
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Heartbeat status · stale after 30s of silence</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* health radial */}
          <div className="card flex flex-col items-center py-6">
            <div className="relative">
              <ResponsiveContainer width={120} height={120}>
                <RadialBarChart cx="50%" cy="50%" innerRadius={36} outerRadius={54}
                  data={radialData} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar dataKey="value" angleAxisId={0} background={{ fill: "#1f2937" }}
                    cornerRadius={6} fill={radialData[0].fill} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-lg font-bold text-white">{healthPct.toFixed(0)}%</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Fleet Health</p>
          </div>

          {/* stat cards */}
          <div className="card p-5 flex flex-col gap-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold text-white">{total}</p>
          </div>
          <div className="card p-5 flex flex-col gap-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Active</p>
            <p className="text-3xl font-bold text-emerald-400">{active}</p>
          </div>
          <div className="card p-5 flex flex-col gap-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Stale / Crashed</p>
            <p className={`text-3xl font-bold ${total - active > 0 ? "text-rose-400" : "text-gray-600"}`}>
              {total - active}
            </p>
          </div>
        </div>
      )}

      {loading && !data && <div className="text-gray-500 text-sm py-4">Loading…</div>}
      {data && <WorkerHealthTable workers={data} />}
    </div>
  );
}
