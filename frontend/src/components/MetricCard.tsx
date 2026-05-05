import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface MetricCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: "indigo" | "emerald" | "red" | "orange" | "yellow" | "purple" | "gray";
}

const accentBorder: Record<string, string> = {
  indigo:  "border-indigo-500/40 shadow-indigo-500/5",
  emerald: "border-emerald-500/40 shadow-emerald-500/5",
  red:     "border-red-500/40 shadow-red-500/5",
  orange:  "border-orange-500/40 shadow-orange-500/5",
  yellow:  "border-yellow-500/40 shadow-yellow-500/5",
  purple:  "border-purple-500/40 shadow-purple-500/5",
  gray:    "border-gray-700/60",
};
const accentIcon: Record<string, string> = {
  indigo:  "bg-indigo-500/10 text-indigo-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  red:     "bg-red-500/10 text-red-400",
  orange:  "bg-orange-500/10 text-orange-400",
  yellow:  "bg-yellow-500/10 text-yellow-400",
  purple:  "bg-purple-500/10 text-purple-400",
  gray:    "bg-gray-700 text-gray-400",
};
const trendColor = { up: "text-emerald-400", down: "text-red-400", neutral: "text-gray-500" };

export function MetricCard({ title, value, sub, icon: Icon, trend, trendLabel, accent = "gray" }: MetricCardProps) {
  return (
    <div className={clsx("card p-5 shadow-lg border", accentBorder[accent])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">{title}</p>
          <p className="text-3xl font-bold text-white tabular-nums leading-none">{value}</p>
          {(sub || trendLabel) && (
            <div className="mt-2 flex items-center gap-2">
              {trendLabel && trend && (
                <span className={clsx("text-xs font-medium", trendColor[trend])}>{trendLabel}</span>
              )}
              {sub && <span className="text-xs text-gray-600">{sub}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={clsx("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", accentIcon[accent])}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
