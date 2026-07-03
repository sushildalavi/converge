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
  agent_run_id: string | null;
  step_id: string | null;
  parent_step_id: string | null;
  tool_name: string | null;
  model_name: string | null;
  provider_name: string | null;
  prompt_hash: string | null;
  system_prompt_hash: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  retry_reason: string | null;
  trace_status: string | null;
  evaluation_status: string | null;
  replay_confidence: number | null;
  original_output_hash: string | null;
  replayed_output_hash: string | null;
  tool_call_args_hash: string | null;
  tool_call_result_hash: string | null;
  structured_output_valid: boolean | null;
  failure_category: string | null;
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

export interface AgentStepOut {
  id: string;
  agent_run_id: string;
  step_id: string;
  parent_step_id: string | null;
  tool_name: string | null;
  model_name: string | null;
  provider_name: string | null;
  prompt_hash: string | null;
  system_prompt_hash: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  retry_reason: string | null;
  trace_status: string;
  evaluation_status: string;
  replay_confidence: number;
  original_output_hash: string | null;
  replayed_output_hash: string | null;
  tool_call_args_hash: string | null;
  tool_call_result_hash: string | null;
  structured_output_valid: boolean;
  failure_category: string | null;
  created_at: string;
}

export interface EvalResultOut {
  id: string;
  agent_run_id: string;
  evaluator_name: string;
  evaluator_kind: string;
  verdict: string;
  score: number;
  details_json: Record<string, unknown>;
  compared_against: string | null;
  created_at: string;
}

export interface TraceComparisonOut {
  id: string;
  agent_run_id: string;
  original_run_id: string;
  replayed_run_id: string;
  tool_sequence_diff_json: Record<string, unknown>;
  output_hash_diff_json: Record<string, unknown>;
  evaluator_verdict_diff_json: Record<string, unknown>;
  replay_confidence: number;
  failure_category_summary_json: Record<string, unknown>;
  created_at: string;
}

export interface AgentRunOut {
  id: string;
  agent_run_id: string;
  workflow_id: string;
  run_kind: string;
  provider_name: string | null;
  model_name: string | null;
  prompt_hash: string | null;
  system_prompt_hash: string | null;
  trace_status: string;
  evaluation_status: string;
  replay_confidence: number;
  failure_category: string | null;
  original_output_hash: string | null;
  replayed_output_hash: string | null;
  created_at: string;
  updated_at: string;
  steps: AgentStepOut[];
  eval_results: EvalResultOut[];
  trace_comparisons: TraceComparisonOut[];
}

export interface AIProviderStatus {
  provider: string;
  mode: string;
  model?: string | null;
  source?: string | null;
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
