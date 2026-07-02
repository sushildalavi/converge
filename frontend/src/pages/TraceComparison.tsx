import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCcw, SplitSquareVertical } from "lucide-react";
import { api } from "../api/client";
import { AnimatedNumber, FadeUp, Skeleton, Stagger, SI } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-title">{title}</p>
        </div>
      </div>
      <pre className="json-viewer">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function TraceComparison() {
  const { agentRunId } = useParams<{ agentRunId: string }>();
  const runLoader = useCallback(() => api.agentRun(agentRunId ?? ""), [agentRunId]);
  const comparisonLoader = useCallback(() => api.traceComparison(agentRunId ?? ""), [agentRunId]);
  const { data: run, loading: runLoading, refresh: refreshRun } = usePolling(runLoader, 5000);
  const { data: comparison, loading: comparisonLoading, refresh: refreshComparison } = usePolling(comparisonLoader, 7000);

  const refresh = () => {
    refreshRun();
    refreshComparison();
  };

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <Link to="/app/ai-runs" className="back-link">
              <ArrowLeft size={11} />
              Back to runs
            </Link>
            <div className="eyebrow">Trace Comparison</div>
            <h2 className="page-heading">Original vs replayed agent trace</h2>
            <p className="page-copy">
              Compare tool sequences, output hashes, evaluator verdicts, and confidence scoring for the selected run.
            </p>
          </div>
          <button className="btn-outline" onClick={refresh}>
            <RefreshCcw size={11} />
            Refresh
          </button>
        </div>
      </FadeUp>

      <Stagger className="metric-grid metric-grid-4">
        {[
          { label: "Replay confidence", value: comparison?.replay_confidence ?? run?.replay_confidence ?? null, color: "var(--cyan)" },
          { label: "Trace status", value: run?.trace_status ?? null, color: "var(--violet)" },
          { label: "Eval status", value: run?.evaluation_status ?? null, color: "var(--green)" },
          { label: "Steps", value: run?.steps.length ?? null, color: "var(--text)" },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.color }}>
                {runLoading || comparisonLoading ? <Skeleton className="h-4 w-16" /> : typeof item.value === "number" ? <AnimatedNumber value={item.value} decimals={item.label === "Replay confidence" ? 2 : 0} /> : item.value ?? "–"}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      {comparison && (
        <div className="two-column-grid">
          <JsonPanel title="Tool sequence diff" value={comparison.tool_sequence_diff_json} />
          <JsonPanel title="Output hash diff" value={comparison.output_hash_diff_json} />
        </div>
      )}

      <div className="two-column-grid">
        <JsonPanel title="Evaluator verdict diff" value={comparison?.evaluator_verdict_diff_json ?? {}} />
        <JsonPanel title="Failure category summary" value={comparison?.failure_category_summary_json ?? {}} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Run context</p>
            <p className="panel-copy">The source run and replayed run IDs used to compute the comparison.</p>
          </div>
          <span className="panel-chip">
            <SplitSquareVertical size={11} />
            AI replay
          </span>
        </div>
        <div className="stack-list">
          {run ? (
            <>
              <div className="note-row">Agent run: {run.agent_run_id}</div>
              <div className="note-row">Workflow: {run.workflow_id}</div>
              <div className="note-row">Original output hash: {run.original_output_hash ?? "n/a"}</div>
              <div className="note-row">Replayed output hash: {run.replayed_output_hash ?? "n/a"}</div>
            </>
          ) : (
            <div className="empty-state">
              <p>No trace comparison available yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
