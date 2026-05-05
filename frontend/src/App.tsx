import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AlertTriangle, LayoutDashboard, Server, Skull, Zap } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import WorkflowDetail from "./pages/WorkflowDetail";
import DeadLetters from "./pages/DeadLetters";
import WorkerHealth from "./pages/WorkerHealth";
import { PageTransition } from "./components/Animated";
import { Header } from "./components/Header";
import { CommandPalette } from "./components/CommandPalette";

const NAV = [
  { to: "/",            label: "Dashboard",   icon: LayoutDashboard, end: true },
  { to: "/deadletters", label: "Dead Letters", icon: Skull            },
  { to: "/workers",     label: "Workers",      icon: Server           },
];

function Inner() {
  const loc = useLocation();
  const [cmd, setCmd] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmd(o => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />

      {/* ── sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar shrink-0 z-20">
        {/* logo */}
        <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div
            className="w-6 h-6 rounded flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 0 12px rgba(99,102,241,.4)" }}
          >
            <Zap size={12} color="#fff" />
          </div>
          <div>
            <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>ReplayForge</p>
            <p style={{ color: "#334155", fontSize: 10, marginTop: 1 }}>Workflow Debugger</p>
          </div>
        </div>

        {/* live pill */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.12)" }}>
            <span className="relative flex w-1.5 h-1.5 shrink-0">
              <span className="live-ring absolute inset-0 rounded-full" style={{ background: "#10b981" }} />
              <span className="relative rounded-full w-1.5 h-1.5" style={{ background: "#10b981" }} />
            </span>
            <span style={{ color: "#34d399", fontSize: 10, fontWeight: 700, letterSpacing: ".08em" }}>LIVE</span>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <p style={{ color: "#1e293b", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", padding: "0 6px 8px" }}>Platform</p>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <Icon size={13} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* cmd shortcut */}
        <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setCmd(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md"
            style={{ background: "rgba(255,255,255,.03)", border: "1px solid var(--border)", cursor: "pointer" }}
          >
            <span style={{ color: "#334155", fontSize: 11 }}>Quick search</span>
            <span className="flex gap-0.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
          </button>
        </div>
      </aside>

      {/* ── main ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onCmdK={() => setCmd(true)} />
        <main className="flex-1 overflow-y-auto">
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
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "#0c1220", border: "1px solid rgba(255,255,255,.1)", color: "#e2e8f0", fontSize: 13, borderRadius: 8, boxShadow: "0 16px 32px rgba(0,0,0,.6)" },
        }}
      />
      <Inner />
    </BrowserRouter>
  );
}
