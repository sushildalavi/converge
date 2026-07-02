import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, Braces, Layers3, RefreshCcw, Server, ShieldCheck, Workflow, Zap, Bot, LayoutDashboard, Cpu } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { CommandPalette } from "../components/CommandPalette";

const NAV = [
  { to: "/app", label: "AI Console", icon: LayoutDashboard, end: true },
  { to: "/app/workers", label: "Workers", icon: Server },
  { to: "/app/streams", label: "Streams", icon: Workflow },
  { to: "/app/replay", label: "Replay / DLQ", icon: Layers3 },
  { to: "/app/convergence", label: "Convergence", icon: ShieldCheck },
  { to: "/app/benchmarks", label: "Benchmarks", icon: Activity },
  { to: "/app/ai-runs", label: "Agent Runs", icon: Bot },
  { to: "/app/ai-evals", label: "Evals", icon: Braces },
  { to: "/app/architecture", label: "Architecture", icon: Cpu },
];

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/app": { title: "AI Operations Console", subtitle: "Live recovery state, convergence signals, and operator actions." },
  "/app/workers": { title: "Worker Health", subtitle: "Heartbeats, stale workers, and active claim state." },
  "/app/streams": { title: "Stream Backlog", subtitle: "Redis pending entries, retry queues, and backlog pressure." },
  "/app/replay": { title: "Replay / DLQ", subtitle: "Dead letters, replay actions, and recovery traceability." },
  "/app/convergence": { title: "Convergence", subtitle: "Proof that the system drained and recovered cleanly." },
  "/app/chaos": { title: "Benchmark Explorer", subtitle: "Measured benchmark and chaos artifacts from this repo." },
  "/app/benchmarks": { title: "Benchmark Explorer", subtitle: "Replay throughput, recovery time, and AI eval proof." },
  "/app/ai-runs": { title: "Agent Runs", subtitle: "AI traces, step hashes, and replay confidence." },
  "/app/ai-evals": { title: "AI Evals", subtitle: "Deterministic and judge-backed eval results." },
  "/app/architecture": { title: "Architecture", subtitle: "Control plane, worker pool, outbox, and trace store." },
  "/app/workflows/:wfId": { title: "Workflow Timeline", subtitle: "Per-workflow event history, attempts, and incident context." },
};

function resolveRouteMeta(pathname: string) {
  if (pathname.startsWith("/app/workflows/")) {
    return TITLES["/app/workflows/:wfId"];
  }
  return TITLES[pathname] ?? TITLES["/app"];
}

function ShellHeader({
  pathname,
  onRefresh,
}: {
  pathname: string;
  onRefresh: () => void;
}) {
  const route = resolveRouteMeta(pathname);
  const metricsLoader = useCallback(() => api.getMetrics(), []);
  const { data: metrics } = usePolling(metricsLoader, 8000);
  const health = !metrics
    ? null
    : metrics.converged && metrics.active_workers > 0
      ? "healthy"
      : metrics.stale_workers > 0 || metrics.dead_lettered > 0
        ? "degraded"
        : "watch";

  return (
    <header className="console-topbar">
      <div>
        <div className="eyebrow">Converge / Recovery Intelligence</div>
        <h1 className="console-title">{route.title}</h1>
        <p className="console-subtitle">{route.subtitle}</p>
      </div>

      <div className="console-topbar-actions">
        {health && (
          <div className="console-status">
            <span className={`dot ${health}`} />
            <div>
              <p className="console-status-label">System</p>
              <p className="console-status-value">
                {health === "healthy" ? "Converged" : health === "degraded" ? "Degraded" : "Monitoring"}
              </p>
            </div>
            {metrics && (
              <div className="console-status-metrics">
                <span>{metrics.active_workers} workers</span>
                <span>{metrics.pending_events} pending</span>
                <span>{metrics.dead_lettered} DLQ</span>
              </div>
            )}
          </div>
        )}

        <button className="btn-outline" onClick={onRefresh}>
          <RefreshCcw size={11} />
          Refresh
        </button>
      </div>
    </header>
  );
}

export function AppShell() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const refresh = () => window.location.reload();

  const activeMeta = useMemo(() => resolveRouteMeta(location.pathname), [location.pathname]);

  return (
    <div className="app-shell">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <Zap size={14} strokeWidth={2.4} />
          </div>
          <div>
            <p className="brand-name">Converge</p>
            <p className="brand-subtitle">AI workflow recovery platform</p>
          </div>
        </div>

        <nav className="app-nav">
          <p className="section-label">Console</p>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => "app-nav-link" + (isActive ? " active" : "")}>
              <Icon size={14} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-panel">
          <p className="sidebar-panel-label">Current view</p>
          <p className="sidebar-panel-title">{activeMeta.title}</p>
          <p className="sidebar-panel-copy">{activeMeta.subtitle}</p>
        </div>

        <div className="sidebar-panel">
          <p className="sidebar-panel-label">Shortcuts</p>
          <button className="shortcut-button" onClick={() => setPaletteOpen(true)}>
            <span>Command palette</span>
            <kbd className="kbd">⌘K</kbd>
          </button>
          <a
            className="shortcut-link"
            href="https://github.com/sushildalavi/converge"
            target="_blank"
            rel="noreferrer"
          >
            Open docs
          </a>
        </div>
      </aside>

      <div className="app-main">
        <ShellHeader pathname={location.pathname} onRefresh={refresh} />
        <main className="app-content">
          <Outlet key={location.pathname} />
        </main>
      </div>
    </div>
  );
}
