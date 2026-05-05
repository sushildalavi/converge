import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";

const E = [0.22, 0.6, 0.36, 1] as const;

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const spring  = useSpring(value, { stiffness: 100, damping: 18 });
  const display = useTransform(spring, v => decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString());
  const [text, setText] = useState(() => decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString());
  useEffect(() => { spring.set(value) }, [value, spring]);
  useEffect(() => display.on("change", v => setText(v)), [display]);
  return <span className="tick">{text}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"skeleton " + className} />;
}

export function FadeUp({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .28, delay, ease: E }}>
      {children}
    </motion.div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: .2 }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className}
      initial="h" animate="s" variants={{ h:{}, s:{ transition:{ staggerChildren:.04 } } }}>
      {children}
    </motion.div>
  );
}
export function SI({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className}
      variants={{ h:{ opacity:0, y:10 }, s:{ opacity:1, y:0, transition:{ duration:.26, ease:E } } }}>
      {children}
    </motion.div>
  );
}

export function PresenceFade({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
          exit={{ opacity:0, height:0 }} transition={{ duration:.2 }} style={{ overflow:"hidden" }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
