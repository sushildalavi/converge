import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { FadeUp, Stagger, SI, Skeleton } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";
import type { DeadLetterOut } from "../types";

const ago = (iso:string) => {
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60) return `${s}s`; if(s<3600) return `${Math.floor(s/60)}m`; return `${Math.floor(s/3600)}h`;
};

type RS="idle"|"replaying"|"done";

function Row({ dl, refresh }: { dl:DeadLetterOut; refresh:()=>void }) {
  const [state,setState] = useState<RS>("idle");
  const done = !!dl.replayed_at||state==="done";

  const replay = async () => {
    if(done||state==="replaying") return;
    setState("replaying");
    try {
      await api.replayDeadLetter(dl.id);
      setState("done");
      toast.success("Replayed",{description:`${dl.event_type} re-queued`});
      setTimeout(refresh,800);
    } catch { toast.error("Replay failed"); setState("idle"); }
  };

  return (
    <motion.tr className="tr" layout
      initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.18}}>
      <td className="td" style={{paddingLeft:16}}>
        <span className="mono" style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{dl.event_type}</span>
      </td>
      <td className="td">
        <Link to={`/workflows/${dl.workflow_id}`}
          style={{color:"var(--accent2)",textDecoration:"none",fontFamily:"JetBrains Mono",fontSize:11}}
          onMouseEnter={e=>((e.currentTarget as HTMLElement).style.color="var(--text)")}
          onMouseLeave={e=>((e.currentTarget as HTMLElement).style.color="var(--accent2)")}>
          {dl.workflow_id.slice(-18)}
        </Link>
      </td>
      <td className="td" style={{fontSize:11,color:"var(--dim)"}}>{dl.service_name}</td>
      <td className="td">
        <span className="mono" style={{fontSize:10,color:"var(--red)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",maxWidth:200}} title={dl.last_error??""}>
          {dl.last_error??"—"}
        </span>
      </td>
      <td className="td mono" style={{fontSize:11,color:"var(--dim)"}}>{ago(dl.created_at)} ago</td>
      <td className="td">{done?<EventStatusBadge status="replayed"/>:<EventStatusBadge status="dead_lettered"/>}</td>
      <td className="td" style={{paddingRight:14}}>
        {done?(
          <span className="mono" style={{fontSize:10,color:"var(--dimmer)"}}>
            {dl.replayed_at?ago(dl.replayed_at)+" ago":"just now"}
          </span>
        ):(
          <motion.button className="btn-green" onClick={replay} disabled={state==="replaying"}
            whileTap={{scale:.92}}>
            <RefreshCw size={9} className={state==="replaying"?"animate-spin":""}/>
            {state==="replaying"?"…":"Replay"}
          </motion.button>
        )}
      </td>
    </motion.tr>
  );
}

export default function DeadLetters() {
  const loader = useCallback(()=>api.listDeadLetters(100),[]);
  const { data,loading,error,refresh } = usePolling(loader,5000);
  const pending  = (data??[]).filter(d=>!d.replayed_at).length;
  const replayed = (data??[]).filter(d=>!!d.replayed_at).length;

  return (
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16}}>

      <FadeUp>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <AlertTriangle size={16} style={{color:"var(--red)"}}/>
          <h1 style={{fontSize:17,fontWeight:600,color:"var(--text)",letterSpacing:"-.02em"}}>Dead Letter Queue</h1>
        </div>
        <p style={{fontSize:12,color:"var(--dim)",marginTop:4}}>Events that exhausted all retry attempts</p>
      </FadeUp>

      {data&&data.length>0&&(
        <Stagger className="grid grid-cols-3 gap-3">
          {[
            {label:"Total",   value:data.length, color:"var(--text)"},
            {label:"Pending", value:pending,     color:"var(--red)"},
            {label:"Replayed",value:replayed,    color:"var(--green)"},
          ].map(({label,value,color})=>(
            <SI key={label}>
              <div className="card" style={{padding:"12px 16px",textAlign:"center"}}>
                <p className="mono" style={{fontSize:24,fontWeight:700,color,letterSpacing:"-.02em"}}>{value}</p>
                <p style={{fontSize:10,color:"var(--dim)",marginTop:4,textTransform:"uppercase",letterSpacing:".06em"}}>{label}</p>
              </div>
            </SI>
          ))}
        </Stagger>
      )}

      {error&&(
        <div style={{padding:"10px 14px",borderRadius:5,color:"var(--red)",
          background:"rgba(248,113,113,.07)",border:"1px solid rgba(248,113,113,.2)",fontSize:12}}>
          {error}
        </div>
      )}

      <div className="card" style={{overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{borderBottom:"1px solid var(--border)"}}>
              {["Event","Workflow","Service","Last Error","Age","Status","Action"].map(h=>(
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&!data?[...Array(4)].map((_,i)=>(
              <tr key={i} className="tr">
                {[...Array(7)].map((_,j)=><td key={j} className="td"><Skeleton className="h-3 w-full"/></td>)}
              </tr>
            )):(data??[]).length===0?(
              <tr><td colSpan={7} style={{padding:"40px 0",textAlign:"center",color:"var(--dimmer)",fontSize:12}}>
                No dead letters yet
              </td></tr>
            ):(
              <AnimatePresence>
                {data!.map(dl=><Row key={dl.id} dl={dl} refresh={refresh}/>)}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
