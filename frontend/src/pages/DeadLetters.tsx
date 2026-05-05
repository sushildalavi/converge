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
