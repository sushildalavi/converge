import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BarChart2, AlertTriangle, Server, Zap, RefreshCw, Layers3, ShieldCheck, Workflow } from "lucide-react";
import { api } from "../api/client";
import { toast } from "sonner";

type Item = { id:string; label:string; sub:string; icon:React.ReactNode; action:()=>void };

export function CommandPalette({ open, onClose }: { open:boolean; onClose:()=>void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const items: Item[] = [
    { id:"landing", label:"Landing page",   sub:"Product story and demo flow", icon:<BarChart2 size={13}/>,    action:()=>{ nav("/");onClose() } },
    { id:"dash",    label:"Recovery Console", sub:"Live metrics and recovery state", icon:<ShieldCheck size={13}/>, action:()=>{ nav("/app");onClose() } },
    { id:"workers", label:"Workers",        sub:"Heartbeat monitor",          icon:<Server size={13}/>,        action:()=>{ nav("/app/workers");onClose() } },
    { id:"streams", label:"Stream backlog",  sub:"Pending entries and retry state", icon:<Workflow size={13}/>, action:()=>{ nav("/app/streams");onClose() } },
    { id:"dlq",     label:"Replay / DLQ",    sub:"Review and replay failures", icon:<Layers3 size={13}/>, action:()=>{ nav("/app/replay");onClose() } },
    { id:"conv",    label:"Convergence",     sub:"Recovery verification", icon:<ShieldCheck size={13}/>, action:()=>{ nav("/app/convergence");onClose() } },
    { id:"chaos",   label:"Chaos results",   sub:"Measured benchmark artifacts", icon:<AlertTriangle size={13}/>, action:()=>{ nav("/app/chaos");onClose() } },
    { id:"gen",     label:"Generate workload", sub:"30 synthetic checkout flows", icon:<Zap size={13}/>,
      action:async()=>{ onClose(); try{ const r=await api.generateWorkload(30); toast.success("Generated",{description:`${r.events_sent} events queued`}) }catch{ toast.error("Failed") } } },
    { id:"reload",  label:"Reload",         sub:"Hard refresh all data",      icon:<RefreshCw size={13}/>,     action:()=>window.location.reload() },
  ];

  const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || i.sub.toLowerCase().includes(q.toLowerCase())) : items;

  useEffect(()=>{ setSel(0) },[q]);
  useEffect(()=>{
    if(!open){ setQ(""); return; }
    const t = setTimeout(()=>ref.current?.focus(), 50);
    return ()=>clearTimeout(t);
  },[open]);
  useEffect(()=>{
    if(!open) return;
    const h = (e:KeyboardEvent) => {
      if(e.key==="Escape") onClose();
      if(e.key==="ArrowDown"){ e.preventDefault(); setSel(s=>Math.min(s+1,filtered.length-1)) }
      if(e.key==="ArrowUp"){ e.preventDefault(); setSel(s=>Math.max(s-1,0)) }
      if(e.key==="Enter"){ e.preventDefault(); filtered[sel]?.action() }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[open,filtered,sel,onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50"
            style={{ background:"rgba(4,7,11,.72)", backdropFilter:"blur(8px)" }}
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            transition={{duration:.15}} onClick={onClose} />

          <motion.div className="fixed z-50"
            style={{ top:"16%", left:"50%", width:520, maxWidth:"calc(100vw - 32px)",
              background:"linear-gradient(180deg, rgba(12,18,28,.98), rgba(9,13,21,.96))", border:"1px solid var(--border2)",
              borderRadius:20, boxShadow:"0 30px 90px rgba(0,0,0,.7)",
              overflow:"hidden", x:"-50%", backdropFilter:"blur(18px) saturate(120%)" }}
            initial={{opacity:0,y:-14,scale:.965}}
            animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:-8,scale:.98}}
            transition={{duration:.18,ease:[0.22,0.6,0.36,1]}}>

            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px",
              borderBottom:"1px solid rgba(102,224,210,.12)" }}>
              <input ref={ref} value={q} onChange={e=>setQ(e.target.value)}
                placeholder="Search pages and actions…"
                style={{ flex:1, background:"transparent", border:"none", outline:"none",
                  fontSize:14, color:"var(--text)", fontFamily:"inherit" }} />
              <kbd className="kbd" onClick={onClose}>esc</kbd>
            </div>

            <div style={{ maxHeight:260, overflowY:"auto", padding:"4px 0" }}>
              {filtered.length===0 ? (
                <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--dimmer)", fontSize:12 }}>
                  No results
                </div>
              ) : filtered.map((item,i)=>(
                <div key={item.id}
                  style={{
                    display:"flex", alignItems:"center", gap:12, padding:"9px 16px",
                    cursor:"pointer", background: i===sel?"rgba(74,215,202,.08)":"transparent",
                    transition:"background .12s, transform .12s",
                  }}
                  onClick={item.action}
                  onMouseEnter={()=>setSel(i)}
                  onMouseLeave={()=>setSel(i)}>
                  <span style={{ color:"var(--dim)", flexShrink:0 }}>{item.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:500, color:"var(--text)" }}>{item.label}</p>
                    <p style={{ fontSize:11, color:"var(--dim)", marginTop:1 }}>{item.sub}</p>
                  </div>
                  {i===sel && <kbd className="kbd">↵</kbd>}
                </div>
              ))}
            </div>

            <div style={{ padding:"8px 16px", borderTop:"1px solid var(--border)",
              display:"flex", gap:16, fontSize:11, color:"var(--dimmer)" }}>
              <span><kbd className="kbd">↑↓</kbd> navigate</span>
              <span><kbd className="kbd">↵</kbd> select</span>
              <span><kbd className="kbd">esc</kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
