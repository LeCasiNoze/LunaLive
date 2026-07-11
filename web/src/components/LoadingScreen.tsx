// ══════════════════════════════════════════════════════════════════════
//  LoadingScreen — écran de chargement GLOBAL de LunaLive
//
//  👉 CODEX : C'EST L'ÉLÉMENT À PEAUFINER. C'est le fallback de toutes les
//  routes lazy (App.tsx <Suspense fallback={<LoadingScreen />}>) — il
//  remplace l'ancien texte « Chargement... » de dev. La base ci-dessous est
//  volontairement simple et propre (anneau conic + logo pulsant, theme-aware
//  sombre). À enrichir : marque LunaLive animée, micro-copy, transitions
//  d'entrée/sortie, variantes (plein écran vs inline), skeleton par page.
//  Point d'entrée unique : ce fichier + son usage dans App.tsx.
// ══════════════════════════════════════════════════════════════════════

const STYLE_ID = "ll-loading-screen";
const CSS = `
@keyframes llLoadSpin { to { transform: rotate(360deg); } }
@keyframes llLoadPulse {
  0%, 100% { transform: scale(1); opacity: 0.92; }
  50% { transform: scale(1.06); opacity: 1; }
}
@keyframes llLoadDots {
  0%, 20% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; }
}
.ll-load {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; width: 100%; min-height: 60vh;
  color: rgba(215, 208, 245, 0.9);
}
.ll-load--full { min-height: 100dvh; }
.ll-load-ring {
  position: relative; width: 68px; height: 68px; border-radius: 999px;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(124,77,255,0.15) 90deg, #7c4dff 240deg, #38bdf8 320deg, transparent 360deg);
  -webkit-mask: radial-gradient(circle 26px at 50% 50%, transparent 98%, #000 100%);
  mask: radial-gradient(circle 26px at 50% 50%, transparent 98%, #000 100%);
  animation: llLoadSpin 1s linear infinite;
}
.ll-load-core {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 26px; animation: llLoadPulse 2s ease-in-out infinite;
}
.ll-load-label {
  font-family: system-ui, sans-serif; font-weight: 800; font-size: 13px;
  letter-spacing: 0.5px; opacity: 0.8;
}
.ll-load-label b { color: #a78bfa; }
.ll-load-dots span { animation: llLoadDots 1.2s ease-in-out infinite; }
.ll-load-dots span:nth-child(2) { animation-delay: 0.2s; }
.ll-load-dots span:nth-child(3) { animation-delay: 0.4s; }
@media (prefers-reduced-motion: reduce) {
  .ll-load-ring, .ll-load-core, .ll-load-dots span { animation: none; }
}
`;

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function LoadingScreen({ full = false, label = "Chargement" }: { full?: boolean; label?: string }) {
  ensureCss();
  return (
    <div className={`ll-load${full ? " ll-load--full" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <div className="ll-load-ring">
        <div className="ll-load-core" aria-hidden>🌙</div>
      </div>
      <div className="ll-load-label">
        {label} <span className="ll-load-dots"><span>.</span><span>.</span><span>.</span></span>
      </div>
    </div>
  );
}

export default LoadingScreen;
