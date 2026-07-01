import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { BarChart2, AlertTriangle, Server, Zap } from "lucide-react";
import Dashboard      from "./pages/Dashboard";
import WorkflowDetail from "./pages/WorkflowDetail";
import DeadLetters    from "./pages/DeadLetters";
import WorkerHealth   from "./pages/WorkerHealth";
import { PageTransition } from "./components/Animated";
import { Header }         from "./components/Header";
import { CommandPalette } from "./components/CommandPalette";

const NAV = [
  { to:"/",            label:"Overview",     icon:BarChart2,    end:true },
  { to:"/deadletters", label:"Dead Letters",  icon:AlertTriangle },
  { to:"/workers",     label:"Workers",       icon:Server        },
];

function Inner() {
  const loc = useLocation();
  const [cmd, setCmd] = useState(false);

  useEffect(()=>{
    const h = (e:KeyboardEvent) => {
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){ e.preventDefault(); setCmd(o=>!o) }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);

  return (
    <div style={{ display:"flex", height:"100vh", background:"var(--bg)" }}>
      <CommandPalette open={cmd} onClose={()=>setCmd(false)} />

      {/* sidebar */}
      <aside className="sidebar">
        {/* logo */}
        <div style={{ padding:"16px 14px 12px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:24, height:24, borderRadius:5,
              background:"var(--accent)", display:"flex",
              alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
              <Zap size={13} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", letterSpacing:"-.01em" }}>
                Converge
              </p>
            </div>
          </div>
        </div>

        {/* nav */}
        <nav style={{ flex:1, padding:"10px 8px", overflowY:"auto", scrollbarWidth:"none" }}>
          <p className="section-label" style={{ paddingLeft:6 }}>Navigation</p>
          {NAV.map(({to,label,icon:Icon,end})=>(
            <NavLink key={to} to={to} end={end}
              className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <Icon size={13} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* search shortcut */}
        <div style={{ padding:"8px", borderTop:"1px solid var(--border)" }}>
          <button onClick={()=>setCmd(true)}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"6px 8px", borderRadius:5, background:"var(--raised)",
              border:"1px solid var(--border)", cursor:"pointer", fontSize:11, color:"var(--dim)" }}>
            <span>Search</span>
            <span style={{ display:"flex", gap:2 }}>
              <kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd>
            </span>
          </button>
        </div>
      </aside>

      {/* main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        <Header onCmdK={()=>setCmd(true)} />
        <main style={{ flex:1, overflowY:"auto" }}>
          <AnimatePresence mode="wait">
            <Routes location={loc} key={loc.pathname}>
              <Route path="/"                element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="/workflows/:wfId" element={<PageTransition><WorkflowDetail /></PageTransition>} />
              <Route path="/deadletters"     element={<PageTransition><DeadLetters /></PageTransition>} />
              <Route path="/workers"         element={<PageTransition><WorkerHealth /></PageTransition>} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{
        style:{ background:"var(--card)", border:"1px solid var(--border2)",
          color:"var(--text)", fontSize:13, borderRadius:6 },
      }} />
      <Inner />
    </BrowserRouter>
  );
}
