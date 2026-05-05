import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
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
import { AnimatedNumber, Skeleton } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

/* ── helpers ─────────────────────────────────────────────── */
const fmtMs = (v: number | null) =>
  v == null ? "–" : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`;
const pct = (n: number, d: number) => d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`;
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

/* ── chart tooltip ───────────────────────────────────────── */
const TT = {
  contentStyle: { background: "#0c1220", border: "1px solid rgba(255,255,255,.09)", borderRadius: 7, fontSize: 12, padding: "9px 13px", boxShadow: "0 16px 40px rgba(0,0,0,.7)" },
  labelStyle: { color: "#475569", fontSize: 11, marginBottom: 3 },
  itemStyle: { color: "#e2e8f0" },
  cursor: { stroke: "rgba(255,255,255,.04)" },
};

/* ── snapshot type ───────────────────────────────────────── */
type Snap = { t: string; succeeded: number; dead: number; retrying: number };
type RateSnap = { t: string; processed: number; dead: number; retrying: number };

/* ── status bar chart data ───────────────────────────────── */
function statusBarData(m: { succeeded:number; dead_lettered:number; retrying:number; queued:number; processing:number }) {
  return [
    { name: "succeeded",    value: m.succeeded,     color: "#10b981" },
    { name: "queued",       value: m.queued,         color: "#6366f1" },
    { name: "processing",   value: m.processing,     color: "#eab308" },
    { name: "retrying",     value: m.retrying,      color: "#f97316" },
    { name: "dead-lettered",value: m.dead_lettered, color: "#f43f5e" },
  ];
}

/* ── component ───────────────────────────────────────────── */
export default function Dashboard() {
  const mLoad = useCallback(() => api.getMetrics(), []);
  const wLoad = useCallback(() => api.listWorkflows(40), []);
  const { data: m, error: mErr, refresh: refM } = usePolling(mLoad, 4000);
  const { data: wf, error: wErr, refresh: refWf } = usePolling(wLoad, 5000);

  const [gen, setGen] = useState(false);
  const hist = useRef<Snap[]>([]);
  const rateHist = useRef<RateSnap[]>([]);
  const sparks = useRef<Record<string, number[]>>({ total: [], ok: [], dead: [] });

  // accumulate history
  if (m) {
    const t = new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const last = hist.current[hist.current.length - 1];
    if (!last || last.t !== t) {
      const snap = { t, succeeded: m.succeeded, dead: m.dead_lettered, retrying: m.retrying };
      // build rate (delta) history for the chart
      if (last) {
        rateHist.current = [...rateHist.current.slice(-34), {
          t,
          processed: Math.max(0, snap.succeeded - last.succeeded),
          dead:      Math.max(0, snap.dead - last.dead),
          retrying:  snap.retrying,
        }];
      } else {
        rateHist.current = [{ t, processed: 0, dead: 0, retrying: m.retrying }];
      }
      hist.current = [...hist.current.slice(-34), snap];
      sparks.current.total = [...sparks.current.total.slice(-9), m.total_events];
      sparks.current.ok    = [...sparks.current.ok.slice(-9),    m.succeeded];
      sparks.current.dead  = [...sparks.current.dead.slice(-9),  m.dead_lettered];
    }
  }

  const throughput = (() => {
    if (hist.current.length < 4) return null;
    const slice = hist.current.slice(-6);
    const delta = slice[slice.length - 1].succeeded - slice[0].succeeded;
    const secs = (slice.length - 1) * 4;
    return secs > 0 ? Math.round((delta / secs) * 60) : null;
  })();

  const barData = m ? statusBarData(m) : [];

  const generate = async () => {
    setGen(true);
    try {
      const r = await api.generateWorkload(30);
      toast.success("Workload generated", { description: `${r.events_sent} events queued` });
      setTimeout(() => { refM(); refWf(); }, 1000);
    } catch { toast.error("Generation failed"); }
    finally { setGen(false); }
  };

  return (
    <div className="page px-5 py-5 space-y-4">

      {/* ── page title + actions ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "-.01em" }}>Overview</h1>
          <div className="flex items-center gap-3 mt-1 mono" style={{ fontSize: 11, color: "#334155" }}>
            {m ? (
              <>
                <span><span style={{ color: "#e2e8f0" }}><AnimatedNumber value={m.total_events} /></span> total events</span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span><span style={{ color: "#34d399" }}>{pct(m.succeeded, m.total_events)}</span> success rate</span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span><span style={{ color: "#fb7185" }}>{pct(m.dead_lettered, m.total_events)}</span> error rate</span>
                {throughput != null && (
                  <><span style={{ color: "#1e293b" }}>·</span>
                  <span><span style={{ color: "#818cf8" }}>{throughput}/min</span> throughput</span></>
                )}
              </>
            ) : <Skeleton className="h-3 w-52" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-icon" onClick={() => { refM(); refWf(); }} title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button className="btn-primary" onClick={generate} disabled={gen}>
            {gen ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
            {gen ? "Generating…" : "Generate Workload"}
          </button>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 xl:grid-cols-4 gap-3"
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: .05 } } }}
      >
        {[
          { label:"Total Events",  value: m?.total_events ?? null, icon: Activity,    accent:"indigo" as const, sparkData: sparks.current.total, sub: "all time" },
          { label:"Succeeded",     value: m?.succeeded ?? null,    icon: CheckCircle2, accent:"emerald" as const, sparkData: sparks.current.ok, trend: m ? pct(m.succeeded, m.total_events) : undefined, trendUp: true },
          { label:"Dead-lettered", value: m?.dead_lettered ?? null, icon: Skull,       accent:"rose" as const,   sparkData: sparks.current.dead, sub: "exhausted retries" },
          { label:"Active Workers",value: m?.active_workers ?? null, icon: Server,     accent: (m?.stale_workers ? "orange" : "emerald") as any, sub: m?.stale_workers ? `${m.stale_workers} stale` : "all healthy" },
          { label:"Retrying",      value: m?.retrying ?? null,      icon: RefreshCw,  accent:"orange" as const, sub: "in backoff" },
          { label:"Replay Success",value: m ? `${(m.replay_success_rate*100).toFixed(0)}%` : null, icon: TrendingUp, accent:"purple" as const, sub: m ? `${m.replay_requeued} total` : undefined },
          { label:"p50 Latency",   value: m ? fmtMs(m.p50_attempt_duration_ms) : null, icon: Clock, accent:"sky" as const, sub: "median attempt" },
          { label:"p95 Latency",   value: m ? fmtMs(m.p95_attempt_duration_ms) : null, icon: Zap,   accent:"amber" as const, sub: "95th percentile" },
        ].map((card, i) => (
          <motion.div key={card.label} variants={{ hidden:{opacity:0,y:10}, show:{opacity:1,y:0,transition:{duration:.28}} }}>
            <MetricCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── charts + feed ────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* throughput area chart */}
        <div className="xl:col-span-3 card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Event Throughput</p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>Rolling 35-point window</p>
            </div>
            <div className="flex items-center gap-4 mono" style={{ fontSize: 10, color: "#334155" }}>
              {[["Succeeded","#10b981"],["Dead","#f43f5e"],["Retrying","#f97316"]].map(([l,c]) => (
                <span key={l as string} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-[2px]" style={{ background: c as string }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="px-3 pt-3 pb-1">
            {rateHist.current.length < 3 ? (
              <div className="h-44 flex items-center justify-center" style={{ color: "#1e293b", fontSize: 12 }}>
                Collecting data — updates every 4s
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <AreaChart data={rateHist.current} margin={{ top:4, right:4, left:-32, bottom:0 }}>
                  <defs>
                    {[["ok","#10b981"],["dl","#f43f5e"],["re","#f97316"]].map(([id,c]) => (
                      <linearGradient key={id as string} id={`a-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c as string} stopOpacity={.3} />
                        <stop offset="100%" stopColor={c as string} stopOpacity={.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.03)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize:9, fill:"#1e293b", fontFamily:"JetBrains Mono" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize:9, fill:"#1e293b" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...TT} />
                  <Area type="monotone" dataKey="processed" name="Processed/tick" stroke="#10b981" fill="url(#a-ok)" strokeWidth={2} dot={false} activeDot={{ r:3, fill:"#10b981", strokeWidth:0 }} />
                  <Area type="monotone" dataKey="retrying"  name="Retrying"       stroke="#f97316" fill="url(#a-re)" strokeWidth={1.5} dot={false} activeDot={{ r:3, fill:"#f97316", strokeWidth:0 }} />
                  <Area type="monotone" dataKey="dead"      name="Dead-lettered"  stroke="#f43f5e" fill="url(#a-dl)" strokeWidth={1.5} dot={false} activeDot={{ r:3, fill:"#f43f5e", strokeWidth:0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* status distribution bar + live feed */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {/* horizontal bar */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Status Distribution</p>
            </div>
            <div className="px-4 py-3">
              {!m ? (
                <div className="space-y-2">{[...Array(5)].map((_,i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={barData} layout="vertical" margin={{ top:0, right:12, left:0, bottom:0 }} barSize={12}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:"#475569", fontFamily:"JetBrains Mono" }} tickLine={false} axisLine={false} width={78} />
                    <Tooltip {...TT} />
                    <Bar dataKey="value" name="Events" radius={[0,3,3,0]}>
                      {barData.map((b,i) => <Cell key={i} fill={b.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {m && (
                <div className="mt-2 pt-2 flex items-center justify-between mono" style={{ borderTop:"1px solid rgba(255,255,255,.04)", fontSize:11, color:"#334155" }}>
                  <span>Total: <span style={{ color:"#e2e8f0" }}>{m.total_events.toLocaleString()}</span></span>
                  <span>Success: <span style={{ color:"#34d399" }}>{pct(m.succeeded, m.total_events)}</span></span>
                </div>
              )}
            </div>
          </div>

          {/* live feed — compact */}
          <LiveFeed />
        </div>
      </div>

      {/* ── workflow table ────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div>
            <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Recent Workflows</p>
            <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>Click any row to inspect the full event timeline</p>
          </div>
          {wf && <span className="mono" style={{ color:"#1e293b", fontSize:11 }}>{wf.length} loaded</span>}
        </div>
        <div className="overflow-x-auto">
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                {["Workflow ID","Events","Succeeded","DLQ","In-flight","Status","Updated"].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!wf ? [...Array(8)].map((_,i) => (
                <tr key={i} className="tr">
                  {[...Array(7)].map((_,j) => <td key={j} className="td"><Skeleton className="h-3 w-full" /></td>)}
                </tr>
              )) : wf.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding:"48px 0", textAlign:"center", color:"#1e293b", fontSize:13 }}>
                    No workflows — click <strong style={{ color:"#475569" }}>Generate Workload</strong> to begin
                  </td>
                </tr>
              ) : wf.map((w, i) => (
                <motion.tr key={w.workflow_id} className="tr"
                  initial={{ opacity:0 }} animate={{ opacity:1 }}
                  transition={{ delay: Math.min(i*.01, .25), duration:.18 }}>
                  <td className="td" style={{ paddingLeft:16 }}>
                    <Link
                      to={`/workflows/${w.workflow_id}`}
                      className="group flex items-center gap-1 mono"
                      style={{ color:"#818cf8", fontSize:12, fontWeight:500, textDecoration:"none" }}
                      onMouseEnter={e => (e.currentTarget.style.color="#a5b4fc")}
                      onMouseLeave={e => (e.currentTarget.style.color="#818cf8")}
                    >
                      {w.workflow_id}
                      <ArrowUpRight size={9} style={{ opacity:0 }} className="group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="td mono" style={{ fontSize:12 }}>{w.total_events}</td>
                  <td className="td mono" style={{ fontSize:12, color:"#34d399" }}>{w.succeeded}</td>
                  <td className="td mono" style={{ fontSize:12 }}>
                    {w.dead_lettered > 0
                      ? <span style={{ color:"#fb7185", fontWeight:700 }}>{w.dead_lettered}</span>
                      : <span style={{ color:"#1e293b" }}>—</span>}
                  </td>
                  <td className="td mono" style={{ fontSize:12 }}>
                    {w.in_flight > 0
                      ? <span style={{ color:"#fbbf24" }}>{w.in_flight}</span>
                      : <span style={{ color:"#1e293b" }}>—</span>}
                  </td>
                  <td className="td">
                    <EventStatusBadge status={
                      w.has_failures ? "dead_lettered" :
                      w.in_flight > 0 ? "processing" : "succeeded"
                    } />
                  </td>
                  <td className="td mono" style={{ fontSize:11, color:"#334155" }}>{ago(w.last_updated_at)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
