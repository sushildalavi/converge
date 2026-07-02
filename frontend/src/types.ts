export type EventStatus =
  | "received"
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "retrying"
  | "dead_lettered"
  | "replayed"
  | "cancelled";

export interface EventAttemptOut {
  id: string;
  attempt_number: number;
  worker_name: string | null;
  status: string;
  error_message: string | null;
  metadata_json: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface EventOut {
  id: string;
  application_id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  idempotency_key: string;
  status: EventStatus;
  payload_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  duplicate: boolean;
  attempts: EventAttemptOut[];
}

export interface WorkflowSummaryOut {
  workflow_id: string;
  total_events: number;
  succeeded: number;
  failed: number;
  dead_lettered: number;
  in_flight: number;
  has_failures: boolean;
  last_updated_at: string | null;
}

export interface WorkflowTimelineEventOut {
  id: string;
  event_type: string;
  service_name: string;
  status: EventStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  attempts: EventAttemptOut[];
}

export interface WorkflowTimelineOut {
  workflow_id: string;
  events: WorkflowTimelineEventOut[];
}

export interface DeadLetterOut {
  id: string;
  event_id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  reason: string;
  last_error: string | null;
  created_at: string;
  replayed_at: string | null;
  replay_status: string | null;
}

export interface WorkerOut {
  id: string;
  worker_name: string;
  status: string;
  last_heartbeat_at: string;
  current_event_id: string | null;
  is_stale: boolean;
}

export interface MetricsOut {
  total_events: number;
  succeeded: number;
  failed: number;
  dead_lettered: number;
  retrying: number;
  queued: number;
  processing: number;
  replay_requeued: number;
  replay_success_rate: number;
  active_workers: number;
  stale_workers: number;
  processed_per_sec: number | null;
  retry_queue_depth: number;
  incoming_stream_depth: number;
  retry_stream_depth: number;
  incoming_pending: number;
  retry_pending: number;
  replay_latency_ms: number | null;
  event_attempt_failures: number;
  avg_attempt_duration_ms: number | null;
  p50_attempt_duration_ms: number | null;
  p95_attempt_duration_ms: number | null;
  acknowledged_events: number;
  pending_events: number;
  stream_backlog: number;
  retrying_events: number;
  dlq_events: number;
  orphaned_records: number;
  duplicate_deliveries: number;
  duplicate_side_effects: number;
  recent_failures: number;
  convergence_state: string;
  converged: boolean;
  worker_heartbeat_age_seconds: number | null;
}

export interface ConvergenceOut {
  total_events: number;
  processed_events: number;
  acknowledged_events: number;
  received_events: number;
  queued_events: number;
  processing_events: number;
  retrying_events: number;
  dead_lettered_events: number;
  pending_events: number;
  retry_queue_depth: number;
  retry_stream_depth: number;
  incoming_stream_depth: number;
  stream_backlog: number;
  dlq_events: number;
  orphaned_records: number;
  duplicate_deliveries: number;
  duplicate_side_effects: number;
  recent_failures: number;
  active_workers: number;
  stale_workers: number;
  worker_heartbeat_age_seconds: number | null;
  convergence_state: string;
  converged: boolean;
  convergence_issues: string[];
  verified_at: string;
}

export interface IncidentSummaryOut {
  id: string;
  workflow_id: string;
  summary_text: string;
  model_name: string | null;
  created_at: string;
}

export interface RecoveryTimelineEntry {
  event: string;
  impact: string;
}

export type RecoveryResult = "converged" | "degraded" | "failed" | "insufficient_evidence";

export interface RecoveryPostmortemOut {
  incident_summary: string;
  recovery_result: RecoveryResult;
  timeline: RecoveryTimelineEntry[];
  evidence: string[];
  risks: string[];
  recommended_actions: string[];
  confidence: number;
  resume_safe_summary: string;
}

export interface RecoveryPostmortemRequest {
  workflow_id?: string | null;
  artifact_paths?: string[];
  workflow_snapshot?: Record<string, unknown> | null;
  convergence_snapshot?: Record<string, unknown> | null;
  worker_snapshot?: Record<string, unknown> | null;
  provider?: string | null;
  model?: string | null;
  include_live_snapshot?: boolean;
}
