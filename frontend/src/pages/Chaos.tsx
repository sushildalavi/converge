import { useMemo } from "react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, FileText, RefreshCcw, ShieldCheck } from "lucide-react";
import { measuredArtifacts, formatRate, formatSeconds } from "../data/recoveryProduct";
import { FadeUp, Stagger, SI, Skeleton } from "../components/Animated";

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

export default function Chaos() {
  const replay = measuredArtifacts[0];
  const chaos = measuredArtifacts[1];

  const comparison = useMemo(
    () => [
      {
        name: "Replay",
        recovery: replay.recovery_time_seconds,
        throughput: replay.end_to_end_throughput_events_per_sec,
      },
      {
        name: "Chaos",
        recovery: chaos.recovery_time_seconds,
        throughput: chaos.end_to_end_throughput_events_per_sec,
      },
    ],
    [replay, chaos],
  );

  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">Benchmark Explorer</div>
            <h2 className="page-heading">Measured recovery evidence</h2>
            <p className="page-copy">
              These cards are built from checked-in benchmark artifacts. No inflated throughput numbers, no fake
              chaos runs, and no hidden demo data.
            </p>
          </div>
          <div className="toolbar-note">
            <RefreshCcw size={11} />
            Evidence-backed only
          </div>
        </div>
      </FadeUp>

      <Stagger className="metric-grid metric-grid-4">
        {[
          { label: "Latest replay", value: `${replay.submitted} events`, color: "var(--text)" },
          { label: "Replay recovery", value: formatSeconds(replay.recovery_time_seconds), color: "var(--orange)" },
          { label: "Latest chaos", value: `${chaos.submitted} events`, color: "var(--text)" },
          { label: "Chaos recovery", value: formatSeconds(chaos.recovery_time_seconds), color: "var(--green)" },
        ].map((item) => (
          <SI key={item.label}>
            <div className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value" style={{ color: item.color }}>
                {item.value}
              </p>
            </div>
          </SI>
        ))}
      </Stagger>

      <div className="two-column-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Recovery time comparison</p>
              <p className="panel-copy">Measured recovery duration for the latest checked-in artifacts.</p>
            </div>
            <span className="panel-chip">seconds</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barSize={32}>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--dim)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--dim)" }} tickLine={false} axisLine={false} />
                <Tooltip {...TT} />
                <Bar dataKey="recovery" radius={[4, 4, 0, 0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">End-to-end throughput</p>
              <p className="panel-copy">Actual end-to-end throughput captured in the artifact outputs.</p>
            </div>
            <span className="panel-chip">events/sec</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barSize={32}>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--dim)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--dim)" }} tickLine={false} axisLine={false} />
                <Tooltip {...TT} />
                <Bar dataKey="throughput" radius={[4, 4, 0, 0]} fill="#4ade80" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Artifact cards</p>
            <p className="panel-copy">The values below come directly from repository artifacts.</p>
          </div>
        </div>

        <div className="artifact-grid">
          {measuredArtifacts.map((artifact) => (
            <div key={artifact.id} className="artifact-card">
              <div className="artifact-head">
                <div>
                  <div className="eyebrow">{artifact.kind}</div>
                  <p className="artifact-title">{artifact.title}</p>
                  <p className="artifact-source">{artifact.source}</p>
                </div>
                <span className={`status-pill ${artifact.kind === "chaos" ? "status-pill-chaos" : "status-pill-benchmark"}`}>
                  {artifact.converged ? "converged" : "degraded"}
                </span>
              </div>

              <div className="artifact-stats">
                <div>
                  <p className="artifact-stat-value">{artifact.submitted}</p>
                  <p className="artifact-stat-label">Submitted</p>
                </div>
                <div>
                  <p className="artifact-stat-value">{formatSeconds(artifact.recovery_time_seconds)}</p>
                  <p className="artifact-stat-label">Recovery</p>
                </div>
                <div>
                  <p className="artifact-stat-value">{formatRate(artifact.end_to_end_throughput_events_per_sec)}</p>
                  <p className="artifact-stat-label">Throughput</p>
                </div>
                <div>
                  <p className="artifact-stat-value">{artifact.dead_letters}</p>
                  <p className="artifact-stat-label">DLQ</p>
                </div>
              </div>

              <div className="artifact-meta">
                <span>
                  <ShieldCheck size={11} /> Converged
                </span>
                <span>
                  <FileText size={11} /> {artifact.p50_e2e_ms.toFixed(2)}ms p50
                </span>
              </div>
              <p className="artifact-note">{artifact.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">What the numbers mean</p>
            <p className="panel-copy">Use these notes to keep the story honest in demos and reviews.</p>
          </div>
        </div>

        <div className="evidence-grid">
          <div className="evidence-card">
            <AlertTriangle size={14} />
            <p>Only show the 1000-event replay and 10-event chaos artifacts that are already checked in.</p>
          </div>
          <div className="evidence-card">
            <AlertTriangle size={14} />
            <p>Do not claim 100K-event runs, 3,000+ messages/sec, or zero backlog unless you actually measure them here.</p>
          </div>
          <div className="evidence-card">
            <AlertTriangle size={14} />
            <p>Label smoke-scale validation clearly if you generate temporary artifacts for local testing.</p>
          </div>
          <div className="evidence-card">
            <AlertTriangle size={14} />
            <p>AI eval pass rate and replay confidence should come from the seeded agent traces or a local benchmark run.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
