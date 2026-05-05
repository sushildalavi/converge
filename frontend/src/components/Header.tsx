import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle, AlertTriangle, XCircle, Search } from "lucide-react";
import { usePolling } from "../hooks/usePolling";
import { api } from "../api/client";

const CRUMBS: Record<string, string> = {
  "/": "Dashboard",
  "/deadletters": "Dead Letters",
  "/workers": "Workers",
};

type Health = "healthy" | "degraded" | "critical";

const HCfg: Record<Health, { label: string; color: string; Icon: typeof CheckCircle; dot: string }> = {
  healthy:  { label: "Operational",       color: "#10b981", Icon: CheckCircle,  dot: "#10b981" },
  degraded: { label: "Degraded",          color: "#f97316", Icon: AlertTriangle, dot: "#f97316" },
  critical: { label: "System Critical",   color: "#f43f5e", Icon: XCircle,       dot: "#f43f5e" },
};

export function Header({ onCmdK }: { onCmdK: () => void }) {
  const loc = useLocation();
  const crumb = CRUMBS[loc.pathname] ?? "Workflow Detail";
  const mLoader = useCallback(() => api.getMetrics(), []);
  const { data: m } = usePolling(mLoader, 8000);

  const health: Health = !m ? "healthy"
    : m.active_workers === 0 && m.total_events > 0 ? "critical"
    : m.stale_workers > 0 || m.dead_lettered > 0 ? "degraded"
    : "healthy";
  const h = HCfg[health];

  return (
    <header
      className="flex items-center justify-between px-5 shrink-0"
      style={{ height: 42, borderBottom: "1px solid var(--border)", background: "rgba(8,12,20,.9)", backdropFilter: "blur(8px)" }}
    >
      {/* breadcrumb */}
      <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <span style={{ color: "#334155" }}>ReplayForge</span>
        <span style={{ color: "#1e293b" }}>/</span>
        <span style={{ color: "#94a3b8", fontWeight: 500 }}>{crumb}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* health */}
        {m && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ background: `${h.color}10`, border: `1px solid ${h.color}25`, fontSize: 11, color: h.color, fontWeight: 600 }}
          >
            <span className="relative w-1.5 h-1.5 flex shrink-0">
              {health === "healthy" && <span className="live-ring absolute inset-0 rounded-full" style={{ background: h.dot }} />}
              <span className="relative rounded-full w-1.5 h-1.5" style={{ background: h.dot }} />
            </span>
            {h.label}
          </div>
        )}

        {/* quick stats */}
        {m && (
          <div className="flex items-center gap-3 mono" style={{ fontSize: 11, color: "#334155" }}>
            <span><span style={{ color: "#64748b" }}>{m.active_workers}</span> workers</span>
            <span><span style={{ color: "#6366f1" }}>{m.total_events.toLocaleString()}</span> events</span>
          </div>
        )}

        {/* search */}
        <button
          onClick={onCmdK}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md"
          style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", fontSize: 11, color: "#475569", cursor: "pointer" }}
        >
          <Search size={11} />
          <span>Search</span>
          <span className="flex gap-0.5 ml-1"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
        </button>
      </div>
    </header>
  );
}
