// web/src/components/LevelUpPopup.tsx
// ─────────────────────────────────────────────────────────────────────────
// Pop-up de passage de niveau : apparaît par-dessus tout le site quand le
// viewer monte de palier (n'importe où). Animation premium (framer-motion) +
// ambiance sonore synthétisée (Web Audio, aucun asset). Auto-fermeture.
// ─────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

export type LevelUpData = { level: number; title?: string | null; tier?: number };

// Palette par palier (tier 0→9) : bronze → argent → or → émeraude → saphir →
// améthyste → rubis → cyan → rose → or blanc.
const TIER_COLORS: Array<[string, string]> = [
  ["#c9843f", "#f0b072"], ["#9aa4b2", "#d7dde6"], ["#e0a832", "#ffd971"],
  ["#1fae74", "#5ff0b0"], ["#2f7ff0", "#79b6ff"], ["#8b5cf6", "#c4a6ff"],
  ["#ef4444", "#ff8a8a"], ["#22d3ee", "#8ef2ff"], ["#ec4899", "#ffa6d4"],
  ["#e8d9a0", "#fffbe6"],
];

// Son "level up" : arpège majeur ascendant + shimmer final. Nécessite un
// contexte audio (geste utilisateur idéalement ; try/catch sinon).
function playLevelUpSound() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const t = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === notes.length - 1 ? "sine" : "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    // shimmer haut de gamme sur la dernière note
    const sh = ctx.createOscillator();
    const shG = ctx.createGain();
    sh.type = "sine";
    sh.frequency.setValueAtTime(1568, now + 0.36); // G6
    shG.gain.setValueAtTime(0.0001, now + 0.36);
    shG.gain.exponentialRampToValueAtTime(0.12, now + 0.4);
    shG.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    sh.connect(shG).connect(ctx.destination);
    sh.start(now + 0.36);
    sh.stop(now + 1.15);
    window.setTimeout(() => { try { ctx.close(); } catch {} }, 1600);
  } catch { /* audio bloqué (pas de geste) → silencieux */ }
}

const STYLE_ID = "lvlup-styles";
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes lvlup-ring { to { transform: rotate(360deg); } }
@keyframes lvlup-pulse { 0%,100%{ transform:scale(1); opacity:.9 } 50%{ transform:scale(1.06); opacity:1 } }
.lvlup-ray { position:absolute; left:50%; top:50%; width:2px; height:46%; transform-origin:50% 0;
  background:linear-gradient(to bottom, var(--r2), transparent); opacity:.55; }
@media (prefers-reduced-motion: reduce){ .lvlup-spin{ animation:none !important } }
`;
  document.head.appendChild(el);
}

export function LevelUpPopup({ open, data, onClose }: { open: boolean; data: LevelUpData | null; onClose: () => void }) {
  ensureStyles();
  const tier = Math.max(0, Math.min(9, Number(data?.tier ?? 0)));
  const [c1, c2] = TIER_COLORS[tier];

  React.useEffect(() => {
    if (!open || !data) return;
    playLevelUpSound();
    const t = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(t);
  }, [open, data, onClose]);

  return (
    <AnimatePresence>
      {open && data ? (
        <motion.div
          key="lvlup"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 5000, display: "grid", placeItems: "center",
            background: "radial-gradient(ellipse at center, rgba(8,6,16,.72), rgba(4,3,10,.9))",
            backdropFilter: "blur(6px)", cursor: "pointer",
            ["--r1" as any]: c1, ["--r2" as any]: c2,
          }}
        >
          <motion.div
            initial={{ scale: 0.4, y: 30, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.7, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: 320, height: 320, display: "grid", placeItems: "center" }}
          >
            {/* Rayons + anneau conique tournant */}
            <div className="lvlup-spin" style={{ position: "absolute", inset: 0, animation: "lvlup-ring 9s linear infinite" }}>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="lvlup-ray" style={{ transform: `translateX(-50%) rotate(${i * 22.5}deg)` }} />
              ))}
            </div>
            <motion.div
              className="lvlup-spin"
              initial={{ scale: 0.6 }} animate={{ scale: 1 }}
              transition={{ delay: 0.05, type: "spring", stiffness: 200, damping: 14 }}
              style={{
                position: "absolute", width: 236, height: 236, borderRadius: "50%",
                background: `conic-gradient(from 0deg, ${c1}, ${c2}, ${c1}, ${c2}, ${c1})`,
                animation: "lvlup-ring 4s linear infinite",
                filter: "blur(2px)", opacity: 0.5,
              }}
            />
            {/* Disque central */}
            <div style={{
              position: "relative", width: 208, height: 208, borderRadius: "50%",
              background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,.14), rgba(12,9,22,.96) 62%)",
              border: `2px solid ${c2}`, boxShadow: `0 0 60px ${c1}, inset 0 0 40px rgba(0,0,0,.6)`,
              display: "grid", placeItems: "center", textAlign: "center",
              animation: "lvlup-pulse 2.2s ease-in-out infinite",
            }}>
              <div>
                <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 3, textTransform: "uppercase", color: c2, opacity: 0.9 }}>Level up</div>
                <motion.div
                  initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 12 }}
                  style={{ fontFamily: "'Bebas Neue', 'Anton', system-ui", fontSize: 92, lineHeight: 0.9, color: "#fff", textShadow: `0 0 30px ${c1}`, margin: "2px 0 0" }}
                >
                  {data.level}
                </motion.div>
                <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 14, color: c2, marginTop: 2, maxWidth: 190, marginInline: "auto" }}>
                  {data.title || "Nouveau palier"}
                </div>
              </div>
            </div>
            {/* Particules qui jaillissent */}
            {Array.from({ length: 18 }).map((_, i) => {
              const ang = (i / 18) * Math.PI * 2;
              return (
                <motion.span key={`p${i}`}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ x: Math.cos(ang) * 150, y: Math.sin(ang) * 150, opacity: [0, 1, 0], scale: 1 }}
                  transition={{ delay: 0.1 + (i % 6) * 0.03, duration: 1.1, ease: "easeOut" }}
                  style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", background: i % 2 ? c1 : c2, boxShadow: `0 0 10px ${c2}` }}
                />
              );
            })}
          </motion.div>

          <div style={{ position: "absolute", bottom: 40, fontSize: 12, color: "rgba(255,255,255,.4)", fontFamily: "system-ui" }}>
            Clique pour fermer
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default LevelUpPopup;
