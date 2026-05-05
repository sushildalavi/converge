import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LayoutDashboard, RefreshCw, Server, Skull, Zap } from "lucide-react";
import { api } from "../api/client";
import { toast } from "sonner";

type Item = {
  id: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  action: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/* animation #10 — command palette spring open
   animation #27 — item hover layoutId sliding background pill */
export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Item[] = [
    {
      id: "dash",
      label: "Dashboard",
      sub: "Overview and live metrics",
      icon: <LayoutDashboard size={14} style={{ color: "#818cf8" }} />,
      action: () => { navigate("/"); onClose(); },
    },
    {
      id: "dlq",
      label: "Dead Letter Queue",
      sub: "Review and replay failures",
      icon: <Skull size={14} style={{ color: "#f43f5e" }} />,
      action: () => { navigate("/deadletters"); onClose(); },
    },
    {
      id: "workers",
      label: "Worker Health",
      sub: "Heartbeat and fleet status",
      icon: <Server size={14} style={{ color: "#34d399" }} />,
      action: () => { navigate("/workers"); onClose(); },
    },
    {
      id: "gen",
      label: "Generate Workload",
      sub: "30 synthetic checkout flows",
      icon: <Zap size={14} style={{ color: "#f59e0b" }} />,
      action: async () => {
        onClose();
        try {
          const r = await api.generateWorkload(30);
          toast.success("Workload generated", { description: `${r.events_sent} events queued` });
        } catch {
          toast.error("Generation failed");
        }
      },
    },
    {
      id: "reload",
      label: "Reload page",
      sub: "Hard refresh all data",
      icon: <RefreshCw size={14} style={{ color: "#64748b" }} />,
      action: () => { window.location.reload(); },
    },
    {
      id: "dlq2",
      label: "Dead Letters",
      sub: "Events exhausting all retries",
      icon: <AlertTriangle size={14} style={{ color: "#f97316" }} />,
      action: () => { navigate("/deadletters"); onClose(); },
    },
  ];

  const filtered = query.trim()
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.sub?.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[selected]?.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, onClose]);

  // auto-focus input
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />

          {/* palette — animation #10: spring open */}
          <motion.div
            className="fixed z-50"
            style={{
              top: "18%",
              left: "50%",
              width: 520,
              maxWidth: "calc(100vw - 32px)",
              x: "-50%",
              background: "rgba(8,14,28,0.98)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              boxShadow:
                "0 0 0 1px rgba(99,102,241,0.08), 0 32px 64px rgba(0,0,0,0.9), 0 8px 24px rgba(99,102,241,0.06)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              overflow: "hidden",
            }}
            initial={{ opacity: 0, y: -14, scale: 0.94, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0,   scale: 1,    filter: "blur(0px)" }}
            exit={{ opacity: 0,    y: -8,  scale: 0.97, filter: "blur(2px)" }}
            transition={{ duration: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {/* search input */}
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Zap size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, actions…"
                className="flex-1 bg-transparent outline-none"
                style={{
                  fontSize: 14,
                  color: "#e2e8f0",
                  fontFamily: "inherit",
                }}
              />
              <div className="flex items-center gap-1">
                <kbd className="kbd">esc</kbd>
              </div>
            </div>

            {/* results */}
            <LayoutGroup>
              <div
                className="py-1.5 overflow-y-auto"
                style={{ maxHeight: 280, scrollbarWidth: "none" }}
              >
                {filtered.length === 0 ? (
                  <div
                    className="px-4 py-10 text-center"
                    style={{ color: "#334155", fontSize: 13 }}
                  >
                    No results for &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filtered.map((item, i) => (
                    <motion.button
                      key={item.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left relative"
                      onClick={item.action}
                      onMouseEnter={() => setSelected(i)}
                      /* animation #16: whileTap scale */
                      whileTap={{ scale: 0.98 }}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      {/* animation #27: layoutId background pill */}
                      {i === selected && (
                        <motion.div
                          layoutId="cmd-pill"
                          className="absolute inset-x-1.5 inset-y-0.5 rounded-lg"
                          style={{ background: "rgba(99,102,241,0.12)" }}
                          transition={{ duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] }}
                        />
                      )}
                      <span
                        className="relative z-10 shrink-0"
                        style={{ color: "#475569" }}
                      >
                        {item.icon}
                      </span>
                      <div className="relative z-10 flex-1 min-w-0">
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#e2e8f0",
                          }}
                        >
                          {item.label}
                        </p>
                        {item.sub && (
                          <p
                            style={{ fontSize: 11, marginTop: 1, color: "#475569" }}
                          >
                            {item.sub}
                          </p>
                        )}
                      </div>
                      {i === selected && (
                        <kbd className="kbd relative z-10 shrink-0">↵</kbd>
                      )}
                    </motion.button>
                  ))
                )}
              </div>
            </LayoutGroup>

            {/* footer */}
            <div
              className="px-4 py-2.5 flex items-center gap-4"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.05)",
                color: "#334155",
                fontSize: 11,
              }}
            >
              <span className="flex items-center gap-1">
                <kbd className="kbd">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">esc</kbd> close
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
