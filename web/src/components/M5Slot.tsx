// ─────────────────────────────────────────────────────────────────────────────
// M5 — Slot Machine premium : 3 reels qui s'arrêtent en cascade sur 💎.
// Avec paytable visible et diamants dans la rotation.
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

// Symboles incluant 💎 dans la rotation pour que le user les voie passer.
const SYMBOLS = ["🍒", "🍋", "🍇", "💎", "🍒", "🔔", "💎", "7️⃣", "🍋", "💎"];
const WIN = "💎";

const PAYTABLE = [
  { sym: "🍒", label: "Cerises × 3",  pct: "10%" },
  { sym: "🍋", label: "Citrons × 3",  pct: "30%" },
  { sym: "🍇", label: "Raisins × 3",  pct: "50%" },
  { sym: "🔔", label: "Cloches × 3",  pct: "70%" },
  { sym: "7️⃣", label: "Lucky 7 × 3",  pct: "90%" },
  { sym: "💎", label: "Diamants × 3", pct: "100%", jackpot: true },
];

function Reel({ stopped, finalSymbol, delay }: { stopped: boolean; finalSymbol: string; delay: number }) {
  return (
    <div className="m5s-reel">
      <div className={`m5s-strip ${stopped ? "stopped" : ""}`} style={{ animationDelay: `${delay}ms` }}>
        {Array.from({ length: 24 }).map((_, i) => (
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
    accentLight: theme?.accentLight || "#FFE552",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [stopped, setStopped] = React.useState<[boolean, boolean, boolean]>([false, false, false]);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const play = () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    setStopped([false, false, false]);
    setTimeout(() => setStopped((s) => [true, s[1], s[2]]), 1400);
    setTimeout(() => setStopped((s) => [s[0], true, s[2]]), 2100);
    setTimeout(() => {
      setStopped([true, true, true]);
      setPhase("won");
      setTimeout(() => setPopupOpen(true), 800);
    }, 2800);
  };

  return (
    <div className="m5s-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m5s-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 100px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m5s-root::before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 50% 0%,${T.accentGlow},transparent 55%);pointer-events:none;opacity:.5}
        .m5s-root::after{content:"";position:absolute;inset:0;background-image:linear-gradient(${T.accent}06 1px,transparent 1px),linear-gradient(90deg,${T.accent}06 1px,transparent 1px);background-size:32px 32px;pointer-events:none;opacity:.4}

        .m5s-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;position:relative;z-index:2}
        .m5s-avatar{width:78px;height:78px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden}
        .m5s-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m5s-pseudo{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:#fff;text-shadow:0 0 16px ${T.accentGlow};margin-top:6px}

        .m5s-offer{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 24px;margin-bottom:18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid ${T.accent}55;border-radius:14px;backdrop-filter:blur(8px);box-shadow:0 0 30px ${T.accentGlow}40}
        .m5s-offer-mini{font-size:.72rem;font-weight:700;letter-spacing:.18em;color:${T.accent};text-transform:uppercase}
        .m5s-offer-main{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;color:#fff;text-align:center;line-height:1.1}
        .m5s-offer-main .accent{color:${T.accent};text-shadow:0 0 14px ${T.accentGlow}}

        .m5s-board{position:relative;z-index:2;display:flex;flex-direction:column;gap:14px;width:min(94vw,440px);margin-bottom:22px}

        .m5s-machine{position:relative;background:linear-gradient(180deg,${T.bgCard},#0a0612);border:4px solid ${T.accent};border-radius:24px;padding:20px 16px 18px;box-shadow:0 0 50px ${T.accentGlow},0 14px 40px rgba(0,0,0,.7),inset 0 0 24px rgba(0,0,0,.3)}
        .m5s-machine-leds{position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-around;padding:0 18px;pointer-events:none}
        .m5s-led{width:8px;height:8px;border-radius:50%;background:radial-gradient(circle,${T.accentLight},${T.accent});box-shadow:0 0 6px ${T.accentLight};animation:m5s-blink 1.4s ease-in-out infinite}
        .m5s-screen{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#000;border:2px solid ${T.border};border-radius:12px;padding:8px;margin-top:8px;margin-bottom:14px;box-shadow:inset 0 0 24px rgba(0,0,0,.8)}
        .m5s-reel{position:relative;height:108px;background:linear-gradient(180deg,#1a0d2a,#0d0617);border-radius:8px;overflow:hidden;border:1px solid ${T.border}}
        .m5s-reel::before,.m5s-reel::after{content:"";position:absolute;left:0;right:0;height:24px;z-index:2;pointer-events:none}
        .m5s-reel::before{top:0;background:linear-gradient(180deg,rgba(0,0,0,.85),transparent)}
        .m5s-reel::after{bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.85),transparent)}
        .m5s-strip{display:flex;flex-direction:column;animation:m5s-spin .12s linear infinite}
        .m5s-strip.stopped{animation-play-state:paused;display:none}
        .m5s-cell{height:108px;display:flex;align-items:center;justify-content:center;font-size:2.6rem}
        .m5s-final{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:3.2rem;background:radial-gradient(circle,${T.bgCard},#1a0d2a);animation:m5s-pop .35s ease-out;text-shadow:0 0 20px ${T.accentGlow}}
        .m5s-bar{display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,.5);border:1px solid ${T.border};border-radius:8px;padding:8px 14px;font-size:.85rem;color:rgba(255,255,255,.75)}
        .m5s-bar strong{color:${T.accent};font-weight:900;text-shadow:0 0 8px ${T.accentGlow}}

        .m5s-paytable{background:${T.bgCard};border:1px solid ${T.border};border-radius:12px;padding:12px 14px;box-shadow:0 8px 20px rgba(0,0,0,.4)}
        .m5s-paytable h3{font-family:'Playfair Display',serif;font-size:.9rem;color:${T.accent};margin:0 0 8px;text-align:center;letter-spacing:.06em;text-transform:uppercase}
        .m5s-pt-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}
        .m5s-pt-row{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:6px;font-size:.78rem;color:rgba(255,255,255,.85);gap:6px}
        .m5s-pt-row.jackpot{background:${T.accent}15;color:${T.accent};font-weight:900;border:1px solid ${T.accent}55;grid-column:1/-1}
        .m5s-pt-syms{font-size:1rem;letter-spacing:-2px;flex-shrink:0}
        .m5s-pt-pct{font-weight:900;flex-shrink:0}
        .m5s-pt-row.jackpot .m5s-pt-pct{text-shadow:0 0 8px ${T.accentGlow}}

        .m5s-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:min(96vw,460px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:1.08rem;border:none;border-radius:14px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15);text-decoration:none;position:relative;z-index:2}
        .m5s-cta:not(:disabled):hover{transform:translateY(-2px)}
        .m5s-cta:disabled{opacity:.65;cursor:not-allowed;animation:none}
        .m5s-cta-pulse{animation:m5s-pulse 2s ease-in-out infinite}

        .m5s-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m5s-fade .3s ease-out}
        .m5s-popup{position:relative;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});border:2px solid ${T.accent};border-radius:22px;padding:30px 22px 22px;text-align:center;max-width:380px;width:100%;box-shadow:0 0 80px ${T.accentGlow};animation:m5s-pop .4s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box}
        .m5s-popup-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .m5s-popup-close:hover{background:rgba(255,255,255,.18)}
        .m5s-popup-icon{font-size:2rem;margin-bottom:4px}
        .m5s-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:900;margin:0 0 8px;color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m5s-popup p{color:rgba(255,255,255,.85);margin:0 0 6px;font-size:.92rem;line-height:1.5}
        .m5s-popup .amounts{display:inline-flex;align-items:center;gap:8px;font-size:.85rem;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;padding:8px 12px;border-radius:10px;margin:12px 0 18px;flex-wrap:wrap;justify-content:center}
        .m5s-popup .amounts strong{color:${T.accent};font-weight:900;font-size:1rem;text-shadow:0 0 10px ${T.accentGlow}}
        .m5s-popup .m5s-cta{width:100%;font-size:.95rem;padding:14px 18px;letter-spacing:.08em}

        @keyframes m5s-spin{0%{transform:translateY(0)}100%{transform:translateY(-108px)}}
        @keyframes m5s-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes m5s-fade{from{opacity:0}to{opacity:1}}
        @keyframes m5s-blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m5s-pulse{0%,100%{box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}50%{box-shadow:0 14px 40px ${T.accentGlow},0 0 0 6px ${T.accent}25,inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}}
      `}</style>

      <div className="m5s-header">
        {profileImageUrl ? <div className="m5s-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m5s-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m5s-offer">
        <div className="m5s-offer-mini">✦ Offre exclusive ✦</div>
        <div className="m5s-offer-main">
          {dep ? <>Dépose <span className="accent">{dep}</span> · </> : null}
          {bon ? <>Reçois <span className="accent">{bon}</span></> : "Bonus 100% garanti"}
        </div>
      </div>

      <div className="m5s-board">
        <div className="m5s-machine">
          <div className="m5s-machine-leds">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="m5s-led" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
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

        <div className="m5s-paytable">
          <h3>Tableau des gains</h3>
          <div className="m5s-pt-grid">
            {PAYTABLE.filter((p) => !p.jackpot).map((p, i) => (
              <div key={i} className="m5s-pt-row">
                <span className="m5s-pt-syms">{p.sym}{p.sym}{p.sym}</span>
                <span className="m5s-pt-pct">{p.pct}</span>
              </div>
            ))}
            {PAYTABLE.filter((p) => p.jackpot).map((p, i) => (
              <div key={`j${i}`} className="m5s-pt-row jackpot">
                <span className="m5s-pt-syms">{p.sym}{p.sym}{p.sym}</span>
                <span style={{ flex: 1, fontSize: ".7rem" }}>JACKPOT</span>
                <span className="m5s-pt-pct">{p.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m5s-cta m5s-cta-pulse" onClick={play}>🎰 Lancer la machine</button>
      ) : phase === "spinning" ? (
        <button className="m5s-cta" disabled>⏳ Roulement…</button>
      ) : (
        <button className="m5s-cta" onClick={() => setPopupOpen(true)}>💎 Voir mon gain</button>
      )}

      {phase === "won" && popupOpen ? (
        <div className="m5s-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m5s-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m5s-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m5s-popup-icon">💎💎💎</div>
            <h2>JACKPOT</h2>
            <p>Trois diamants alignés. Bonus <strong style={{ color: T.accent }}>100%</strong> débloqué.</p>
            {(dep || bon) ? (
              <div className="amounts">
                {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
                {dep && bon ? <span style={{ color: T.accent }}>→</span> : null}
                {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m5s-cta v3-cta">
              🎁 Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
