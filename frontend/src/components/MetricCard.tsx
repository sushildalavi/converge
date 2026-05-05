import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber, Skeleton } from "./Animated";

/* mini inline sparkline */
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ width: 56, height: 24 }} />;
  const max = Math.max(...data, 1);
  const w = 56, h = 24, pad = 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - pad - ((v / max) * (h - pad * 2));
    return `${x},${y}`;
  }).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sp-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sp-${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ACCENT: Record<string, { color: string; dimColor: string }> = {
  indigo:  { color: "#818cf8", dimColor: "rgba(99,102,241,.08)"  },
  emerald: { color: "#34d399", dimColor: "rgba(16,185,129,.08)"  },
  rose:    { color: "#fb7185", dimColor: "rgba(244,63,94,.08)"   },
  orange:  { color: "#fb923c", dimColor: "rgba(249,115,22,.08)"  },
  amber:   { color: "#fbbf24", dimColor: "rgba(245,158,11,.08)"  },
  purple:  { color: "#c084fc", dimColor: "rgba(168,85,247,.08)"  },
  sky:     { color: "#38bdf8", dimColor: "rgba(14,165,233,.08)"  },
  default: { color: "#64748b", dimColor: "rgba(100,116,139,.06)" },
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
}

export function MetricCard({ label, value, sub, icon: Icon, trend, trendUp, accent = "default", sparkData }: Props) {
  const { color, dimColor } = ACCENT[accent] ?? ACCENT.default;
  const isLoading = value === null;

  return (
    <motion.div
      className="card p-4 flex flex-col gap-2.5 relative overflow-hidden"
      whileHover={{ y: -1, borderColor: "rgba(255,255,255,.12)" }}
      transition={{ duration: .12 }}
      style={{ cursor: "default" }}
    >
      {/* top line accent */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${color}50,transparent)` }} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && (
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: dimColor }}>
              <Icon size={11} style={{ color }} strokeWidth={2} />
            </div>
          )}
          <span style={{ color: "#475569", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</span>
        </div>
        {trend && (
          <span style={{ color: trendUp ? "#34d399" : "#fb7185", fontSize: 11, fontWeight: 600 }}>
            {trendUp ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="mono font-bold tabular-nums" style={{ color: "#fff", fontSize: 26, lineHeight: 1 }}>
            {isLoading ? <Skeleton className="w-16 h-6" /> :
              typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </div>
          {sub && <div style={{ color: "#334155", fontSize: 11, marginTop: 4 }}>{sub}</div>}
        </div>
        {sparkData && <Spark data={sparkData} color={color} />}
      </div>
    </motion.div>
  );
}
