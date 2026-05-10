// ─────────────────────────────────────────────────────────────────────────────
// M5 — Slot Machine : cabinet chrome avec depth, less LEDs, plus mature.
// Reels naturels avec décélération physique, paytable propre, marquee chrome.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

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
  pseudoStyle?: V3LineStyleLike;
};

const SYMBOLS = ["🍒", "🍋", "🍇", "💎", "🔔", "7️⃣", "🍇", "💎", "🍋", "🔔", "🍒", "💎"];
const WIN = "💎";
const CELL_H = 96;
const STRIP_LEN = 36;
const TARGET_IDX = 35;

const PAYTABLE = [
  { sym: "🍒", pct: "10%" },
  { sym: "🍋", pct: "30%" },
  { sym: "🍇", pct: "50%" },
  { sym: "🔔", pct: "70%" },
  { sym: "7️⃣", pct: "90%" },
  { sym: "💎", pct: "100%", jackpot: true },
];

function Reel({ spinning, duration, tension, won, spinKey }: {
  spinning: boolean;
  duration: number;
  tension?: boolean;
  won?: boolean;
  spinKey: number;
}) {
  const strip = React.useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < STRIP_LEN; i++) {
      if (i === TARGET_IDX) arr.push(WIN);
      else arr.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const translateY = spinning ? -(TARGET_IDX * CELL_H) : 0;

  return (
    <div className={`m5-reel ${tension ? "tension" : ""} ${won ? "won" : ""}`}>
      <div
        className="m5-strip"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: spinning ? `transform ${duration}s cubic-bezier(.17,.67,.16,.99)` : "none",
        }}
      >
        {strip.map((sym, i) => <div key={i} className="m5-cell">{sym}</div>)}
      </div>
    </div>
  );
}

export function M5Slot({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M5SlotProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    chrome:      "#3a3a42",
  };

  const [phase, setPhase] = React.useState<"idle" | "spinning" | "tension" | "won">("idle");
  const [spinKey, setSpinKey] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const REEL_DURATIONS = [1.4, 2.4, 4.0] as const;

  const play = () => {
    if (phase !== "idle") return;
    sfx.click();
    setSpinKey((k) => k + 1);
    setPhase("spinning");
    setTimeout(() => sfx.reelStop(), REEL_DURATIONS[0] * 1000);
    setTimeout(() => {
      sfx.reelStop();
      setPhase("tension");
      sfx.tension(REEL_DURATIONS[2] * 1000 - REEL_DURATIONS[1] * 1000);
    }, REEL_DURATIONS[1] * 1000);
    setTimeout(() => {
      sfx.reelStop();
      setPhase("won");
      sfx.win();
      setTimeout(() => setPopupOpen(true), 800);
    }, REEL_DURATIONS[2] * 1000);
  };

  return (
    <div className="m5-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m5-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m5-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,67,.08),transparent 60%);pointer-events:none}

        .m5-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;position:relative;z-index:2}
        .m5-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m5-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m5-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m5-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:22px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m5-promo strong{color:${T.accent}}

        /* Cabinet */
        .m5-cabinet{position:relative;z-index:2;width:min(94vw,420px);background:linear-gradient(180deg,#1f1d24,#0d0a12);border:2px solid ${T.chrome};border-radius:10px;padding:18px 14px 16px;box-shadow:0 12px 32px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);margin-bottom:14px}

        /* Marquee chrome top */
        .m5-marquee{display:flex;align-items:center;justify-content:center;padding:8px 12px;margin-bottom:14px;background:linear-gradient(180deg,#52525b,#27272a);border-radius:4px;border:1px solid #18181b;box-shadow:inset 0 1px 0 rgba(255,255,255,.15);font-family:'Playfair Display',serif;font-size:.95rem;font-weight:700;letter-spacing:.12em;color:#f5f1e6;text-transform:uppercase;text-shadow:0 1px 0 rgba(0,0,0,.6)}

        /* Screen avec frame */
        .m5-screen-frame{padding:6px;background:linear-gradient(180deg,#27272a,#18181b);border-radius:6px;border:1px solid #0a0a0c;box-shadow:inset 0 2px 4px rgba(0,0,0,.6)}
        .m5-screen{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#000;border-radius:3px;padding:4px}

        .m5-reel{position:relative;height:${CELL_H}px;background:linear-gradient(180deg,#0a070e,#15101a);border-radius:2px;overflow:hidden;transition:box-shadow .25s ease}
        .m5-reel::before,.m5-reel::after{content:"";position:absolute;left:0;right:0;height:18px;z-index:2;pointer-events:none}
        .m5-reel::before{top:0;background:linear-gradient(180deg,rgba(0,0,0,.9),transparent)}
        .m5-reel::after{bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.9),transparent)}
        .m5-reel.tension{box-shadow:inset 0 0 24px ${T.accent}55;animation:m5-tension-pulse .4s ease-in-out infinite alternate}
        .m5-reel.won{box-shadow:inset 0 0 16px ${T.accent}88;animation:m5-win-pulse 1.5s ease-in-out infinite}
        .m5-strip{display:flex;flex-direction:column;will-change:transform}
        .m5-cell{height:${CELL_H}px;display:flex;align-items:center;justify-content:center;font-size:2.4rem;flex-shrink:0}

        /* Bet bar */
        .m5-bar{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:8px 12px;background:rgba(0,0,0,.5);border:1px solid #0a0a0c;border-radius:3px;font-size:.78rem;color:rgba(245,241,230,.7);letter-spacing:.06em}
        .m5-bar strong{color:${T.accent};font-weight:700}

        /* Paytable */
        .m5-paytable{position:relative;z-index:2;background:${T.bgCard};border:1px solid #1f1d24;border-radius:6px;padding:12px 14px;width:min(94vw,420px);margin-bottom:22px}
        .m5-paytable-title{font-size:.7rem;font-weight:600;letter-spacing:.18em;color:rgba(245,241,230,.6);text-transform:uppercase;text-align:center;margin-bottom:10px}
        .m5-pt-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px}
        .m5-pt-row{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;font-size:.85rem;color:rgba(245,241,230,.85);gap:8px}
        .m5-pt-row.jackpot{background:${T.accent}15;color:${T.accent};font-weight:700;border:1px solid ${T.accent}55;border-radius:3px;grid-column:1/-1}
        .m5-pt-sym{font-size:1rem}
        .m5-pt-pct{font-weight:700;font-variant-numeric:tabular-nums}

        .m5-cta{display:block;width:min(94vw,420px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease;position:relative;z-index:2}
        .m5-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark}}
        .m5-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}

        /* Popup */
        .m5-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m5-fade .2s ease-out}
        .m5-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 26px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m5-pop .35s cubic-bezier(.17,.84,.34,1.27)}
        .m5-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer}
        .m5-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m5-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m5-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m5-popup h2 span{color:${T.accent}}
        .m5-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px}
        .m5-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m5-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m5-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}
        .m5-popup .m5-cta{width:100%;font-size:.88rem;padding:14px 16px;letter-spacing:.12em}

        @keyframes m5-tension-pulse{from{box-shadow:inset 0 0 24px ${T.accent}55}to{box-shadow:inset 0 0 32px ${T.accent}88}}
        @keyframes m5-win-pulse{0%,100%{box-shadow:inset 0 0 16px ${T.accent}88}50%{box-shadow:inset 0 0 24px ${T.accent}}}
        @keyframes m5-fade{from{opacity:0}to{opacity:1}}
        @keyframes m5-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m5-header">
        {profileImageUrl ? <div className="m5-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m5-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m5-promo">Machine à sous · <strong>1 spin gratuit</strong></div>

      <div className="m5-cabinet">
        <div className="m5-marquee">Lucky Slots</div>
        <div className="m5-screen-frame">
          <div className="m5-screen">
            <Reel spinning={phase !== "idle"} duration={REEL_DURATIONS[0]} won={phase === "won"} spinKey={spinKey} />
            <Reel spinning={phase !== "idle"} duration={REEL_DURATIONS[1]} won={phase === "won"} spinKey={spinKey + 100} />
            <Reel spinning={phase !== "idle"} duration={REEL_DURATIONS[2]} tension={phase === "tension"} won={phase === "won"} spinKey={spinKey + 200} />
          </div>
        </div>
        <div className="m5-bar">
          <span>Mise · <strong>{dep || "—"}</strong></span>
          <span>Gain · <strong>{bon || "—"}</strong></span>
        </div>
      </div>

      <div className="m5-paytable">
        <div className="m5-paytable-title">Tableau des gains</div>
        <div className="m5-pt-grid">
          {PAYTABLE.filter((p) => !p.jackpot).map((p, i) => (
            <div key={i} className="m5-pt-row">
              <span className="m5-pt-sym">{p.sym}{p.sym}{p.sym}</span>
              <span className="m5-pt-pct">{p.pct}</span>
            </div>
          ))}
          {PAYTABLE.filter((p) => p.jackpot).map((p, i) => (
            <div key={`j${i}`} className="m5-pt-row jackpot">
              <span className="m5-pt-sym">{p.sym}{p.sym}{p.sym}</span>
              <span style={{ flex: 1, fontSize: ".72rem", letterSpacing: ".1em" }}>JACKPOT</span>
              <span className="m5-pt-pct">{p.pct}</span>
            </div>
          ))}
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m5-cta" onClick={play}>Lancer la machine</button>
      ) : phase === "spinning" ? (
        <button className="m5-cta" disabled>Roulement…</button>
      ) : phase === "tension" ? (
        <button className="m5-cta" disabled>Suspense…</button>
      ) : (
        <button className="m5-cta" onClick={() => setPopupOpen(true)}>Voir mon gain</button>
      )}

      {phase === "won" && popupOpen ? (
        <div className="m5-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m5-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m5-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m5-popup-eyebrow">Jackpot</div>
            <h2>3 diamants · <span>bonus 100%</span></h2>
            {(dep || bon) ? (
              <div className="reward-box">
                <div className="lbl">Ton offre</div>
                <div className="val">
                  {dep ? <>Dépose <strong>{dep}</strong></> : null}
                  {dep && bon ? " · " : null}
                  {bon ? <>Reçois <strong>{bon}</strong></> : null}
                </div>
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m5-cta v3-cta">
              Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
