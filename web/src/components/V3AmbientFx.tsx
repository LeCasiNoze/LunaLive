// ─────────────────────────────────────────────────────────────────────────────
// V3AmbientFx — couches background "premium" reutilisables pour les modeles
// V3 visuels. A poser en debut de root avec z-index 0/1/2, puis le contenu
// sur un layer z-index 10.
//
// Composition :
//   - <V3MeshBg>     : 4 radial gradients animes (drift lent)
//   - <V3AuroraBg>   : 2 beams diagonaux flous animes
//   - <V3GrainBg>    : SVG noise turbulence overlay (mix-blend overlay)
//   - <V3SpotlightBg>: spotlight radial qui suit le curseur (a wrapper sur
//                      une section avec position:relative)
//
// Toutes les anims respectent prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

type AmbientColors = {
  accent: string;
  accentLight: string;
  accentAlt: string;
  accentHot: string;
};

export function V3MeshBg({ colors, fixed = true, opacity = 1 }: {
  colors: AmbientColors;
  fixed?: boolean;
  opacity?: number;
}) {
  return (
    <div className={`v3mesh ${fixed ? "v3mesh-fixed" : ""}`} aria-hidden>
      <style>{`
        .v3mesh{position:absolute;inset:-20%;z-index:0;pointer-events:none;opacity:${opacity};
          background:
            radial-gradient(45% 35% at 20% 30%, ${colors.accent}55 0%, transparent 60%),
            radial-gradient(40% 30% at 80% 20%, ${colors.accentAlt}40 0%, transparent 60%),
            radial-gradient(50% 40% at 60% 80%, ${colors.accentLight}45 0%, transparent 60%),
            radial-gradient(30% 25% at 30% 70%, ${colors.accentHot}35 0%, transparent 60%);
          filter:blur(40px) saturate(1.25);
          animation:v3mesh-drift 18s ease-in-out infinite alternate}
        .v3mesh-fixed{position:fixed}
        @keyframes v3mesh-drift{
          0%{transform:translate(0,0) scale(1)}
          50%{transform:translate(3%,-2%) scale(1.05)}
          100%{transform:translate(-2%,3%) scale(1.02)}
        }
        @media (prefers-reduced-motion:reduce){.v3mesh{animation:none}}
      `}</style>
    </div>
  );
}

export function V3AuroraBg({ colors, fixed = true, opacity = 0.45 }: {
  colors: AmbientColors;
  fixed?: boolean;
  opacity?: number;
}) {
  return (
    <div className={`v3aurora ${fixed ? "v3aurora-fixed" : ""}`} aria-hidden>
      <style>{`
        .v3aurora{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;opacity:${opacity}}
        .v3aurora-fixed{position:fixed}
        .v3aurora::before,.v3aurora::after{content:"";position:absolute;width:180%;height:80px;left:-40%;
          background:linear-gradient(90deg,transparent 0%,${colors.accent}cc 30%,${colors.accentLight}cc 50%,${colors.accentAlt}cc 70%,transparent 100%);
          filter:blur(34px);transform-origin:center;animation:v3aurora-flow 12s ease-in-out infinite}
        .v3aurora::before{top:15%;animation-delay:-2s}
        .v3aurora::after{top:60%;animation-delay:-7s;height:60px;opacity:.75}
        @keyframes v3aurora-flow{0%,100%{transform:translateX(-10%) rotate(-8deg)}50%{transform:translateX(10%) rotate(-4deg)}}
        @media (prefers-reduced-motion:reduce){.v3aurora::before,.v3aurora::after{animation:none}}
      `}</style>
    </div>
  );
}

export function V3GrainBg({ fixed = true, opacity = 0.06 }: { fixed?: boolean; opacity?: number }) {
  return (
    <div className={`v3grain ${fixed ? "v3grain-fixed" : ""}`} aria-hidden>
      <style>{`
        .v3grain{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:${opacity};mix-blend-mode:overlay;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>")}
        .v3grain-fixed{position:fixed}
      `}</style>
    </div>
  );
}

/** Wrapper interactif : pose ce composant comme premier enfant d'une section
 *  position:relative pour avoir un spotlight radial qui suit le curseur. */
export function V3Spotlight({ accent, accentAlt, intensity = 0.55, size = 420 }: {
  accent: string;
  accentAlt: string;
  intensity?: number;
  size?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mx = useMotionValue(50);
  const my = useMotionValue(30);
  const smx = useSpring(mx, { stiffness: 60, damping: 20 });
  const smy = useSpring(my, { stiffness: 60, damping: 20 });
  const bgX = useTransform(smx, (v) => `${v}%`);
  const bgY = useTransform(smy, (v) => `${v}%`);

  React.useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width) * 100);
      my.set(((e.clientY - r.top) / r.height) * 100);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  const a1 = `${accent}${Math.round(intensity * 255).toString(16).padStart(2, "0")}`;
  const a2 = `${accentAlt}${Math.round(intensity * 0.6 * 255).toString(16).padStart(2, "0")}`;

  return (
    <motion.div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen",
        background: useTransform(
          [bgX, bgY] as any,
          ([x, y]: any) => `radial-gradient(${size}px ${size}px at ${x} ${y}, ${a1} 0%, ${a2} 30%, transparent 70%)`
        ),
      }}
    />
  );
}
