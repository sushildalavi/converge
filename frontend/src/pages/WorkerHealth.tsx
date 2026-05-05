import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Server, Activity, Clock } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { FadeUp, Stagger, SI, Skeleton } from "../components/Animated";
import type { WorkerOut } from "../types";

const ago = (iso:string) => {
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<10) return "just now"; if(s<60) return `${s}s ago`; return `${Math.floor(s/60)}m ago`;
};
const hbAge = (iso:string) => Math.floor((Date.now()-new Date(iso).getTime())/1000);

const STATUS_COLOR: Record<string,{ text:string; bg:string; border:string; dot:string }> = {
  active:  { text:"#4ade80", bg:"rgba(74,222,128,.08)",  border:"rgba(74,222,128,.2)",  dot:"#22c55e" },
  busy:    { text:"#fbbf24", bg:"rgba(251,191,36,.08)",  border:"rgba(251,191,36,.2)",  dot:"#f59e0b" },
  stale:   { text:"#fb923c", bg:"rgba(251,146,60,.08)",  border:"rgba(251,146,60,.2)",  dot:"#f97316" },
  stopped: { text:"#71717a", bg:"rgba(113,113,122,.06)", border:"rgba(113,113,122,.2)", dot:"#52525b" },
  crashed: { text:"#f87171", bg:"rgba(248,113,113,.08)", border:"rgba(248,113,113,.2)", dot:"#ef4444" },
};

function WorkerCard({ w, i }: { w:WorkerOut; i:number }) {
  const eff  = w.is_stale?"stale":w.status;
  const cfg  = STATUS_COLOR[eff]??STATUS_COLOR.stopped;
  const age  = hbAge(w.last_heartbeat_at);
  const live = !w.is_stale&&w.status==="active";

  return (
    <motion.div className="card" style={{ overflow:"hidden" }}
      initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
      transition={{delay:i*.06,duration:.22}}>

      {/* status stripe */}
      <div style={{ height:2, background:cfg.dot }}/>

      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Server size={14} style={{ color:"var(--dim)" }}/>
            <span className="mono" style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{w.worker_name}</span>
          </div>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4,
            padding:"2px 7px", borderRadius:3, fontSize:11, fontWeight:500,
            background:cfg.bg, color:cfg.text, border:`1px solid ${cfg.border}`,
            fontFamily:"JetBrains Mono" }}>
            <span style={{ width:5,height:5,borderRadius:"50%",background:cfg.dot,display:"inline-block" }}/>
            {eff}
          </span>
        </div>

        {/* heartbeat */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:10, color:"var(--dim)", textTransform:"uppercase", letterSpacing:".06em" }}>Heartbeat</span>
            <span className="mono" style={{ fontSize:10, color:age>30?"var(--orange)":"var(--dim)" }}>{ago(w.last_heartbeat_at)}</span>
          </div>
          <div style={{ height:3, borderRadius:2, background:"var(--raised)", overflow:"hidden" }}>
            <motion.div style={{ height:"100%", borderRadius:2, background:cfg.dot, transformOrigin:"left" } as React.CSSProperties}
              animate={live?{scaleX:[1,.15,1],opacity:[1,.4,1]}:{scaleX:Math.max(.04,1-age/60)}}
              transition={live?{duration:2,repeat:Infinity,ease:"easeInOut"}:{duration:.5}}/>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[
            { label:"Status",     value:eff },
            { label:"Processing", value:w.current_event_id?w.current_event_id.slice(0,10)+"…":"idle" },
          ].map(({label,value})=>(
            <div key={label} style={{ background:"var(--raised)", borderRadius:4, padding:"6px 8px" }}>
              <p style={{ fontSize:9, color:"var(--dimmer)", textTransform:"uppercase", letterSpacing:".06em" }}>{label}</p>
              <p className="mono" style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function WorkerHealth() {
  const loader = useCallback(()=>api.listWorkers(),[]);
  const { data,loading } = usePolling(loader,4000);

  const active  = (data??[]).filter(w=>!w.is_stale&&w.status==="active").length;
  const stale   = (data??[]).filter(w=>w.is_stale).length;
  const crashed = (data??[]).filter(w=>w.status==="crashed").length;
  const total   = (data??[]).length;
  const pct     = total>0?Math.round((active/total)*100):0;
  const arcColor = pct>80?"#4ade80":pct>50?"#f59e0b":"#f87171";
  const circ    = 2*Math.PI*22;

  return (
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16}}>

      <FadeUp>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Server size={16} style={{color:"var(--dim)"}}/>
          <h1 style={{fontSize:17,fontWeight:600,color:"var(--text)",letterSpacing:"-.02em"}}>Workers</h1>
        </div>
        <p style={{fontSize:12,color:"var(--dim)",marginTop:4}}>Heartbeat monitor · stale threshold 30s</p>
      </FadeUp>

      {data&&data.length>0&&(
        <Stagger className="grid grid-cols-4 gap-3">
          {/* fleet arc */}
          <SI>
            <div className="card" style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{position:"relative",width:52,height:52,flexShrink:0}}>
                <svg viewBox="0 0 56 56" style={{width:"100%",height:"100%",transform:"rotate(-90deg)"}}>
                  <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border2)" strokeWidth="6"/>
                  <motion.circle cx="28" cy="28" r="22" fill="none" strokeLinecap="round"
                    stroke={arcColor} strokeWidth="6"
                    strokeDasharray={circ}
                    initial={{strokeDashoffset:circ}}
                    animate={{strokeDashoffset:circ*(1-pct/100)}}
                    transition={{duration:1.1,ease:"easeOut"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span className="mono" style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{pct}%</span>
                </div>
              </div>
              <div>
                <p style={{fontSize:10,color:"var(--dim)",textTransform:"uppercase",letterSpacing:".06em"}}>Fleet Health</p>
                <p className="mono" style={{fontSize:18,fontWeight:700,color:"var(--text)"}}>{active}<span style={{fontSize:12,color:"var(--dimmer)"}}>/{total}</span></p>
              </div>
            </div>
          </SI>
          {[
            {label:"Active",  value:active,  color:"var(--green)"},
            {label:"Stale",   value:stale,   color:stale>0?"var(--orange)":"var(--dimmer)"},
            {label:"Crashed", value:crashed, color:crashed>0?"var(--red)":"var(--dimmer)"},
          ].map(({label,value,color})=>(
            <SI key={label}>
              <div className="card" style={{padding:"14px 16px"}}>
                <p style={{fontSize:10,color:"var(--dim)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{label}</p>
                <p className="mono" style={{fontSize:22,fontWeight:700,color}}>{value}</p>
              </div>
            </SI>
          ))}
        </Stagger>
      )}

      {loading&&!data?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[...Array(3)].map((_,i)=><Skeleton key={i} className="h-36"/>)}
        </div>
      ):(data??[]).length===0?(
        <div className="card" style={{padding:"48px",textAlign:"center"}}>
          <Server size={28} style={{color:"var(--border2)",margin:"0 auto 8px"}}/>
          <p style={{fontSize:13,color:"var(--dim)"}}>No workers registered</p>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
          {data!.map((w,i)=><WorkerCard key={w.id} w={w} i={i}/>)}
        </div>
      )}
    </div>
  );
}
