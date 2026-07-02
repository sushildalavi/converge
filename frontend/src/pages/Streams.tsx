import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Activity, RefreshCw, Workflow } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { Skeleton, FadeUp, Stagger, SI, AnimatedNumber } from "../components/Animated";

const TT = {
  contentStyle: {
    background: "#18181c",
    border: "1px solid #2a2a30",
    borderRadius: 6,
    fontSize: 11,
    padding: "7px 10px",
  },
  labelStyle: { color: "#71717a", fontSize: 10, marginBottom: 2 },
  itemStyle: { color: "#f4f4f5" },
  cursor: { stroke: "rgba(255,255,255,.04)" },
};

const fmtRate = (value: number | null) => (value == null ? "–" : `${value.toFixed(1)}/s`);
const fmtMs = (value: number | null) => (value == null ? "–" : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`);
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

export default function Streams() {
  const metricsLoader = useCallback(() => api.getMetrics(), []);
  const eventsLoader = useCallback(() => api.recentEvents(16), []);
  const convergenceLoader = useCallback(() => api.getConvergence(), []);

  const { data: metrics, loading: metricsLoading, error: metricsError, refresh } = usePolling(metricsLoader, 5000);
  const { data: events, loading: eventsLoading, error: eventsError } = usePolling(eventsLoader, 3500);
  const { data: convergence } = usePolling(convergenceLoader, 8000);

  const backlogData = useMemo(
    () => [
      { label: "Incoming", value: metrics?.incoming_stream_depth ?? 0 },
      { label: "Retry stream", value: metrics?.retry_stream_depth ?? 0 },
      { label: "Pending", value: metrics?.pending_events ?? 0 },
      { label: "Retry queue", value: metrics?.retry_queue_depth ?? 0 },
    ],
    [metrics],
  );

  const topIssues = convergence?.convergence_issues ?? [];

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">Redis Streams</div>
            <h2 className="page-heading">Stream backlog and retry pressure</h2>
            <p className="page-copy">
              Inspect pending entries, retry queue depth, and the operational signs that the stream is still draining.
            </p>
          </div>
          <button className="btn-outline" onClick={refresh}>
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </FadeUp>

      {metricsError && (
        <div className="error-banner">
          <AlertTriangle size={13} />
          <span>{metricsError}</span>
        </div>
      )}

      <Stagger className="metric-grid metric-grid-6">
        {[
          { label: "Incoming stream", value: metrics?.incoming_stream_depth ?? null, tone: "var(--blue)" },
          { label: "Retry stream", value: metrics?.retry_stream_depth ?? null, tone: "var(--orange)" },
          { label: "Pending entries", value: metrics?.pending_events ?? null, tone: "var(--red)" },
          { label: "Retry queue", value: metrics?.retry_queue_depth ?? null, tone: "var(--muted)" },
          { label: "Backlog", value: metrics?.stream_backlog ?? null, tone: "var(--text)" },
          { label: "Heartbeat age", value: metrics?.worker_heartbeat_age_seconds ?? null, tone: "var(--dim)", suffix: "s" },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.tone }}>
                {metricsLoading && !metrics ? (
                  <Skeleton className="h-4 w-12" />
                ) : typeof item.value === "number" ? (
                  item.label === "Heartbeat age" ? (
                    `${item.value.toFixed(1)}s`
                  ) : (
                    <AnimatedNumber value={item.value} />
                  )
                ) : (
                  "–"
                )}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      <div className="two-column-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Backlog pressure</p>
              <p className="panel-copy">Redis stream depths, pending entries, and retry queue pressure.</p>
            </div>
            <span className="panel-chip">{fmtRate(metrics?.processed_per_sec ?? null)}</span>
          </div>
          <div className="chart-wrap">
            {metricsLoading && !metrics ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={backlogData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barSize={28}>
                  <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--dim)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--dim)" }} tickLine={false} axisLine={false} />
                  <Tooltip {...TT} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Convergence notes</p>
              <p className="panel-copy">Signals that explain whether the stream has actually drained.</p>
            </div>
            <span className={`status-pill ${convergence?.converged ? "status-pill-good" : "status-pill-warn"}`}>
              {convergence?.convergence_state ?? "unknown"}
            </span>
          </div>

          <div className="stack-list">
            {topIssues.length === 0 ? (
              <div className="empty-state">
                <Activity size={16} />
                <p>No backlog issues recorded right now.</p>
              </div>
            ) : (
              topIssues.map((issue) => (
                <div key={issue} className="note-row">
                  {issue}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Recent stream activity</p>
            <p className="panel-copy">Latest events with status and retry state.</p>
          </div>
          <Link to="/app/replay" className="panel-link">
            Go to replay
          </Link>
        </div>

        {eventsError && (
          <div className="error-banner">
            <AlertTriangle size={13} />
            <span>{eventsError}</span>
          </div>
        )}

        <div className="table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Error</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {eventsLoading && !events ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((__, j) => (
                      <td key={j}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (events ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Workflow size={16} />
                      <p>No recent stream activity.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                events!.map((event) => (
                  <tr key={event.id}>
                    <td className="mono">{event.event_type}</td>
                    <td className="mono">
                      <Link to={`/app/workflows/${event.workflow_id}`} className="mono-link">
                        {event.workflow_id.slice(-18)}
                      </Link>
                    </td>
                    <td>
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="mono">{event.attempt_count}</td>
                    <td className="mono dim-cell">{event.last_error ?? "—"}</td>
                    <td className="mono">{ago(event.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Recovery signals</p>
            <p className="panel-copy">Use these numbers to decide whether to replay or wait.</p>
          </div>
        </div>

        <div className="signal-grid">
          <div className="signal-card">
            <p className="signal-label">Processed / sec</p>
            <p className="signal-value">{fmtRate(metrics?.processed_per_sec ?? null)}</p>
          </div>
          <div className="signal-card">
            <p className="signal-label">Replay latency</p>
            <p className="signal-value">{fmtMs(metrics?.replay_latency_ms ?? null)}</p>
          </div>
          <div className="signal-card">
            <p className="signal-label">Recent failures</p>
            <p className="signal-value">{metrics?.recent_failures ?? "–"}</p>
          </div>
          <div className="signal-card">
            <p className="signal-label">Stale workers</p>
            <p className="signal-value">{metrics?.stale_workers ?? "–"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
