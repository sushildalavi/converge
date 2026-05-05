import type { EventStatus } from "../types";

const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  received:     { bg: "bg-gray-800",         text: "text-gray-400",    dot: "bg-gray-500",    label: "received" },
  queued:       { bg: "bg-blue-950/60",      text: "text-blue-400",    dot: "bg-blue-500",    label: "queued" },
  processing:   { bg: "bg-yellow-950/60",    text: "text-yellow-400",  dot: "bg-yellow-400",  label: "processing" },
  succeeded:    { bg: "bg-emerald-950/60",   text: "text-emerald-400", dot: "bg-emerald-500", label: "succeeded" },
  failed:       { bg: "bg-red-950/60",       text: "text-red-400",     dot: "bg-red-500",     label: "failed" },
  retrying:     { bg: "bg-orange-950/60",    text: "text-orange-400",  dot: "bg-orange-500",  label: "retrying" },
  dead_lettered:{ bg: "bg-rose-950/60",      text: "text-rose-400",    dot: "bg-rose-500",    label: "dead lettered" },
  replayed:     { bg: "bg-purple-950/60",    text: "text-purple-400",  dot: "bg-purple-500",  label: "replayed" },
  cancelled:    { bg: "bg-gray-900",         text: "text-gray-500",    dot: "bg-gray-600",    label: "cancelled" },
};

export function EventStatusBadge({ status, size = "sm" }: { status: EventStatus | string; size?: "xs" | "sm" }) {
  const c = config[status] ?? config.received;
  const pulse = status === "processing" || status === "retrying";
  const textSize = size === "xs" ? "text-[10px]" : "text-xs";

  return (
    <span className={`badge ${c.bg} ${c.text} ${textSize} border border-white/5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${pulse ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}
