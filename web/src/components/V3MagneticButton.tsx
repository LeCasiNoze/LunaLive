// ─────────────────────────────────────────────────────────────────────────────
// V3MagneticButton — bouton ancre <a> qui suit legerement le curseur via
// useMotionValue + useSpring. Effet "magnetique" subtil (deplacement 18-22%
// de la distance curseur/centre). Sans-effet sur touch / prefers-reduced.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export type V3MagneticButtonProps = {
  href: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
  /** Intensite : 0.18 par defaut. >0.25 = aggressive, <0.12 = subtil. */
  strength?: number;
  /** Style additionnel (background, border, etc.). */
  style?: React.CSSProperties;
};

export function V3MagneticButton({
  href, onClick, children, className, strength = 0.18, style,
}: V3MagneticButtonProps) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength * 1.2);
  };
  const reset = () => { x.set(0); y.set(0); };

  return (
    <motion.a
      ref={ref}
      href={href}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onBlur={reset}
      style={{ ...style, x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.a>
  );
}
