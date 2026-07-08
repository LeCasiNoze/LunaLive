// web/src/components/events/CountUp.tsx
import * as React from "react";
import { useInView, useReducedMotion } from "framer-motion";

// Compteur animé (ease-out cubic) déclenché au scroll — même idiome que
// useCountUp (M11Aurix.tsx) / CountUp (S1CelsiusLanding.tsx). Coupé sous
// prefers-reduced-motion : affiche direct la valeur finale.
export function CountUp({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10px" });
  const reduceMotion = useReducedMotion();
  const target = Math.max(0, Math.floor(value));
  const [val, setVal] = React.useState(reduceMotion ? target : 0);

  React.useEffect(() => {
    if (reduceMotion) {
      setVal(target);
      return;
    }
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, reduceMotion]);

  return <span ref={ref}>{val.toLocaleString("fr-FR")}</span>;
}
