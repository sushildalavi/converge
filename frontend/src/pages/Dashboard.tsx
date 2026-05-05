import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, ArrowUpRight, CheckCircle2, Clock,
  Play, RefreshCw, Server, Skull, TrendingUp, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { LiveFeed } from "../components/LiveFeed";
import { AnimatedNumber, Skeleton, AppearOnScroll, SpotlightCard } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

/* ── helpers ─────────────────────────────────────────────── */
const fmtMs = (v: number | null) =>
  v == null ? "–" : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`;
const pct = (n: number, d: number) =>
  d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`;
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const TT = {
  contentStyle: {
    background: "#0c1220",
    border: "1px solid rgba(255,255,255,.09)",
    borderRadius: 8,
    fontSize: 12,
    padding: "9px 13px",
    boxShadow: "0 16px 40px rgba(0,0,0,.7)",
  },
  labelStyle: { color: "#475569", fontSize: 11, marginBottom: 3 },
  itemStyle:  { color: "#e2e8f0" },
  cursor:     { stroke: "rgba(255,255,255,.04)" },
};

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

type RateSnap = { t: string; processed: number; dead: number; retrying: number };
type Snap     = { t: string; succeeded: number; dead: number; retrying: number };

const STATUS_META = [
  { key: "succeeded",    label: "Succeeded",     color: "#10b981" },
  { key: "queued",       label: "Queued",         color: "#6366f1" },
  { key: "processing",   label: "Processing",     color: "#eab308" },
  { key: "retrying",     label: "Retrying",       color: "#f97316" },
  { key: "dead_lettered",label: "Dead-lettered",  color: "#f43f5e" },
] as const;

type GenState = "idle" | "loading" | "success";

/* ── component ───────────────────────────────────────────── */
export default function Dashboard() {
  const mLoad = useCallback(() => api.getMetrics(), []);
  const wLoad = useCallback(() => api.listWorkflows(40), []);
  const { data: m, error: mErr, refresh: refM } = usePolling(mLoad, 4000);
  const { data: wf, error: wErr, refresh: refWf } = usePolling(wLoad, 5000);

  const [genState, setGenState] = useState<GenState>("idle");
  const hist     = useRef<Snap[]>([]);
  const rateHist = useRef<RateSnap[]>([]);
  const sparks   = useRef<Record<string, number[]>>({ total: [], ok: [], dead: [] });
  const mounted  = useRef(true);

  // accumulate history
  if (m) {
    const t = new Date().toLocaleTimeString("en", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const last = hist.current[hist.current.length - 1];
    if (!last || last.t !== t) {
      const snap: Snap = { t, succeeded: m.succeeded, dead: m.dead_lettered, retrying: m.retrying };
      if (last) {
        rateHist.current = [
          ...rateHist.current.slice(-34),
          {
            t,
            processed: Math.max(0, snap.succeeded - last.succeeded),
            dead:      Math.max(0, snap.dead - last.dead),
            retrying:  snap.retrying,
          },
        ];
      } else {
        rateHist.current = [{ t, processed: 0, dead: 0, retrying: m.retrying }];
      }
      hist.current = [...hist.current.slice(-34), snap];
      sparks.current.total = [...(sparks.current.total ?? []).slice(-9), m.total_events];
      sparks.current.ok    = [...(sparks.current.ok   ?? []).slice(-9), m.succeeded];
      sparks.current.dead  = [...(sparks.current.dead ?? []).slice(-9), m.dead_lettered];
    }
  }

  const throughput = (() => {
    if (hist.current.length < 4) return null;
    const slice = hist.current.slice(-6);
    const delta = slice[slice.length - 1].succeeded - slice[0].succeeded;
    const secs  = (slice.length - 1) * 4;
    return secs > 0 ? Math.round((delta / secs) * 60) : null;
  })();

  /* animation #25: generate button state machine */
  const generate = async () => {
    if (genState !== "idle") return;
    setGenState("loading");
    try {
      const r = await api.generateWorkload(30);
      setGenState("success");
      toast.success("Workload generated", { description: `${r.events_sent} events queued` });
      setTimeout(() => { refM(); refWf(); }, 800);
      setTimeout(() => setGenState("idle"), 2000);
    } catch {
      toast.error("Generation failed");
      setGenState("idle");
    }
  };

  /* animation #13: status bar fill widths */
  const statusBars = m
    ? STATUS_META.map((s) => ({
        ...s,
        value: m[s.key as keyof typeof m] as number ?? 0,
        pct: m.total_events > 0
          ? ((m[s.key as keyof typeof m] as number ?? 0) / m.total_events) * 100
          : 0,
      }))
    : [];

  return (
    <div className="page-wrap">

      {/* ── page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#fff",
              letterSpacing: "-.02em",
              lineHeight: 1.2,
            }}
          >
            Overview
          </h1>
          <div
            className="flex items-center gap-3 mt-1.5 mono"
            style={{ fontSize: 11, color: "#334155" }}
          >
            {m ? (
              <>
                <span>
                  <span style={{ color: "#e2e8f0" }}>
                    {/* animation #23: animated number in header */}
                    <AnimatedNumber value={m.total_events} />
                  </span>
                  {" "}total events
                </span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span>
                  <span style={{ color: "#34d399" }}>{pct(m.succeeded, m.total_events)}</span>
                  {" "}success
                </span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span>
                  <span style={{ color: "#fb7185" }}>{pct(m.dead_lettered, m.total_events)}</span>
                  {" "}error
                </span>
                {throughput != null && (
                  <>
                    <span style={{ color: "#1e293b" }}>·</span>
                    <span>
                      <span style={{ color: "#818cf8" }}>{throughput}/min</span>
                      {" "}throughput
                    </span>
                  </>
                )}
              </>
            ) : (
              <Skeleton className="h-3 w-60" />
            )}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-2">
          <motion.button
            className="btn-icon"
            onClick={() => { refM(); refWf(); }}
            title="Refresh"
            whileTap={{ scale: 0.92 }}
          >
            <RefreshCw size={13} />
          </motion.button>

          {/* animation #25: generate button state machine */}
          <motion.button
            className="btn-primary"
            onClick={generate}
            disabled={genState !== "idle"}
            whileHover={{ boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}
            /* animation #16: whileTap */
            whileTap={{ scale: 0.95 }}
            animate={
              genState === "success"
                ? { backgroundColor: ["#4f46e5", "#10b981", "#10b981", "#4f46e5"] }
                : {}
            }
            transition={
              genState === "success"
                ? { duration: 1.2, times: [0, 0.15, 0.85, 1] }
                : {}
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {genState === "idle" && (
                <motion.span
                  key="idle"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <Play size={12} /> Generate Workload
                </motion.span>
              )}
              {genState === "loading" && (
                <motion.span
                  key="loading"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <RefreshCw size={12} className="animate-spin" /> Generating…
                </motion.span>
              )}
              {genState === "success" && (
                <motion.span
                  key="success"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <CheckCircle2 size={12} /> Done!
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* ── KPI cards bento row — animation #2: stagger ──── */}
      <motion.div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.055 } } }}
      >
        {/* hero card — featured with gradient border (animations #5, #6) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } } }}
        >
          <SpotlightCard className="h-full">
            <MetricCard
              label="Total Events"
              value={m?.total_events ?? null}
              icon={Activity}
              accent="indigo"
              sparkData={sparks.current.total}
              sub="all time"
              featured
            />
          </SpotlightCard>
        </motion.div>

        {[
          {
            label: "Succeeded",
            value: m?.succeeded ?? null,
            icon: CheckCircle2,
            accent: "emerald" as const,
            sparkData: sparks.current.ok,
            trend: m ? pct(m.succeeded, m.total_events) : undefined,
            trendUp: true,
          },
          {
            label: "Dead-lettered",
            value: m?.dead_lettered ?? null,
            icon: Skull,
            accent: "rose" as const,
            sparkData: sparks.current.dead,
            sub: "exhausted retries",
          },
          {
            label: "Active Workers",
            value: m?.active_workers ?? null,
            icon: Server,
            accent: (m?.stale_workers ? "orange" : "emerald") as "orange" | "emerald",
            sub: m?.stale_workers ? `${m.stale_workers} stale` : "all healthy",
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
            }}
          >
            <MetricCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* second row of KPI cards */}
      <motion.div
        className="grid grid-cols-4 gap-3 mb-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.055, delayChildren: 0.2 } } }}
      >
        {[
          { label: "Retrying",      value: m?.retrying ?? null,      icon: RefreshCw,  accent: "orange" as const, sub: "in backoff" },
          { label: "Replay Success", value: m ? `${(m.replay_success_rate * 100).toFixed(0)}%` : null, icon: TrendingUp, accent: "purple" as const, sub: m ? `${m.replay_requeued} total` : undefined },
          { label: "p50 Latency",   value: m ? fmtMs(m.p50_attempt_duration_ms) : null, icon: Clock, accent: "sky" as const, sub: "median attempt" },
          { label: "p95 Latency",   value: m ? fmtMs(m.p95_attempt_duration_ms) : null, icon: Zap,   accent: "amber" as const, sub: "95th percentile" },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
            }}
          >
            <MetricCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── charts + live feed ───────────────────────────── */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "3fr 2fr" }}>

        {/* area chart — animation #12: entrance */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.28, ease: EASE }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <div>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                Event Throughput
              </p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                Rolling window · updates every 4s
              </p>
            </div>
            <div
              className="flex items-center gap-4 mono"
              style={{ fontSize: 10, color: "#334155" }}
            >
              {[["Succeeded","#10b981"],["Dead","#f43f5e"],["Retrying","#f97316"]].map(([l,c]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-5 rounded-full"
                    style={{ height: 2, background: c }}
                  />
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="px-3 pt-3 pb-1">
            {rateHist.current.length < 3 ? (
              <div
                className="h-44 flex flex-col items-center justify-center gap-2"
                style={{ color: "#1e293b", fontSize: 12 }}
              >
                <Activity size={20} style={{ color: "#1e293b" }} />
                <span>Collecting data — updates every 4s</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <ResponsiveContainer width="100%" height={176}>
                  <AreaChart
                    data={rateHist.current}
                    margin={{ top: 4, right: 4, left: -32, bottom: 0 }}
                  >
                    <defs>
                      {[["ok","#10b981"],["dl","#f43f5e"],["re","#f97316"]].map(([id, c]) => (
                        <linearGradient key={id} id={`a-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={c} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="1 4"
                      stroke="rgba(255,255,255,.03)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 9, fill: "#1e293b", fontFamily: "JetBrains Mono" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#1e293b" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip {...TT} />
                    <Area type="monotone" dataKey="processed" name="Processed/tick" stroke="#10b981" fill="url(#a-ok)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="retrying"  name="Retrying"       stroke="#f97316" fill="url(#a-re)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#f97316", strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="dead"      name="Dead-lettered"  stroke="#f43f5e" fill="url(#a-dl)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#f43f5e", strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* live feed */}
        <motion.div
          style={{ display: "flex", flexDirection: "column" }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.32, ease: EASE }}
        >
          <LiveFeed />
        </motion.div>
      </div>

      {/* ── status bars + workflow table ─────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 3fr" }}>

        {/* status distribution — animation #13: horizontal bars fill */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.35, ease: EASE }}
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
              Status Distribution
            </p>
            {m && (
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                {m.total_events.toLocaleString()} total ·{" "}
                <span style={{ color: "#34d399" }}>
                  {pct(m.succeeded, m.total_events)}
                </span>{" "}
                success rate
              </p>
            )}
          </div>
          <div className="px-4 py-4 space-y-3.5">
            {!m
              ? [...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-2.5 w-28" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))
              : statusBars.map((bar, i) => (
                  <div key={bar.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span
                        style={{
                          color: "#475569",
                          fontSize: 11,
                          fontWeight: 500,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {bar.label}
                      </span>
                      <span
                        className="mono"
                        style={{ color: bar.color, fontSize: 11, fontWeight: 600 }}
                      >
                        {bar.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="status-bar-track">
                      <motion.div
                        className="status-bar-fill"
                        style={{ background: bar.color }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: bar.pct / 100 }}
                        transition={{
                          duration: 0.8,
                          delay: 0.4 + i * 0.08,
                          ease: "easeOut",
                        }}
                      />
                    </div>
                  </div>
                ))}
          </div>
        </motion.div>

        {/* workflow table — animation #28: scroll reveal on rows */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.38, ease: EASE }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <div>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                Recent Workflows
              </p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                Click any row to inspect the full event timeline
              </p>
            </div>
            {wf && (
              <span
                className="mono"
                style={{
                  color: "#1e293b",
                  fontSize: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  padding: "1px 7px",
                }}
              >
                {wf.length}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  {["Workflow ID","Events","Succeeded","DLQ","In-flight","Status","Updated"].map(
                    (h) => <th key={h} className="th">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {!wf
                  ? [...Array(6)].map((_, i) => (
                      <tr key={i} className="tr">
                        {[...Array(7)].map((_, j) => (
                          <td key={j} className="td">
                            <Skeleton className="h-3 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : wf.length === 0
                  ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: "48px 0", textAlign: "center", color: "#1e293b", fontSize: 13 }}
                      >
                        No workflows —{" "}
                        <strong style={{ color: "#475569" }}>Generate Workload</strong>
                        {" "}to begin
                      </td>
                    </tr>
                  )
                  : wf.map((w, i) => (
                      /* animation #28: scroll reveal on rows + animation #21: stagger */
                      <AppearOnScroll
                        key={w.workflow_id}
                        delay={Math.min(i * 0.03, 0.25)}
                        className="contents"
                      >
                        <motion.tr
                          className="tr"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            delay: Math.min(i * 0.02, 0.25),
                            duration: 0.2,
                          }}
                        >
                          <td className="td" style={{ paddingLeft: 16 }}>
                            <Link
                              to={`/workflows/${w.workflow_id}`}
                              className="group flex items-center gap-1 mono"
                              style={{
                                color: "#818cf8",
                                fontSize: 12,
                                fontWeight: 500,
                                textDecoration: "none",
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLElement).style.color = "#818cf8")
                              }
                            >
                              {w.workflow_id}
                              <ArrowUpRight
                                size={9}
                                style={{ opacity: 0 }}
                                className="group-hover:opacity-100 transition-opacity"
                              />
                            </Link>
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.total_events}
                          </td>
                          <td className="td mono" style={{ fontSize: 12, color: "#34d399" }}>
                            {w.succeeded}
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.dead_lettered > 0 ? (
                              <span style={{ color: "#fb7185", fontWeight: 700 }}>
                                {w.dead_lettered}
                              </span>
                            ) : (
                              <span style={{ color: "#1e293b" }}>—</span>
                            )}
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.in_flight > 0 ? (
                              <span style={{ color: "#fbbf24" }}>{w.in_flight}</span>
                            ) : (
                              <span style={{ color: "#1e293b" }}>—</span>
                            )}
                          </td>
                          <td className="td">
                            <EventStatusBadge
                              status={
                                w.has_failures
                                  ? "dead_lettered"
                                  : w.in_flight > 0
                                  ? "processing"
                                  : "succeeded"
                              }
                            />
                          </td>
                          <td className="td mono" style={{ fontSize: 11, color: "#334155" }}>
                            {ago(w.last_updated_at)}
                          </td>
                        </motion.tr>
                      </AppearOnScroll>
                    ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
