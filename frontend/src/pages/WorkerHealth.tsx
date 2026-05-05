import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Server, Zap } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { FadeIn, Stagger, StaggerItem, Skeleton } from "../components/Animated";
import type { WorkerOut } from "../types";

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
};

const hbAge = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const STATUSES: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  active:  { label: "active",  color: "#34d399", bg: "rgba(16,185,129,0.09)",  border: "rgba(16,185,129,0.2)"  },
  busy:    { label: "busy",    color: "#fbbf24", bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.2)"  },
  stale:   { label: "stale",   color: "#fb923c", bg: "rgba(249,115,22,0.09)",  border: "rgba(249,115,22,0.2)"  },
  stopped: { label: "stopped", color: "#475569", bg: "rgba(71,85,105,0.09)",   border: "rgba(71,85,105,0.2)"   },
  crashed: { label: "crashed", color: "#f87171", bg: "rgba(239,68,68,0.09)",   border: "rgba(239,68,68,0.2)"   },
};

/* ── worker card ─────────────────────────────────────────── */
function WorkerCard({ w, i }: { w: WorkerOut; i: number }) {
  const effective = w.is_stale ? "stale" : w.status;
  const cfg       = STATUSES[effective] ?? STATUSES.stopped;
  const age       = hbAge(w.last_heartbeat_at);
  const isLive    = !w.is_stale && w.status === "active";

  return (
    <motion.div
      className="card overflow-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.07, duration: 0.3, ease: EASE }}
      /* animation #17: card hover lift */
      whileHover={{ y: -3, borderColor: cfg.border }}
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      {/* top accent line */}
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.color}70, transparent)`,
        }}
      />

      <div className="p-4">
        {/* header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            {/* animation #8: live pulse for active workers */}
            {isLive ? (
              <span className="live-ring">
                <span
                  className="live-ring-dot"
                  style={{ background: cfg.color }}
                />
              </span>
            ) : (
              <span
                className="rounded-full"
                style={{ width: 7, height: 7, background: cfg.color, display: "inline-block" }}
              />
            )}
            <span
              className="mono font-semibold text-white"
              style={{ fontSize: 13, letterSpacing: "-0.01em" }}
            >
              {w.worker_name}
            </span>
          </div>
          <span
            className="badge"
            style={{
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* heartbeat bar — animation #19: worker heartbeat oscillation */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[10px] uppercase tracking-[0.06em]"
              style={{ color: "#334155" }}
            >
              Heartbeat
            </span>
            <span
              className="mono text-[11px]"
              style={{ color: age > 30 ? "#fb923c" : "#475569" }}
            >
              {ago(w.last_heartbeat_at)}
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 4, background: "rgba(255,255,255,0.04)" }}
          >
            <motion.div
              className="h-full rounded-full"
              /* animation #19: oscillating heartbeat bar for live workers */
              animate={
                isLive
                  ? { scaleX: [1, 0.2, 1], opacity: [1, 0.5, 1] }
                  : { scaleX: Math.max(0.04, 1 - age / 60) }
              }
              transition={
                isLive
                  ? {
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
                  : { duration: 0.6 }
              }
              style={
                {
                  transformOrigin: "left",
                  background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}80)`,
                } as React.CSSProperties
              }
            />
          </div>
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="card-inset px-3 py-2">
            <p className="text-[10px]" style={{ color: "#334155" }}>Status</p>
            <p
              className="mono text-[12px] font-semibold"
              style={{ color: cfg.color }}
            >
              {effective}
            </p>
          </div>
          <div className="card-inset px-3 py-2">
            <p className="text-[10px]" style={{ color: "#334155" }}>Processing</p>
            <p
              className="mono text-[12px] font-semibold"
              style={{ color: "#e2e8f0" }}
            >
              {w.current_event_id
                ? `${w.current_event_id.slice(0, 10)}…`
                : "—"}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── page ────────────────────────────────────────────────── */
export default function WorkerHealth() {
  const loader = useCallback(() => api.listWorkers(), []);
  const { data, loading } = usePolling(loader, 4000);

  const active  = (data ?? []).filter((w) => !w.is_stale && w.status === "active").length;
  const stale   = (data ?? []).filter((w) => w.is_stale).length;
  const crashed = (data ?? []).filter((w) => w.status === "crashed").length;
  const total   = (data ?? []).length;
  const healthPct = total > 0 ? Math.round((active / total) * 100) : 0;
  const arcColor  = healthPct > 80 ? "#10b981" : healthPct > 50 ? "#f97316" : "#f43f5e";
  const circumference = 2 * Math.PI * 22;

  return (
    <div className="page-wrap space-y-5">

      {/* page header */}
      <FadeIn>
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-white flex items-center gap-2"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              <Server size={16} style={{ color: "#818cf8" }} />
              Workers
            </h1>
            <p className="text-[12px] mt-1" style={{ color: "#334155" }}>
              Heartbeat monitor · stale threshold 30s · polling every 4s
            </p>
          </div>
        </div>
      </FadeIn>

      {/* fleet summary — animation #2: stagger */}
      {data && data.length > 0 && (
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* arc card — animation #14: SVG arc */}
          <StaggerItem>
            <div className="card p-4 flex items-center gap-4 h-full">
              <div
                className="relative shrink-0"
                style={{ width: 56, height: 56 }}
              >
                <svg
                  viewBox="0 0 56 56"
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                >
                  <circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="7"
                  />
                  <motion.circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    strokeLinecap="round"
                    stroke={arcColor}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - healthPct / 100) }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 4px ${arcColor}60)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="mono font-bold text-white"
                    style={{ fontSize: 11 }}
                  >
                    {healthPct}%
                  </span>
                </div>
              </div>
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "#475569" }}
                >
                  Fleet Health
                </p>
                <p
                  className="mono font-bold text-white"
                  style={{ fontSize: 20, letterSpacing: "-0.02em" }}
                >
                  {active}
                  <span
                    style={{ fontSize: 13, color: "#334155", fontWeight: 400 }}
                  >
                    /{total}
                  </span>
                </p>
              </div>
            </div>
          </StaggerItem>

          {[
            { label: "Active",  value: active,  color: "#34d399", icon: Activity },
            { label: "Stale",   value: stale,   color: stale > 0   ? "#fb923c" : "#1e2d3d", icon: Clock },
            { label: "Crashed", value: crashed, color: crashed > 0 ? "#f87171" : "#1e2d3d", icon: Zap   },
          ].map(({ label, value, color, icon: Icon }) => (
            <StaggerItem key={label}>
              <div className="card p-4 flex items-center gap-3 h-full">
                <Icon size={15} style={{ color, flexShrink: 0 }} strokeWidth={1.75} />
                <div>
                  <p
                    className="text-[10px] uppercase tracking-[0.06em]"
                    style={{ color: "#475569" }}
                  >
                    {label}
                  </p>
                  <p
                    className="mono font-bold"
                    style={{
                      color,
                      fontSize: 22,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {value}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* worker cards grid */}
      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <FadeIn className="card p-16 text-center">
          <Server size={32} className="mx-auto mb-2" style={{ color: "#1e2d3d" }} />
          <p className="text-[13px]" style={{ color: "#334155" }}>
            No workers registered
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#1e2d3d" }}>
            Start the worker service to see activity
          </p>
        </FadeIn>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data!.map((w, i) => (
            <WorkerCard key={w.id} w={w} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}
