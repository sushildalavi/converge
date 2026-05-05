import { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { EventStatusBadge } from "./EventStatusBadge";
import { Skeleton } from "./Animated";

function ago(iso: string | null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "now"; if (s < 60) return s + "s"; return Math.floor(s/60) + "m";
}

export function LiveFeed() {
  const loader = useCallback(() => api.recentEvents(30), []);
  const { data, loading } = usePolling(loader, 2500);
  const seen = useRef(new Set<string>());
  const items = data ?? [];

  return (
    <div className="card flex flex-col" style={{ height:"100%", minHeight:280 }}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        <div className="flex items-center gap-2">
          <Activity size={13} style={{ color:"var(--accent)" }} />
          <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Activity</span>
        </div>
        <span className="mono" style={{ fontSize:10, color:"var(--dimmer)",
          background:"var(--raised)", border:"1px solid var(--border)", borderRadius:3, padding:"1px 6px" }}>
          {items.length}
        </span>
      </div>

      <div style={{ flex:1, overflowY:"auto", scrollbarWidth:"none", minHeight:0 }}>
        {loading && !data ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_,i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-4 h-4 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
            justifyContent:"center", height:"100%", color:"var(--dimmer)", fontSize:12 }}>
            No recent events
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map(ev => {
              const isNew = !seen.current.has(ev.id);
              if (isNew) seen.current.add(ev.id);
              return (
                <motion.div key={ev.id}
                  initial={isNew ? { opacity:0, backgroundColor:"rgba(245,158,11,.06)" } : { opacity:1 }}
                  animate={{ opacity:1, backgroundColor:"rgba(0,0,0,0)" }}
                  transition={{ duration:.35 }}
                  style={{ padding:"8px 16px", borderBottom:"1px solid var(--border)", cursor:"default" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.02)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background="transparent")}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span className="mono" style={{ fontSize:11, fontWeight:600, color:"var(--text)", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {ev.event_type}
                    </span>
                    <EventStatusBadge status={ev.status} />
                    {ev.attempt_count > 1 && (
                      <span className="mono" style={{ fontSize:10, color:"var(--orange)" }}>×{ev.attempt_count}</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
                    <span className="mono" style={{ fontSize:10, color:"var(--dimmer)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {ev.workflow_id}
                    </span>
                    {ev.last_error && (
                      <span className="mono" style={{ fontSize:10, color:"var(--red)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={ev.last_error}>
                        {ev.last_error.slice(0, 24)}
                      </span>
                    )}
                    <span className="mono" style={{ fontSize:10, color:"var(--dimmer)", flexShrink:0 }}>{ago(ev.updated_at)}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
