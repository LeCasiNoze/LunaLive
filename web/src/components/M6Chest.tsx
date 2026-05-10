// ─────────────────────────────────────────────────────────────────────────────
// M6 — Mines : design crypto-casino style (Stake.com vibe).
// Grille 3x3 propre, cellules tile-like avec depth subtil, stats bar en haut.
// (Fichier reste M6Chest pour rétrocompat saves.)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";

export type M6ChestProps = {
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

type CellState = "closed" | "diamond" | "bomb";

// SVG diamond bleu/cyan style Stake
const DiamondIcon = () => (
  <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
    <defs>
      <linearGradient id="m6-diamond" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7dd3fc" />
        <stop offset=".5" stopColor="#0ea5e9" />
        <stop offset="1" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    <path d="M6 9 L12 2 L18 9 L12 22 Z" fill="url(#m6-diamond)" stroke="#0c4a6e" strokeWidth=".8" strokeLinejoin="round" />
    <path d="M6 9 L18 9" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
    <path d="M12 2 L12 9" stroke="rgba(255,255,255,.35)" strokeWidth=".5" />
    <path d="M9 9 L12 22" stroke="rgba(0,0,0,.2)" strokeWidth=".5" />
  </svg>
);

const BombIcon = () => (
  <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
    <circle cx="12" cy="14" r="8" fill="#27272a" stroke="#0a0a0a" strokeWidth=".8" />
    <circle cx="9.5" cy="11.5" r="2" fill="rgba(255,255,255,.18)" />
    <rect x="11" y="3" width="2" height="4" fill="#52525b" rx=".3" />
    <path d="M13 5 L15 3 M11 5 L9 3" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="14" cy="2" r="1.2" fill="#ef4444" />
  </svg>
);

export function M6Chest({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M6ChestProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    chrome:      "#3a3a42",
  };
  const [cells, setCells] = React.useState<CellState[]>(Array(9).fill("closed"));
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [winType, setWinType] = React.useState<"collect" | "all" | null>(null);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const diamondCount = cells.filter((c) => c === "diamond").length;
  const closedCount = cells.filter((c) => c === "closed").length;
  const canCollect = diamondCount >= 3 && !winType;

  const reveal = (idx: number) => {
    if (cells[idx] !== "closed" || winType) return;
    sfx.reveal();
    setCells((prev) => { const next = [...prev]; next[idx] = "diamond"; return next; });
  };

  React.useEffect(() => {
    if (winType) return;
    if (closedCount === 1) {
      const lastIdx = cells.findIndex((c) => c === "closed");
      sfx.tension(800);
      const tmo = setTimeout(() => {
        sfx.boom();
        setCells((prev) => { const next = [...prev]; next[lastIdx] = "bomb"; return next; });
        setTimeout(() => { sfx.win(); setWinType("all"); setPopupOpen(true); }, 600);
      }, 800);
      return () => clearTimeout(tmo);
    }
  }, [closedCount, cells, winType]);

  const collect = () => { if (!canCollect) return; sfx.coin(); sfx.win(); setWinType("collect"); setPopupOpen(true); };
  const reset = () => { setCells(Array(9).fill("closed")); setWinType(null); setPopupOpen(false); };

  // Tier system pour bannière + popup
  let mini: string;
  let main: React.ReactNode;
  if (winType) {
    mini = "Bonus débloqué";
    main = <>Récupère ton <span className="accent">{winType === "all" ? "JACKPOT" : "bonus"}</span></>;
  } else if (diamondCount === 0) {
    mini = "Démineur · 1 bombe cachée";
    main = <>Trouve <span className="accent">3 diamants</span> · gagne ton bonus</>;
  } else if (diamondCount < 3) {
    mini = `Plus que ${3 - diamondCount} diamant${3 - diamondCount > 1 ? "s" : ""}`;
    main = <>Tu approches du <span className="accent">bonus</span></>;
  } else if (diamondCount < 6) {
    mini = "Bonus débloqué · continue";
    main = <>Encore <span className="accent">{6 - diamondCount}</span> pour le SUPER BONUS</>;
  } else if (diamondCount < 8) {
    mini = "SUPER BONUS débloqué";
    main = <>Encore <span className="accent">{8 - diamondCount}</span> pour le JACKPOT</>;
  } else {
    mini = "JACKPOT en vue";
    main = <><span className="accent">Une dernière case</span>… ose-tu ?</>;
  }

  return (
    <div className="m6-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m6-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m6-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,67,.08),transparent 60%);pointer-events:none}

        .m6-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;position:relative;z-index:2}
        .m6-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m6-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m6-pseudo{font-size:1.05rem;font-weight:600;color:#f5f1e6}

        .m6-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:18px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m6-promo .accent{color:${T.accent};font-weight:700}

        /* Tagline en escalier */
        .m6-tagline{position:relative;z-index:2;font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:#f5f1e6;text-align:center;margin-bottom:16px;line-height:1.3}
        .m6-tagline .accent{color:${T.accent}}

        /* Stats bar style game UI */
        .m6-stats{position:relative;z-index:2;display:flex;gap:8px;width:min(94vw,360px);margin-bottom:16px}
        .m6-stat{flex:1;display:flex;flex-direction:column;align-items:center;padding:8px 6px;background:${T.bgCard};border:1px solid #1f1d24;border-radius:4px}
        .m6-stat-lbl{font-size:.62rem;font-weight:600;letter-spacing:.15em;color:rgba(245,241,230,.5);text-transform:uppercase;margin-bottom:2px}
        .m6-stat-val{font-size:1.1rem;font-weight:700;color:#f5f1e6;font-variant-numeric:tabular-nums}
        .m6-stat.diamond .m6-stat-val{color:#0ea5e9}
        .m6-stat.diamond.super .m6-stat-val{color:${T.accent}}
        .m6-stat.bomb .m6-stat-val{color:#ef4444}

        /* Grille */
        .m6-grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:min(94vw,360px);margin-bottom:24px;padding:6px;background:${T.bgCard};border:1px solid #1f1d24;border-radius:6px}
        .m6-cell{aspect-ratio:1/1;perspective:1000px;cursor:pointer}
        .m6-cell-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,1.6,.6,1)}
        .m6-cell.flipped .m6-cell-inner{transform:rotateY(180deg)}
        .m6-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:4px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04)}
        .m6-face-front{background:linear-gradient(180deg,#27272a,#1a1a1d);border:1px solid #0a0a0c}
        .m6-cell.closed:hover .m6-face-front{background:linear-gradient(180deg,#3a3a42,#27272a);border-color:${T.accent}66}
        .m6-cell.closed:active .m6-face-front{transform:scale(.96)}
        .m6-face-back{transform:rotateY(180deg);background:linear-gradient(180deg,#0a070f,#15101a);border:1px solid #0ea5e966}
        .m6-face-back.bomb{background:linear-gradient(180deg,#1a0808,#0a0404);border-color:#ef4444;animation:m6-bomb-shake .4s ease-in-out}

        .m6-cta{display:block;width:min(94vw,360px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease;position:relative;z-index:2}
        .m6-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark}}
        .m6-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}
        .m6-cta.ghost{background:transparent;color:rgba(245,241,230,.5);border:1px solid rgba(245,241,230,.15);box-shadow:none;font-size:.78rem;padding:10px 18px;width:auto;margin-top:10px;letter-spacing:.1em}

        /* Popup */
        .m6-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m6-fade .2s ease-out}
        .m6-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 26px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m6-pop .35s cubic-bezier(.17,.84,.34,1.27)}
        .m6-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer}
        .m6-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m6-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m6-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m6-popup h2 span{color:${T.accent}}
        .m6-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px}
        .m6-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m6-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m6-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}

        @keyframes m6-bomb-shake{0%,100%{transform:rotateY(180deg) translateX(0)}25%{transform:rotateY(180deg) translateX(-3px)}75%{transform:rotateY(180deg) translateX(3px)}}
        @keyframes m6-fade{from{opacity:0}to{opacity:1}}
        @keyframes m6-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m6-header">
        {profileImageUrl ? <div className="m6-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m6-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m6-promo">{mini}</div>

      <div className="m6-tagline">{main}</div>

      <div className="m6-stats">
        <div className={`m6-stat diamond ${diamondCount >= 6 ? "super" : ""}`}>
          <div className="m6-stat-lbl">Diamants</div>
          <div className="m6-stat-val">{diamondCount}/9</div>
        </div>
        <div className="m6-stat">
          <div className="m6-stat-lbl">Cases</div>
          <div className="m6-stat-val">{closedCount}</div>
        </div>
        <div className="m6-stat bomb">
          <div className="m6-stat-lbl">Mines</div>
          <div className="m6-stat-val">1</div>
        </div>
      </div>

      <div className="m6-grid">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`m6-cell ${c === "closed" ? "closed" : "flipped"}`}
            onClick={() => reveal(i)}
          >
            <div className="m6-cell-inner">
              <div className="m6-face m6-face-front" />
              <div className={`m6-face m6-face-back ${c === "bomb" ? "bomb" : ""}`}>
                {c === "diamond" ? <DiamondIcon /> : c === "bomb" ? <BombIcon /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!winType ? (
        canCollect ? (
          <button className="m6-cta" onClick={collect}>
            {diamondCount >= 6 ? "Collecter SUPER BONUS" : "Collecter maintenant"}
          </button>
        ) : (
          <button className="m6-cta" disabled>
            {diamondCount === 0 ? "Trouve 3 diamants" : `Encore ${3 - diamondCount} diamant${3 - diamondCount > 1 ? "s" : ""}`}
          </button>
        )
      ) : (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m6-cta v3-cta">
          Récupérer mon bonus
        </a>
      )}

      {winType ? <button className="m6-cta ghost" onClick={reset}>Rejouer</button> : null}

      {popupOpen && winType ? (
        <div className="m6-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m6-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m6-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m6-popup-eyebrow">
              {winType === "all" ? "Jackpot Mega" : diamondCount >= 6 ? "Super Bonus" : "Bonus débloqué"}
            </div>
            <h2>
              {winType === "all"
                ? <>Tu décroches le <span>JACKPOT</span></>
                : <>Tu remportes ton <span>bonus 100%</span></>}
            </h2>
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
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m6-cta v3-cta">
              Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
