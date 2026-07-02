import axios from "axios";
import type {
  AIProviderStatus,
  AgentRunOut,
  EvalResultOut,
  TraceComparisonOut,
  ConvergenceOut, DeadLetterOut, EventOut, IncidentSummaryOut,
  RecoveryPostmortemOut, RecoveryPostmortemRequest,
  MetricsOut, WorkerOut, WorkflowSummaryOut, WorkflowTimelineOut,
} from "../types";

const http = axios.create({
  baseURL: "",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});


export type ServiceBreakdown = { service:string; total:number; succeeded:number; failed:number; retrying:number; success_rate:number; avg_duration_ms:number|null };
export type TopError = { error:string; event_type:string; count:number };
export type LatencyHistogram = { bins:string[]; counts:number[]; total:number };
export type EventTypeStats = { event_type:string; total:number; succeeded:number; dead_lettered:number; retrying:number; avg_attempts:number };
export type ThroughputPoint = { minute:string|null; count:number; succeeded:number; failed:number };

export type RecentEvent = {
  id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  updated_at: string | null;
};

export const api = {
  getMetrics: () => http.get<MetricsOut>("/api/metrics").then(r => r.data),
  getConvergence: () => http.get<ConvergenceOut>("/api/convergence").then(r => r.data),
  listWorkflows: (limit = 50) => http.get<WorkflowSummaryOut[]>("/api/workflows", { params: { limit } }).then(r => r.data),
  getWorkflowTimeline: (id: string) => http.get<WorkflowTimelineOut>(`/api/workflows/${id}/timeline`).then(r => r.data),
  listDeadLetters: (limit = 100) => http.get<DeadLetterOut[]>("/api/deadletters", { params: { limit } }).then(r => r.data),
  replayDeadLetter: (id: string) => http.post<EventOut>(`/api/deadletters/${id}/replay`).then(r => r.data),
  listWorkers: () => http.get<WorkerOut[]>("/api/workers").then(r => r.data),
  summarizeIncident: (wfId: string) => http.post<IncidentSummaryOut>(`/api/incidents/${wfId}/summarize`).then(r => r.data),
  generateRecoveryPostmortem: (body: RecoveryPostmortemRequest = {}) => http.post<RecoveryPostmortemOut>("/api/ai/recovery-postmortem", body).then(r => r.data),
  generateWorkload: (count = 30) => http.post<{ workflows: number; events_sent: number; errors: number }>("/api/demo/generate-workload", null, { params: { count } }).then(r => r.data),
  generateAIWorkload: (count = 3) => http.post<{ agent_runs: number; steps: number; events: number; eval_results: number; trace_comparisons: number }>("/api/demo/generate-ai-workload", null, { params: { count } }).then(r => r.data),
  recentEvents: (limit = 40) => http.get<RecentEvent[]>("/api/events/recent", { params: { limit } }).then(r => r.data),
  servicesBreakdown: () => http.get<ServiceBreakdown[]>("/api/insights/services").then(r => r.data),
  topErrors: (limit = 10) => http.get<TopError[]>("/api/insights/errors", { params: { limit } }).then(r => r.data),
  latencyHistogram: () => http.get<LatencyHistogram>("/api/insights/latency-histogram").then(r => r.data),
  eventTypeStats: () => http.get<EventTypeStats[]>("/api/insights/event-types").then(r => r.data),
  throughputPerMinute: (minutes = 30) => http.get<ThroughputPoint[]>("/api/insights/throughput", { params: { minutes } }).then(r => r.data),
  agentRuns: (limit = 30) => http.get<AgentRunOut[]>("/api/ai/agent-runs", { params: { limit } }).then(r => r.data),
  agentRun: (agentRunId: string) => http.get<AgentRunOut>(`/api/ai/agent-runs/${agentRunId}`).then(r => r.data),
  evalResults: (agentRunId?: string) => http.get<EvalResultOut[]>("/api/ai/evals", { params: agentRunId ? { agent_run_id: agentRunId } : {} }).then(r => r.data),
  traceComparison: (agentRunId: string) => http.get<TraceComparisonOut>(`/api/ai/traces/compare/${agentRunId}`).then(r => r.data),
  providerStatus: () => http.get<AIProviderStatus>("/api/ai/providers/status").then(r => r.data),

};
