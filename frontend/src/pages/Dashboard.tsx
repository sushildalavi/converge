import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, AlertTriangle, CheckCircle, Clock, Play,
  RefreshCw, Server, Skull, TrendingUp, Zap,
} from "lucide-react";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { usePolling } from "../hooks/usePolling";
import type { MetricsOut, WorkflowSummaryOut } from "../types";

/* ── helpers ─────────────────────────────────────────────── */
function fmtMs(ms: number | null) {
  if (ms == null) return "–";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}
function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function timeAgo(iso: string | null) {
  if (!iso) return "–";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── chart colour palette ────────────────────────────────── */
const COLORS = {
  succeeded:    "#10b981",
  dead_lettered:"#f43f5e",
  retrying:     "#f97316",
  queued:       "#6366f1",
  processing:   "#eab308",
  failed:       "#ef4444",
};

const TOOLTIP_STYLE = {
  contentStyle: { background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#94a3b8" },
  itemStyle:    { color: "#e2e8f0" },
};

/* ── sparkline data from metrics ─────────────────────────── */
function buildPieData(m: MetricsOut) {
  const slices = [
    { name: "Succeeded",     value: m.succeeded,     color: COLORS.succeeded },
    { name: "Dead-lettered", value: m.dead_lettered, color: COLORS.dead_lettered },
    { name: "Retrying",      value: m.retrying,      color: COLORS.retrying },
    { name: "Queued",        value: m.queued,         color: COLORS.queued },
    { name: "Processing",    value: m.processing,     color: COLORS.processing },
  ].filter(s => s.value > 0);
  return slices;
}

function buildBarData(workflows: WorkflowSummaryOut[]) {
  return workflows.slice(0, 12).reverse().map(w => ({
    name: w.workflow_id.slice(0, 12),
    Succeeded:    w.succeeded,
    Failed:       w.dead_lettered,
    "In Flight":  w.in_flight,
  }));
}

/* ── metric history sparkline ───────────────────────────── */
type HistoryPoint = { t: string; total: number; succeeded: number; dead: number };

/* ── custom tooltip for bar ──────────────────────────────── */
function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5 font-mono">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.fill }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── component ───────────────────────────────────────────── */
export default function Dashboard() {
  const metricsLoader = useCallback(() => api.getMetrics(), []);
  const workflowsLoader = useCallback(() => api.listWorkflows(30), []);

  const { data: metrics, error: mErr, refresh: refreshMetrics } = usePolling(metricsLoader, 5000);
  const { data: workflows, error: wErr, refresh: refreshWf } = usePolling(workflowsLoader, 5000);

  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  // rolling history for sparkline (keep last 20 snapshots)
  const history = useRef<HistoryPoint[]>([]);
  if (metrics) {
    const t = new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const last = history.current[history.current.length - 1];
    if (!last || last.t !== t) {
      history.current = [...history.current.slice(-19), {
        t, total: metrics.total_events, succeeded: metrics.succeeded, dead: metrics.dead_lettered,
      }];
    }
  }

  const handleGenerate = async () => {
    setGenerating(true); setGenMsg(null);
    try {
      const r = await api.generateWorkload(30);
      setGenMsg(`✓ ${r.events_sent} events across ${r.workflows} workflows`);
      setTimeout(() => { refreshMetrics(); refreshWf(); }, 1000);
    } catch { setGenMsg("Failed to generate workload"); }
    finally { setGenerating(false); }
  };

  const pieData = metrics ? buildPieData(metrics) : [];
  const barData = workflows ? buildBarData(workflows) : [];
  const successRate = metrics && metrics.total_events > 0
    ? ((metrics.succeeded / metrics.total_events) * 100).toFixed(1)
    : "–";

  return (
    <div className="p-6 space-y-6">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live system overview · auto-refreshes every 5s</p>
        </div>
        <div className="flex items-center gap-3">
          {genMsg && (
            <span className="text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
              {genMsg}
            </span>
          )}
          <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2">
            {generating ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {generating ? "Generating…" : "Generate Workload"}
          </button>
        </div>
      </div>

      {(mErr || wErr) && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {mErr || wErr}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Events"
          value={metrics?.total_events?.toLocaleString() ?? "–"}
          icon={Activity}
          accent="indigo"
          sub="all time"
        />
        <MetricCard
          title="Succeeded"
          value={metrics?.succeeded?.toLocaleString() ?? "–"}
          icon={CheckCircle}
          accent="emerald"
          trendLabel={metrics ? `${successRate}%` : undefined}
          trend="up"
          sub="success rate"
        />
        <MetricCard
          title="Dead-lettered"
          value={metrics?.dead_lettered?.toLocaleString() ?? "–"}
          icon={Skull}
          accent="red"
          sub="exhausted retries"
        />
        <MetricCard
          title="Active Workers"
          value={metrics?.active_workers ?? "–"}
          icon={Server}
          accent={metrics?.stale_workers ? "orange" : "emerald"}
          trendLabel={metrics?.stale_workers ? `${metrics.stale_workers} stale` : undefined}
          trend={metrics?.stale_workers ? "down" : "neutral"}
          sub={metrics?.stale_workers ? "check worker health" : "all healthy"}
        />
        <MetricCard
          title="Retrying"
          value={metrics?.retrying?.toLocaleString() ?? "–"}
          icon={RefreshCw}
          accent="orange"
          sub="in backoff"
        />
        <MetricCard
          title="Replay Success"
          value={metrics ? pct(metrics.replay_success_rate) : "–"}
          icon={TrendingUp}
          accent="purple"
          sub={`${metrics?.replay_requeued ?? 0} replayed`}
        />
        <MetricCard
          title="p50 Latency"
          value={fmtMs(metrics?.p50_attempt_duration_ms ?? null)}
          icon={Clock}
          accent="indigo"
          sub="median attempt duration"
        />
        <MetricCard
          title="p95 Latency"
          value={fmtMs(metrics?.p95_attempt_duration_ms ?? null)}
          icon={Zap}
          accent="yellow"
          sub="95th percentile"
        />
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* sparkline */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div>
              <p className="text-sm font-semibold text-white">Event Volume</p>
              <p className="text-xs text-gray-500 mt-0.5">Live rolling 20-point window</p>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history.current} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSucceeded" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Area type="monotone" dataKey="succeeded" name="Succeeded" stroke="#10b981" fill="url(#gSucceeded)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="dead" name="Dead-lettered" stroke="#f43f5e" fill="url(#gDead)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* donut */}
        <div className="card">
          <div className="card-header">
            <p className="text-sm font-semibold text-white">Status Breakdown</p>
          </div>
          <div className="card-body flex flex-col items-center">
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                      dataKey="value" paddingAngle={3} stroke="none">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 w-full mt-1">
                  {pieData.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                        <span className="text-xs text-gray-400">{s.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-white tabular-nums">{s.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
                No data yet — generate a workload
              </div>
            )}
          </div>
        </div>
      </div>

      {/* bar chart */}
      {barData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <p className="text-sm font-semibold text-white">Workflow Outcomes</p>
              <p className="text-xs text-gray-500 mt-0.5">Events per workflow, most recent 12</p>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569", fontFamily: "monospace" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="Succeeded" stackId="a" fill={COLORS.succeeded} radius={[0,0,0,0]} />
                <Bar dataKey="Failed" stackId="a" fill={COLORS.dead_lettered} radius={[0,0,0,0]} />
                <Bar dataKey="In Flight" stackId="a" fill={COLORS.queued} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* workflows table */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <p className="text-sm font-semibold text-white">Recent Workflows</p>
            <p className="text-xs text-gray-500 mt-0.5">Click to view full timeline</p>
          </div>
          {workflows && (
            <span className="text-xs text-gray-600">{workflows.length} workflows</span>
          )}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/40">
              <th className="table-header">Workflow ID</th>
              <th className="table-header">Events</th>
              <th className="table-header">Succeeded</th>
              <th className="table-header">Dead-lettered</th>
              <th className="table-header">In Flight</th>
              <th className="table-header">Status</th>
              <th className="table-header pr-4">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(workflows ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-600">
                  No workflows yet. Click "Generate Workload" to begin.
                </td>
              </tr>
            ) : (
              (workflows ?? []).map(wf => (
                <tr key={wf.workflow_id} className="table-row">
                  <td className="table-cell">
                    <Link to={`/workflows/${wf.workflow_id}`}
                      className="font-mono text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                      {wf.workflow_id}
                    </Link>
                  </td>
                  <td className="table-cell tabular-nums">{wf.total_events}</td>
                  <td className="table-cell tabular-nums text-emerald-400">{wf.succeeded}</td>
                  <td className="table-cell tabular-nums">
                    {wf.dead_lettered > 0
                      ? <span className="text-rose-400 font-semibold">{wf.dead_lettered}</span>
                      : <span className="text-gray-700">0</span>
                    }
                  </td>
                  <td className="table-cell tabular-nums">
                    {wf.in_flight > 0
                      ? <span className="text-yellow-400">{wf.in_flight}</span>
                      : <span className="text-gray-700">0</span>
                    }
                  </td>
                  <td className="table-cell">
                    {wf.has_failures
                      ? <EventStatusBadge status="dead_lettered" />
                      : wf.in_flight > 0
                        ? <EventStatusBadge status="processing" />
                        : <EventStatusBadge status="succeeded" />
                    }
                  </td>
                  <td className="table-cell pr-4 text-gray-600 text-xs">{timeAgo(wf.last_updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
