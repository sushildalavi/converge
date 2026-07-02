import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowUpRight, Play, RefreshCw, Activity, Zap,
  AlertOctagon, CheckCircle2, Server,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { LiveFeed } from "../components/LiveFeed";
import { AnimatedNumber, Skeleton, FadeUp, Stagger, SI } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";
import type { RecoveryPostmortemOut, RecoveryResult } from "../types";

const pct = (n:number,d:number) => d===0?"–":`${((n/d)*100).toFixed(1)}%`;
const fmtMs = (v:number|null) => v==null?"–":v<1000?`${Math.round(v)}ms`:`${(v/1000).toFixed(2)}s`;
const fmtSec = (v:number|null) => v==null?"–":v<60?`${v.toFixed(1)}s`:`${(v/60).toFixed(1)}m`;
const fmtRate = (v:number|null) => v==null ? "–" : `${v.toFixed(1)}/s`;
const ago = (iso:string|null) => {
  if(!iso) return "–";
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m`; return `${Math.floor(s/3600)}h`;
};

const TT = {
  contentStyle:{ background:"#18181c", border:"1px solid #2a2a30", borderRadius:6, fontSize:11, padding:"7px 10px" },
  labelStyle:{ color:"#71717a", fontSize:10, marginBottom:2 },
  itemStyle:{ color:"#f4f4f5" },
  cursor:{ stroke:"rgba(255,255,255,.04)" },
};

type RateSnap = { t:string; processed:number; dead:number; retrying:number };
type HistSnap = { t:string; succeeded:number; dead:number; retrying:number };

const SVC_LABELS: Record<string,string> = {
  "checkout-service":     "Checkout",
  "payment-service":      "Payment",
  "inventory-service":    "Inventory",
  "notification-service": "Notification",
  "fulfillment-service":  "Fulfillment",
};

const PM_COLOR: Record<RecoveryResult, string> = {
  converged: "var(--green)",
  degraded: "var(--orange)",
  failed: "var(--red)",
  insufficient_evidence: "var(--dim)",
};

export default function Dashboard() {
  const mLoad  = useCallback(()=>api.getMetrics(),[]);
  const wLoad  = useCallback(()=>api.listWorkflows(40),[]);
  const sLoad  = useCallback(()=>api.servicesBreakdown(),[]);
  const eLoad  = useCallback(()=>api.topErrors(8),[]);
  const lLoad  = useCallback(()=>api.latencyHistogram(),[]);
  const tLoad  = useCallback(()=>api.eventTypeStats(),[]);

  const { data:m, refresh:refM } = usePolling(mLoad,4000);
  const cLoad  = useCallback(()=>api.getConvergence(),[]);
  const { data:c, refresh:refC } = usePolling(cLoad,4000);
  const { data:wf, refresh:refWf } = usePolling(wLoad,5000);
  const { data:svc } = usePolling(sLoad,8000);
  const { data:errs } = usePolling(eLoad,10000);
  const { data:lat } = usePolling(lLoad,10000);
  const { data:etypes } = usePolling(tLoad,10000);

  const [gen, setGen] = useState(false);
  const [postmortem, setPostmortem] = useState<RecoveryPostmortemOut | null>(null);
  const [postmortemLoading, setPostmortemLoading] = useState(false);

  const hist     = useRef<HistSnap[]>([]);
  const rateHist = useRef<RateSnap[]>([]);

  if(m){
    const t = new Date().toLocaleTimeString("en",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
    const last = hist.current[hist.current.length-1];
    if(!last || last.t!==t){
      const snap: HistSnap = { t, succeeded:m.succeeded, dead:m.dead_lettered, retrying:m.retrying };
      if(last){
        rateHist.current = [...rateHist.current.slice(-44),{
          t, processed: Math.max(0,snap.succeeded-last.succeeded),
          dead: Math.max(0,snap.dead-last.dead), retrying:snap.retrying,
        }];
      } else rateHist.current = [{ t, processed:0, dead:0, retrying:m.retrying }];
      hist.current = [...hist.current.slice(-44), snap];
    }
  }

  const tp = (()=>{
    if(hist.current.length<4) return null;
    const sl = hist.current.slice(-6);
    const d = sl[sl.length-1].succeeded - sl[0].succeeded;
    return Math.round((d/((sl.length-1)*4))*60);
  })();

  const latestWorkflowId = wf?.[0]?.workflow_id ?? null;

  const generate = async () => {
    setGen(true);
    try {
      const r = await api.generateWorkload(30);
      toast.success("Workload queued",{description:`${r.events_sent} events`});
      setTimeout(()=>{ refM(); refWf() },800);
    } catch { toast.error("Generation failed"); }
    finally { setGen(false); }
  };

  const analyzeRecovery = async () => {
    setPostmortemLoading(true);
    try {
      const result = await api.generateRecoveryPostmortem({
        workflow_id: latestWorkflowId,
        include_live_snapshot: true,
      });
      setPostmortem(result);
      toast.success("Recovery postmortem generated", {
        description: result.recovery_result,
      });
    } catch {
      toast.error("Recovery postmortem failed");
    } finally {
      setPostmortemLoading(false);
    }
  };

  const latData = lat ? lat.bins.map((b,i)=>({ bin:b, count:lat.counts[i] })) : [];

  return (
    <div className="page" style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* HEADER */}
      <FadeUp>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontSize:17, fontWeight:600, color:"var(--text)", letterSpacing:"-.02em" }}>AI Operations Console</h1>
            {m && (
              <p className="mono" style={{ fontSize:11, color:"var(--dim)", marginTop:4 }}>
                <span style={{color:"var(--muted)"}}><AnimatedNumber value={m.total_events}/></span> events
                {" · "}<span style={{color:"var(--green)"}}>{pct(m.succeeded,m.total_events)}</span> ok
                {" · "}<span style={{color:"var(--red)"}}>{pct(m.dead_lettered,m.total_events)}</span> err
                {" · p50 "}<span style={{color:"var(--muted)"}}>{fmtMs(m.p50_attempt_duration_ms)}</span>
                {" · p95 "}<span style={{color:"var(--muted)"}}>{fmtMs(m.p95_attempt_duration_ms)}</span>
                {tp!=null && <> · <span style={{color:"var(--accent)"}}>{tp}/min</span></>}
                {c && <> · <span style={{color:c.converged?"var(--green)":"var(--orange)"}}>{c.convergence_state}</span></>}
              </p>
            )}
          </div>
          <div style={{display:"flex",gap:6}}>
            <motion.button className="btn-outline" onClick={()=>{refM();refC();refWf()}} whileTap={{scale:.93}}>
              <RefreshCw size={11}/>
            </motion.button>
            <motion.button className="btn-amber" onClick={generate} disabled={gen} whileTap={{scale:.93}}>
              {gen ? <RefreshCw size={11} className="animate-spin"/> : <Play size={11}/>}
              {gen ? "Generating…" : "Generate Workload"}
            </motion.button>
          </div>
        </div>
      </FadeUp>

      {/* MICRO STAT BAND — 8 stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:0,
        border:"1px solid var(--border)", borderRadius:6, overflow:"hidden", background:"var(--card)" }}>
        {[
          { label:"Events",     value:m?.total_events??null,            color:"var(--muted)", mono:true },
          { label:"Success",    value:m?.succeeded??null,                color:"var(--green)", mono:true },
          { label:"Failed",     value:m?.dead_lettered??null,           color:"var(--red)",   mono:true },
          { label:"Retrying",   value:m?.retrying??null,                 color:"var(--orange)",mono:true },
          { label:"Workers",    value:m?.active_workers??null,          color:"var(--blue)",  mono:true },
          { label:"Stale",      value:m?.stale_workers??null,           color:m?.stale_workers?"var(--orange)":"var(--dimmer)", mono:true },
          { label:"p50",        value:m?fmtMs(m.p50_attempt_duration_ms):null, color:"var(--muted)", mono:false },
          { label:"p95",        value:m?fmtMs(m.p95_attempt_duration_ms):null, color:"var(--muted)", mono:false },
        ].map((s,i,arr)=>(
          <div key={i} style={{ padding:"10px 12px",
            borderRight: i<arr.length-1 ? "1px solid var(--border)" : "none" }}>
            <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)",
              textTransform:"uppercase", letterSpacing:".07em", marginBottom:4 }}>{s.label}</p>
            <p className={s.mono?"mono":""} style={{ fontSize:18, fontWeight:700, color:s.color, letterSpacing:"-.02em", lineHeight:1 }}>
              {s.value===null ? <Skeleton className="w-10 h-4"/> :
               typeof s.value==="number" ? <AnimatedNumber value={s.value}/> : s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:0,
        border:"1px solid var(--border)", borderRadius:6, overflow:"hidden", background:"var(--card)" }}>
        {[
          { label:"Processed/s", value:m?.processed_per_sec ?? null, color:"var(--green)", mono:false },
          { label:"Retry queue", value:m?.retry_queue_depth ?? null, color:"var(--orange)", mono:true },
          { label:"Incoming pending", value:m?.incoming_pending ?? null, color:"var(--muted)", mono:true },
          { label:"Retry pending", value:m?.retry_pending ?? null, color:"var(--muted)", mono:true },
          { label:"Recovery time", value:m?.replay_latency_ms ?? null, color:"var(--blue)", mono:false },
        ].map((s,i,arr)=>(
          <div key={s.label} style={{ padding:"10px 12px",
            borderRight: i<arr.length-1 ? "1px solid var(--border)" : "none" }}>
            <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)",
              textTransform:"uppercase", letterSpacing:".07em", marginBottom:4 }}>{s.label}</p>
            <p className={s.mono?"mono":""} style={{ fontSize:16, fontWeight:700, color:s.color, letterSpacing:"-.02em", lineHeight:1 }}>
              {s.value===null ? <Skeleton className="w-10 h-4"/> :
               typeof s.value==="number" ? (
                 s.label === "Processed/s" ? fmtRate(s.value) :
                 s.label === "Replay latency" ? fmtMs(s.value) :
                 <AnimatedNumber value={s.value}/>
               ) : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>Convergence Check</p>
            <p style={{ fontSize:10, color:"var(--dim)", marginTop:2 }}>Backend and Redis-backed recovery state</p>
          </div>
          <span className="mono" style={{ fontSize:10, color:c?.converged ? "var(--green)" : "var(--orange)" }}>
            {c?.verified_at ? ago(c.verified_at) : "waiting"}
          </span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:0 }}>
          {[
            { label:"State", value:c?.convergence_state ?? null, color:c?.converged ? "var(--green)" : "var(--orange)", mono:false },
            { label:"Submitted", value:c?.total_events ?? null, color:"var(--muted)", mono:true },
            { label:"Processed", value:c?.processed_events ?? null, color:"var(--green)", mono:true },
            { label:"Pending", value:c?.pending_events ?? null, color:"var(--orange)", mono:true },
            { label:"Backlog", value:c?.stream_backlog ?? null, color:"var(--muted)", mono:true },
            { label:"DLQ", value:c?.dead_lettered_events ?? null, color:c?.dead_lettered_events ? "var(--red)" : "var(--muted)", mono:true },
            { label:"Stale workers", value:c?.stale_workers ?? null, color:c?.stale_workers ? "var(--orange)" : "var(--muted)", mono:true },
            { label:"Heartbeat age", value:c?.worker_heartbeat_age_seconds ?? null, color:"var(--dim)", mono:false },
            { label:"Orphans", value:c?.orphaned_records ?? null, color:c?.orphaned_records ? "var(--red)" : "var(--muted)", mono:true },
            { label:"Dup sidefx", value:c?.duplicate_side_effects ?? null, color:c?.duplicate_side_effects ? "var(--red)" : "var(--muted)", mono:true },
            { label:"Recent fails", value:c?.recent_failures ?? null, color:"var(--dim)", mono:true },
          ].map((s,i,arr)=>(
            <div key={s.label} style={{ padding:"10px 12px", borderRight: i<arr.length-1 ? "1px solid var(--border)" : "none" }}>
              <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:4 }}>{s.label}</p>
              <p className={s.mono?"mono":""} style={{ fontSize:16, fontWeight:700, color:s.color, letterSpacing:"-.02em", lineHeight:1 }}>
                {s.value===null ? <Skeleton className="w-10 h-4"/> : typeof s.value==="number" ? (
                  s.label === "Heartbeat age" ? fmtSec(s.value) : <AnimatedNumber value={s.value}/>
                ) : s.value}
              </p>
            </div>
          ))}
        </div>
        {c && c.convergence_issues.length > 0 && (
          <div style={{ padding:"0 14px 12px", fontSize:11, color:"var(--dim)" }}>
            <span style={{ fontWeight:600, color:"var(--text)" }}>Open issues:</span>{" "}
            {c.convergence_issues.join(" · ")}
          </div>
        )}
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>Recovery Postmortem</p>
            <p style={{ fontSize:10, color:"var(--dim)", marginTop:2 }}>Evidence-grounded analysis from live convergence and the latest workflow</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {latestWorkflowId && (
              <span className="mono" style={{ fontSize:10, color:"var(--dimmer)" }}>
                {latestWorkflowId}
              </span>
            )}
            <motion.button className="btn-outline" onClick={analyzeRecovery} disabled={postmortemLoading} whileTap={{ scale: .93 }}>
              {postmortemLoading ? <RefreshCw size={11} className="animate-spin" /> : <Activity size={11} />}
              {postmortemLoading ? "Analysing…" : "Generate"}
            </motion.button>
          </div>
        </div>
        {!postmortem ? (
          <div style={{ padding:"12px 14px", color:"var(--dimmer)", fontSize:11 }}>
            Run the analyzer to see the incident summary, evidence, risks, and recommended actions.
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.5fr) minmax(260px,.9fr)", gap:0 }}>
            <div style={{ padding:"12px 14px", borderRight:"1px solid var(--border)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:10 }}>
                <div>
                  <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em" }}>Recovery Result</p>
                  <p className="mono" style={{ fontSize:16, fontWeight:700, color:PM_COLOR[postmortem.recovery_result], marginTop:4 }}>
                    {postmortem.recovery_result}
                  </p>
                </div>
                <div style={{ minWidth:88, textAlign:"right" }}>
                  <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em" }}>Confidence</p>
                  <p className="mono" style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginTop:4 }}>
                    {(postmortem.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              <div style={{ height:4, borderRadius:999, background:"var(--raised)", overflow:"hidden", marginBottom:10 }}>
                <div style={{ width:`${postmortem.confidence * 100}%`, height:"100%", background:PM_COLOR[postmortem.recovery_result], borderRadius:999 }} />
              </div>
              <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{postmortem.incident_summary}</p>

              <div style={{ marginTop:14 }}>
                <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>Timeline</p>
                <div style={{ display:"grid", gap:8 }}>
                  {postmortem.timeline.map((item, idx) => (
                    <div key={`${item.event}-${idx}`} style={{ padding:"8px 10px", background:"var(--raised)", borderRadius:4 }}>
                      <p style={{ fontSize:11, fontWeight:600, color:"var(--text)" }}>{item.event}</p>
                      <p style={{ fontSize:11, color:"var(--dim)", marginTop:2, lineHeight:1.5 }}>{item.impact}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop:14 }}>
                <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>Evidence</p>
                <div style={{ display:"grid", gap:6 }}>
                  {postmortem.evidence.map((item, idx) => (
                    <div key={`${idx}-${item.slice(0,12)}`} style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding:"12px 14px" }}>
              <div>
                <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>Risks</p>
                <div style={{ display:"grid", gap:6 }}>
                  {postmortem.risks.map((item, idx) => (
                    <div key={`${idx}-${item.slice(0,12)}`} style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop:14 }}>
                <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>Recommended Actions</p>
                <div style={{ display:"grid", gap:6 }}>
                  {postmortem.recommended_actions.map((item, idx) => (
                    <div key={`${idx}-${item.slice(0,12)}`} style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop:14, padding:"10px 12px", border:"1px solid var(--border)", borderRadius:4, background:"var(--raised)" }}>
                <p style={{ fontSize:9.5, fontWeight:600, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:6 }}>Resume Safety</p>
                <p style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>{postmortem.resume_safe_summary}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ROW: rate chart (full width) */}
      <div className="card" style={{overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Event Rate · Live</p>
          <div style={{display:"flex",gap:14,fontSize:10,color:"var(--dimmer)"}}>
            {[["Processed","#4ade80"],["Retrying","#fb923c"],["Dead","#f87171"]].map(([l,c])=>(
              <span key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:10,height:2,borderRadius:1,background:c,display:"inline-block"}}/>
                {l}
              </span>
            ))}
          </div>
        </div>
        <div style={{padding:"6px 6px 0",height:160}}>
          {rateHist.current.length<3 ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--dimmer)",fontSize:11}}>
              Collecting data…
            </div>
          ):(
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rateHist.current} margin={{top:4,right:8,left:-30,bottom:0}}>
                <defs>
                  {[["ok","#4ade80"],["dl","#f87171"],["re","#fb923c"]].map(([id,c])=>(
                    <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={.25}/>
                      <stop offset="100%" stopColor={c} stopOpacity={.02}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false}/>
                <XAxis dataKey="t" tick={{fontSize:9,fill:"var(--dimmer)",fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{fontSize:9,fill:"var(--dimmer)"}} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip {...TT}/>
                <Area type="monotone" dataKey="processed" stackId="1" stroke="#4ade80" fill="url(#gok)" strokeWidth={1.5} dot={false}/>
                <Area type="monotone" dataKey="retrying"  stackId="1" stroke="#fb923c" fill="url(#gre)" strokeWidth={1.5} dot={false}/>
                <Area type="monotone" dataKey="dead"      stackId="1" stroke="#f87171" fill="url(#gdl)" strokeWidth={1.5} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ROW: services + live feed */}
      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:12,minHeight:300}}>

        {/* Service breakdown table */}
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)"}}>
            <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Service Health</p>
            <p style={{fontSize:10,color:"var(--dim)",marginTop:2}}>Aggregate by service · success rate · avg latency</p>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid var(--border)"}}>
                {["Service","Events","OK","DLQ","Retry","Success","Avg Latency"].map(h=>(
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!svc ? [...Array(5)].map((_,i)=>(
                <tr key={i} className="tr">
                  {[...Array(7)].map((_,j)=><td key={j} className="td"><Skeleton className="h-3 w-full"/></td>)}
                </tr>
              )) : svc.map(s=>(
                <tr key={s.service} className="tr">
                  <td className="td" style={{paddingLeft:14}}>
                    <span style={{fontSize:12,fontWeight:500,color:"var(--text)"}}>{SVC_LABELS[s.service]??s.service}</span>
                  </td>
                  <td className="td mono" style={{fontSize:11}}>{s.total}</td>
                  <td className="td mono" style={{fontSize:11,color:"var(--green)"}}>{s.succeeded}</td>
                  <td className="td mono" style={{fontSize:11}}>
                    {s.failed>0?<span style={{color:"var(--red)",fontWeight:600}}>{s.failed}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td mono" style={{fontSize:11}}>
                    {s.retrying>0?<span style={{color:"var(--orange)"}}>{s.retrying}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td">
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:4,background:"var(--raised)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${s.success_rate*100}%`,
                          background:s.success_rate>0.85?"var(--green)":s.success_rate>0.6?"var(--accent)":"var(--red)",
                          borderRadius:2}}/>
                      </div>
                      <span className="mono" style={{fontSize:10,color:"var(--muted)",width:32,textAlign:"right"}}>
                        {(s.success_rate*100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="td mono" style={{fontSize:11,color:"var(--muted)",paddingRight:14}}>{fmtMs(s.avg_duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Live feed */}
        <LiveFeed/>
      </div>

      {/* ROW: errors + latency hist */}
      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:12}}>

        {/* Top errors */}
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between"}}>
            <div>
              <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Top Errors</p>
              <p style={{fontSize:10,color:"var(--dim)",marginTop:2}}>Most frequent failure messages</p>
            </div>
            {errs && <span className="mono" style={{fontSize:10,color:"var(--dimmer)"}}>{errs.length}</span>}
          </div>
          <div>
            {!errs ? [...Array(5)].map((_,i)=>(
              <div key={i} style={{padding:"10px 14px",borderBottom:"1px solid var(--border)"}}>
                <Skeleton className="h-3 w-full"/>
              </div>
            )) : errs.length===0 ? (
              <div style={{padding:"32px",textAlign:"center",color:"var(--dimmer)",fontSize:11}}>
                No errors recorded
              </div>
            ) : errs.map((e,i)=>(
              <div key={i} className="tr" style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:10}}>
                <span className="mono" style={{fontSize:10,fontWeight:600,color:"var(--red)",width:24}}>×{e.count}</span>
                <span className="mono" style={{fontSize:10,color:"var(--dim)",width:140,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.event_type}</span>
                <span style={{flex:1,fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={e.error}>{e.error}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Latency histogram */}
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)"}}>
            <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Latency Distribution</p>
            <p style={{fontSize:10,color:"var(--dim)",marginTop:2}}>{lat?`${lat.total.toLocaleString()} attempts`:"—"}</p>
          </div>
          <div style={{padding:"8px 8px 4px",height:160}}>
            {!lat ? <Skeleton className="h-full w-full"/> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latData} margin={{top:4,right:4,left:-28,bottom:0}} barSize={14}>
                  <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false}/>
                  <XAxis dataKey="bin" tick={{fontSize:9,fill:"var(--dimmer)",fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:9,fill:"var(--dimmer)"}} tickLine={false} axisLine={false}/>
                  <Tooltip {...TT}/>
                  <Bar dataKey="count" radius={[2,2,0,0]} fill="#f59e0b"/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ROW: event types breakdown */}
      <div className="card" style={{overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)"}}>
          <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Event Type Breakdown</p>
          <p style={{fontSize:10,color:"var(--dim)",marginTop:2}}>Per-step success and retry behaviour</p>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{borderBottom:"1px solid var(--border)"}}>
              {["Event","Total","Succeeded","Dead","Retrying","Avg Attempts","Pass Rate"].map(h=>(
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!etypes ? [...Array(5)].map((_,i)=>(
              <tr key={i} className="tr">
                {[...Array(7)].map((_,j)=><td key={j} className="td"><Skeleton className="h-3 w-full"/></td>)}
              </tr>
            )) : etypes.map(e=>{
              const rate = e.total>0?e.succeeded/e.total:0;
              return (
                <tr key={e.event_type} className="tr">
                  <td className="td mono" style={{fontSize:12,fontWeight:600,color:"var(--text)",paddingLeft:14}}>{e.event_type}</td>
                  <td className="td mono" style={{fontSize:11}}>{e.total}</td>
                  <td className="td mono" style={{fontSize:11,color:"var(--green)"}}>{e.succeeded}</td>
                  <td className="td mono" style={{fontSize:11}}>
                    {e.dead_lettered>0?<span style={{color:"var(--red)",fontWeight:600}}>{e.dead_lettered}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td mono" style={{fontSize:11}}>
                    {e.retrying>0?<span style={{color:"var(--orange)"}}>{e.retrying}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td mono" style={{fontSize:11,color:e.avg_attempts>1.2?"var(--orange)":"var(--muted)"}}>{e.avg_attempts}</td>
                  <td className="td" style={{paddingRight:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:3,background:"var(--raised)",borderRadius:2,overflow:"hidden",maxWidth:80}}>
                        <div style={{height:"100%",width:`${rate*100}%`,
                          background:rate>0.9?"var(--green)":rate>0.7?"var(--accent)":"var(--red)",borderRadius:2}}/>
                      </div>
                      <span className="mono" style={{fontSize:10,color:"var(--muted)",width:36,textAlign:"right"}}>
                        {(rate*100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ROW: recent workflows */}
      <div className="card" style={{overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between"}}>
          <div>
            <p style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Recent Workflows</p>
            <p style={{fontSize:10,color:"var(--dim)",marginTop:2}}>Click to inspect timeline</p>
          </div>
          {wf && <span className="mono" style={{fontSize:10,color:"var(--dimmer)"}}>{wf.length}</span>}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid var(--border)"}}>
                {["Workflow","Events","Success","DLQ","In-flight","Status","Updated"].map(h=>(
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!wf ? [...Array(5)].map((_,i)=>(
                <tr key={i} className="tr">{[...Array(7)].map((_,j)=><td key={j} className="td"><Skeleton className="h-3 w-full"/></td>)}</tr>
              )) : wf.length===0 ? (
                <tr><td colSpan={7} style={{padding:"24px 0",textAlign:"center",color:"var(--dimmer)",fontSize:11}}>No workflows</td></tr>
              ) : wf.slice(0,10).map((w,i)=>(
                <motion.tr key={w.workflow_id} className="tr"
                  initial={{opacity:0}} animate={{opacity:1}} transition={{delay:Math.min(i*.01,.2),duration:.15}}>
                  <td className="td" style={{paddingLeft:14}}>
                    <Link to={`/app/workflows/${w.workflow_id}`}
                      style={{ color:"var(--accent2)", textDecoration:"none", fontSize:11.5,
                        fontFamily:"JetBrains Mono", fontWeight:500, display:"flex", alignItems:"center", gap:3 }}
                      onMouseEnter={e=>((e.currentTarget as HTMLElement).style.color="var(--text)")}
                      onMouseLeave={e=>((e.currentTarget as HTMLElement).style.color="var(--accent2)")}>
                      {w.workflow_id}
                      <ArrowUpRight size={9} style={{opacity:.5}}/>
                    </Link>
                  </td>
                  <td className="td mono" style={{fontSize:11}}>{w.total_events}</td>
                  <td className="td mono" style={{fontSize:11,color:"var(--green)"}}>{w.succeeded}</td>
                  <td className="td mono" style={{fontSize:11}}>
                    {w.dead_lettered>0?<span style={{color:"var(--red)",fontWeight:700}}>{w.dead_lettered}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td mono" style={{fontSize:11}}>
                    {w.in_flight>0?<span style={{color:"var(--accent)"}}>{w.in_flight}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                  </td>
                  <td className="td"><EventStatusBadge status={w.has_failures?"dead_lettered":w.in_flight>0?"processing":"succeeded"}/></td>
                  <td className="td mono" style={{fontSize:10,color:"var(--dim)"}}>{ago(w.last_updated_at)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
