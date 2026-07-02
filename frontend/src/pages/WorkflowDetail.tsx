import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowLeft, Bot, ChevronDown, Clock, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { FadeUp, Stagger, SI, Skeleton } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";
import type { IncidentSummaryOut, WorkflowTimelineEventOut } from "../types";

const fmtMs = (v:number|null) => v==null?"–":v<1000?`${Math.round(v)}ms`:`${(v/1000).toFixed(2)}s`;
const fmtT  = (iso:string) => new Date(iso).toLocaleTimeString("en",{hour12:false});

const DOT: Record<string,string> = {
  succeeded:"#4ade80",failed:"#f87171",retrying:"#fb923c",
  dead_lettered:"#f87171",processing:"#fbbf24",queued:"#60a5fa",
};

const TT = {
  contentStyle:{ background:"#18181c", border:"1px solid #2a2a30", borderRadius:6, fontSize:12, padding:"8px 12px" },
  labelStyle:{ color:"#71717a", fontSize:10, marginBottom:2 },
};

function TimelineEvent({ ev, idx, isLast }: { ev:WorkflowTimelineEventOut; idx:number; isLast:boolean }) {
  const [open, setOpen] = useState(false);
  const color  = DOT[ev.status] ?? "#52525b";
  const totalMs = ev.attempts.reduce((s,a)=>s+(a.duration_ms??0),0);

  return (
    <motion.div style={{ display:"flex", gap:16 }}
      initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
      transition={{delay:idx*.04,duration:.22}}>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:16, flexShrink:0, paddingTop:16 }}>
        <motion.div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }}
          initial={{scale:0}} animate={{scale:1}}
          transition={{delay:idx*.04+.08,type:"spring",stiffness:400,damping:20}}/>
        {!isLast && <div style={{ width:1, flex:1, marginTop:4,
          background:`linear-gradient(180deg,${color}40 0%,rgba(255,255,255,.04) 100%)`, minHeight:16 }}/>}
      </div>

      <div style={{ flex:1, marginBottom:10 }}>
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
            cursor: ev.attempts.length ? "pointer" : "default",
            transition:"background .08s",
          }}
            onClick={()=>ev.attempts.length&&setOpen(!open)}
            onMouseEnter={e=>{if(ev.attempts.length)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.02)"}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent"}}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
              <span className="mono" style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{ev.event_type}</span>
              <EventStatusBadge status={ev.status}/>
              <span style={{ fontSize:11, color:"var(--dimmer)" }}>{ev.service_name}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
              {ev.attempt_count>1 && <span className="mono" style={{ fontSize:11, color:"var(--orange)" }}>×{ev.attempt_count}</span>}
              {totalMs>0 && <span className="mono" style={{ fontSize:11, color:"var(--dim)", display:"flex", alignItems:"center", gap:3 }}><Clock size={9}/>{fmtMs(totalMs)}</span>}
              <span className="mono" style={{ fontSize:10, color:"var(--dimmer)" }}>{fmtT(ev.created_at)}</span>
              {ev.attempts.length>0 && (
                <motion.span animate={{rotate:open?180:0}} transition={{duration:.15}}>
                  <ChevronDown size={12} style={{color:"var(--dimmer)"}}/>
                </motion.span>
              )}
            </div>
          </div>

          {ev.last_error && (
            <div style={{ padding:"6px 14px", background:"rgba(248,113,113,.04)", borderTop:"1px solid rgba(248,113,113,.12)" }}>
              <p className="mono" style={{ fontSize:10, color:"var(--red)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.last_error}</p>
            </div>
          )}

          <AnimatePresence>
            {open && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
                exit={{height:0,opacity:0}} transition={{duration:.18}} style={{overflow:"hidden",borderTop:"1px solid var(--border)"}}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["#","Status","Duration","Worker","Started","Error"].map(h=><th key={h} className="th" style={{paddingTop:6,paddingBottom:6}}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ev.attempts.map((a,ai)=>(
                      <motion.tr key={a.id} className="tr"
                        initial={{opacity:0}} animate={{opacity:1}} transition={{delay:ai*.03}}>
                        <td className="td mono" style={{fontSize:11,color:"var(--dim)",paddingLeft:14}}>{a.attempt_number}</td>
                        <td className="td"><EventStatusBadge status={a.status}/></td>
                        <td className="td mono" style={{fontSize:11}}>{fmtMs(a.duration_ms)}</td>
                        <td className="td"><span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"var(--dim)" }}><User size={9}/>{a.worker_name??"–"}</span></td>
                        <td className="td mono" style={{fontSize:10,color:"var(--dim)"}}>{fmtT(a.started_at)}</td>
                        <td className="td" style={{paddingRight:14}}>
                          {a.error_message?<span className="mono" style={{fontSize:10,color:"var(--red)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",maxWidth:180}}>{a.error_message}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default function WorkflowDetail() {
  const { wfId } = useParams<{wfId:string}>();
  const loader   = useCallback(()=>api.getWorkflowTimeline(wfId!),[wfId]);
  const { data, loading } = usePolling(loader,8000);
  const [summary, setSummary] = useState<IncidentSummaryOut|null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const summarize = async () => {
    setSummarizing(true);
    try { setSummary(await api.summarizeIncident(wfId!)) }
    catch { toast.error("Summarization failed") }
    finally { setSummarizing(false) }
  };

  if(loading) return (
    <div className="page" style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <Skeleton className="h-5 w-40"/><Skeleton className="h-4 w-60"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[...Array(4)].map((_,i)=><Skeleton key={i} className="h-16"/>)}
      </div>
      <Skeleton className="h-64"/>
    </div>
  );
  if(!data) return null;

  const events    = data.events;
  const total     = events.length;
  const succeeded = events.filter(e=>e.status==="succeeded").length;
  const dead      = events.filter(e=>e.status==="dead_lettered").length;
  const totalMs   = events.flatMap(e=>e.attempts).reduce((s,a)=>s+(a.duration_ms??0),0);
  const totalAttempts = events.reduce((s,e)=>s+e.attempt_count,0);
  const successPct = total>0?(succeeded/total)*100:0;

  const barData = events.map(ev=>({
    step: ev.event_type.split(".").pop()??ev.event_type,
    attempts: Math.max(ev.attempt_count,1),
    status: ev.status,
  }));

  return (
    <div className="page" style={{ display:"flex", flexDirection:"column", gap:14 }}>

      <FadeUp>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <Link to="/app" style={{ display:"flex", alignItems:"center", gap:4, fontSize:11,
              color:"var(--dim)", textDecoration:"none", marginBottom:8 }}
              onMouseEnter={e=>((e.currentTarget as HTMLElement).style.color="var(--muted)")}
              onMouseLeave={e=>((e.currentTarget as HTMLElement).style.color="var(--dim)")}>
              <ArrowLeft size={11}/> Back
            </Link>
            <h1 className="mono" style={{ fontSize:16, fontWeight:600, color:"var(--text)", letterSpacing:"-.01em" }}>
              {data.workflow_id}
            </h1>
            <p style={{ fontSize:11, color:"var(--dim)", marginTop:3 }}>
              {total} events · {totalAttempts} attempts
            </p>
          </div>
          <motion.button className="btn-outline" onClick={summarize} disabled={summarizing} whileTap={{scale:.93}}>
            {summarizing?<RefreshCw size={11} className="animate-spin"/>:<Bot size={11}/>}
            {summarizing?"Analysing…":"AI Summary"}
          </motion.button>
        </div>
      </FadeUp>

      <AnimatePresence>
        {summary && (
          <motion.div className="card" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            style={{ borderColor:"rgba(245,158,11,.25)", overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(245,158,11,.15)", display:"flex", alignItems:"center", gap:6 }}>
              <Bot size={11} style={{ color:"var(--accent)" }}/>
              <p style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>Incident Analysis</p>
              <span style={{ fontSize:10, color:"var(--dim)" }}>· {summary.model_name??"template"}</span>
            </div>
            <p style={{ padding:"10px 14px", fontSize:13, lineHeight:1.6, color:"var(--muted)" }}>{summary.summary_text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* stats */}
      <Stagger className="grid grid-cols-4 gap-3">
        {[
          {label:"Succeeded",     value:`${succeeded}/${total}`, color:"var(--green)"},
          {label:"Dead-lettered", value:dead,                    color:"var(--red)"},
          {label:"Total Attempts",value:totalAttempts,           color:"var(--orange)"},
          {label:"Duration",      value:fmtMs(totalMs||null),    color:"var(--muted)"},
        ].map(({label,value,color})=>(
          <SI key={label}>
            <div className="card" style={{ padding:"12px 14px" }}>
              <p style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", color:"var(--dim)", marginBottom:6 }}>{label}</p>
              <p className="mono" style={{ fontSize:18, fontWeight:700, color }}>{value}</p>
            </div>
          </SI>
        ))}
      </Stagger>

      {/* charts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>
        {/* success rate */}
        <div className="card" style={{ padding:"16px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <p style={{ fontSize:12, fontWeight:600, color:"var(--text)", marginBottom:16 }}>Success Rate</p>
          <div style={{ position:"relative", width:120, height:120 }}>
            <svg viewBox="0 0 100 100" style={{ width:"100%", height:"100%", transform:"rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--border2)" strokeWidth="9"/>
              <motion.circle cx="50" cy="50" r="38" fill="none" strokeLinecap="round"
                stroke={successPct>80?"var(--green)":successPct>50?"var(--accent)":"var(--red)"}
                strokeWidth="9"
                strokeDasharray={`${2*Math.PI*38}`}
                initial={{strokeDashoffset:2*Math.PI*38}}
                animate={{strokeDashoffset:2*Math.PI*38*(1-successPct/100)}}
                transition={{duration:1.2,ease:"easeOut",delay:.2}}/>
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <span className="mono" style={{ fontSize:20, fontWeight:700, color:"var(--text)" }}>{successPct.toFixed(0)}%</span>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:16, width:"100%" }}>
            {[{l:"ok",v:succeeded,c:"var(--green)"},{l:"failed",v:dead,c:"var(--red)"}].map(({l,v,c})=>(
              <div key={l} style={{ textAlign:"center", padding:"6px", background:"var(--raised)", borderRadius:4 }}>
                <p className="mono" style={{ fontSize:14, fontWeight:700, color:c }}>{v}</p>
                <p style={{ fontSize:9, color:"var(--dimmer)", textTransform:"uppercase", letterSpacing:".06em", marginTop:2 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* attempts per step */}
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px 8px", borderBottom:"1px solid var(--border)" }}>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Attempts per Step</p>
          </div>
          <div style={{ padding:"12px 16px" }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} margin={{top:4,right:4,left:-28,bottom:0}} barSize={24}>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false}/>
                <XAxis dataKey="step" tick={{fontSize:10,fill:"var(--dim)",fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:10,fill:"var(--dim)"}} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip {...TT}/>
                <Bar dataKey="attempts" radius={[3,3,0,0]}>
                  {barData.map((e,i)=><Cell key={i} fill={DOT[e.status]??"#52525b"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* timeline */}
      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Event Timeline</p>
          <p style={{ fontSize:11, color:"var(--dimmer)" }}>Click to expand attempts</p>
        </div>
        <div style={{ padding:"16px" }}>
          {events.map((ev,i)=><TimelineEvent key={ev.id} ev={ev} idx={i} isLast={i===events.length-1}/>)}
        </div>
      </div>
    </div>
  );
}
