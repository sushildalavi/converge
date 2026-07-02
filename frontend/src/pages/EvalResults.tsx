import { useCallback } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, RefreshCcw } from "lucide-react";
import { api } from "../api/client";
import { FadeUp, Skeleton, Stagger, SI } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

const verdictColor = (verdict: string) => {
  if (verdict === "pass") return "var(--green)";
  if (verdict === "review" || verdict === "warn") return "var(--orange)";
  return "var(--red)";
};

export default function EvalResults() {
  const runsLoader = useCallback(() => api.agentRuns(12), []);
  const evalLoader = useCallback(() => api.evalResults(), []);
  const { data: runs } = usePolling(runsLoader, 6000);
  const { data: evals, loading, refresh } = usePolling(evalLoader, 4500);

  const latest = evals?.[0];

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">AI Evals</div>
            <h2 className="page-heading">Evaluation results table</h2>
            <p className="page-copy">Deterministic exact-match, schema checks, and fake LLM judge outputs.</p>
          </div>
          <button className="btn-outline" onClick={refresh}>
            <RefreshCcw size={11} />
            Refresh
          </button>
        </div>
      </FadeUp>

      <Stagger className="metric-grid metric-grid-3">
        {[
          { label: "Total evals", value: evals?.length ?? null, color: "var(--text)" },
          { label: "Latest verdict", value: latest?.verdict ?? null, color: verdictColor(latest?.verdict ?? "warn") },
          { label: "Latest score", value: latest?.score ?? null, color: "var(--cyan)" },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.color }}>
                {loading && !evals ? <Skeleton className="h-4 w-12" /> : typeof item.value === "number" ? item.value.toFixed(2) : item.value ?? "–"}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Evaluation log</p>
            <p className="panel-copy">One row per evaluator verdict emitted by the seeded agent traces.</p>
          </div>
          <span className="panel-chip">
            <BadgeCheck size={11} />
            Verified
          </span>
        </div>

        <div className="table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Evaluator</th>
                <th>Kind</th>
                <th>Verdict</th>
                <th>Score</th>
                <th>Compared</th>
                <th>Agent run</th>
              </tr>
            </thead>
            <tbody>
              {loading && !evals ? (
                [...Array(6)].map((_, row) => (
                  <tr key={row}>
                    {[...Array(6)].map((__, cell) => (
                      <td key={cell}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (evals ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No eval results recorded yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                evals!.map((evalResult) => {
                  const run = runs?.find((item) => item.id === evalResult.agent_run_id);
                  return (
                    <tr key={evalResult.id}>
                      <td className="mono">{evalResult.evaluator_name}</td>
                      <td className="mono">{evalResult.evaluator_kind}</td>
                      <td className="mono" style={{ color: verdictColor(evalResult.verdict) }}>
                        {evalResult.verdict}
                      </td>
                      <td className="mono">{evalResult.score.toFixed(2)}</td>
                      <td className="mono">{evalResult.compared_against ?? "–"}</td>
                      <td className="mono">
                        <Link to={`/app/ai-runs/${run?.agent_run_id ?? evalResult.agent_run_id}`} className="mono-link">
                          {run?.agent_run_id ?? evalResult.agent_run_id}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
