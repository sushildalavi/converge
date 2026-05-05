# ReplayForge — Complete Frontend Source Code

> Paste this entire file into Claude Design / v0.dev / any Claude session
> and ask it to redesign the UI.

## Project context

ReplayForge is a dark-theme workflow debugging SaaS dashboard built with:
- React 18 + TypeScript + Vite
- Tailwind CSS + Framer Motion animations
- Recharts for data visualisation
- Sonner for toasts
- JetBrains Mono for monospace data, Inter for UI text

## Live API endpoints (backend running on localhost:8000)

```
GET  /api/metrics          → { total_events, succeeded, dead_lettered, retrying, active_workers, p50_attempt_duration_ms, p95_attempt_duration_ms, ... }
GET  /api/workflows        → [{ workflow_id, total_events, succeeded, dead_lettered, in_flight, has_failures, last_updated_at }]
GET  /api/workflows/{id}/timeline → { workflow_id, events: [{ event_type, status, attempt_count, attempts: [...] }] }
GET  /api/deadletters      → [{ id, event_type, workflow_id, service_name, last_error, created_at, replayed_at }]
POST /api/deadletters/{id}/replay
GET  /api/workers          → [{ id, worker_name, status, last_heartbeat_at, is_stale }]
GET  /api/events/recent    → [{ id, event_type, service_name, workflow_id, status, attempt_count, last_error, updated_at }]
POST /api/demo/generate-workload?count=N
```


---

## `src/App.tsx`

```typescript
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

```

---

## `src/api/client.ts`

```typescript
import axios from "axios";
import type {
  DeadLetterOut, EventOut, IncidentSummaryOut,
  MetricsOut, WorkerOut, WorkflowSummaryOut, WorkflowTimelineOut,
} from "../types";

const http = axios.create({
  baseURL: "",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

export type RecentEvent = {
  id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  updated_at: string | null;
};

export const api = {
  getMetrics: () => http.get<MetricsOut>("/api/metrics").then(r => r.data),
  listWorkflows: (limit = 50) => http.get<WorkflowSummaryOut[]>("/api/workflows", { params: { limit } }).then(r => r.data),
  getWorkflowTimeline: (id: string) => http.get<WorkflowTimelineOut>(`/api/workflows/${id}/timeline`).then(r => r.data),
  listDeadLetters: (limit = 100) => http.get<DeadLetterOut[]>("/api/deadletters", { params: { limit } }).then(r => r.data),
  replayDeadLetter: (id: string) => http.post<EventOut>(`/api/deadletters/${id}/replay`).then(r => r.data),
  listWorkers: () => http.get<WorkerOut[]>("/api/workers").then(r => r.data),
  summarizeIncident: (wfId: string) => http.post<IncidentSummaryOut>(`/api/incidents/${wfId}/summarize`).then(r => r.data),
  generateWorkload: (count = 30) => http.post<{ workflows: number; events_sent: number; errors: number }>("/api/demo/generate-workload", null, { params: { count } }).then(r => r.data),
  recentEvents: (limit = 40) => http.get<RecentEvent[]>("/api/events/recent", { params: { limit } }).then(r => r.data),
};

```

---

## `src/components/Animated.tsx`

```typescript
import {
  motion,
  AnimatePresence,
  useSpring,
  useTransform,
  useInView,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, MouseEvent } from "react";

const EASE = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number];

/* ─────────────────────────────────────────────────────────────
   AnimatedNumber — spring counter with tick animation
   ───────────────────────────────────────────────────────────── */
export function AnimatedNumber({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const display = useTransform(spring, (v) =>
    decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString()
  );
  const [text, setText] = useState(
    decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString()
  );
  const [key, setKey] = useState(0);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsub = display.on("change", (v) => {
      setText(v);
      setKey((k) => k + 1);
    });
    return unsub;
  }, [display]);

  return (
    <span key={key} className="tick">
      {text}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Skeleton — shimmer loading placeholder
   ───────────────────────────────────────────────────────────── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─────────────────────────────────────────────────────────────
   Stagger container & item
   ───────────────────────────────────────────────────────────── */
export const staggerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: EASE },
  },
};

export function Stagger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FadeIn — opacity + y
   ───────────────────────────────────────────────────────────── */
export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PageTransition — blur + opacity (animation #1)
   ───────────────────────────────────────────────────────────── */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(6px)", y: 6 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      exit={{ opacity: 0, filter: "blur(3px)", y: -4 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AppearOnScroll — useInView trigger (animation #28)
   ───────────────────────────────────────────────────────────── */
export function AppearOnScroll({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.38, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SpotlightCard — mouse-follow radial gradient (animation #6)
   ───────────────────────────────────────────────────────────── */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mouse-x", `${x}%`);
    el.style.setProperty("--mouse-y", `${y}%`);
  }, []);

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      onMouseMove={handleMouseMove}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PresenceFade — collapse/expand with AnimatePresence
   ───────────────────────────────────────────────────────────── */
export function PresenceFade({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

```

---

## `src/components/CommandPalette.tsx`

```typescript
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LayoutDashboard, RefreshCw, Server, Skull, Zap } from "lucide-react";
import { api } from "../api/client";
import { toast } from "sonner";

type Item = {
  id: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  action: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/* animation #10 — command palette spring open
   animation #27 — item hover layoutId sliding background pill */
export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Item[] = [
    {
      id: "dash",
      label: "Dashboard",
      sub: "Overview and live metrics",
      icon: <LayoutDashboard size={14} style={{ color: "#818cf8" }} />,
      action: () => { navigate("/"); onClose(); },
    },
    {
      id: "dlq",
      label: "Dead Letter Queue",
      sub: "Review and replay failures",
      icon: <Skull size={14} style={{ color: "#f43f5e" }} />,
      action: () => { navigate("/deadletters"); onClose(); },
    },
    {
      id: "workers",
      label: "Worker Health",
      sub: "Heartbeat and fleet status",
      icon: <Server size={14} style={{ color: "#34d399" }} />,
      action: () => { navigate("/workers"); onClose(); },
    },
    {
      id: "gen",
      label: "Generate Workload",
      sub: "30 synthetic checkout flows",
      icon: <Zap size={14} style={{ color: "#f59e0b" }} />,
      action: async () => {
        onClose();
        try {
          const r = await api.generateWorkload(30);
          toast.success("Workload generated", { description: `${r.events_sent} events queued` });
        } catch {
          toast.error("Generation failed");
        }
      },
    },
    {
      id: "reload",
      label: "Reload page",
      sub: "Hard refresh all data",
      icon: <RefreshCw size={14} style={{ color: "#64748b" }} />,
      action: () => { window.location.reload(); },
    },
    {
      id: "dlq2",
      label: "Dead Letters",
      sub: "Events exhausting all retries",
      icon: <AlertTriangle size={14} style={{ color: "#f97316" }} />,
      action: () => { navigate("/deadletters"); onClose(); },
    },
  ];

  const filtered = query.trim()
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.sub?.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[selected]?.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, onClose]);

  // auto-focus input
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />

          {/* palette — animation #10: spring open */}
          <motion.div
            className="fixed z-50"
            style={{
              top: "18%",
              left: "50%",
              width: 520,
              maxWidth: "calc(100vw - 32px)",
              x: "-50%",
              background: "rgba(8,14,28,0.98)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              boxShadow:
                "0 0 0 1px rgba(99,102,241,0.08), 0 32px 64px rgba(0,0,0,0.9), 0 8px 24px rgba(99,102,241,0.06)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              overflow: "hidden",
            }}
            initial={{ opacity: 0, y: -14, scale: 0.94, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0,   scale: 1,    filter: "blur(0px)" }}
            exit={{ opacity: 0,    y: -8,  scale: 0.97, filter: "blur(2px)" }}
            transition={{ duration: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {/* search input */}
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Zap size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, actions…"
                className="flex-1 bg-transparent outline-none"
                style={{
                  fontSize: 14,
                  color: "#e2e8f0",
                  fontFamily: "inherit",
                }}
              />
              <div className="flex items-center gap-1">
                <kbd className="kbd">esc</kbd>
              </div>
            </div>

            {/* results */}
            <LayoutGroup>
              <div
                className="py-1.5 overflow-y-auto"
                style={{ maxHeight: 280, scrollbarWidth: "none" }}
              >
                {filtered.length === 0 ? (
                  <div
                    className="px-4 py-10 text-center"
                    style={{ color: "#334155", fontSize: 13 }}
                  >
                    No results for &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filtered.map((item, i) => (
                    <motion.button
                      key={item.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left relative"
                      onClick={item.action}
                      onMouseEnter={() => setSelected(i)}
                      /* animation #16: whileTap scale */
                      whileTap={{ scale: 0.98 }}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      {/* animation #27: layoutId background pill */}
                      {i === selected && (
                        <motion.div
                          layoutId="cmd-pill"
                          className="absolute inset-x-1.5 inset-y-0.5 rounded-lg"
                          style={{ background: "rgba(99,102,241,0.12)" }}
                          transition={{ duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] }}
                        />
                      )}
                      <span
                        className="relative z-10 shrink-0"
                        style={{ color: "#475569" }}
                      >
                        {item.icon}
                      </span>
                      <div className="relative z-10 flex-1 min-w-0">
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#e2e8f0",
                          }}
                        >
                          {item.label}
                        </p>
                        {item.sub && (
                          <p
                            style={{ fontSize: 11, marginTop: 1, color: "#475569" }}
                          >
                            {item.sub}
                          </p>
                        )}
                      </div>
                      {i === selected && (
                        <kbd className="kbd relative z-10 shrink-0">↵</kbd>
                      )}
                    </motion.button>
                  ))
                )}
              </div>
            </LayoutGroup>

            {/* footer */}
            <div
              className="px-4 py-2.5 flex items-center gap-4"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.05)",
                color: "#334155",
                fontSize: 11,
              }}
            >
              <span className="flex items-center gap-1">
                <kbd className="kbd">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">esc</kbd> close
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

```

---

## `src/components/DeadLetterTable.tsx`

```typescript
export {}; // kept for import compatibility — DLQ logic moved into DeadLetters.tsx

```

---

## `src/components/EventStatusBadge.tsx`

```typescript
/* EventStatusBadge — animated dot for active states (animation #11) */

const S: Record<
  string,
  { bg: string; color: string; border: string; dot: string; pulse?: true }
> = {
  received:      { bg: "rgba(30,41,59,.5)",    color: "#64748b", border: "rgba(100,116,139,.18)", dot: "#475569" },
  queued:        { bg: "rgba(30,58,138,.2)",   color: "#93c5fd", border: "rgba(59,130,246,.18)",  dot: "#60a5fa" },
  processing:    { bg: "rgba(120,53,15,.25)",  color: "#fcd34d", border: "rgba(245,158,11,.22)",  dot: "#fbbf24", pulse: true },
  succeeded:     { bg: "rgba(6,78,59,.2)",     color: "#6ee7b7", border: "rgba(16,185,129,.18)",  dot: "#34d399" },
  failed:        { bg: "rgba(127,29,29,.2)",   color: "#fca5a5", border: "rgba(239,68,68,.18)",   dot: "#f87171" },
  retrying:      { bg: "rgba(124,45,18,.22)",  color: "#fdba74", border: "rgba(249,115,22,.2)",   dot: "#fb923c", pulse: true },
  dead_lettered: { bg: "rgba(136,19,55,.22)",  color: "#fda4af", border: "rgba(244,63,94,.2)",    dot: "#fb7185" },
  replayed:      { bg: "rgba(88,28,135,.2)",   color: "#d8b4fe", border: "rgba(168,85,247,.18)",  dot: "#c084fc" },
  cancelled:     { bg: "rgba(15,23,42,.4)",    color: "#475569", border: "rgba(71,85,105,.15)",   dot: "#334155" },
  pending:       { bg: "rgba(30,58,138,.18)",  color: "#93c5fd", border: "rgba(59,130,246,.15)",  dot: "#60a5fa" },
};

export function EventStatusBadge({ status }: { status: string }) {
  const s = S[status] ?? S.received;
  return (
    <span
      className="badge"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      <span
        className={`rounded-full shrink-0 ${s.pulse ? "badge-pulse-dot" : ""}`}
        style={{
          width: 5,
          height: 5,
          background: s.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}

```

---

## `src/components/Header.tsx`

```typescript
import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle, AlertTriangle, XCircle, Search } from "lucide-react";
import { usePolling } from "../hooks/usePolling";
import { api } from "../api/client";
import { AnimatedNumber } from "./Animated";

const CRUMBS: Record<string, string> = {
  "/":             "Dashboard",
  "/deadletters":  "Dead Letters",
  "/workers":      "Workers",
};

type Health = "healthy" | "degraded" | "critical";

const HCfg: Record<
  Health,
  { label: string; color: string; bg: string; border: string; Icon: typeof CheckCircle }
> = {
  healthy:  { label: "Operational",     color: "#10b981", bg: "rgba(16,185,129,.08)",  border: "rgba(16,185,129,.2)",  Icon: CheckCircle   },
  degraded: { label: "Degraded",        color: "#f97316", bg: "rgba(249,115,22,.08)",  border: "rgba(249,115,22,.2)",  Icon: AlertTriangle },
  critical: { label: "System Critical", color: "#f43f5e", bg: "rgba(244,63,94,.08)",   border: "rgba(244,63,94,.2)",   Icon: XCircle       },
};

export function Header({ onCmdK }: { onCmdK: () => void }) {
  const loc  = useLocation();
  const crumb = CRUMBS[loc.pathname] ?? "Workflow Detail";
  const mLoader = useCallback(() => api.getMetrics(), []);
  const { data: m } = usePolling(mLoader, 8000);

  const health: Health = !m ? "healthy"
    : m.active_workers === 0 && m.total_events > 0 ? "critical"
    : m.stale_workers > 0 || m.dead_lettered > 0   ? "degraded"
    : "healthy";

  const h = HCfg[health];

  return (
    <header
      className="flex items-center justify-between px-5 shrink-0"
      style={{
        height: "var(--header-h)",
        borderBottom: "1px solid var(--border)",
        background: "rgba(3,7,18,.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 10,
      }}
    >
      {/* breadcrumb */}
      <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <span style={{ color: "#2d3748", fontWeight: 500 }}>ReplayForge</span>
        <span style={{ color: "#1e293b" }}>/</span>
        <span style={{ color: "#94a3b8", fontWeight: 500 }}>{crumb}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* health badge — animation #18: pulsing dot */}
        {m && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
            style={{
              background: h.bg,
              border: `1px solid ${h.border}`,
              fontSize: 11,
              color: h.color,
              fontWeight: 600,
            }}
          >
            <span
              className="relative flex shrink-0"
              style={{ width: 6, height: 6 }}
            >
              {health === "healthy" && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: h.color, opacity: 0.5 }}
                />
              )}
              <span
                className="relative rounded-full"
                style={{ width: 6, height: 6, background: h.color }}
              />
            </span>
            {h.label}
          </div>
        )}

        {/* quick stats with AnimatedNumber (animation #23) */}
        {m && (
          <div
            className="flex items-center gap-3 mono"
            style={{ fontSize: 11, color: "#334155" }}
          >
            <span>
              <span style={{ color: "#64748b" }}>{m.active_workers}</span>
              {" "}workers
            </span>
            <span style={{ color: "#1e293b" }}>·</span>
            <span>
              <span style={{ color: "#6366f1" }}>
                <AnimatedNumber value={m.total_events} />
              </span>
              {" "}events
            </span>
          </div>
        )}

        {/* search / cmd-k button */}
        <button
          onClick={onCmdK}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors"
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid var(--border)",
            fontSize: 11,
            color: "#475569",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "rgba(255,255,255,.07)";
            (e.currentTarget as HTMLElement).style.borderColor =
              "rgba(255,255,255,.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "rgba(255,255,255,.04)";
            (e.currentTarget as HTMLElement).style.borderColor =
              "var(--border)";
          }}
        >
          <Search size={11} />
          <span>Search</span>
          <span className="flex gap-0.5 ml-0.5">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
      </div>
    </header>
  );
}

```

---

## `src/components/LiveFeed.tsx`

```typescript
import { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { EventStatusBadge } from "./EventStatusBadge";

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return "now";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

const SVC: Record<string, string> = {
  "checkout-service":     "🛒",
  "payment-service":      "💳",
  "inventory-service":    "📦",
  "notification-service": "✉️",
  "fulfillment-service":  "🚚",
};

/* animation #7 — live feed item entrance (slide in from top) */
const itemVariants = {
  initial: { opacity: 0, y: -8, backgroundColor: "rgba(99,102,241,0.1)" },
  animate: { opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" },
  exit:    { opacity: 0, x: 8, transition: { duration: 0.15 } },
};

export function LiveFeed() {
  const loader = useCallback(() => api.recentEvents(30), []);
  const { data, loading } = usePolling(loader, 2500);
  const seen = useRef(new Set<string>());
  const items = data ?? [];

  return (
    <div
      className="card overflow-hidden flex flex-col"
      style={{ flex: 1, minHeight: 0 }}
    >
      {/* header — animation #8: double-ring live pulse */}
      <div
        className="px-4 py-2.5 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
      >
        <div className="flex items-center gap-2.5">
          {/* two-ring pulse (animation #8) */}
          <span className="live-ring">
            <span className="live-ring-dot" style={{ background: "#10b981" }} />
          </span>
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>
            Live Activity
          </span>
        </div>
        <span
          className="mono"
          style={{
            color: "#1e293b",
            fontSize: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {items.length}
        </span>
      </div>

      {/* feed body */}
      <div className="overflow-y-auto" style={{ flex: 1, scrollbarWidth: "none" }}>
        {loading && !data ? (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="skeleton rounded" style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-2.5 w-28" />
                  <div className="skeleton h-2 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((ev) => {
              const isNew = !seen.current.has(ev.id);
              if (isNew) seen.current.add(ev.id);
              return (
                <motion.div
                  key={ev.id}
                  variants={isNew ? itemVariants : undefined}
                  initial={isNew ? "initial" : undefined}
                  animate={isNew ? "animate" : undefined}
                  exit="exit"
                  transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className="px-3.5 py-2 flex items-start gap-2.5"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,.03)",
                    cursor: "default",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,.018)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }}
                >
                  <span
                    style={{ fontSize: 13, lineHeight: 1, marginTop: 1, flexShrink: 0 }}
                  >
                    {SVC[ev.service_name] ?? "⚡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="mono truncate"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#e2e8f0",
                          maxWidth: 120,
                        }}
                      >
                        {ev.event_type}
                      </span>
                      <EventStatusBadge status={ev.status} />
                      {ev.attempt_count > 1 && (
                        <span className="mono" style={{ fontSize: 10, color: "#f97316" }}>
                          ×{ev.attempt_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="mono truncate"
                        style={{ fontSize: 10, color: "#1e293b" }}
                      >
                        {ev.workflow_id.slice(-14)}
                      </span>
                      {ev.last_error && (
                        <span
                          className="mono truncate"
                          style={{ fontSize: 10, color: "#f43f5e", maxWidth: 100 }}
                          title={ev.last_error}
                        >
                          {ev.last_error.slice(0, 26)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="mono shrink-0 mt-0.5"
                    style={{ fontSize: 10, color: "#1e293b" }}
                  >
                    {ago(ev.updated_at)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {items.length === 0 && !loading && (
          <div
            className="flex flex-col items-center justify-center py-12"
            style={{ color: "#1e293b", fontSize: 12 }}
          >
            <span style={{ fontSize: 24, marginBottom: 8 }}>⚡</span>
            Waiting for events…
          </div>
        )}
      </div>
    </div>
  );
}

```

---

## `src/components/MetricCard.tsx`

```typescript
import { motion } from "framer-motion";
import { useRef, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber, Skeleton } from "./Animated";

/* ── sparkline with draw-in animation (animation #4) ─────── */
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ width: 56, height: 24 }} />;

  const max = Math.max(...data, 1);
  const w = 56;
  const h = 24;
  const pad = 2;

  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const pathD = data.reduce((acc, v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - pad - (v / max) * (h - pad * 2);
    return acc + (i === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
  }, "");

  const totalLength = data.length * 10; // approximate

  return (
    <svg width={w} height={h} style={{ overflow: "visible", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sp-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${pts} ${w},${h}`}
        fill={`url(#sp-fill-${color.replace("#", "")})`}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ strokeDasharray: totalLength, strokeDashoffset: totalLength }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.1 }}
      />
    </svg>
  );
}

/* ── accent palette ───────────────────────────────────────── */
const ACCENT: Record<string, { color: string; dimColor: string; glow: string }> = {
  indigo:  { color: "#818cf8", dimColor: "rgba(99,102,241,.1)",  glow: "rgba(99,102,241,.3)"  },
  emerald: { color: "#34d399", dimColor: "rgba(16,185,129,.1)",  glow: "rgba(16,185,129,.3)"  },
  rose:    { color: "#fb7185", dimColor: "rgba(244,63,94,.1)",   glow: "rgba(244,63,94,.3)"   },
  orange:  { color: "#fb923c", dimColor: "rgba(249,115,22,.1)",  glow: "rgba(249,115,22,.3)"  },
  amber:   { color: "#fbbf24", dimColor: "rgba(245,158,11,.1)",  glow: "rgba(245,158,11,.3)"  },
  purple:  { color: "#c084fc", dimColor: "rgba(168,85,247,.1)",  glow: "rgba(168,85,247,.3)"  },
  sky:     { color: "#38bdf8", dimColor: "rgba(14,165,233,.1)",  glow: "rgba(14,165,233,.3)"  },
  default: { color: "#64748b", dimColor: "rgba(100,116,139,.06)", glow: "rgba(100,116,139,.2)" },
};

interface Props {
  label: string;
  value: number | string | null;
  sub?: string;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: keyof typeof ACCENT;
  sparkData?: number[];
  featured?: boolean;
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendUp,
  accent = "default",
  sparkData,
  featured = false,
}: Props) {
  const { color, dimColor, glow } = ACCENT[accent] ?? ACCENT.default;
  const isLoading = value === null;
  const cardRef = useRef<HTMLDivElement>(null);

  // Spotlight mouse-follow (animation #6)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mouse-x", `${x}%`);
    el.style.setProperty("--mouse-y", `${y}%`);
  }, []);

  return (
    <motion.div
      ref={cardRef}
      className={`spotlight-card relative overflow-hidden flex flex-col gap-2.5 p-4 ${featured ? "card-gradient-border" : "card"}`}
      onMouseMove={handleMouseMove}
      /* animation #17: card lift + border brighten on hover */
      whileHover={{
        y: -3,
        borderColor: featured ? undefined : "rgba(255,255,255,.14)",
        transition: { duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] },
      }}
      style={{ cursor: "default" }}
    >
      {/* top accent gradient line */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}70, transparent)`,
        }}
      />

      {/* header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && (
            <div
              className="w-5 h-5 rounded flex items-center justify-center shrink-0"
              style={{ background: dimColor }}
            >
              <Icon size={11} style={{ color }} strokeWidth={2} />
            </div>
          )}
          <span
            style={{
              color: "#475569",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: ".06em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </div>
        {trend && (
          <span
            style={{
              color: trendUp ? "#34d399" : "#fb7185",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {trendUp ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>

      {/* value + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div
            className="mono font-bold tabular-nums"
            style={{
              color: featured ? color : "#fff",
              fontSize: featured ? 30 : 24,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {isLoading ? (
              <Skeleton className="w-16 h-6" />
            ) : typeof value === "number" ? (
              <AnimatedNumber value={value} />
            ) : (
              value
            )}
          </div>
          {sub && (
            <div
              style={{
                color: "#334155",
                fontSize: 10.5,
                marginTop: 5,
                letterSpacing: "0.01em",
              }}
            >
              {sub}
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 0 && (
          <Spark data={sparkData} color={color} />
        )}
      </div>
    </motion.div>
  );
}

```

---

## `src/components/WorkerHealthTable.tsx`

```typescript
export {}; // kept for import compatibility — Worker table moved into WorkerHealth.tsx

```

---

## `src/components/WorkflowTimeline.tsx`

```typescript
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Clock, User } from "lucide-react";
import type { WorkflowTimelineEventOut } from "../types";
import { EventStatusBadge } from "./EventStatusBadge";

const fmtMs = (ms: number | null) => ms == null ? "–" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

const dot: Record<string, string> = {
  succeeded:    "#10b981",
  failed:       "#ef4444",
  retrying:     "#f97316",
  dead_lettered:"#f43f5e",
  processing:   "#eab308",
  queued:       "#6366f1",
};

export function WorkflowTimeline({ events }: { events: WorkflowTimelineEventOut[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-0">
      {events.map((ev, idx) => {
        const isLast = idx === events.length - 1;
        const isOpen = expanded.has(ev.id);
        const color = dot[ev.status] ?? "#475569";
        const totalMs = ev.attempts.reduce((s, a) => s + (a.duration_ms ?? 0), 0);

        return (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3 }}
            className="flex gap-5"
          >
            {/* connector */}
            <div className="flex flex-col items-center w-6 shrink-0 pt-4">
              <motion.div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: color, boxShadow: `0 0 0 3px ${color}25` }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: idx * 0.05 + 0.15, type: "spring", stiffness: 300 }}
              />
              {!isLast && (
                <div className="flex-1 w-px mt-1 mb-0"
                  style={{ background: `linear-gradient(180deg, ${color}40 0%, #1a2640 100%)`, minHeight: 24 }} />
              )}
            </div>

            {/* card */}
            <div className="flex-1 mb-3 card overflow-hidden"
              style={isOpen ? { boxShadow: `0 0 0 1px ${color}25`, borderColor: `${color}25` } : {}}>

              {/* header */}
              <div
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${ev.attempts.length ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                onClick={() => ev.attempts.length && toggle(ev.id)}
              >
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <span className="text-[13px] font-semibold text-white mono truncate">{ev.event_type}</span>
                  <EventStatusBadge status={ev.status} />
                  <span className="text-[11px] text-slate-600 hidden sm:block">{ev.service_name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ev.attempt_count > 1 && (
                    <span className="text-[11px] text-orange-400 font-medium">×{ev.attempt_count}</span>
                  )}
                  {totalMs > 0 && (
                    <span className="text-[11px] text-slate-600 flex items-center gap-1 mono">
                      <Clock size={10} />{fmtMs(totalMs)}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-700 mono">{fmtTime(ev.created_at)}</span>
                  {ev.attempts.length > 0 && (
                    <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={13} className="text-slate-600" />
                    </motion.span>
                  )}
                </div>
              </div>

              {/* last error */}
              {ev.last_error && (
                <div className="px-4 py-2" style={{ background: "rgba(244,63,94,0.05)", borderTop: "1px solid rgba(244,63,94,0.12)" }}>
                  <p className="text-[11px] text-rose-400 mono leading-relaxed truncate">{ev.last_error}</p>
                </div>
              )}

              {/* expanded attempts */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    style={{ overflow: "hidden", borderTop: "1px solid #1a2640" }}
                  >
                    <div className="px-4 py-2" style={{ background: "rgba(255,255,255,0.01)" }}>
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Attempt History</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1a2640" }}>
                          {["#", "Status", "Duration", "Worker", "Time", "Error"].map(h => (
                            <th key={h} className="th py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ev.attempts.map((a, ai) => (
                          <motion.tr key={a.id}
                            className="tr-hover"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: ai * 0.04 }}
                          >
                            <td className="td pl-4 mono text-slate-600 text-[12px]">{a.attempt_number}</td>
                            <td className="td"><EventStatusBadge status={a.status} /></td>
                            <td className="td mono text-[12px]">{fmtMs(a.duration_ms)}</td>
                            <td className="td">
                              <span className="flex items-center gap-1 text-slate-500 text-[11px]">
                                <User size={9} />{a.worker_name ?? "–"}
                              </span>
                            </td>
                            <td className="td mono text-slate-600 text-[11px]">{fmtTime(a.started_at)}</td>
                            <td className="td pr-4 max-w-xs">
                              {a.error_message
                                ? <span className="text-rose-400 text-[11px] mono truncate block">{a.error_message}</span>
                                : <span className="text-slate-700 text-[11px]">—</span>
                              }
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

```

---

## `src/hooks/usePolling.ts`

```typescript
import { useCallback, useEffect, useRef, useState } from "react";

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 5000
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backoff = useRef(intervalMs);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    try {
      const result = await fn();
      setData(result);
      setError(null);
      backoff.current = intervalMs;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "request failed";
      setError(msg);
      backoff.current = Math.min(backoff.current * 1.5, 30_000);
    } finally {
      setLoading(false);
    }
  }, [fn, intervalMs]);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      await run();
      if (mounted) timer.current = setTimeout(tick, backoff.current);
    };

    tick();
    return () => {
      mounted = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [run]);

  return { data, loading, error, refresh: run };
}

```

---

## `src/index.css`

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;1,14..32,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── custom property for animatable border angle ──────────── */
@property --border-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

/* ── design tokens ────────────────────────────────────────── */
:root {
  --bg:         #030712;
  --surface:    #0c1220;
  --surface2:   #0f1829;
  --raised:     #101827;
  --border:     rgba(255, 255, 255, 0.08);
  --border2:    rgba(255, 255, 255, 0.13);
  --text:       #e2e8f0;
  --text-muted: #64748b;
  --text-dim:   #334155;
  --text-dimmer:#1e293b;
  --accent:     #6366f1;
  --accent-h:   #818cf8;
  --accent-dim: rgba(99, 102, 241, 0.12);
  --emerald:    #10b981;
  --rose:       #f43f5e;
  --orange:     #f97316;
  --amber:      #f59e0b;
  --sidebar-w:  210px;
  --header-h:   42px;
  --radius:     8px;
  --radius-sm:  6px;
}

/* ── base reset ───────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-size: 13px;
  -webkit-text-size-adjust: 100%;
  text-rendering: optimizeLegibility;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'ss01';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
  line-height: 1.5;
}

/* ── selection ────────────────────────────────────────────── */
::selection { background: rgba(99, 102, 241, 0.28); color: #fff; }

/* ── scrollbar ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 9px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

/* ── monospace ────────────────────────────────────────────── */
.mono {
  font-family: 'JetBrains Mono', 'Menlo', 'Consolas', monospace;
  font-feature-settings: 'zero', 'ss01';
}

/* ── layout ───────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: rgba(3, 7, 18, 0.97);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* ── card ─────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.card-inset {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

/* ── rotating gradient border card ───────────────────────── */
.card-gradient-border {
  position: relative;
  background: var(--surface);
  border-radius: var(--radius);
  isolation: isolate;
}
.card-gradient-border::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: calc(var(--radius) + 1px);
  background: conic-gradient(
    from var(--border-angle),
    transparent 20%,
    rgba(99, 102, 241, 0.6) 40%,
    rgba(168, 85, 247, 0.4) 50%,
    rgba(99, 102, 241, 0.6) 60%,
    transparent 80%
  );
  animation: border-rotate 4s linear infinite;
  z-index: -1;
}
.card-gradient-border::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: calc(var(--radius) - 1px);
  background: var(--surface);
  z-index: -1;
}

/* ── spotlight card ───────────────────────────────────────── */
.spotlight-card {
  position: relative;
  overflow: hidden;
}
.spotlight-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(99, 102, 241, 0.08) 0%,
    transparent 60%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 1;
}
.spotlight-card:hover::before { opacity: 1; }

/* ── table ────────────────────────────────────────────────── */
.th {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.055em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 8px 14px;
  text-align: left;
  white-space: nowrap;
}
.td {
  padding: 9px 14px;
  font-size: 13px;
  color: #cbd5e1;
  vertical-align: middle;
}
.tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: default;
  transition: background 0.1s ease;
}
.tr:last-child { border: none; }
.tr:hover { background: rgba(255, 255, 255, 0.018); }
.tr-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.035);
  transition: background 0.1s ease;
}
.tr-row:last-child { border: none; }
.tr-row:hover { background: rgba(255, 255, 255, 0.018); }

/* ── buttons ──────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  height: 30px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
  font-family: inherit;
  letter-spacing: -0.01em;
}
.btn:disabled { opacity: 0.38; cursor: not-allowed; }

.btn-primary {
  @apply btn;
  background: linear-gradient(135deg, #4f46e5, #4338ca);
  border-color: rgba(99, 102, 241, 0.5);
  color: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #5753e8, #4f46e5);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.35), 0 1px 2px rgba(0,0,0,0.4);
  border-color: rgba(99, 102, 241, 0.7);
}
.btn-primary:active:not(:disabled) { transform: scale(0.96); }

.btn-ghost {
  @apply btn;
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border);
  color: #94a3b8;
}
.btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
  border-color: var(--border2);
}

.btn-icon {
  @apply btn;
  width: 30px;
  padding: 0;
  justify-content: center;
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}
.btn-icon:hover:not(:disabled) {
  background: var(--raised);
  color: var(--text);
  border-color: var(--border2);
}

.btn-success {
  @apply btn;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.25);
  color: #34d399;
  font-size: 11px;
  height: 26px;
  padding: 0 10px;
}
.btn-success:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
  box-shadow: 0 0 14px rgba(16, 185, 129, 0.2);
}

/* ── badge ────────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  border: 1px solid transparent;
  font-family: 'JetBrains Mono', monospace;
}

/* ── nav item ─────────────────────────────────────────────── */
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 450;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.12s, background 0.12s;
  cursor: pointer;
  position: relative;
}
.nav-item:hover { color: #cbd5e1; background: rgba(255, 255, 255, 0.04); }
.nav-item.active { color: #fff; }

/* ── kbd ──────────────────────────────────────────────────── */
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  min-width: 16px;
  padding: 0 3px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  font-size: 10px;
  color: #64748b;
  font-family: inherit;
  font-weight: 500;
}

/* ── page ─────────────────────────────────────────────────── */
.page { min-height: 100%; }

/* ── recharts global ──────────────────────────────────────── */
.recharts-wrapper text { font-family: 'JetBrains Mono', monospace !important; }
.recharts-cartesian-axis-tick-value { fill: #1e293b !important; font-size: 10px !important; }
.recharts-tooltip-wrapper { outline: none !important; }

/* ════════════════════════════════════════════════════════════
   KEYFRAME ANIMATIONS
   ════════════════════════════════════════════════════════════ */

/* 1. Shimmer sweep for skeletons */
@keyframes shimmer {
  0%   { background-position: -400% 0; }
  100% { background-position:  400% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface)  25%,
    rgba(255,255,255,0.04) 50%,
    var(--surface)  75%
  );
  background-size: 400% 100%;
  animation: shimmer 1.8s ease infinite;
  border-radius: 4px;
}

/* 2. Rotating gradient border */
@keyframes border-rotate {
  from { --border-angle: 0deg; }
  to   { --border-angle: 360deg; }
}

/* 3. Live pulse ring — two-ring */
@keyframes pulse-ping-outer {
  0%   { transform: scale(1);   opacity: 0.8; }
  60%  { transform: scale(2.4); opacity: 0;   }
  100% { transform: scale(2.4); opacity: 0;   }
}
@keyframes pulse-ping-inner {
  0%   { transform: scale(1);   opacity: 0.6; }
  80%  { transform: scale(1.8); opacity: 0;   }
  100% { transform: scale(1.8); opacity: 0;   }
}

.live-ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.live-ring-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--emerald);
  flex-shrink: 0;
}
.live-ring-dot::before,
.live-ring-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: inherit;
}
.live-ring-dot::before {
  animation: pulse-ping-outer 2s ease-out infinite;
}
.live-ring-dot::after {
  animation: pulse-ping-inner 2s ease-out infinite 0.3s;
}

/* 4. Status badge pulse dot */
@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
.badge-pulse-dot { animation: badge-pulse 1.4s ease infinite; }

/* 5. Animated number tick-in */
@keyframes tickIn {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0);   }
}
.tick { animation: tickIn 0.22s ease; display: inline-block; }

/* 6. Gradient shift (for accents) */
@keyframes gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* 7. Scan line effect */
@keyframes scan-line {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(200%); }
}

/* 8. Header health pulse */
@keyframes health-pulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50%       { box-shadow: 0 0 0 3px transparent; }
}

/* 9. Horizontal bar fill entrance (base class, width animated via JS/framer) */
.status-bar-track {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  position: relative;
}
.status-bar-fill {
  height: 100%;
  border-radius: 3px;
  transform-origin: left;
}

/* 10. Page wrapper */
.page-wrap {
  padding: 20px 22px 48px;
  min-height: 100%;
}

```

---

## `src/main.tsx`

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

```

---

## `src/pages/Dashboard.tsx`

```typescript
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
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
import { AnimatedNumber, Skeleton, AppearOnScroll, SpotlightCard } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";

/* ── helpers ─────────────────────────────────────────────── */
const fmtMs = (v: number | null) =>
  v == null ? "–" : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`;
const pct = (n: number, d: number) =>
  d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`;
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const TT = {
  contentStyle: {
    background: "#0c1220",
    border: "1px solid rgba(255,255,255,.09)",
    borderRadius: 8,
    fontSize: 12,
    padding: "9px 13px",
    boxShadow: "0 16px 40px rgba(0,0,0,.7)",
  },
  labelStyle: { color: "#475569", fontSize: 11, marginBottom: 3 },
  itemStyle:  { color: "#e2e8f0" },
  cursor:     { stroke: "rgba(255,255,255,.04)" },
};

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

type RateSnap = { t: string; processed: number; dead: number; retrying: number };
type Snap     = { t: string; succeeded: number; dead: number; retrying: number };

const STATUS_META = [
  { key: "succeeded",    label: "Succeeded",     color: "#10b981" },
  { key: "queued",       label: "Queued",         color: "#6366f1" },
  { key: "processing",   label: "Processing",     color: "#eab308" },
  { key: "retrying",     label: "Retrying",       color: "#f97316" },
  { key: "dead_lettered",label: "Dead-lettered",  color: "#f43f5e" },
] as const;

type GenState = "idle" | "loading" | "success";

/* ── component ───────────────────────────────────────────── */
export default function Dashboard() {
  const mLoad = useCallback(() => api.getMetrics(), []);
  const wLoad = useCallback(() => api.listWorkflows(40), []);
  const { data: m, error: mErr, refresh: refM } = usePolling(mLoad, 4000);
  const { data: wf, error: wErr, refresh: refWf } = usePolling(wLoad, 5000);

  const [genState, setGenState] = useState<GenState>("idle");
  const hist     = useRef<Snap[]>([]);
  const rateHist = useRef<RateSnap[]>([]);
  const sparks   = useRef<Record<string, number[]>>({ total: [], ok: [], dead: [] });
  const mounted  = useRef(true);

  // accumulate history
  if (m) {
    const t = new Date().toLocaleTimeString("en", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const last = hist.current[hist.current.length - 1];
    if (!last || last.t !== t) {
      const snap: Snap = { t, succeeded: m.succeeded, dead: m.dead_lettered, retrying: m.retrying };
      if (last) {
        rateHist.current = [
          ...rateHist.current.slice(-34),
          {
            t,
            processed: Math.max(0, snap.succeeded - last.succeeded),
            dead:      Math.max(0, snap.dead - last.dead),
            retrying:  snap.retrying,
          },
        ];
      } else {
        rateHist.current = [{ t, processed: 0, dead: 0, retrying: m.retrying }];
      }
      hist.current = [...hist.current.slice(-34), snap];
      sparks.current.total = [...(sparks.current.total ?? []).slice(-9), m.total_events];
      sparks.current.ok    = [...(sparks.current.ok   ?? []).slice(-9), m.succeeded];
      sparks.current.dead  = [...(sparks.current.dead ?? []).slice(-9), m.dead_lettered];
    }
  }

  const throughput = (() => {
    if (hist.current.length < 4) return null;
    const slice = hist.current.slice(-6);
    const delta = slice[slice.length - 1].succeeded - slice[0].succeeded;
    const secs  = (slice.length - 1) * 4;
    return secs > 0 ? Math.round((delta / secs) * 60) : null;
  })();

  /* animation #25: generate button state machine */
  const generate = async () => {
    if (genState !== "idle") return;
    setGenState("loading");
    try {
      const r = await api.generateWorkload(30);
      setGenState("success");
      toast.success("Workload generated", { description: `${r.events_sent} events queued` });
      setTimeout(() => { refM(); refWf(); }, 800);
      setTimeout(() => setGenState("idle"), 2000);
    } catch {
      toast.error("Generation failed");
      setGenState("idle");
    }
  };

  /* animation #13: status bar fill widths */
  const statusBars = m
    ? STATUS_META.map((s) => ({
        ...s,
        value: m[s.key as keyof typeof m] as number ?? 0,
        pct: m.total_events > 0
          ? ((m[s.key as keyof typeof m] as number ?? 0) / m.total_events) * 100
          : 0,
      }))
    : [];

  return (
    <div className="page-wrap">

      {/* ── page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#fff",
              letterSpacing: "-.02em",
              lineHeight: 1.2,
            }}
          >
            Overview
          </h1>
          <div
            className="flex items-center gap-3 mt-1.5 mono"
            style={{ fontSize: 11, color: "#334155" }}
          >
            {m ? (
              <>
                <span>
                  <span style={{ color: "#e2e8f0" }}>
                    {/* animation #23: animated number in header */}
                    <AnimatedNumber value={m.total_events} />
                  </span>
                  {" "}total events
                </span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span>
                  <span style={{ color: "#34d399" }}>{pct(m.succeeded, m.total_events)}</span>
                  {" "}success
                </span>
                <span style={{ color: "#1e293b" }}>·</span>
                <span>
                  <span style={{ color: "#fb7185" }}>{pct(m.dead_lettered, m.total_events)}</span>
                  {" "}error
                </span>
                {throughput != null && (
                  <>
                    <span style={{ color: "#1e293b" }}>·</span>
                    <span>
                      <span style={{ color: "#818cf8" }}>{throughput}/min</span>
                      {" "}throughput
                    </span>
                  </>
                )}
              </>
            ) : (
              <Skeleton className="h-3 w-60" />
            )}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-2">
          <motion.button
            className="btn-icon"
            onClick={() => { refM(); refWf(); }}
            title="Refresh"
            whileTap={{ scale: 0.92 }}
          >
            <RefreshCw size={13} />
          </motion.button>

          {/* animation #25: generate button state machine */}
          <motion.button
            className="btn-primary"
            onClick={generate}
            disabled={genState !== "idle"}
            whileHover={{ boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}
            /* animation #16: whileTap */
            whileTap={{ scale: 0.95 }}
            animate={
              genState === "success"
                ? { backgroundColor: ["#4f46e5", "#10b981", "#10b981", "#4f46e5"] }
                : {}
            }
            transition={
              genState === "success"
                ? { duration: 1.2, times: [0, 0.15, 0.85, 1] }
                : {}
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {genState === "idle" && (
                <motion.span
                  key="idle"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <Play size={12} /> Generate Workload
                </motion.span>
              )}
              {genState === "loading" && (
                <motion.span
                  key="loading"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <RefreshCw size={12} className="animate-spin" /> Generating…
                </motion.span>
              )}
              {genState === "success" && (
                <motion.span
                  key="success"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <CheckCircle2 size={12} /> Done!
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* ── KPI cards bento row — animation #2: stagger ──── */}
      <motion.div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.055 } } }}
      >
        {/* hero card — featured with gradient border (animations #5, #6) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } } }}
        >
          <SpotlightCard className="h-full">
            <MetricCard
              label="Total Events"
              value={m?.total_events ?? null}
              icon={Activity}
              accent="indigo"
              sparkData={sparks.current.total}
              sub="all time"
              featured
            />
          </SpotlightCard>
        </motion.div>

        {[
          {
            label: "Succeeded",
            value: m?.succeeded ?? null,
            icon: CheckCircle2,
            accent: "emerald" as const,
            sparkData: sparks.current.ok,
            trend: m ? pct(m.succeeded, m.total_events) : undefined,
            trendUp: true,
          },
          {
            label: "Dead-lettered",
            value: m?.dead_lettered ?? null,
            icon: Skull,
            accent: "rose" as const,
            sparkData: sparks.current.dead,
            sub: "exhausted retries",
          },
          {
            label: "Active Workers",
            value: m?.active_workers ?? null,
            icon: Server,
            accent: (m?.stale_workers ? "orange" : "emerald") as "orange" | "emerald",
            sub: m?.stale_workers ? `${m.stale_workers} stale` : "all healthy",
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
            }}
          >
            <MetricCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* second row of KPI cards */}
      <motion.div
        className="grid grid-cols-4 gap-3 mb-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.055, delayChildren: 0.2 } } }}
      >
        {[
          { label: "Retrying",      value: m?.retrying ?? null,      icon: RefreshCw,  accent: "orange" as const, sub: "in backoff" },
          { label: "Replay Success", value: m ? `${(m.replay_success_rate * 100).toFixed(0)}%` : null, icon: TrendingUp, accent: "purple" as const, sub: m ? `${m.replay_requeued} total` : undefined },
          { label: "p50 Latency",   value: m ? fmtMs(m.p50_attempt_duration_ms) : null, icon: Clock, accent: "sky" as const, sub: "median attempt" },
          { label: "p95 Latency",   value: m ? fmtMs(m.p95_attempt_duration_ms) : null, icon: Zap,   accent: "amber" as const, sub: "95th percentile" },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
            }}
          >
            <MetricCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── charts + live feed ───────────────────────────── */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "3fr 2fr" }}>

        {/* area chart — animation #12: entrance */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.28, ease: EASE }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <div>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                Event Throughput
              </p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                Rolling window · updates every 4s
              </p>
            </div>
            <div
              className="flex items-center gap-4 mono"
              style={{ fontSize: 10, color: "#334155" }}
            >
              {[["Succeeded","#10b981"],["Dead","#f43f5e"],["Retrying","#f97316"]].map(([l,c]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-5 rounded-full"
                    style={{ height: 2, background: c }}
                  />
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="px-3 pt-3 pb-1">
            {rateHist.current.length < 3 ? (
              <div
                className="h-44 flex flex-col items-center justify-center gap-2"
                style={{ color: "#1e293b", fontSize: 12 }}
              >
                <Activity size={20} style={{ color: "#1e293b" }} />
                <span>Collecting data — updates every 4s</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <ResponsiveContainer width="100%" height={176}>
                  <AreaChart
                    data={rateHist.current}
                    margin={{ top: 4, right: 4, left: -32, bottom: 0 }}
                  >
                    <defs>
                      {[["ok","#10b981"],["dl","#f43f5e"],["re","#f97316"]].map(([id, c]) => (
                        <linearGradient key={id} id={`a-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={c} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="1 4"
                      stroke="rgba(255,255,255,.03)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 9, fill: "#1e293b", fontFamily: "JetBrains Mono" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#1e293b" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip {...TT} />
                    <Area type="monotone" dataKey="processed" name="Processed/tick" stroke="#10b981" fill="url(#a-ok)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="retrying"  name="Retrying"       stroke="#f97316" fill="url(#a-re)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#f97316", strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="dead"      name="Dead-lettered"  stroke="#f43f5e" fill="url(#a-dl)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#f43f5e", strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* live feed */}
        <motion.div
          style={{ display: "flex", flexDirection: "column" }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.32, ease: EASE }}
        >
          <LiveFeed />
        </motion.div>
      </div>

      {/* ── status bars + workflow table ─────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 3fr" }}>

        {/* status distribution — animation #13: horizontal bars fill */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.35, ease: EASE }}
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
              Status Distribution
            </p>
            {m && (
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                {m.total_events.toLocaleString()} total ·{" "}
                <span style={{ color: "#34d399" }}>
                  {pct(m.succeeded, m.total_events)}
                </span>{" "}
                success rate
              </p>
            )}
          </div>
          <div className="px-4 py-4 space-y-3.5">
            {!m
              ? [...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-2.5 w-28" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))
              : statusBars.map((bar, i) => (
                  <div key={bar.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span
                        style={{
                          color: "#475569",
                          fontSize: 11,
                          fontWeight: 500,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {bar.label}
                      </span>
                      <span
                        className="mono"
                        style={{ color: bar.color, fontSize: 11, fontWeight: 600 }}
                      >
                        {bar.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="status-bar-track">
                      <motion.div
                        className="status-bar-fill"
                        style={{ background: bar.color }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: bar.pct / 100 }}
                        transition={{
                          duration: 0.8,
                          delay: 0.4 + i * 0.08,
                          ease: "easeOut",
                        }}
                      />
                    </div>
                  </div>
                ))}
          </div>
        </motion.div>

        {/* workflow table — animation #28: scroll reveal on rows */}
        <motion.div
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.38, ease: EASE }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
          >
            <div>
              <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                Recent Workflows
              </p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
                Click any row to inspect the full event timeline
              </p>
            </div>
            {wf && (
              <span
                className="mono"
                style={{
                  color: "#1e293b",
                  fontSize: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  padding: "1px 7px",
                }}
              >
                {wf.length}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  {["Workflow ID","Events","Succeeded","DLQ","In-flight","Status","Updated"].map(
                    (h) => <th key={h} className="th">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {!wf
                  ? [...Array(6)].map((_, i) => (
                      <tr key={i} className="tr">
                        {[...Array(7)].map((_, j) => (
                          <td key={j} className="td">
                            <Skeleton className="h-3 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : wf.length === 0
                  ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: "48px 0", textAlign: "center", color: "#1e293b", fontSize: 13 }}
                      >
                        No workflows —{" "}
                        <strong style={{ color: "#475569" }}>Generate Workload</strong>
                        {" "}to begin
                      </td>
                    </tr>
                  )
                  : wf.map((w, i) => (
                      <motion.tr
                        key={w.workflow_id}
                        className="tr"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          delay: Math.min(i * 0.02, 0.25),
                          duration: 0.2,
                        }}
                      >
                          <td className="td" style={{ paddingLeft: 16 }}>
                            <Link
                              to={`/workflows/${w.workflow_id}`}
                              className="group flex items-center gap-1 mono"
                              style={{
                                color: "#818cf8",
                                fontSize: 12,
                                fontWeight: 500,
                                textDecoration: "none",
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLElement).style.color = "#818cf8")
                              }
                            >
                              {w.workflow_id}
                              <ArrowUpRight
                                size={9}
                                style={{ opacity: 0 }}
                                className="group-hover:opacity-100 transition-opacity"
                              />
                            </Link>
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.total_events}
                          </td>
                          <td className="td mono" style={{ fontSize: 12, color: "#34d399" }}>
                            {w.succeeded}
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.dead_lettered > 0 ? (
                              <span style={{ color: "#fb7185", fontWeight: 700 }}>
                                {w.dead_lettered}
                              </span>
                            ) : (
                              <span style={{ color: "#1e293b" }}>—</span>
                            )}
                          </td>
                          <td className="td mono" style={{ fontSize: 12 }}>
                            {w.in_flight > 0 ? (
                              <span style={{ color: "#fbbf24" }}>{w.in_flight}</span>
                            ) : (
                              <span style={{ color: "#1e293b" }}>—</span>
                            )}
                          </td>
                          <td className="td">
                            <EventStatusBadge
                              status={
                                w.has_failures
                                  ? "dead_lettered"
                                  : w.in_flight > 0
                                  ? "processing"
                                  : "succeeded"
                              }
                            />
                          </td>
                          <td className="td mono" style={{ fontSize: 11, color: "#334155" }}>
                            {ago(w.last_updated_at)}
                          </td>
                      </motion.tr>
                    ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

```

---

## `src/pages/DeadLetters.tsx`

```typescript
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ExternalLink, RefreshCw, Skull,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { FadeIn, Stagger, StaggerItem, Skeleton } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";
import type { DeadLetterOut } from "../types";

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
};

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

type ReplayState = "idle" | "replaying" | "done";

/* animation #26: replay button with success glow flash */
function ReplayButton({
  replayState,
  onClick,
}: {
  replayState: ReplayState;
  onClick: () => void;
}) {
  const isLoading  = replayState === "replaying";
  const isSuccess  = replayState === "done";

  return (
    <motion.button
      className="btn-success"
      onClick={onClick}
      disabled={isLoading}
      whileHover={{ boxShadow: "0 0 16px rgba(16,185,129,0.25)", scale: 1.02 }}
      /* animation #16: whileTap */
      whileTap={{ scale: 0.94 }}
      animate={
        isSuccess
          ? {
              backgroundColor: [
                "rgba(16,185,129,0.12)",
                "rgba(16,185,129,0.35)",
                "rgba(16,185,129,0.12)",
              ],
              boxShadow: [
                "0 0 0px rgba(16,185,129,0)",
                "0 0 20px rgba(16,185,129,0.5)",
                "0 0 0px rgba(16,185,129,0)",
              ],
            }
          : {}
      }
      transition={isSuccess ? { duration: 0.6 } : {}}
    >
      <RefreshCw
        size={10}
        className={isLoading ? "animate-spin" : ""}
      />
      {isLoading ? "…" : "Replay"}
    </motion.button>
  );
}

/* ── row ─────────────────────────────────────────────────── */
function Row({ dl, refresh }: { dl: DeadLetterOut; refresh: () => void }) {
  const [state, setState] = useState<ReplayState>("idle");
  const done = !!dl.replayed_at || state === "done";

  const replay = async () => {
    if (done) return;
    if (state === "replaying") return;
    setState("replaying");
    try {
      await api.replayDeadLetter(dl.id);
      setState("done");
      toast.success("Replayed", {
        description: `${dl.event_type} re-queued for processing`,
      });
      setTimeout(refresh, 800);
    } catch {
      toast.error("Replay failed");
      setState("idle");
    }
  };

  return (
    /* animation #21: row stagger fade */
    <motion.tr
      className="tr-row"
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <td className="td pl-4">
        <span className="mono text-[12px] font-semibold text-white">
          {dl.event_type}
        </span>
      </td>
      <td className="td">
        <Link
          to={`/workflows/${dl.workflow_id}`}
          className="group flex items-center gap-1 mono text-[12px]"
          style={{ color: "#818cf8", textDecoration: "none" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#818cf8")
          }
        >
          {dl.workflow_id.slice(-16)}
          <ExternalLink
            size={9}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Link>
      </td>
      <td className="td text-[12px]" style={{ color: "#475569" }}>
        {dl.service_name}
      </td>
      <td className="td max-w-[200px]">
        <span
          className="mono text-[11px] truncate block"
          style={{ color: "#fb7185" }}
          title={dl.last_error ?? ""}
        >
          {dl.last_error ?? "—"}
        </span>
      </td>
      <td className="td mono text-[12px]" style={{ color: "#334155" }}>
        {ago(dl.created_at)} ago
      </td>
      <td className="td">
        {done ? (
          <EventStatusBadge status="replayed" />
        ) : (
          <EventStatusBadge status="dead_lettered" />
        )}
      </td>
      <td className="td pr-4">
        {done ? (
          <span className="mono text-[11px]" style={{ color: "#334155" }}>
            {dl.replayed_at ? `${ago(dl.replayed_at)} ago` : "just now"}
          </span>
        ) : (
          <ReplayButton replayState={state} onClick={replay} />
        )}
      </td>
    </motion.tr>
  );
}

/* ── page ────────────────────────────────────────────────── */
export default function DeadLetters() {
  const loader = useCallback(() => api.listDeadLetters(100), []);
  const { data, loading, error, refresh } = usePolling(loader, 5000);

  const pending  = (data ?? []).filter((d) => !d.replayed_at).length;
  const replayed = (data ?? []).filter((d) => !!d.replayed_at).length;

  return (
    <div className="page-wrap space-y-5">

      {/* header */}
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-white flex items-center gap-2"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              <Skull size={16} style={{ color: "#f43f5e" }} />
              Dead Letter Queue
            </h1>
            <p className="text-[12px] mt-1" style={{ color: "#334155" }}>
              Events that exhausted all retry attempts
            </p>
          </div>
        </div>
      </FadeIn>

      {/* stats — animation #2: stagger */}
      {data && data.length > 0 && (
        <Stagger className="grid grid-cols-3 gap-3">
          {[
            { label: "Total DLQ",      value: data.length, color: "#f1f5f9", border: "rgba(241,245,249,.08)" },
            { label: "Pending replay", value: pending,     color: "#fb7185", border: "rgba(244,63,94,.15)"   },
            { label: "Replayed",       value: replayed,    color: "#c084fc", border: "rgba(168,85,247,.15)"  },
          ].map(({ label, value, color, border }) => (
            <StaggerItem key={label}>
              <div
                className="card p-4 text-center"
                style={{ borderColor: border }}
              >
                <p
                  className="mono font-bold"
                  style={{ color, fontSize: 28, letterSpacing: "-0.02em" }}
                >
                  {value}
                </p>
                <p className="text-[11px] mt-1" style={{ color: "#475569" }}>
                  {label}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* error */}
      {error && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-[13px]"
          style={{
            color: "#fb7185",
            background: "rgba(244,63,94,0.07)",
            border: "1px solid rgba(244,63,94,0.18)",
          }}
        >
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {/* table */}
      <FadeIn delay={0.1} className="card overflow-hidden">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {["Event","Workflow","Service","Last Error","Age","Status","Action"].map(
                (h) => <th key={h} className="th">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="tr-row">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="td">
                      <Skeleton className="h-3.5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <Skull
                    size={28}
                    className="mx-auto mb-2"
                    style={{ color: "#1e2d3d" }}
                  />
                  <p className="text-[13px]" style={{ color: "#334155" }}>
                    No dead letters yet
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: "#1e2d3d" }}>
                    Events that exhaust all retries appear here
                  </p>
                </td>
              </tr>
            ) : (
              <AnimatePresence>
                {data!.map((dl) => (
                  <Row key={dl.id} dl={dl} refresh={refresh} />
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </FadeIn>
    </div>
  );
}

```

---

## `src/pages/WorkerHealth.tsx`

```typescript
import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Server, Zap } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { FadeIn, Stagger, StaggerItem, Skeleton } from "../components/Animated";
import type { WorkerOut } from "../types";

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
};

const hbAge = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const STATUSES: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  active:  { label: "active",  color: "#34d399", bg: "rgba(16,185,129,0.09)",  border: "rgba(16,185,129,0.2)"  },
  busy:    { label: "busy",    color: "#fbbf24", bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.2)"  },
  stale:   { label: "stale",   color: "#fb923c", bg: "rgba(249,115,22,0.09)",  border: "rgba(249,115,22,0.2)"  },
  stopped: { label: "stopped", color: "#475569", bg: "rgba(71,85,105,0.09)",   border: "rgba(71,85,105,0.2)"   },
  crashed: { label: "crashed", color: "#f87171", bg: "rgba(239,68,68,0.09)",   border: "rgba(239,68,68,0.2)"   },
};

/* ── worker card ─────────────────────────────────────────── */
function WorkerCard({ w, i }: { w: WorkerOut; i: number }) {
  const effective = w.is_stale ? "stale" : w.status;
  const cfg       = STATUSES[effective] ?? STATUSES.stopped;
  const age       = hbAge(w.last_heartbeat_at);
  const isLive    = !w.is_stale && w.status === "active";

  return (
    <motion.div
      className="card overflow-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.07, duration: 0.3, ease: EASE }}
      /* animation #17: card hover lift */
      whileHover={{ y: -3, borderColor: cfg.border }}
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      {/* top accent line */}
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.color}70, transparent)`,
        }}
      />

      <div className="p-4">
        {/* header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            {/* animation #8: live pulse for active workers */}
            {isLive ? (
              <span className="live-ring">
                <span
                  className="live-ring-dot"
                  style={{ background: cfg.color }}
                />
              </span>
            ) : (
              <span
                className="rounded-full"
                style={{ width: 7, height: 7, background: cfg.color, display: "inline-block" }}
              />
            )}
            <span
              className="mono font-semibold text-white"
              style={{ fontSize: 13, letterSpacing: "-0.01em" }}
            >
              {w.worker_name}
            </span>
          </div>
          <span
            className="badge"
            style={{
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* heartbeat bar — animation #19: worker heartbeat oscillation */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[10px] uppercase tracking-[0.06em]"
              style={{ color: "#334155" }}
            >
              Heartbeat
            </span>
            <span
              className="mono text-[11px]"
              style={{ color: age > 30 ? "#fb923c" : "#475569" }}
            >
              {ago(w.last_heartbeat_at)}
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 4, background: "rgba(255,255,255,0.04)" }}
          >
            <motion.div
              className="h-full rounded-full"
              /* animation #19: oscillating heartbeat bar for live workers */
              animate={
                isLive
                  ? { scaleX: [1, 0.2, 1], opacity: [1, 0.5, 1] }
                  : { scaleX: Math.max(0.04, 1 - age / 60) }
              }
              transition={
                isLive
                  ? {
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
                  : { duration: 0.6 }
              }
              style={
                {
                  transformOrigin: "left",
                  background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}80)`,
                } as React.CSSProperties
              }
            />
          </div>
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="card-inset px-3 py-2">
            <p className="text-[10px]" style={{ color: "#334155" }}>Status</p>
            <p
              className="mono text-[12px] font-semibold"
              style={{ color: cfg.color }}
            >
              {effective}
            </p>
          </div>
          <div className="card-inset px-3 py-2">
            <p className="text-[10px]" style={{ color: "#334155" }}>Processing</p>
            <p
              className="mono text-[12px] font-semibold"
              style={{ color: "#e2e8f0" }}
            >
              {w.current_event_id
                ? `${w.current_event_id.slice(0, 10)}…`
                : "—"}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── page ────────────────────────────────────────────────── */
export default function WorkerHealth() {
  const loader = useCallback(() => api.listWorkers(), []);
  const { data, loading } = usePolling(loader, 4000);

  const active  = (data ?? []).filter((w) => !w.is_stale && w.status === "active").length;
  const stale   = (data ?? []).filter((w) => w.is_stale).length;
  const crashed = (data ?? []).filter((w) => w.status === "crashed").length;
  const total   = (data ?? []).length;
  const healthPct = total > 0 ? Math.round((active / total) * 100) : 0;
  const arcColor  = healthPct > 80 ? "#10b981" : healthPct > 50 ? "#f97316" : "#f43f5e";
  const circumference = 2 * Math.PI * 22;

  return (
    <div className="page-wrap space-y-5">

      {/* page header */}
      <FadeIn>
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-white flex items-center gap-2"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              <Server size={16} style={{ color: "#818cf8" }} />
              Workers
            </h1>
            <p className="text-[12px] mt-1" style={{ color: "#334155" }}>
              Heartbeat monitor · stale threshold 30s · polling every 4s
            </p>
          </div>
        </div>
      </FadeIn>

      {/* fleet summary — animation #2: stagger */}
      {data && data.length > 0 && (
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* arc card — animation #14: SVG arc */}
          <StaggerItem>
            <div className="card p-4 flex items-center gap-4 h-full">
              <div
                className="relative shrink-0"
                style={{ width: 56, height: 56 }}
              >
                <svg
                  viewBox="0 0 56 56"
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                >
                  <circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="7"
                  />
                  <motion.circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    strokeLinecap="round"
                    stroke={arcColor}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - healthPct / 100) }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 4px ${arcColor}60)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="mono font-bold text-white"
                    style={{ fontSize: 11 }}
                  >
                    {healthPct}%
                  </span>
                </div>
              </div>
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "#475569" }}
                >
                  Fleet Health
                </p>
                <p
                  className="mono font-bold text-white"
                  style={{ fontSize: 20, letterSpacing: "-0.02em" }}
                >
                  {active}
                  <span
                    style={{ fontSize: 13, color: "#334155", fontWeight: 400 }}
                  >
                    /{total}
                  </span>
                </p>
              </div>
            </div>
          </StaggerItem>

          {[
            { label: "Active",  value: active,  color: "#34d399", icon: Activity },
            { label: "Stale",   value: stale,   color: stale > 0   ? "#fb923c" : "#1e2d3d", icon: Clock },
            { label: "Crashed", value: crashed, color: crashed > 0 ? "#f87171" : "#1e2d3d", icon: Zap   },
          ].map(({ label, value, color, icon: Icon }) => (
            <StaggerItem key={label}>
              <div className="card p-4 flex items-center gap-3 h-full">
                <Icon size={15} style={{ color, flexShrink: 0 }} strokeWidth={1.75} />
                <div>
                  <p
                    className="text-[10px] uppercase tracking-[0.06em]"
                    style={{ color: "#475569" }}
                  >
                    {label}
                  </p>
                  <p
                    className="mono font-bold"
                    style={{
                      color,
                      fontSize: 22,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {value}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* worker cards grid */}
      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <FadeIn className="card p-16 text-center">
          <Server size={32} className="mx-auto mb-2" style={{ color: "#1e2d3d" }} />
          <p className="text-[13px]" style={{ color: "#334155" }}>
            No workers registered
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#1e2d3d" }}>
            Start the worker service to see activity
          </p>
        </FadeIn>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data!.map((w, i) => (
            <WorkerCard key={w.id} w={w} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

```

---

## `src/pages/WorkflowDetail.tsx`

```typescript
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, Bot, CheckCircle2, ChevronDown,
  Clock, RefreshCw, Skull, User, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { FadeIn, Stagger, StaggerItem, Skeleton } from "../components/Animated";
import { usePolling } from "../hooks/usePolling";
import type { IncidentSummaryOut, WorkflowTimelineEventOut } from "../types";

const fmtMs = (v: number | null) =>
  v == null ? "–" : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`;
const fmtT = (iso: string) =>
  new Date(iso).toLocaleTimeString("en", { hour12: false });

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const DOT: Record<string, string> = {
  succeeded:     "#10b981",
  failed:        "#ef4444",
  retrying:      "#f97316",
  dead_lettered: "#f43f5e",
  processing:    "#eab308",
  queued:        "#6366f1",
};

const TT = {
  contentStyle: {
    background: "#0b1120",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    fontSize: 12,
    padding: "10px 14px",
  },
  labelStyle: { color: "#475569", fontSize: 11, marginBottom: 4 },
};

/* ── timeline event item ─────────────────────────────────── */
function TimelineEvent({
  ev,
  idx,
  isLast,
}: {
  ev: WorkflowTimelineEventOut;
  idx: number;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const color    = DOT[ev.status] ?? "#475569";
  const totalMs  = ev.attempts.reduce((s, a) => s + (a.duration_ms ?? 0), 0);

  return (
    /* animation #20: timeline node spring scale pop */
    <motion.div
      className="flex gap-4"
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.045, duration: 0.3, ease: EASE }}
    >
      {/* timeline rail */}
      <div className="flex flex-col items-center w-5 shrink-0 pt-[18px]">
        <motion.div
          className="rounded-full shrink-0"
          style={{
            width: 10,
            height: 10,
            background: color,
            boxShadow: `0 0 10px ${color}55`,
          }}
          /* animation #20: spring scale pop */
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            delay: idx * 0.045 + 0.1,
            type: "spring",
            stiffness: 450,
            damping: 18,
          }}
        />
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{
              background: `linear-gradient(180deg, ${color}45 0%, rgba(255,255,255,0.02) 100%)`,
              minHeight: 20,
            }}
          />
        )}
      </div>

      {/* event card */}
      <div className="flex-1 mb-3">
        <motion.div
          className="card overflow-hidden"
          animate={{
            borderColor: open ? `${color}30` : "rgba(255,255,255,0.07)",
          }}
          transition={{ duration: 0.15 }}
        >
          {/* header row */}
          <div
            className={`flex items-center gap-3 px-4 py-3 ${ev.attempts.length ? "cursor-pointer" : ""}`}
            style={{ transition: "background 0.1s ease" }}
            onClick={() => ev.attempts.length && setOpen(!open)}
            onMouseEnter={(e) => {
              if (ev.attempts.length)
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,.018)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <div className="flex-1 flex items-center gap-2.5 min-w-0">
              <span
                className="mono text-[13px] font-semibold text-white truncate"
                style={{ letterSpacing: "-0.01em" }}
              >
                {ev.event_type}
              </span>
              <EventStatusBadge status={ev.status} />
              <span
                className="text-[11px] hidden sm:block"
                style={{ color: "#334155" }}
              >
                {ev.service_name}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {ev.attempt_count > 1 && (
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: "#f97316" }}
                >
                  ×{ev.attempt_count} retries
                </span>
              )}
              {totalMs > 0 && (
                <span
                  className="mono text-[11px] flex items-center gap-1"
                  style={{ color: "#334155" }}
                >
                  <Clock size={9} />
                  {fmtMs(totalMs)}
                </span>
              )}
              <span
                className="mono text-[11px]"
                style={{ color: "#1e2d3d" }}
              >
                {fmtT(ev.created_at)}
              </span>
              {ev.attempts.length > 0 && (
                <motion.span
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChevronDown size={12} style={{ color: "#334155" }} />
                </motion.span>
              )}
            </div>
          </div>

          {/* error banner */}
          {ev.last_error && (
            <div
              className="px-4 py-2"
              style={{
                background: "rgba(244,63,94,0.04)",
                borderTop: "1px solid rgba(244,63,94,0.1)",
              }}
            >
              <p
                className="mono text-[11px] truncate"
                style={{ color: "#fb7185" }}
              >
                {ev.last_error}
              </p>
            </div>
          )}

          {/* expanded attempts — animation #21: row stagger fade */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{
                  overflow: "hidden",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  className="px-4 py-2"
                  style={{ background: "rgba(255,255,255,0.01)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: "#1e2d3d" }}
                  >
                    Attempt Log
                  </p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {["#","Status","Duration","Worker","Started","Error"].map((h) => (
                        <th key={h} className="th py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ev.attempts.map((a, ai) => (
                      /* animation #21: attempt rows stagger fade */
                      <motion.tr
                        key={a.id}
                        className="tr-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: ai * 0.04, duration: 0.2 }}
                      >
                        <td
                          className="td pl-4 mono text-[11px]"
                          style={{ color: "#475569" }}
                        >
                          {a.attempt_number}
                        </td>
                        <td className="td">
                          <EventStatusBadge status={a.status} />
                        </td>
                        <td className="td mono text-[12px]">
                          {fmtMs(a.duration_ms)}
                        </td>
                        <td className="td">
                          <span
                            className="flex items-center gap-1 text-[11px]"
                            style={{ color: "#475569" }}
                          >
                            <User size={9} />
                            {a.worker_name ?? "–"}
                          </span>
                        </td>
                        <td
                          className="td mono text-[11px]"
                          style={{ color: "#475569" }}
                        >
                          {fmtT(a.started_at)}
                        </td>
                        <td className="td pr-4 max-w-[200px]">
                          {a.error_message ? (
                            <span
                              className="mono text-[11px] truncate block"
                              style={{ color: "#fb7185" }}
                            >
                              {a.error_message}
                            </span>
                          ) : (
                            <span style={{ color: "#1e2d3d" }}>—</span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ── page ────────────────────────────────────────────────── */
export default function WorkflowDetail() {
  const { wfId } = useParams<{ wfId: string }>();
  const loader = useCallback(() => api.getWorkflowTimeline(wfId!), [wfId]);
  const { data, loading, error } = usePolling(loader, 8000);

  const [summary, setSummary] = useState<IncidentSummaryOut | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const summarize = async () => {
    setSummarizing(true);
    try {
      const s = await api.summarizeIncident(wfId!);
      setSummary(s);
    } catch {
      toast.error("Summarization failed");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) return (
    <div className="page-wrap space-y-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-60" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
  if (error) return (
    <div className="page-wrap text-[13px]" style={{ color: "#fb7185" }}>{error}</div>
  );
  if (!data) return null;

  const events        = data.events;
  const total         = events.length;
  const succeeded     = events.filter((e) => e.status === "succeeded").length;
  const dead          = events.filter((e) => e.status === "dead_lettered").length;
  const totalAttempts = events.reduce((s, e) => s + e.attempt_count, 0);
  const totalMs       = events.flatMap((e) => e.attempts).reduce((s, a) => s + (a.duration_ms ?? 0), 0);
  const successPct    = total > 0 ? (succeeded / total) * 100 : 0;
  const circumference = 2 * Math.PI * 38;

  const barData = events.map((ev) => ({
    step:     ev.event_type.split(".").pop() ?? ev.event_type,
    attempts: Math.max(ev.attempt_count, 1),
    status:   ev.status,
  }));

  return (
    <div className="page-wrap space-y-5">

      {/* header */}
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              to="/"
              className="flex items-center gap-1 text-[12px] mb-2.5 transition-colors"
              style={{ color: "#334155", textDecoration: "none" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#94a3b8")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#334155")}
            >
              <ArrowLeft size={12} /> Overview
            </Link>
            <h1
              className="mono font-semibold text-white"
              style={{ fontSize: 17, letterSpacing: "-0.02em" }}
            >
              {data.workflow_id}
            </h1>
            <p className="text-[12px] mt-1" style={{ color: "#334155" }}>
              {total} events · {totalAttempts} attempts total
            </p>
          </div>
          <motion.button
            className="btn-ghost"
            onClick={summarize}
            disabled={summarizing}
            whileHover={{ boxShadow: "0 0 16px rgba(168,85,247,0.2)" }}
            whileTap={{ scale: 0.95 }}
          >
            {summarizing ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <Bot size={12} />
            )}
            {summarizing ? "Analysing…" : "AI Summary"}
          </motion.button>
        </div>
      </FadeIn>

      {/* AI summary panel — animation: spring entrance */}
      <AnimatePresence>
        {summary && (
          <motion.div
            className="card overflow-hidden"
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            style={{
              borderColor: "rgba(168,85,247,0.22)",
              background: "rgba(168,85,247,0.04)",
            }}
          >
            <div
              className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(168,85,247,0.1)" }}
            >
              <Bot size={12} style={{ color: "#a855f7" }} />
              <p className="text-[12px] font-semibold text-white">
                Incident Analysis
              </p>
              <span className="text-[11px]" style={{ color: "#475569" }}>
                via {summary.model_name ?? "template"}
              </span>
            </div>
            <p
              className="px-4 py-3 text-[13px] leading-relaxed"
              style={{ color: "#cbd5e1" }}
            >
              {summary.summary_text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* stats stagger */}
      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Succeeded",     value: `${succeeded}/${total}`, icon: CheckCircle2, color: "#34d399" },
          { label: "Dead-lettered", value: dead,                    icon: Skull,        color: "#fb7185" },
          { label: "Total Attempts",value: totalAttempts,           icon: Zap,          color: "#fb923c" },
          { label: "Total Duration",value: fmtMs(totalMs || null),  icon: Clock,        color: "#818cf8" },
        ].map(({ label, value, icon: Icon, color }) => (
          <StaggerItem key={label}>
            <div
              className="card p-4 flex items-center gap-3"
              style={{ transition: "border-color 0.15s ease" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.12)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")
              }
            >
              <Icon size={16} strokeWidth={1.75} style={{ color, flexShrink: 0 }} />
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: "#475569" }}
                >
                  {label}
                </p>
                <p
                  className="mono font-bold"
                  style={{ color, fontSize: 18, letterSpacing: "-0.01em" }}
                >
                  {value}
                </p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* SVG arc for success rate — animation #14 */}
        <FadeIn delay={0.1} className="lg:col-span-2 card overflow-hidden">
          <div
            className="px-5 py-3.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[13px] font-semibold text-white">Success Rate</p>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            <div className="relative" style={{ width: 132, height: 132 }}>
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}
              >
                {/* track */}
                <circle
                  cx="50" cy="50" r="38"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="10"
                />
                {/* animated arc — animation #14 */}
                <motion.circle
                  cx="50" cy="50" r="38"
                  fill="none"
                  strokeLinecap="round"
                  stroke={
                    successPct > 80 ? "#10b981"
                    : successPct > 50 ? "#f97316"
                    : "#f43f5e"
                  }
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * (1 - successPct / 100) }}
                  transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
                  style={{
                    filter: `drop-shadow(0 0 8px ${successPct > 80 ? "#10b981" : "#f97316"}60)`,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.p
                  className="mono font-bold text-white"
                  style={{ fontSize: 24, letterSpacing: "-0.02em" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  {successPct.toFixed(0)}%
                </motion.p>
                <p className="text-[10px]" style={{ color: "#475569" }}>
                  success
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full">
              {[
                { l: "succeeded", v: succeeded,      c: "#10b981" },
                { l: "failed",    v: dead,            c: "#f43f5e" },
              ].map(({ l, v, c }) => (
                <div
                  key={l}
                  className="text-center py-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <p
                    className="mono font-bold"
                    style={{ color: c, fontSize: 18 }}
                  >
                    {v}
                  </p>
                  <p className="text-[10px]" style={{ color: "#334155" }}>
                    {l}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* bar chart */}
        <FadeIn delay={0.15} className="lg:col-span-3 card overflow-hidden">
          <div
            className="px-5 py-3.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[13px] font-semibold text-white">Attempts per Step</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#334155" }}>
              Bars colored by final outcome
            </p>
          </div>
          <div className="px-4 py-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={barData}
                margin={{ top: 4, right: 4, left: -30, bottom: 0 }}
                barSize={28}
              >
                <CartesianGrid
                  strokeDasharray="1 4"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="step"
                  tick={{ fontSize: 10, fill: "#334155", fontFamily: "JetBrains Mono" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#334155" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip {...TT} />
                <Bar dataKey="attempts" name="Attempts" radius={[4, 4, 0, 0]}>
                  {barData.map((e, i) => (
                    <Cell
                      key={i}
                      fill={DOT[e.status] ?? DOT.queued}
                      style={{
                        filter: `drop-shadow(0 0 6px ${DOT[e.status] ?? DOT.queued}50)`,
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
      </div>

      {/* timeline */}
      <FadeIn delay={0.2} className="card overflow-hidden">
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[13px] font-semibold text-white">Event Timeline</p>
          <p className="text-[11px]" style={{ color: "#334155" }}>
            Click events to expand attempt history
          </p>
        </div>
        <div className="p-5">
          {events.map((ev, i) => (
            <TimelineEvent
              key={ev.id}
              ev={ev}
              idx={i}
              isLast={i === events.length - 1}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

```

---

## `src/types.ts`

```typescript
export type EventStatus =
  | "received"
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "retrying"
  | "dead_lettered"
  | "replayed"
  | "cancelled";

export interface EventAttemptOut {
  id: string;
  attempt_number: number;
  worker_name: string | null;
  status: string;
  error_message: string | null;
  metadata_json: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface EventOut {
  id: string;
  application_id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  idempotency_key: string;
  status: EventStatus;
  payload_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  duplicate: boolean;
  attempts: EventAttemptOut[];
}

export interface WorkflowSummaryOut {
  workflow_id: string;
  total_events: number;
  succeeded: number;
  failed: number;
  dead_lettered: number;
  in_flight: number;
  has_failures: boolean;
  last_updated_at: string | null;
}

export interface WorkflowTimelineEventOut {
  id: string;
  event_type: string;
  service_name: string;
  status: EventStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  attempts: EventAttemptOut[];
}

export interface WorkflowTimelineOut {
  workflow_id: string;
  events: WorkflowTimelineEventOut[];
}

export interface DeadLetterOut {
  id: string;
  event_id: string;
  workflow_id: string;
  event_type: string;
  service_name: string;
  reason: string;
  last_error: string | null;
  created_at: string;
  replayed_at: string | null;
  replay_status: string | null;
}

export interface WorkerOut {
  id: string;
  worker_name: string;
  status: string;
  last_heartbeat_at: string;
  current_event_id: string | null;
  is_stale: boolean;
}

export interface MetricsOut {
  total_events: number;
  succeeded: number;
  failed: number;
  dead_lettered: number;
  retrying: number;
  queued: number;
  processing: number;
  replay_requeued: number;
  replay_success_rate: number;
  active_workers: number;
  stale_workers: number;
  avg_attempt_duration_ms: number | null;
  p50_attempt_duration_ms: number | null;
  p95_attempt_duration_ms: number | null;
}

export interface IncidentSummaryOut {
  id: string;
  workflow_id: string;
  summary_text: string;
  model_name: string | null;
  created_at: string;
}

```

---

## `frontend/package.json`

```json
{
  "name": "replayforge-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-tooltip": "^1.2.8",
    "axios": "1.7.7",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "framer-motion": "^12.38.0",
    "lucide-react": "^1.14.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.28.0",
    "recharts": "^3.8.1",
    "sonner": "^2.0.7"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3",
    "vite": "5.4.10"
  }
}

```
