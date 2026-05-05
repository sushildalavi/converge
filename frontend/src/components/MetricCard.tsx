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
