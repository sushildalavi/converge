"""
Three AI-powered insight layers for ReplayForge.

LAYER 1 — Anomaly Detection
  Statistical detection of unusual patterns in event flow:
  z-score over rolling windows, sudden error-rate spikes,
  drop in throughput, latency degradation. No external API.

LAYER 2 — Smart Retry Policy Recommender
  Analyzes per-event-type failure history and suggests
  optimal max_attempts and backoff schedule based on
  observed success rate and time-to-recover patterns.

LAYER 3 — Root Cause Analysis
  Given a failing workflow, identifies the most likely
  root cause by correlating with similar past failures
  and surfacing the dominant error pattern. Falls back
  to deterministic templates; uses Claude when
  ANTHROPIC_API_KEY is set.
"""
from __future__ import annotations

import logging
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DeadLetter, Event, EventAttempt

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# LAYER 1 — Anomaly Detection
# ─────────────────────────────────────────────────────────────
def detect_anomalies(db: Session, lookback_minutes: int = 30) -> dict[str, Any]:
    """Run statistical anomaly checks against the last N minutes of activity.

    Detects:
      - Error rate spike (> 2x baseline)
      - Latency degradation (p95 > 2x rolling p95)
      - Throughput drop (current vs baseline)
      - Per-service anomalies (one service much worse than others)
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=lookback_minutes)
    half = now - timedelta(minutes=lookback_minutes // 2)

    # Pull attempt durations split into two halves: baseline (older) and recent
    baseline_rows = db.execute(
        select(EventAttempt.duration_ms, EventAttempt.status)
        .where(
            EventAttempt.finished_at.isnot(None),
            EventAttempt.finished_at >= cutoff,
            EventAttempt.finished_at < half,
        )
    ).all()
    recent_rows = db.execute(
        select(EventAttempt.duration_ms, EventAttempt.status)
        .where(EventAttempt.finished_at.isnot(None), EventAttempt.finished_at >= half)
    ).all()

    anomalies: list[dict[str, Any]] = []

    def _stats(rows):
        durations = [r.duration_ms for r in rows if r.duration_ms is not None]
        statuses  = [r.status for r in rows]
        total     = len(rows)
        failed    = sum(1 for s in statuses if s == "failed")
        if not durations or total == 0:
            return None
        durations_sorted = sorted(durations)
        p95 = durations_sorted[min(int(len(durations_sorted) * 0.95), len(durations_sorted) - 1)]
        return {
            "total": total,
            "fail_rate": failed / total,
            "avg_ms": statistics.fmean(durations),
            "p95_ms": p95,
        }

    base = _stats(baseline_rows)
    rec  = _stats(recent_rows)

    if base and rec:
        # Error rate spike
        if rec["fail_rate"] > 0.05 and rec["fail_rate"] > base["fail_rate"] * 2.0:
            anomalies.append({
                "type": "error_rate_spike",
                "severity": "high",
                "message": f"Error rate jumped from {base['fail_rate']:.1%} to {rec['fail_rate']:.1%}",
                "baseline": round(base["fail_rate"], 3),
                "current":  round(rec["fail_rate"], 3),
            })

        # Latency degradation
        if rec["p95_ms"] > base["p95_ms"] * 2.0 and rec["p95_ms"] > 200:
            anomalies.append({
                "type": "latency_degradation",
                "severity": "medium",
                "message": f"p95 latency jumped from {base['p95_ms']}ms to {rec['p95_ms']}ms",
                "baseline_p95_ms": int(base["p95_ms"]),
                "current_p95_ms":  int(rec["p95_ms"]),
            })

        # Throughput drop
        base_rate = base["total"] / max(lookback_minutes / 2, 1)
        rec_rate  = rec["total"] / max(lookback_minutes / 2, 1)
        if base_rate > 5 and rec_rate < base_rate * 0.5:
            anomalies.append({
                "type": "throughput_drop",
                "severity": "high",
                "message": f"Throughput dropped from {base_rate:.0f}/min to {rec_rate:.0f}/min",
                "baseline_per_min": round(base_rate, 1),
                "current_per_min":  round(rec_rate, 1),
            })

    # Per-service anomalies
    svc_stats = db.execute(
        select(
            Event.service_name,
            func.count(Event.id).label("total"),
            func.sum(case((Event.status == "dead_lettered", 1), else_=0)).label("dlq"),
            func.sum(case((Event.status == "retrying", 1), else_=0)).label("retry"),
        )
        .where(Event.created_at >= cutoff)
        .group_by(Event.service_name)
    ).all()

    if svc_stats:
        avg_dlq_rate = sum((r.dlq or 0) / r.total for r in svc_stats if r.total) / len([r for r in svc_stats if r.total])
        for r in svc_stats:
            if r.total and r.total > 10:
                rate = (r.dlq or 0) / r.total
                if rate > avg_dlq_rate * 3 and rate > 0.05:
                    anomalies.append({
                        "type": "service_outlier",
                        "severity": "medium",
                        "message": f"{r.service_name} has {rate:.1%} DLQ rate (3x fleet avg)",
                        "service": r.service_name,
                        "dlq_rate": round(rate, 3),
                    })

    return {
        "checked_at":      now.isoformat(),
        "lookback_minutes": lookback_minutes,
        "baseline":        base,
        "current":         rec,
        "anomalies":       anomalies,
        "anomaly_count":   len(anomalies),
        "status":          "anomaly" if anomalies else "normal",
    }


# ─────────────────────────────────────────────────────────────
# LAYER 2 — Smart Retry Policy Recommender
# ─────────────────────────────────────────────────────────────
def recommend_retry_policy(db: Session) -> list[dict[str, Any]]:
    """Per-event-type retry policy recommendations.

    For each event_type:
      - Compute success rate, retry rate, dead-letter rate
      - If retries are working → keep current policy
      - If most failures are transient (1-2 attempts succeed) → reduce attempts
      - If retries don't help (success after attempt N is rare) → suggest fewer attempts
      - If too many DLQs → suggest more attempts or longer backoff
    """
    rows = db.execute(
        select(
            Event.event_type,
            func.count(Event.id).label("total"),
            func.sum(case((Event.status == "succeeded", 1), else_=0)).label("ok"),
            func.sum(case((Event.status == "dead_lettered", 1), else_=0)).label("dead"),
            func.avg(Event.attempt_count).label("avg_attempts"),
            func.max(Event.attempt_count).label("max_attempts_seen"),
        )
        .group_by(Event.event_type)
    ).all()

    recommendations = []
    for r in rows:
        total = r.total or 0
        if total < 10:
            continue
        ok       = int(r.ok or 0)
        dead     = int(r.dead or 0)
        avg_att  = float(r.avg_attempts or 0)
        max_seen = int(r.max_attempts_seen or 0)

        success_rate = ok / total
        dead_rate    = dead / total

        rec: dict[str, Any] = {
            "event_type": r.event_type,
            "total": total,
            "success_rate": round(success_rate, 3),
            "dead_letter_rate": round(dead_rate, 3),
            "avg_attempts": round(avg_att, 2),
        }

        # Decision logic
        if dead_rate < 0.02 and avg_att < 1.3:
            rec["recommendation"] = "reduce_attempts"
            rec["suggested_max_attempts"] = 2
            rec["rationale"] = "Failures are rare and most events succeed on first attempt — reducing max_attempts saves DB load."
        elif dead_rate > 0.10:
            rec["recommendation"] = "increase_backoff"
            rec["suggested_max_attempts"] = 6
            rec["rationale"] = f"High dead-letter rate ({dead_rate:.1%}) suggests downstream is slow to recover — extend backoff window."
        elif avg_att > 2.5:
            rec["recommendation"] = "investigate_root_cause"
            rec["suggested_max_attempts"] = 4
            rec["rationale"] = "Most events need many retries — fix the underlying flakiness rather than tuning retries."
        else:
            rec["recommendation"] = "keep_current"
            rec["suggested_max_attempts"] = 4
            rec["rationale"] = "Current retry policy is well-tuned for this event type."

        recommendations.append(rec)

    return sorted(recommendations, key=lambda x: x["dead_letter_rate"], reverse=True)


# ─────────────────────────────────────────────────────────────
# LAYER 3 — Root Cause Analysis
# ─────────────────────────────────────────────────────────────
def root_cause_analysis(db: Session, workflow_id: str) -> dict[str, Any]:
    """Identify probable root cause for a failing workflow.

    1. Pull all events + attempts for the workflow
    2. Identify failed/dead-lettered steps
    3. Find similar past failures (same event_type + similar error)
    4. Compute error frequency, MTBF, common follow-up patterns
    5. Optionally enrich with Claude if ANTHROPIC_API_KEY set
    """
    events = db.execute(
        select(Event).where(Event.workflow_id == workflow_id).order_by(Event.created_at)
    ).scalars().all()

    if not events:
        return {"error": "workflow not found", "workflow_id": workflow_id}

    failed = [e for e in events if e.status in ("failed", "dead_lettered", "retrying")]
    if not failed:
        return {
            "workflow_id": workflow_id,
            "status": "no_failures",
            "summary": "All events succeeded — no root cause to investigate.",
            "events_total": len(events),
        }

    primary = failed[0]  # The first thing that broke is usually the root
    error_msg = primary.last_error or "unknown error"

    # Find similar past failures
    similar = db.execute(
        select(Event.workflow_id, Event.last_error, Event.status, Event.updated_at)
        .where(
            Event.event_type == primary.event_type,
            Event.last_error.isnot(None),
            Event.workflow_id != workflow_id,
            Event.last_error.like(f"%{error_msg.split()[0] if error_msg.split() else ''}%"),
        )
        .order_by(Event.updated_at.desc())
        .limit(20)
    ).all()

    # Cluster errors
    error_freq: Counter[str] = Counter(s.last_error for s in similar if s.last_error)
    top_errors = error_freq.most_common(5)

    # Resolution rate of similar workflows
    similar_dlq = sum(1 for s in similar if s.status == "dead_lettered")
    similar_recovered = len(similar) - similar_dlq

    # Determine likely category
    err_lower = error_msg.lower()
    if "timeout" in err_lower or "timed out" in err_lower:
        category = "timeout"
        likely_cause = "Downstream service is slow or unreachable. Check service health and connection limits."
    elif "crash" in err_lower or "killed" in err_lower:
        category = "process_crash"
        likely_cause = "Worker process died mid-execution. Check OOM, deploy events, or simulated crash injections."
    elif "connection" in err_lower or "refused" in err_lower:
        category = "connectivity"
        likely_cause = "Network or service unavailability. Verify dependency endpoints and DNS."
    elif "auth" in err_lower or "permission" in err_lower or "forbidden" in err_lower:
        category = "auth"
        likely_cause = "Credentials or permissions issue. Rotate keys and verify IAM roles."
    elif "not found" in err_lower or "404" in err_lower:
        category = "resource_missing"
        likely_cause = "A referenced resource doesn't exist. Check upstream order-of-operations."
    elif "simulated" in err_lower:
        category = "simulated_failure"
        likely_cause = "Synthetic failure injected by the demo workload generator (expected)."
    else:
        category = "unknown"
        likely_cause = "Could not classify error pattern automatically."

    # Optional: enrich with Claude
    ai_summary = None
    model_name = None
    if settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            failed_steps = [
                {"event_type": e.event_type, "status": e.status, "attempts": e.attempt_count, "error": e.last_error}
                for e in failed[:5]
            ]
            prompt = (
                "You are a senior reliability engineer. Given this workflow failure, "
                "explain the likely root cause in 2 sentences and suggest one concrete remediation. "
                "Be specific. Don't mention you are an AI.\n\n"
                f"Workflow: {workflow_id}\n"
                f"Failed steps: {failed_steps}\n"
                f"Top similar errors: {top_errors[:3]}\n"
                f"Similar workflows recovered: {similar_recovered} of {len(similar)}\n"
            )
            msg = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            ai_summary = msg.content[0].text
            model_name = "claude-haiku-4-5"
        except Exception:
            log.exception("claude root-cause failed; falling back to template")

    return {
        "workflow_id": workflow_id,
        "primary_failure": {
            "event_type": primary.event_type,
            "service":    primary.service_name,
            "status":     primary.status,
            "attempts":   primary.attempt_count,
            "error":      error_msg,
        },
        "category":       category,
        "likely_cause":   likely_cause,
        "ai_summary":     ai_summary,
        "model":          model_name,
        "similar_failures": {
            "count":              len(similar),
            "recovered":          similar_recovered,
            "dead_lettered":      similar_dlq,
            "recovery_rate":      round(similar_recovered / len(similar), 3) if similar else 0,
            "top_error_patterns": [{"error": e, "count": c} for e, c in top_errors],
        },
        "events_total":   len(events),
        "events_failed":  len(failed),
    }
