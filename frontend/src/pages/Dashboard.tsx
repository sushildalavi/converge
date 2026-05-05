import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowUpRight, Play, RefreshCw, TrendingUp, TrendingDown,
  CheckCircle, AlertOctagon, Clock, Activity, Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { LiveFeed } from "../components/LiveFeed";
import { AnimatedNumber, Skeleton, FadeUp, Stagger, SI } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

const pct = (n:number,d:number) => d===0?"–":`${((n/d)*100).toFixed(1)}%`;
const fmtMs = (v:number|null) => v==null?"–":v<1000?`${Math.round(v)}ms`:`${(v/1000).toFixed(2)}s`;
const ago = (iso:string|null) => {
  if(!iso) return "–";
  const s = Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

const TT = {
  contentStyle:{ background:"#18181c", border:"1px solid #2a2a30", borderRadius:6, fontSize:12, padding:"8px 12px" },
  labelStyle:{ color:"#71717a", fontSize:10, marginBottom:2 },
  itemStyle:{ color:"#f4f4f5" },
  cursor:{ stroke:"rgba(255,255,255,.04)" },
};

type Snap = { t:string; processed:number; dead:number; retrying:number };
type HistSnap = { t:string; succeeded:number; dead:number; retrying:number };

export default function Dashboard() {
  const mLoad = useCallback(()=>api.getMetrics(),[]);
  const wLoad = useCallback(()=>api.listWorkflows(40),[]);
  const { data:m, refresh:refM } = usePolling(mLoad,4000);
  const { data:wf, refresh:refWf } = usePolling(wLoad,5000);
  const [gen, setGen] = useState(false);

  const hist     = useRef<HistSnap[]>([]);
  const rateHist = useRef<Snap[]>([]);
  const sparks   = useRef<number[]>([]);

  if(m){
    const t = new Date().toLocaleTimeString("en",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
    const last = hist.current[hist.current.length-1];
    if(!last || last.t!==t){
      const snap: HistSnap = { t, succeeded:m.succeeded, dead:m.dead_lettered, retrying:m.retrying };
      if(last){
        rateHist.current = [...rateHist.current.slice(-29),{
          t,
          processed: Math.max(0,snap.succeeded-last.succeeded),
          dead:      Math.max(0,snap.dead-last.dead),
          retrying:  snap.retrying,
        }];
      } else {
        rateHist.current = [{ t, processed:0, dead:0, retrying:m.retrying }];
      }
      hist.current = [...hist.current.slice(-29), snap];
      sparks.current = [...sparks.current.slice(-8), m.total_events];
    }
  }

  const tp = (()=>{
    if(hist.current.length<4) return null;
    const sl = hist.current.slice(-6);
    const d = sl[sl.length-1].succeeded - sl[0].succeeded;
    return Math.round((d/((sl.length-1)*4))*60);
  })();

  const generate = async () => {
    setGen(true);
    try {
      const r = await api.generateWorkload(30);
      toast.success("Workload generated",{description:`${r.events_sent} events queued`});
      setTimeout(()=>{ refM(); refWf() },800);
    } catch { toast.error("Generation failed"); }
    finally { setGen(false); }
  };

  const barData = m ? [
    { name:"Succeeded", v:m.succeeded,     c:"#4ade80" },
    { name:"Queued",    v:m.queued,         c:"#60a5fa" },
    { name:"Retrying",  v:m.retrying,       c:"#fb923c" },
    { name:"Dead",      v:m.dead_lettered,  c:"#f87171" },
    { name:"Processing",v:m.processing,     c:"#fbbf24" },
  ] : [];

  return (
    <div className="page" style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* top bar: title + stats + action */}
      <FadeUp>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:4 }}>
          <div>
            <h1 style={{ fontSize:17, fontWeight:600, color:"var(--text)", letterSpacing:"-.02em" }}>Overview</h1>
            {m && (
              <p className="mono" style={{ fontSize:11, color:"var(--dim)", marginTop:3 }}>
                <span style={{ color:"var(--muted)" }}><AnimatedNumber value={m.total_events} /></span>
                {" events · "}
                <span style={{ color:"var(--green)" }}>{pct(m.succeeded,m.total_events)}</span>
                {" success · "}
                <span style={{ color:"var(--red)" }}>{pct(m.dead_lettered,m.total_events)}</span>
                {" error"}
                {tp!=null && <> · <span style={{ color:"var(--accent)" }}>{tp}/min</span></>}
              </p>
            )}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <motion.button className="btn-outline" onClick={()=>{refM();refWf()}} whileTap={{scale:.93}}>
              <RefreshCw size={12} />
            </motion.button>
            <motion.button className="btn-amber" onClick={generate} disabled={gen} whileTap={{scale:.93}}>
              {gen ? <RefreshCw size={12} className="animate-spin"/> : <Play size={12}/>}
              {gen ? "Generating…" : "Generate Workload"}
            </motion.button>
          </div>
        </div>
      </FadeUp>

      {/* stat band — horizontal, compact */}
      <div className="stat-band">
        {[
          { label:"Total Events",   value:m?.total_events??null, icon:<Activity size={12}/>,     color:"var(--accent)", mono:true },
          { label:"Succeeded",      value:m?.succeeded??null,    icon:<CheckCircle size={12}/>,   color:"var(--green)",  mono:true },
          { label:"Dead-lettered",  value:m?.dead_lettered??null,icon:<AlertOctagon size={12}/>,  color:"var(--red)",    mono:true },
          { label:"Active Workers", value:m?.active_workers??null,icon:<Users size={12}/>,        color:"var(--blue)",   mono:true },
          { label:"p50 Latency",    value:m?fmtMs(m.p50_attempt_duration_ms):null, icon:<Clock size={12}/>, color:"var(--muted)", mono:false },
        ].map(({ label, value, icon, color, mono }, i) => (
          <div key={i} className="stat-item">
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"var(--dim)", marginBottom:6 }}>
              <span style={{ color }}>{icon}</span>
              <span style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>{label}</span>
            </div>
            <div className={mono?"mono":""} style={{ fontSize:22, fontWeight:700, color:"var(--text)", letterSpacing:"-.02em", lineHeight:1 }}>
              {value===null ? <Skeleton className="w-14 h-5" /> :
               typeof value==="number" ? <AnimatedNumber value={value} /> : value}
            </div>
          </div>
        ))}
      </div>

      {/* secondary stats row */}
      <Stagger className="grid grid-cols-4 gap-3">
        {[
          { label:"Retrying",       value:m?.retrying??null,                 icon:<RefreshCw size={11}/>,    color:"var(--orange)" },
          { label:"Replay Success", value:m?`${(m.replay_success_rate*100).toFixed(0)}%`:null, icon:<TrendingUp size={11}/>, color:"var(--muted)" },
          { label:"p95 Latency",    value:m?fmtMs(m.p95_attempt_duration_ms):null, icon:<Clock size={11}/>, color:"var(--muted)" },
          { label:"Stale Workers",  value:m?.stale_workers??null,             icon:<TrendingDown size={11}/>,color:m?.stale_workers?"var(--red)":"var(--green)" },
        ].map(({ label, value, icon, color }, i) => (
          <SI key={i}>
            <div className="card" style={{ padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
                <span style={{ color }}>{icon}</span>
                <span style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", color:"var(--dim)" }}>{label}</span>
              </div>
              <div className="mono" style={{ fontSize:18, fontWeight:700, color:"var(--text)" }}>
                {value===null ? <Skeleton className="w-10 h-4" /> :
                 typeof value==="number" ? <AnimatedNumber value={value} /> : value}
              </div>
            </div>
          </SI>
        ))}
      </Stagger>

      {/* charts */}
      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:12, height:300 }}>

        {/* area chart */}
        <div className="card" style={{ overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"12px 16px 8px", borderBottom:"1px solid var(--border)",
            display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Event Rate</p>
            <div style={{ display:"flex", gap:12, fontSize:10, color:"var(--dimmer)" }}>
              {[["Processed","#4ade80"],["Dead","#f87171"],["Retrying","#fb923c"]].map(([l,c])=>(
                <span key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ width:8, height:2, borderRadius:1, background:c, display:"inline-block" }}/>
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex:1, padding:"8px 8px 4px" }}>
            {rateHist.current.length < 3 ? (
              <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                color:"var(--dimmer)", fontSize:12 }}>
                Collecting data — updates every 4s
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rateHist.current} margin={{top:4,right:4,left:-28,bottom:0}}>
                  <defs>
                    {[["ok","#4ade80"],["dl","#f87171"],["re","#fb923c"]].map(([id,c])=>(
                      <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={c} stopOpacity={.2} />
                        <stop offset="100%" stopColor={c} stopOpacity={.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,.04)" vertical={false}/>
                  <XAxis dataKey="t" tick={{fontSize:9,fill:"var(--dimmer)",fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                  <YAxis tick={{fontSize:9,fill:"var(--dimmer)"}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <Tooltip {...TT}/>
                  <Area type="monotone" dataKey="processed" name="Processed" stroke="#4ade80" fill="url(#gok)" strokeWidth={1.5} dot={false} activeDot={{r:3,fill:"#4ade80",strokeWidth:0}}/>
                  <Area type="monotone" dataKey="retrying"  name="Retrying"  stroke="#fb923c" fill="url(#gre)" strokeWidth={1.5} dot={false} activeDot={{r:3,fill:"#fb923c",strokeWidth:0}}/>
                  <Area type="monotone" dataKey="dead"      name="Dead"      stroke="#f87171" fill="url(#gdl)" strokeWidth={1.5} dot={false} activeDot={{r:3,fill:"#f87171",strokeWidth:0}}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* live feed */}
        <LiveFeed />
      </div>

      {/* status bar chart + workflow table */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>

        {/* bar */}
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px 8px", borderBottom:"1px solid var(--border)" }}>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Distribution</p>
          </div>
          <div style={{ padding:"12px 16px 12px" }}>
            {!m ? (
              <div className="space-y-3">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-7 w-full"/>)}</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} layout="vertical" margin={{top:0,right:0,left:0,bottom:0}} barSize={14}>
                  <XAxis type="number" hide/>
                  <YAxis type="category" dataKey="name"
                    tick={{fontSize:10,fill:"var(--dim)",fontFamily:"JetBrains Mono"}}
                    tickLine={false} axisLine={false} width={62}/>
                  <Tooltip {...TT}/>
                  <Bar dataKey="v" name="Events" radius={[0,3,3,0]}>
                    {barData.map((b,i)=><Cell key={i} fill={b.c}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {m && (
              <div className="mono" style={{ fontSize:10, color:"var(--dimmer)", marginTop:8,
                paddingTop:8, borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between" }}>
                <span>Total: <span style={{color:"var(--muted)"}}>{m.total_events.toLocaleString()}</span></span>
                <span>OK: <span style={{color:"var(--green)"}}>{pct(m.succeeded,m.total_events)}</span></span>
              </div>
            )}
          </div>
        </div>

        {/* workflow table */}
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px 8px", borderBottom:"1px solid var(--border)",
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Recent Workflows</p>
            {wf && <span className="mono" style={{ fontSize:10, color:"var(--dimmer)" }}>{wf.length}</span>}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Workflow","Events","Success","DLQ","In-flight","Status","Updated"].map(h=>(
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!wf ? [...Array(5)].map((_,i)=>(
                  <tr key={i} className="tr">
                    {[...Array(7)].map((_,j)=><td key={j} className="td"><Skeleton className="h-3 w-full"/></td>)}
                  </tr>
                )) : wf.length===0 ? (
                  <tr><td colSpan={7} style={{padding:"32px 0",textAlign:"center",color:"var(--dimmer)",fontSize:12}}>
                    No workflows — click Generate Workload
                  </td></tr>
                ) : wf.map((w,i)=>(
                  <motion.tr key={w.workflow_id} className="tr"
                    initial={{opacity:0}} animate={{opacity:1}}
                    transition={{delay:Math.min(i*.01,.2),duration:.15}}>
                    <td className="td" style={{paddingLeft:16}}>
                      <Link to={`/workflows/${w.workflow_id}`}
                        style={{ color:"var(--accent2)", textDecoration:"none", fontSize:12,
                          fontFamily:"JetBrains Mono", fontWeight:500,
                          display:"flex", alignItems:"center", gap:4 }}
                        onMouseEnter={e=>((e.currentTarget as HTMLElement).style.color="var(--text)")}
                        onMouseLeave={e=>((e.currentTarget as HTMLElement).style.color="var(--accent2)")}>
                        {w.workflow_id}
                        <ArrowUpRight size={9} style={{opacity:.5}}/>
                      </Link>
                    </td>
                    <td className="td mono" style={{fontSize:12}}>{w.total_events}</td>
                    <td className="td mono" style={{fontSize:12,color:"var(--green)"}}>{w.succeeded}</td>
                    <td className="td mono" style={{fontSize:12}}>
                      {w.dead_lettered>0?<span style={{color:"var(--red)",fontWeight:700}}>{w.dead_lettered}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                    </td>
                    <td className="td mono" style={{fontSize:12}}>
                      {w.in_flight>0?<span style={{color:"var(--accent)"}}>{w.in_flight}</span>:<span style={{color:"var(--dimmer)"}}>—</span>}
                    </td>
                    <td className="td"><EventStatusBadge status={w.has_failures?"dead_lettered":w.in_flight>0?"processing":"succeeded"}/></td>
                    <td className="td mono" style={{fontSize:11,color:"var(--dim)"}}>{ago(w.last_updated_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
