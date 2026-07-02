export type MeasuredArtifact = {
  id: string;
  title: string;
  kind: "benchmark" | "chaos";
  source: string;
  submitted: number;
  converged: boolean;
  dead_letters: number;
  recovery_time_seconds: number;
  ingest_throughput_events_per_sec: number;
  end_to_end_throughput_events_per_sec: number;
  p50_e2e_ms: number;
  p95_e2e_ms: number;
  stream_backlog?: number;
  pending_after_recovery?: number;
  note: string;
};

export const measuredArtifacts: MeasuredArtifact[] = [
  {
    id: "replay-1000",
    title: "1000-event replay validation",
    kind: "benchmark",
    source: "benchmarks/benchmark_replay_20260701T225501Z.json",
    submitted: 1000,
    converged: true,
    dead_letters: 0,
    recovery_time_seconds: 612.29,
    ingest_throughput_events_per_sec: 83.08,
    end_to_end_throughput_events_per_sec: 1.63,
    p50_e2e_ms: 9987.74,
    p95_e2e_ms: 16354.59,
    stream_backlog: 4098,
    note: "Latest checked-in replay benchmark; converged with zero DLQ and zero pending entries.",
  },
  {
    id: "chaos-100",
    title: "100-event chaos interruption",
    kind: "chaos",
    source: "benchmarks/chaos_replay_20260701T230628Z.json",
    submitted: 100,
    converged: true,
    dead_letters: 0,
    recovery_time_seconds: 5.29,
    ingest_throughput_events_per_sec: 74.3,
    end_to_end_throughput_events_per_sec: 18.9,
    p50_e2e_ms: 4246.15,
    p95_e2e_ms: 5106.81,
    pending_after_recovery: 0,
    note: "Worker interruption replay artifact; converged after recovery with no pending entries.",
  },
];

export const lifecycleSteps = [
  "Event ingest",
  "Redis Streams",
  "Go worker",
  "PostgreSQL claim",
  "Process",
  "Ack",
  "Retry / DLQ",
  "Replay",
  "Convergence check",
];

export const productProblems = [
  "Async jobs fail mid-processing and need a deterministic replay path.",
  "Retries can create duplicates if the worker dies between claim and ack.",
  "Pending entries in Redis Streams can stall forever without operator visibility.",
  "Dead letters need a safe replay flow and proof that the system converged.",
  "Operators need evidence, not guesses, before resuming traffic.",
];

export const featureCards = [
  {
    title: "Crash-safe replay",
    description: "Requeue failed work without pretending the side effect already happened.",
  },
  {
    title: "Database-before-ack recovery",
    description: "Persist the claim first, then ack the stream message after the outcome is known.",
  },
  {
    title: "Retry stream handling",
    description: "Track pending entries and delayed retries so operators can see what is stuck.",
  },
  {
    title: "DLQ replay",
    description: "Recover poison messages with a traceable operator action instead of ad hoc scripts.",
  },
  {
    title: "Worker heartbeat",
    description: "Surface stale workers before they turn into invisible recovery gaps.",
  },
  {
    title: "Convergence verification",
    description: "Make the final recovery state explicit: converged, degraded, failed, or insufficient evidence.",
  },
  {
    title: "Benchmark / chaos harnesses",
    description: "Measure the system with honest artifact-backed runs instead of synthetic promises.",
  },
];

export const architectureNodes = [
  "FastAPI control plane",
  "Redis Streams",
  "Go workers",
  "PostgreSQL",
  "React console",
  "Docker Compose",
];

export const appRoutes = [
  { to: "/app", label: "Recovery Console", description: "Live metrics and recovery summary" },
  { to: "/app/workers", label: "Worker Health", description: "Heartbeats and stale workers" },
  { to: "/app/streams", label: "Stream Backlog", description: "Pending entries and retry state" },
  { to: "/app/replay", label: "Replay / DLQ", description: "Dead letters and replay actions" },
  { to: "/app/convergence", label: "Convergence", description: "Proof that the system drained" },
  { to: "/app/chaos", label: "Chaos Results", description: "Measured benchmark and chaos artifacts" },
];

export const demoFlow = [
  { label: "Worker interrupted", value: "f2b2b0…9160" },
  { label: "Pending entry recovered", value: "0 pending after recovery" },
  { label: "Retry count", value: "0" },
  { label: "DLQ count", value: "0" },
  { label: "Convergence", value: "true" },
  { label: "Recovery time", value: "5.29s" },
  { label: "Throughput", value: "18.9 events/sec" },
];

export const heroStats = [
  {
    label: "Latest replay",
    value: "1000 events",
    detail: "Zero DLQ, zero pending, converged",
  },
  {
    label: "Latest chaos",
    value: "100 events",
    detail: "Worker interruption, converged after recovery",
  },
  {
    label: "Replay throughput",
    value: "1.63 events/sec",
    detail: "End-to-end on the latest replay artifact",
  },
  {
    label: "Chaos recovery",
    value: "5.29s",
    detail: "Measured in the latest chaos artifact",
  },
];

export const formatSeconds = (value: number) => `${value.toFixed(value < 10 ? 2 : 2)}s`;
export const formatRate = (value: number) => `${value.toFixed(2)} events/sec`;
export const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;
