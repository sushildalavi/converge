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
