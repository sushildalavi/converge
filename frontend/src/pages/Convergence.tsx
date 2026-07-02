import { useCallback } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, RefreshCw, Workflow } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { Skeleton, FadeUp, Stagger, SI, AnimatedNumber } from "../components/Animated";

const ago = (iso: string | null) => {
  if (!iso) return "–";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

export default function Convergence() {
  const convLoader = useCallback(() => api.getConvergence(), []);
  const metricsLoader = useCallback(() => api.getMetrics(), []);
  const workflowsLoader = useCallback(() => api.listWorkflows(8), []);

  const { data: convergence, loading: convergenceLoading, error, refresh } = usePolling(convLoader, 5000);
  const { data: metrics } = usePolling(metricsLoader, 8000);
  const { data: workflows } = usePolling(workflowsLoader, 6000);

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">Convergence</div>
            <h2 className="page-heading">Recovery verification and operator proof</h2>
            <p className="page-copy">
              This page answers the only question that matters after a failure: did the system actually drain,
              or is there still work trapped in Redis, Postgres, or dead-letter recovery paths?
            </p>
          </div>
          <button className="btn-outline" onClick={refresh}>
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </FadeUp>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={13} />
          <span>{error}</span>
        </div>
      )}

      <Stagger className="metric-grid metric-grid-6">
        {[
          { label: "State", value: convergence?.convergence_state ?? null, color: "var(--text)" },
          { label: "Converged", value: convergence?.converged ? "true" : convergence?.converged === false ? "false" : null, color: convergence?.converged ? "var(--green)" : "var(--orange)" },
          { label: "Pending", value: convergence?.pending_events ?? null, color: "var(--red)" },
          { label: "Backlog", value: convergence?.stream_backlog ?? null, color: "var(--muted)" },
          { label: "DLQ", value: convergence?.dead_lettered_events ?? null, color: "var(--orange)" },
          { label: "Stale workers", value: convergence?.stale_workers ?? null, color: "var(--blue)" },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.color }}>
                {convergenceLoading && !convergence ? (
                  <Skeleton className="h-4 w-12" />
                ) : typeof item.value === "number" ? (
                  <AnimatedNumber value={item.value} />
                ) : item.value ? (
                  item.value
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
              <p className="panel-title">Verification snapshot</p>
              <p className="panel-copy">
                {convergence?.verified_at ? `Last verified ${ago(convergence.verified_at)}` : "Waiting for a convergence snapshot."}
              </p>
            </div>
            <span className={`status-pill ${convergence?.converged ? "status-pill-good" : "status-pill-warn"}`}>
              {convergence?.converged ? "Converged" : "Not converged"}
            </span>
          </div>

          <div className="signal-grid">
            <div className="signal-card">
              <p className="signal-label">Acknowledged events</p>
              <p className="signal-value">
                {convergenceLoading && !convergence ? <Skeleton className="h-4 w-10" /> : convergence?.acknowledged_events ?? "–"}
              </p>
            </div>
            <div className="signal-card">
              <p className="signal-label">Orphaned records</p>
              <p className="signal-value">
                {convergenceLoading && !convergence ? <Skeleton className="h-4 w-10" /> : convergence?.orphaned_records ?? "–"}
              </p>
            </div>
            <div className="signal-card">
              <p className="signal-label">Duplicate deliveries</p>
              <p className="signal-value">
                {convergenceLoading && !convergence ? <Skeleton className="h-4 w-10" /> : convergence?.duplicate_deliveries ?? "–"}
              </p>
            </div>
            <div className="signal-card">
              <p className="signal-label">Duplicate side effects</p>
              <p className="signal-value">
                {convergenceLoading && !convergence ? <Skeleton className="h-4 w-10" /> : convergence?.duplicate_side_effects ?? "–"}
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Convergence issues</p>
              <p className="panel-copy">Anything here blocks a clean recovery claim.</p>
            </div>
          </div>

          {convergence?.convergence_issues?.length ? (
            <div className="stack-list">
              {convergence.convergence_issues.map((issue) => (
                <div key={issue} className="note-row">
                  {issue}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <ShieldCheck size={16} />
              <p>No active convergence issues.</p>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Resume-safe summary</p>
            <p className="panel-copy">
              This is the text an operator can read before resuming traffic or replaying a DLQ.
            </p>
          </div>
        </div>

        <div className="resume-card">
          <p>
            {convergence?.converged
              ? "Converged: the system drained cleanly and no active recovery issues remain."
              : "Not converged: review pending entries, retry pressure, stale workers, and orphaned records before resuming."}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Recent workflows</p>
            <p className="panel-copy">Use these to move from a system view into a specific incident timeline.</p>
          </div>
          <Link to="/app/replay" className="panel-link">
            Replay / DLQ
          </Link>
        </div>

        <div className="table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Events</th>
                <th>Success</th>
                <th>DLQ</th>
                <th>In-flight</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(workflows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Workflow size={16} />
                      <p>No workflows are available yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                workflows!.map((workflow) => (
                  <tr key={workflow.workflow_id}>
                    <td className="mono">
                      <Link to={`/app/workflows/${workflow.workflow_id}`} className="mono-link">
                        {workflow.workflow_id}
                      </Link>
                    </td>
                    <td className="mono">{workflow.total_events}</td>
                    <td className="mono good-cell">{workflow.succeeded}</td>
                    <td className="mono warn-cell">{workflow.dead_lettered}</td>
                    <td className="mono">{workflow.in_flight}</td>
                    <td className="mono">{ago(workflow.last_updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
