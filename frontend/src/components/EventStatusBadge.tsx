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
