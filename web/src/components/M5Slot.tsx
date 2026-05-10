// ─────────────────────────────────────────────────────────────────────────────
// M5 — Slot Machine : 3 reels qui s'alignent toujours sur le bonus.
//
// Click "JOUER" → reels spinent en cascade (1.5s, 2s, 2.5s) → tous alignés
// sur 💎. Popup avec CTA d'affi.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type M5SlotProps = {
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
    borderColor?: string;
  };
};

const SYMBOLS = ["🍒", "🍋", "🍇", "💎", "7️⃣", "🔔"];
const WIN = "💎";

function Reel({ stopped, finalSymbol, delay }: { stopped: boolean; finalSymbol: string; delay: number }) {
  // Rendu : on affiche une colonne de symbols qui translate continuellement
  // jusqu'à 'stopped'. Au stop, on freeze sur finalSymbol.
  return (
    <div className="m5s-reel">
      <div className={`m5s-strip ${stopped ? "stopped" : ""}`} style={{ animationDelay: `${delay}ms` }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="m5s-cell">{SYMBOLS[i % SYMBOLS.length]}</div>
        ))}
      </div>
      {stopped ? <div className="m5s-final">{finalSymbol}</div> : null}
    </div>
  );
}

export function M5Slot({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M5SlotProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [stopped, setStopped] = React.useState<[boolean, boolean, boolean]>([false, false, false]);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const play = () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    setStopped([false, false, false]);
    setTimeout(() => setStopped((s) => [true, s[1], s[2]]), 1300);
    setTimeout(() => setStopped((s) => [s[0], true, s[2]]), 1900);
    setTimeout(() => {
      setStopped([true, true, true]);
      setPhase("won");
    }, 2500);
  };

  return (
    <div className="m5s-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m5s-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 80px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m5s-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at top,${T.accentGlow},transparent 70%);pointer-events:none}
        .m5s-avatar{width:84px;height:84px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden;margin-bottom:12px;position:relative;z-index:1}
        .m5s-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m5s-pseudo{font-size:1.4rem;font-weight:900;letter-spacing:.05em;text-shadow:0 0 14px ${T.accentGlow};position:relative;z-index:1}
        .m5s-tag{font-size:.92rem;color:rgba(255,255,255,.7);margin:4px 0 22px;letter-spacing:.04em;position:relative;z-index:1}
        .m5s-machine{position:relative;width:min(90vw,400px);background:linear-gradient(180deg,${T.bgCard},#0a0612);border:4px solid ${T.accent};border-radius:24px;padding:24px 18px;box-shadow:0 0 50px ${T.accentGlow},0 14px 40px rgba(0,0,0,.7),inset 0 0 24px rgba(0,0,0,.3);z-index:1}
        .m5s-machine::before,.m5s-machine::after{content:"";position:absolute;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle,#fff,${T.accent});box-shadow:0 0 12px ${T.accentLight};top:50%;transform:translateY(-50%);animation:m5s-blink 1.4s ease-in-out infinite}
        .m5s-machine::before{left:6px}
        .m5s-machine::after{right:6px;animation-delay:.7s}
        .m5s-screen{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#000;border:3px solid ${T.border};border-radius:14px;padding:10px;margin-bottom:16px;box-shadow:inset 0 0 24px rgba(0,0,0,.8)}
        .m5s-reel{position:relative;height:120px;background:linear-gradient(180deg,#1a0d2a,#0d0617);border-radius:8px;overflow:hidden;border:1px solid ${T.border}}
        .m5s-strip{display:flex;flex-direction:column;animation:m5s-spin .15s linear infinite}
        .m5s-strip.stopped{animation-play-state:paused;display:none}
        .m5s-cell{height:120px;display:flex;align-items:center;justify-content:center;font-size:3rem}
        .m5s-final{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:3.4rem;background:linear-gradient(180deg,${T.bgCard},#1a0d2a);animation:m5s-pop .3s ease-out}
        .m5s-bar{display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,.4);border:1px solid ${T.border};border-radius:8px;padding:10px 14px;font-size:.85rem;color:rgba(255,255,255,.75)}
        .m5s-bar strong{color:${T.accent};font-weight:900;text-shadow:0 0 8px ${T.accentGlow}}
        .m5s-cta{margin-top:22px;display:inline-flex;align-items:center;justify-content:center;width:min(90vw,400px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.1em;font-size:1.1rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 8px 24px ${T.accentGlow};text-decoration:none;position:relative;z-index:1}
        .m5s-cta:disabled{opacity:.6;cursor:not-allowed;animation:none}
        .m5s-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;z-index:9999;animation:m5s-fade .25s ease-out}
        .m5s-popup{background:${T.bgCard};border:2px solid ${T.accent};border-radius:18px;padding:32px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 0 60px ${T.accentGlow};animation:m5s-pop .35s cubic-bezier(.17,.84,.34,1.27)}
        .m5s-popup h2{font-size:2rem;font-weight:900;margin:0 0 8px;color:${T.accent};text-shadow:0 0 16px ${T.accentGlow}}
        .m5s-popup p{color:rgba(255,255,255,.85);margin:0 0 20px;font-size:1rem}
        @keyframes m5s-spin{0%{transform:translateY(0)}100%{transform:translateY(-120px)}}
        @keyframes m5s-pop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes m5s-fade{from{opacity:0}to{opacity:1}}
        @keyframes m5s-blink{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>

      {profileImageUrl ? <div className="m5s-avatar"><img src={profileImageUrl} alt="" /></div> : null}
      {pseudo ? <div className="m5s-pseudo">{pseudo}</div> : null}
      <div className="m5s-tag">Lance la machine, gagne ton bonus</div>

      <div className="m5s-machine">
        <div className="m5s-screen">
          <Reel stopped={stopped[0]} finalSymbol={WIN} delay={0} />
          <Reel stopped={stopped[1]} finalSymbol={WIN} delay={150} />
          <Reel stopped={stopped[2]} finalSymbol={WIN} delay={300} />
        </div>
        <div className="m5s-bar">
          <span>Mise</span>
          <span><strong>{dep || "X€"}</strong> → <strong>{bon || "Y€"}</strong></span>
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m5s-cta" onClick={play}>🎰 Lancer la machine</button>
      ) : phase === "spinning" ? (
        <button className="m5s-cta" disabled>⏳ Roulement…</button>
      ) : (
        <button className="m5s-cta" disabled>✨ JACKPOT !</button>
      )}

      {phase === "won" ? (
        <div className="m5s-overlay">
          <div className="m5s-popup">
            <h2>💎 JACKPOT !</h2>
            <p>3 diamants alignés. Bonus 100% débloqué.</p>
            <p style={{ marginBottom: 24, fontSize: 14, color: "rgba(255,255,255,.7)" }}>
              Dépose {dep || "X€"} → Reçois <strong style={{ color: T.accent }}>{bon || "Y€"}</strong>
            </p>
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m5s-cta v3-cta">
              🎁 Récupérer mon jackpot
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
