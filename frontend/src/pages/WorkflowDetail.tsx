import { useCallback, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Bot, CheckCircle, Clock, RefreshCw, XCircle, Zap } from "lucide-react";
import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { api } from "../api/client";
import { WorkflowTimeline } from "../components/WorkflowTimeline";
import { usePolling } from "../hooks/usePolling";
import type { IncidentSummaryOut } from "../types";

function fmtMs(ms: number | null) {
  if (ms == null) return "–";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 },
  itemStyle:    { color: "#e2e8f0" },
};

export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const loader = useCallback(() => api.getWorkflowTimeline(workflowId!), [workflowId]);
  const { data, loading, error } = usePolling(loader, 8000);

  const [summary, setSummary] = useState<IncidentSummaryOut | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sumErr, setSumErr] = useState<string | null>(null);

  const handleSummarize = async () => {
    setSummarizing(true); setSumErr(null);
    try { setSummary(await api.summarizeIncident(workflowId!)); }
    catch { setSumErr("Summarization failed"); }
    finally { setSummarizing(false); }
  };

  if (loading) return (
    <div className="p-6 flex items-center gap-3 text-gray-400">
      <RefreshCw size={16} className="animate-spin" /> Loading…
    </div>
  );
  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!data) return null;

  // stats from timeline
  const events = data.events;
  const total = events.length;
  const succeeded = events.filter(e => e.status === "succeeded").length;
  const failed = events.filter(e => e.status === "dead_lettered").length;
  const totalAttempts = events.reduce((s, e) => s + e.attempt_count, 0);
  const allAttempts = events.flatMap(e => e.attempts);
  const totalMs = allAttempts.reduce((s, a) => s + (a.duration_ms ?? 0), 0);

  // for bar chart — attempts per step
  const attemptBar = events.map(ev => ({
    name: ev.event_type.split(".")[1] ?? ev.event_type,
    attempts: ev.attempt_count || 1,
    status: ev.status,
  }));

  const successPct = total > 0 ? (succeeded / total) * 100 : 0;
  const radialData = [{ name: "Success", value: successPct, fill: "#10b981" }];

  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-3 transition-colors">
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white font-mono">{data.workflow_id}</h1>
          <p className="text-gray-500 text-sm mt-1">{total} events · {totalAttempts} total attempts</p>
        </div>
        <button onClick={handleSummarize} disabled={summarizing} className="btn-secondary flex items-center gap-2">
          {summarizing ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />}
          {summarizing ? "Analysing…" : "AI Incident Summary"}
        </button>
      </div>

      {/* summary panel */}
      {(summary || sumErr) && (
        <div className={`card border ${sumErr ? "border-red-800/40 bg-red-950/20" : "border-purple-800/40 bg-purple-950/10"}`}>
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Bot size={14} className={sumErr ? "text-red-400" : "text-purple-400"} />
              <p className="text-sm font-semibold text-white">
                {sumErr ? "Error" : `Incident Summary`}
              </p>
              {summary?.model_name && (
                <span className="text-xs text-gray-600">via {summary.model_name}</span>
              )}
              {!summary?.model_name && !sumErr && (
                <span className="text-xs text-gray-600">template fallback</span>
              )}
            </div>
          </div>
          <div className="card-body">
            <p className={`text-sm leading-relaxed ${sumErr ? "text-red-400" : "text-gray-300"}`}>
              {sumErr || summary?.summary_text}
            </p>
          </div>
        </div>
      )}

      {/* stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <CheckCircle size={20} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Succeeded</p>
            <p className="text-2xl font-bold text-white">{succeeded}<span className="text-sm text-gray-600 ml-1">/ {total}</span></p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <XCircle size={20} className="text-rose-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Dead-lettered</p>
            <p className="text-2xl font-bold text-white">{failed}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <Zap size={20} className="text-orange-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Attempts</p>
            <p className="text-2xl font-bold text-white">{totalAttempts}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <Clock size={20} className="text-indigo-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Duration</p>
            <p className="text-2xl font-bold text-white">{fmtMs(totalMs || null)}</p>
          </div>
        </div>
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* success radial */}
        <div className="card">
          <div className="card-header"><p className="text-sm font-semibold text-white">Success Rate</p></div>
          <div className="card-body flex flex-col items-center">
            <div className="relative">
              <ResponsiveContainer width={160} height={160}>
                <RadialBarChart cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                  data={radialData} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar dataKey="value" angleAxisId={0} background={{ fill: "#1f2937" }}
                    cornerRadius={8} fill="#10b981" />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-2xl font-bold text-white">{successPct.toFixed(0)}%</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">{succeeded} of {total} events succeeded</p>
          </div>
        </div>

        {/* attempts per step */}
        <div className="card lg:col-span-2">
          <div className="card-header"><p className="text-sm font-semibold text-white">Attempts per Step</p></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={attemptBar} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="attempts" radius={[4, 4, 0, 0]}>
                  {attemptBar.map((entry, i) => (
                    <rect key={i} fill={entry.status === "succeeded" ? "#10b981" : entry.status === "dead_lettered" ? "#f43f5e" : "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* timeline */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <p className="text-sm font-semibold text-white">Event Timeline</p>
          <p className="text-xs text-gray-600">Click any event to expand attempt history</p>
        </div>
        <div className="card-body">
          <WorkflowTimeline events={events} />
        </div>
      </div>
    </div>
  );
}
