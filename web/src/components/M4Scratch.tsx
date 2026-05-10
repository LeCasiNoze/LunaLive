// ─────────────────────────────────────────────────────────────────────────────
// M4 — Mystery Boxes : design loot-box réaliste.
// 3 coffres en bois/métal avec depth, ombres réalistes, animation d'ouverture
// crédible (lid se soulève + glow interne). Pas de "✦ Mystery ✦" framing AI.
// (Fichier reste M4Scratch pour rétrocompat saves.)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M4ScratchProps = {
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

type BoxSpec = { prize: string; win: boolean; sub: string };

const FILLER: Array<{ prize: string; sub: string }> = [
  { prize: "0%",  sub: "Cassé" },
  { prize: "20%", sub: "Bonus mineur" },
  { prize: "0%",  sub: "Vide" },
  { prize: "10%", sub: "Petit lot" },
];

// SVG coffre fermé — bois + bande métal + cadenas
const ClosedChest = ({ accent, accentDark }: { accent: string; accentDark: string }) => (
  <svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg" style={{ width: "78%", height: "auto", display: "block" }}>
    <defs>
      <linearGradient id={`wood-${accent.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a4f2a" />
        <stop offset=".5" stopColor="#5d3a1f" />
        <stop offset="1" stopColor="#3a2410" />
      </linearGradient>
      <linearGradient id={`metal-${accent.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={accent} />
        <stop offset="1" stopColor={accentDark} />
      </linearGradient>
    </defs>
    {/* Corps */}
    <rect x="8" y="38" width="84" height="50" rx="3" fill={`url(#wood-${accent.replace("#","")})`} stroke="#1f1408" strokeWidth="1.5" />
    {/* Couvercle (semi-elliptique pour effet bombé) */}
    <path d="M8 38 Q8 12 50 12 Q92 12 92 38 Z" fill={`url(#wood-${accent.replace("#","")})`} stroke="#1f1408" strokeWidth="1.5" />
    {/* Bandes métalliques */}
    <rect x="6" y="36" width="88" height="5" fill={`url(#metal-${accent.replace("#","")})`} stroke="#1f1408" strokeWidth=".5" />
    <rect x="6" y="62" width="88" height="4" fill={`url(#metal-${accent.replace("#","")})`} stroke="#1f1408" strokeWidth=".5" />
    {/* Cadenas central */}
    <rect x="44" y="42" width="12" height="14" rx="1.5" fill={accentDark} stroke="#1f1408" strokeWidth=".8" />
    <path d="M47 42 L47 38 Q47 34 50 34 Q53 34 53 38 L53 42" fill="none" stroke={accentDark} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="50" cy="48" r="1" fill="#1f1408" />
    {/* Highlights bois (rainures) */}
    <line x1="20" y1="38" x2="20" y2="86" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    <line x1="38" y1="38" x2="38" y2="86" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    <line x1="62" y1="38" x2="62" y2="86" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    <line x1="80" y1="38" x2="80" y2="86" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
  </svg>
);

export function M4Scratch({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M4ScratchProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    chrome:      "#3a3a42",
  };

  const [picked, setPicked] = React.useState<number>(-1);
  const [revealedOthers, setRevealedOthers] = React.useState(false);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const [losers] = React.useState<BoxSpec[]>(() => {
    const shuffled = [...FILLER].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2).map((p) => ({ prize: p.prize, sub: p.sub, win: false }));
  });

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const boxes: BoxSpec[] = React.useMemo(() => {
    const winBox: BoxSpec = { prize: "100%", sub: "JACKPOT", win: true };
    const arr: BoxSpec[] = [];
    let loserIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (i === picked) arr.push(winBox);
      else arr.push(losers[loserIdx++] || losers[0]);
    }
    return arr;
  }, [picked, losers]);

  const pick = (i: number) => {
    if (picked !== -1) return;
    sfx.click();
    setPicked(i);
    setTimeout(() => sfx.reveal(), 600);
    setTimeout(() => {
      setRevealedOthers(true);
      sfx.loss();
      setTimeout(() => sfx.loss(), 200);
    }, 1200);
    setTimeout(() => { sfx.win(); setPopupOpen(true); }, 2400);
  };

  const reset = () => { setPicked(-1); setRevealedOthers(false); setPopupOpen(false); };

  return (
    <div className="m4-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m4-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m4-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,67,.08),transparent 60%);pointer-events:none}

        .m4-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;position:relative;z-index:2}
        .m4-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m4-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m4-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:14px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m4-promo strong{color:${T.accent}}

        .m4-step{position:relative;z-index:2;font-size:.88rem;color:rgba(245,241,230,.7);margin-bottom:20px;text-align:center;font-weight:500}
        .m4-step strong{color:${T.accent};font-weight:700}

        .m4-grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:min(94vw,400px);margin-bottom:28px}

        .m4-box{position:relative;aspect-ratio:.9/1;cursor:pointer;perspective:1200px}
        .m4-box.disabled{cursor:default}
        .m4-box.dim{opacity:.55;filter:grayscale(.35)}
        .m4-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.4,1.6,.6,1)}
        .m4-box.opened .m4-inner{transform:rotateY(180deg)}
        .m4-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px}

        /* Face fermée */
        .m4-face-front{background:linear-gradient(180deg,#2a1d12,#1a1108);border:1px solid #1f1408;box-shadow:0 6px 16px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)}
        .m4-box.idle:hover .m4-face-front{border-color:${T.accent};transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06)}
        .m4-box.idle .m4-face-front{transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
        .m4-front-num{position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:.65rem;font-weight:700;letter-spacing:.12em;color:rgba(245,241,230,.35)}

        /* Face ouverte */
        .m4-face-back{transform:rotateY(180deg);background:linear-gradient(180deg,#15101a,#0a070f);border:1px solid #2a1d12;color:#f5f1e6;box-shadow:0 6px 16px rgba(0,0,0,.55)}
        .m4-face-back.win{background:radial-gradient(circle at 50% 50%,${T.accent}55,transparent 70%),linear-gradient(180deg,#1a1408,#0a070f);border-color:${T.accent};box-shadow:0 0 32px ${T.accent}66,inset 0 0 24px ${T.accent}22}
        .m4-back-prize{font-family:'Playfair Display',serif;font-size:1.7rem;font-weight:700;line-height:1;color:rgba(245,241,230,.55)}
        .m4-face-back.win .m4-back-prize{color:${T.accent}}
        .m4-back-sub{font-size:.62rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-top:6px;color:rgba(245,241,230,.45)}
        .m4-face-back.win .m4-back-sub{color:${T.accentLight}}

        .m4-cta{display:block;width:min(94vw,400px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease;position:relative;z-index:2}
        .m4-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark}}
        .m4-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}
        .m4-cta.ghost{background:transparent;color:rgba(245,241,230,.5);border:1px solid rgba(245,241,230,.15);box-shadow:none;font-size:.78rem;padding:10px 18px;width:auto;margin-top:10px;letter-spacing:.1em}

        .m4-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m4-fade .2s ease-out}
        .m4-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 26px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m4-pop .35s cubic-bezier(.17,.84,.34,1.27)}
        .m4-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer}
        .m4-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m4-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m4-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m4-popup h2 span{color:${T.accent}}
        .m4-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px}
        .m4-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m4-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m4-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}
        .m4-popup .m4-cta{width:100%;font-size:.88rem;padding:14px 16px;letter-spacing:.12em}

        @keyframes m4-fade{from{opacity:0}to{opacity:1}}
        @keyframes m4-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m4-header">
        {profileImageUrl ? <div className="m4-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m4-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m4-promo">Choisis ton coffre · <strong>1 essai</strong></div>

      <div className="m4-step">
        {picked === -1
          ? <>Sélectionne <strong>1 coffre parmi les 3</strong></>
          : !revealedOthers
            ? <strong>Ouverture du coffre…</strong>
            : <strong>Tu as fait le bon choix</strong>}
      </div>

      <div className="m4-grid">
        {boxes.map((b, i) => {
          const isOpened = picked === i || (revealedOthers && picked !== -1);
          const isDimmed = picked !== -1 && picked !== i && !revealedOthers;
          return (
            <div
              key={i}
              className={`m4-box ${picked === -1 ? "idle" : "disabled"} ${isOpened ? "opened" : ""} ${isDimmed ? "dim" : ""}`}
              onClick={() => pick(i)}
            >
              <div className="m4-inner">
                <div className="m4-face m4-face-front">
                  <span className="m4-front-num">N°{i + 1}</span>
                  <ClosedChest accent={T.accent} accentDark={T.accentDark} />
                </div>
                <div className={`m4-face m4-face-back ${b.win ? "win" : ""}`}>
                  <div className="m4-back-prize">{b.prize}</div>
                  <div className="m4-back-sub">{b.sub}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {picked === -1 ? (
        <button className="m4-cta" disabled>Sélectionne un coffre</button>
      ) : !revealedOthers ? (
        <button className="m4-cta" disabled>Ouverture…</button>
      ) : (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m4-cta v3-cta">
          Récupérer mon bonus
        </a>
      )}

      {revealedOthers ? <button className="m4-cta ghost" onClick={reset}>Rejouer</button> : null}

      {popupOpen && revealedOthers ? (
        <div className="m4-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m4-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m4-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m4-popup-eyebrow">Coffre ouvert</div>
            <h2>Tu remportes le <span>bonus 100%</span></h2>
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
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m4-cta v3-cta">
              Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
