import { useCallback } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Bot, PlayCircle, RefreshCcw, Sigma } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { AnimatedNumber, FadeUp, SI, Skeleton, Stagger } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

const verdictColor = (value: string) => {
  if (value === "pass") return "var(--green)";
  if (value === "review" || value === "warn") return "var(--orange)";
  return "var(--red)";
};

export default function AgentRuns() {
  const runsLoader = useCallback(() => api.agentRuns(24), []);
  const providerLoader = useCallback(() => api.providerStatus(), []);
  const { data: runs, loading, refresh } = usePolling(runsLoader, 4500);
  const { data: provider } = usePolling(providerLoader, 8000);

  const latest = runs?.[0];
  const avgConfidence = runs && runs.length > 0 ? runs.reduce((sum, run) => sum + run.replay_confidence, 0) / runs.length : null;
  const providerLabel = provider?.model ? `${provider.provider} / ${provider.model}` : provider?.provider ?? "fake";
  const providerSource = provider?.source ?? "local";

  const seed = async () => {
    try {
      const result = await api.generateAIWorkload(4);
      toast.success("Seeded AI workloads", {
        description: `${result.agent_runs} agent runs and ${result.eval_results} eval results`,
      });
      refresh();
    } catch {
      toast.error("Failed to seed AI workloads");
    }
  };

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">AI Operations</div>
            <h2 className="page-heading">Agent run dashboard</h2>
            <p className="page-copy">
              Track agent runs, replay confidence, evaluation status, and provider fallback from a single pane.
            </p>
          </div>
          <div className="toolbar-actions">
            <button className="btn-outline" onClick={refresh}>
              <RefreshCcw size={11} />
              Refresh
            </button>
            <button className="btn-amber" onClick={seed}>
              <PlayCircle size={11} />
              Seed AI Workload
            </button>
          </div>
        </div>
      </FadeUp>

      <Stagger className="metric-grid metric-grid-4">
          {[
            { label: "Runs", value: runs?.length ?? null, color: "var(--text)" },
            { label: "Latest confidence", value: latest ? latest.replay_confidence * 100 : null, color: "var(--cyan)" },
            { label: "Eval status", value: latest?.evaluation_status ?? null, color: verdictColor(latest?.evaluation_status ?? "warn") },
            { label: "Provider", value: providerLabel, color: "var(--violet)" },
          ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.color }}>
                {loading && !runs ? <Skeleton className="h-4 w-16" /> : typeof item.value === "number" ? <AnimatedNumber value={item.value} decimals={item.label === "Latest confidence" ? 1 : 0} /> : item.value ?? "–"}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Agent trace ledger</p>
            <p className="panel-copy">Step hashes, tool names, replay confidence, and trace status.</p>
          </div>
          <span className="panel-chip">
            <Bot size={11} /> {providerLabel} · {providerSource}
          </span>
        </div>

        <div className="table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Workflow</th>
                <th>Confidence</th>
                <th>Trace</th>
                <th>Eval</th>
                <th>Steps</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {loading && !runs ? (
                [...Array(6)].map((_, row) => (
                  <tr key={row}>
                    {[...Array(7)].map((__, cell) => (
                      <td key={cell}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (runs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Sigma size={16} />
                      <p>No AI runs recorded yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                runs!.map((run) => (
                  <tr key={run.id}>
                    <td className="mono">{run.agent_run_id}</td>
                    <td className="mono">
                      <Link to={`/app/workflows/${run.workflow_id}`} className="mono-link">
                        {run.workflow_id}
                      </Link>
                    </td>
                    <td className="mono" style={{ color: "var(--cyan)" }}>
                      {Math.round(run.replay_confidence * 100)}%
                    </td>
                    <td className="mono">{run.trace_status}</td>
                    <td className="mono">{run.evaluation_status}</td>
                    <td className="mono">{run.steps.length}</td>
                    <td>
                      <Link className="panel-link" to={`/app/ai-runs/${run.agent_run_id}`}>
                        Open
                      </Link>
                    </td>
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
