import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Braces, RefreshCcw } from "lucide-react";
import { api } from "../api/client";
import { FadeUp, Skeleton, Stagger, SI } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

export default function PromptTraceViewer() {
  const { agentRunId } = useParams<{ agentRunId: string }>();
  const loader = useCallback(() => api.agentRun(agentRunId ?? ""), [agentRunId]);
  const { data, loading, refresh } = usePolling(loader, 5000);

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <Link to="/app/ai-runs" className="back-link">
              <ArrowLeft size={11} />
              Back to runs
            </Link>
            <div className="eyebrow">Prompt / Tool Trace</div>
            <h2 className="page-heading">Prompt and tool-call viewer</h2>
            <p className="page-copy">Inspect the agent run payload, hashes, and step-level trace metadata.</p>
          </div>
          <button className="btn-outline" onClick={refresh}>
            <RefreshCcw size={11} />
            Refresh
          </button>
        </div>
      </FadeUp>

      <Stagger className="metric-grid metric-grid-4">
        {[
          { label: "Run", value: data?.agent_run_id ?? null },
          { label: "Workflow", value: data?.workflow_id ?? null },
          { label: "Steps", value: data?.steps.length ?? null },
          { label: "Confidence", value: data ? `${Math.round(data.replay_confidence * 100)}%` : null },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value">
                {loading && !data ? <Skeleton className="h-4 w-16" /> : item.value ?? "–"}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Run JSON</p>
            <p className="panel-copy">JSON representation of the selected agent run and nested traces.</p>
          </div>
          <span className="panel-chip">
            <Braces size={11} />
            JSON
          </span>
        </div>
        <div className="panel-head" style={{ paddingTop: 0 }}>
          <Link className="panel-link" to={`/app/ai-runs/${agentRunId ?? ""}/compare`}>
            Open trace comparison
          </Link>
        </div>
        <pre className="json-viewer">{JSON.stringify(data ?? {}, null, 2)}</pre>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Step ledger</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Tool</th>
                <th>Trace</th>
                <th>Eval</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {(data?.steps ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No step data yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data!.steps.map((step) => (
                  <tr key={step.id}>
                    <td className="mono">{step.step_id}</td>
                    <td className="mono">{step.tool_name ?? "–"}</td>
                    <td className="mono">{step.trace_status}</td>
                    <td className="mono">{step.evaluation_status}</td>
                    <td className="mono">{Math.round(step.replay_confidence * 100)}%</td>
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
