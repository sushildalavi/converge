"""ai agent ops storage

Revision ID: 2d6e5d4c5c91
Revises: 78e5781b3892
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "2d6e5d4c5c91"
down_revision: Union[str, None] = "78e5781b3892"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("agent_run_id", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("step_id", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("parent_step_id", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("tool_name", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("model_name", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("provider_name", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("prompt_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("system_prompt_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("input_tokens", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("output_tokens", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("retry_reason", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("trace_status", sa.String(length=32), nullable=True))
    op.add_column("events", sa.Column("evaluation_status", sa.String(length=32), nullable=True))
    op.add_column("events", sa.Column("replay_confidence", sa.Float(), nullable=True))
    op.add_column("events", sa.Column("original_output_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("replayed_output_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("tool_call_args_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("tool_call_result_hash", sa.String(length=128), nullable=True))
    op.add_column("events", sa.Column("structured_output_valid", sa.Boolean(), nullable=True))
    op.add_column("events", sa.Column("failure_category", sa.String(length=128), nullable=True))

    op.create_index(op.f("ix_events_agent_run_id"), "events", ["agent_run_id"], unique=False)
    op.create_index(op.f("ix_events_step_id"), "events", ["step_id"], unique=False)
    op.create_index(op.f("ix_events_parent_step_id"), "events", ["parent_step_id"], unique=False)
    op.create_index(op.f("ix_events_tool_name"), "events", ["tool_name"], unique=False)
    op.create_index(op.f("ix_events_prompt_hash"), "events", ["prompt_hash"], unique=False)
    op.create_index(op.f("ix_events_system_prompt_hash"), "events", ["system_prompt_hash"], unique=False)
    op.create_index(op.f("ix_events_trace_status"), "events", ["trace_status"], unique=False)
    op.create_index(op.f("ix_events_evaluation_status"), "events", ["evaluation_status"], unique=False)
    op.create_index(op.f("ix_events_failure_category"), "events", ["failure_category"], unique=False)

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.String(length=255), nullable=False),
        sa.Column("workflow_id", sa.String(length=255), nullable=False),
        sa.Column("run_kind", sa.String(length=64), nullable=False),
        sa.Column("provider_name", sa.String(length=128), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("prompt_hash", sa.String(length=128), nullable=True),
        sa.Column("system_prompt_hash", sa.String(length=128), nullable=True),
        sa.Column("trace_status", sa.String(length=32), nullable=False),
        sa.Column("evaluation_status", sa.String(length=32), nullable=False),
        sa.Column("replay_confidence", sa.Float(), nullable=False),
        sa.Column("failure_category", sa.String(length=128), nullable=True),
        sa.Column("original_output_hash", sa.String(length=128), nullable=True),
        sa.Column("replayed_output_hash", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_run_id"),
    )
    op.create_index(op.f("ix_agent_runs_agent_run_id"), "agent_runs", ["agent_run_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_workflow_id"), "agent_runs", ["workflow_id"], unique=False)

    op.create_table(
        "agent_steps",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=False),
        sa.Column("step_id", sa.String(length=255), nullable=False),
        sa.Column("parent_step_id", sa.String(length=255), nullable=True),
        sa.Column("tool_name", sa.String(length=255), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("provider_name", sa.String(length=128), nullable=True),
        sa.Column("prompt_hash", sa.String(length=128), nullable=True),
        sa.Column("system_prompt_hash", sa.String(length=128), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("retry_reason", sa.Text(), nullable=True),
        sa.Column("trace_status", sa.String(length=32), nullable=False),
        sa.Column("evaluation_status", sa.String(length=32), nullable=False),
        sa.Column("replay_confidence", sa.Float(), nullable=False),
        sa.Column("original_output_hash", sa.String(length=128), nullable=True),
        sa.Column("replayed_output_hash", sa.String(length=128), nullable=True),
        sa.Column("tool_call_args_hash", sa.String(length=128), nullable=True),
        sa.Column("tool_call_result_hash", sa.String(length=128), nullable=True),
        sa.Column("structured_output_valid", sa.Boolean(), nullable=False),
        sa.Column("failure_category", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_steps_agent_run_id"), "agent_steps", ["agent_run_id"], unique=False)
    op.create_index(op.f("ix_agent_steps_step_id"), "agent_steps", ["step_id"], unique=False)
    op.create_index(op.f("ix_agent_steps_parent_step_id"), "agent_steps", ["parent_step_id"], unique=False)
    op.create_index(op.f("ix_agent_steps_tool_name"), "agent_steps", ["tool_name"], unique=False)
    op.create_index(op.f("ix_agent_steps_failure_category"), "agent_steps", ["failure_category"], unique=False)

    op.create_table(
        "eval_results",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=False),
        sa.Column("evaluator_name", sa.String(length=128), nullable=False),
        sa.Column("evaluator_kind", sa.String(length=64), nullable=False),
        sa.Column("verdict", sa.String(length=32), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("details_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("compared_against", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_eval_results_agent_run_id"), "eval_results", ["agent_run_id"], unique=False)

    op.create_table(
        "trace_comparisons",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=False),
        sa.Column("original_run_id", sa.String(length=255), nullable=False),
        sa.Column("replayed_run_id", sa.String(length=255), nullable=False),
        sa.Column("tool_sequence_diff_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_hash_diff_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("evaluator_verdict_diff_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("replay_confidence", sa.Float(), nullable=False),
        sa.Column("failure_category_summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trace_comparisons_agent_run_id"), "trace_comparisons", ["agent_run_id"], unique=False)

    op.create_table(
        "event_outbox",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("destination", sa.String(length=64), nullable=False),
        sa.Column("stream_name", sa.String(length=255), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index(op.f("ix_event_outbox_event_id"), "event_outbox", ["event_id"], unique=False)
    op.create_index(op.f("ix_event_outbox_status"), "event_outbox", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_event_outbox_status"), table_name="event_outbox")
    op.drop_index(op.f("ix_event_outbox_event_id"), table_name="event_outbox")
    op.drop_table("event_outbox")
    op.drop_index(op.f("ix_trace_comparisons_agent_run_id"), table_name="trace_comparisons")
    op.drop_table("trace_comparisons")
    op.drop_index(op.f("ix_eval_results_agent_run_id"), table_name="eval_results")
    op.drop_table("eval_results")
    op.drop_index(op.f("ix_agent_steps_failure_category"), table_name="agent_steps")
    op.drop_index(op.f("ix_agent_steps_tool_name"), table_name="agent_steps")
    op.drop_index(op.f("ix_agent_steps_parent_step_id"), table_name="agent_steps")
    op.drop_index(op.f("ix_agent_steps_step_id"), table_name="agent_steps")
    op.drop_index(op.f("ix_agent_steps_agent_run_id"), table_name="agent_steps")
    op.drop_table("agent_steps")
    op.drop_index(op.f("ix_agent_runs_workflow_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_agent_run_id"), table_name="agent_runs")
    op.drop_table("agent_runs")

    op.drop_index(op.f("ix_events_failure_category"), table_name="events")
    op.drop_index(op.f("ix_events_evaluation_status"), table_name="events")
    op.drop_index(op.f("ix_events_trace_status"), table_name="events")
    op.drop_index(op.f("ix_events_system_prompt_hash"), table_name="events")
    op.drop_index(op.f("ix_events_prompt_hash"), table_name="events")
    op.drop_index(op.f("ix_events_tool_name"), table_name="events")
    op.drop_index(op.f("ix_events_parent_step_id"), table_name="events")
    op.drop_index(op.f("ix_events_step_id"), table_name="events")
    op.drop_index(op.f("ix_events_agent_run_id"), table_name="events")
    op.drop_column("events", "failure_category")
    op.drop_column("events", "structured_output_valid")
    op.drop_column("events", "tool_call_result_hash")
    op.drop_column("events", "tool_call_args_hash")
    op.drop_column("events", "replayed_output_hash")
    op.drop_column("events", "original_output_hash")
    op.drop_column("events", "replay_confidence")
    op.drop_column("events", "evaluation_status")
    op.drop_column("events", "trace_status")
    op.drop_column("events", "retry_reason")
    op.drop_column("events", "output_tokens")
    op.drop_column("events", "input_tokens")
    op.drop_column("events", "system_prompt_hash")
    op.drop_column("events", "prompt_hash")
    op.drop_column("events", "provider_name")
    op.drop_column("events", "model_name")
    op.drop_column("events", "tool_name")
    op.drop_column("events", "parent_step_id")
    op.drop_column("events", "step_id")
    op.drop_column("events", "agent_run_id")
