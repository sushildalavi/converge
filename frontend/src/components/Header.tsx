import { useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { usePolling } from "../hooks/usePolling";
import { api } from "../api/client";
import { AnimatedNumber } from "./Animated";

const CRUMBS: Record<string,string> = {
  "/":"Overview", "/deadletters":"Dead Letters", "/workers":"Workers",
};

export function Header({ onCmdK }: { onCmdK: () => void }) {
  const loc   = useLocation();
  const crumb = CRUMBS[loc.pathname] ?? "Workflow";
  const mLoad = useCallback(() => api.getMetrics(), []);
  const { data: m } = usePolling(mLoad, 8000);

  const health = !m ? null
    : m.active_workers === 0 && m.total_events > 0 ? "critical"
    : m.stale_workers > 0 || m.dead_lettered > 0 ? "degraded"
    : "healthy";

  return (
    <div className="main-header">
      {/* breadcrumb */}
      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--dim)", flex:1 }}>
        <span>Converge</span>
        <span style={{ color:"var(--dimmer)" }}>/</span>
        <span style={{ color:"var(--muted)", fontWeight:500 }}>{crumb}</span>
      </div>

      {/* center status */}
      {health && (
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
          <span className="dot" style={{
            background: health==="healthy"?"var(--green)":health==="degraded"?"var(--orange)":"var(--red)",
            width:6, height:6,
          }} />
          <span style={{ color:"var(--dim)" }}>
            {health==="healthy"?"Operational":health==="degraded"?"Degraded":"Critical"}
          </span>
          {m && (
            <span className="mono" style={{ color:"var(--dimmer)", marginLeft:8 }}>
              <span style={{ color:"var(--muted)" }}><AnimatedNumber value={m.total_events} /></span> events
              {" · "}
              <span style={{ color:m.active_workers>0?"var(--green)":"var(--red)" }}>{m.active_workers}</span> workers
            </span>
          )}
        </div>
      )}

      {/* search */}
      <button onClick={onCmdK}
        className="btn-outline"
        style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
        <Search size={11} />
        <span>Search</span>
        <span style={{ display:"flex", gap:2, marginLeft:4 }}>
          <kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd>
        </span>
      </button>
    </div>
  );
}
