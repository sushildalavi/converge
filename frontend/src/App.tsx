import { useEffect, useState } from "react";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { LayoutDashboard, Server, Skull, Zap } from "lucide-react";

import Dashboard     from "./pages/Dashboard";
import WorkflowDetail from "./pages/WorkflowDetail";
import DeadLetters   from "./pages/DeadLetters";
import WorkerHealth  from "./pages/WorkerHealth";
import { PageTransition } from "./components/Animated";
import { Header }    from "./components/Header";
import { CommandPalette } from "./components/CommandPalette";

const NAV = [
  { to: "/",            label: "Dashboard",   icon: LayoutDashboard, end: true },
  { to: "/deadletters", label: "Dead Letters", icon: Skull            },
  { to: "/workers",     label: "Workers",      icon: Server           },
];

/* animation #9 — sidebar nav active pill with layoutId */
function NavItems({ onCmdK }: { onCmdK: () => void }) {
  const loc = useLocation();

  return (
    <LayoutGroup>
      <nav
        className="flex-1 px-3 overflow-y-auto"
        style={{ scrollbarWidth: "none", paddingTop: 6 }}
      >
        <p
          style={{
            color: "#1e293b",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".14em",
            padding: "0 6px 8px",
          }}
        >
          Platform
        </p>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            style={{ marginBottom: 2 }}
          >
            {({ isActive }) => (
              <>
                {/* sliding active pill (animation #9) */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-md"
                    style={{ background: "rgba(99,102,241,0.12)" }}
                    transition={{ duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] }}
                  />
                )}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 2,
                      height: 14,
                      background: "#6366f1",
                      borderRadius: 1,
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 w-full">
                  <Icon size={13} strokeWidth={1.75} />
                  <span>{label}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </LayoutGroup>
  );
}

function Inner() {
  const loc = useLocation();
  const [cmd, setCmd] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmd((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />

      {/* ── sidebar ───────────────────────────────────────── */}
      <aside className="sidebar shrink-0 z-20">
        {/* logo */}
        <div
          className="flex items-center gap-2.5 px-4 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              boxShadow: "0 0 16px rgba(99,102,241,.35)",
            }}
          >
            <Zap size={12} color="#fff" />
          </div>
          <div>
            <p
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              ReplayForge
            </p>
            <p style={{ color: "#1e293b", fontSize: 10, marginTop: 1 }}>
              Workflow Debugger
            </p>
          </div>
        </div>

        {/* live ring — animation #8 */}
        <div className="px-4 py-3 shrink-0">
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
            style={{
              background: "rgba(16,185,129,.05)",
              border: "1px solid rgba(16,185,129,.1)",
            }}
          >
            <span className="live-ring">
              <span className="live-ring-dot" />
            </span>
            <span
              style={{
                color: "#34d399",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".1em",
              }}
            >
              LIVE
            </span>
          </div>
        </div>

        {/* nav items with layoutId pill */}
        <NavItems onCmdK={() => setCmd(true)} />

        {/* cmd-k shortcut button */}
        <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <motion.button
            onClick={() => setCmd(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md"
            style={{
              background: "rgba(255,255,255,.03)",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
            whileHover={{
              background: "rgba(255,255,255,.06)",
              borderColor: "rgba(255,255,255,.1)",
            }}
            /* animation #16 */
            whileTap={{ scale: 0.97 }}
          >
            <span style={{ color: "#334155", fontSize: 11 }}>Quick search</span>
            <span className="flex gap-0.5">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </motion.button>
        </div>
      </aside>

      {/* ── main ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onCmdK={() => setCmd(true)} />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <Routes location={loc} key={loc.pathname}>
              <Route
                path="/"
                element={<PageTransition><Dashboard /></PageTransition>}
              />
              <Route
                path="/workflows/:wfId"
                element={<PageTransition><WorkflowDetail /></PageTransition>}
              />
              <Route
                path="/deadletters"
                element={<PageTransition><DeadLetters /></PageTransition>}
              />
              <Route
                path="/workers"
                element={<PageTransition><WorkerHealth /></PageTransition>}
              />
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
          style: {
            background: "#0c1220",
            border: "1px solid rgba(255,255,255,.1)",
            color: "#e2e8f0",
            fontSize: 13,
            borderRadius: 8,
            boxShadow: "0 16px 40px rgba(0,0,0,.7)",
            fontFamily: "Inter, system-ui, sans-serif",
          },
        }}
      />
      <Inner />
    </BrowserRouter>
  );
}
