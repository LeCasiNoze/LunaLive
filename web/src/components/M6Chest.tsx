// ─────────────────────────────────────────────────────────────────────────────
// M6 — Mines : grille 3x3 avec diamants/bombe.
//
// Logique : chaque clic révèle un diamant (rigged). À partir de 3 diamants
// révélés, le bouton "Collecter" apparaît (early exit). Si l'user continue,
// quand il ne reste qu'1 case, elle se retourne automatiquement → BOMBE →
// popup "Tu as survécu, jackpot 100%".
// (Le nom de fichier reste M6Chest pour rétrocompat avec les imports existants.)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

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

export function M6Chest({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M6ChestProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFE552",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [cells, setCells] = React.useState<CellState[]>(Array(9).fill("closed"));
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [winType, setWinType] = React.useState<"collect" | "all"|null>(null);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const diamondCount = cells.filter((c) => c === "diamond").length;
  const closedCount = cells.filter((c) => c === "closed").length;
  const canCollect = diamondCount >= 3 && !winType;

  const reveal = (idx: number) => {
    if (cells[idx] !== "closed" || winType) return;
    setCells((prev) => {
      const next = [...prev];
      // Rigged : tant qu'il reste plus d'une case fermée → diamant.
      // Quand il ne reste qu'une fermée, click pas requis (auto), mais
      // si ça arrive on la fait diamant aussi.
      next[idx] = "diamond";
      return next;
    });
  };

  // Auto-flip de la dernière case fermée → BOMBE → popup "all"
  React.useEffect(() => {
    if (winType) return;
    if (closedCount === 1) {
      const lastIdx = cells.findIndex((c) => c === "closed");
      const tmo = setTimeout(() => {
        setCells((prev) => {
          const next = [...prev];
          next[lastIdx] = "bomb";
          return next;
        });
        setTimeout(() => {
          setWinType("all");
          setPopupOpen(true);
        }, 600);
      }, 500);
      return () => clearTimeout(tmo);
    }
  }, [closedCount, cells, winType]);

  const collect = () => {
    if (!canCollect) return;
    setWinType("collect");
    setPopupOpen(true);
  };

  const reset = () => {
    setCells(Array(9).fill("closed"));
    setWinType(null);
    setPopupOpen(false);
  };

  return (
    <div className="m6c-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m6c-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 100px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m6c-root::before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 50% 30%,${T.accentGlow},transparent 50%);pointer-events:none;opacity:.55}
        .m6c-root::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 25% 25%,${T.accent}10 1.5px,transparent 1.5px),radial-gradient(circle at 75% 75%,${T.accent}10 1.5px,transparent 1.5px);background-size:50px 50px,70px 70px;pointer-events:none;opacity:.4}

        .m6c-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;position:relative;z-index:2}
        .m6c-avatar{width:78px;height:78px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden}
        .m6c-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m6c-pseudo{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:#fff;text-shadow:0 0 16px ${T.accentGlow};margin-top:6px}

        .m6c-offer{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 24px;margin-bottom:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid ${T.accent}55;border-radius:14px;backdrop-filter:blur(8px);box-shadow:0 0 30px ${T.accentGlow}40}
        .m6c-offer-mini{font-size:.72rem;font-weight:700;letter-spacing:.18em;color:${T.accent};text-transform:uppercase}
        .m6c-offer-main{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;color:#fff;text-align:center;line-height:1.1}
        .m6c-offer-main .accent{color:${T.accent};text-shadow:0 0 14px ${T.accentGlow}}

        .m6c-status{display:flex;align-items:center;gap:14px;font-size:.85rem;color:rgba(255,255,255,.7);margin-bottom:14px;position:relative;z-index:2;letter-spacing:.04em}
        .m6c-status .pill{background:rgba(0,0,0,.4);border:1px solid ${T.border};padding:6px 12px;border-radius:999px;color:#fff;font-weight:700}
        .m6c-status .pill.win{background:${T.accent}15;border-color:${T.accent};color:${T.accent};text-shadow:0 0 8px ${T.accentGlow}}

        .m6c-grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:min(80vw,340px);margin-bottom:22px}
        .m6c-cell{aspect-ratio:1/1;perspective:1000px;cursor:pointer}
        .m6c-cell-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,1.6,.6,1)}
        .m6c-cell.flipped .m6c-cell-inner{transform:rotateY(180deg)}
        .m6c-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;box-shadow:0 8px 16px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08)}
        .m6c-face-front{background:linear-gradient(135deg,${T.bgCard},#1a0d2a);border:2px solid ${T.border};color:rgba(255,255,255,.3)}
        .m6c-face-front::before{content:"?";font-family:'Playfair Display',serif;font-size:2.4rem;font-weight:900;color:${T.accent}55}
        .m6c-cell.closed:hover .m6c-face-front{border-color:${T.accent};box-shadow:0 8px 24px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.1)}
        .m6c-face-back{transform:rotateY(180deg);background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;border:2px solid #fff;box-shadow:0 8px 24px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.6)}
        .m6c-face-back.bomb{background:linear-gradient(135deg,#3d0a0a,#7a1414);color:#fff;border-color:#ff6b6b;box-shadow:0 8px 24px rgba(255,107,107,.4),inset 0 1px 0 rgba(255,255,255,.1);animation:m6c-bomb-shake .4s ease-in-out}

        .m6c-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:min(80vw,340px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:1.08rem;border:none;border-radius:14px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15);text-decoration:none;position:relative;z-index:2;transition:transform .15s ease}
        .m6c-cta:not(:disabled):hover{transform:translateY(-2px)}
        .m6c-cta:disabled{opacity:.5;cursor:not-allowed}
        .m6c-cta-pulse{animation:m6c-pulse 1.6s ease-in-out infinite}
        .m6c-cta.ghost{background:transparent;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.2);box-shadow:none;font-size:.85rem;padding:10px 18px;width:auto;letter-spacing:.06em;margin-top:10px}
        .m6c-cta.ghost:hover{color:#fff;border-color:#fff}

        .m6c-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m6c-fade .3s ease-out}
        .m6c-popup{position:relative;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});border:2px solid ${T.accent};border-radius:22px;padding:36px 28px 28px;text-align:center;max-width:420px;width:100%;box-shadow:0 0 80px ${T.accentGlow};animation:m6c-pop .4s cubic-bezier(.17,.84,.34,1.27)}
        .m6c-popup-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .m6c-popup-close:hover{background:rgba(255,255,255,.18)}
        .m6c-popup-icon{font-size:2.4rem;margin-bottom:6px}
        .m6c-popup h2{font-family:'Playfair Display',serif;font-size:2.1rem;font-weight:900;margin:0 0 10px;color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m6c-popup p{color:rgba(255,255,255,.85);margin:0 0 8px;font-size:.96rem;line-height:1.5}
        .m6c-popup .amounts{display:inline-flex;align-items:center;gap:10px;font-size:.95rem;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;padding:10px 16px;border-radius:10px;margin:14px 0 22px}
        .m6c-popup .amounts strong{color:${T.accent};font-weight:900;font-size:1.1rem;text-shadow:0 0 10px ${T.accentGlow}}

        @keyframes m6c-pulse{0%,100%{box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}50%{box-shadow:0 14px 40px ${T.accentGlow},0 0 0 6px ${T.accent}25,inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}}
        @keyframes m6c-fade{from{opacity:0}to{opacity:1}}
        @keyframes m6c-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes m6c-bomb-shake{0%,100%{transform:rotateY(180deg) translateX(0)}25%{transform:rotateY(180deg) translateX(-4px)}75%{transform:rotateY(180deg) translateX(4px)}}
      `}</style>

      <div className="m6c-header">
        {profileImageUrl ? <div className="m6c-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m6c-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m6c-offer">
        <div className="m6c-offer-mini">✦ Mines · 1 bombe cachée ✦</div>
        <div className="m6c-offer-main">
          {dep ? <>Dépose <span className="accent">{dep}</span> · </> : null}
          {bon ? <>Reçois <span className="accent">{bon}</span></> : "Bonus 100% garanti"}
        </div>
      </div>

      <div className="m6c-status">
        <span className={`pill ${diamondCount >= 3 ? "win" : ""}`}>💎 {diamondCount}/9 diamants</span>
        <span>·</span>
        <span style={{ color: closedCount === 1 ? "#ff6b6b" : "rgba(255,255,255,.6)" }}>
          {closedCount === 1 ? "💣 1 bombe restante…" : `${closedCount} cases fermées`}
        </span>
      </div>

      <div className="m6c-grid">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`m6c-cell ${c === "closed" ? "closed" : "flipped"}`}
            onClick={() => reveal(i)}
          >
            <div className="m6c-cell-inner">
              <div className="m6c-face m6c-face-front" />
              <div className={`m6c-face m6c-face-back ${c === "bomb" ? "bomb" : ""}`}>
                {c === "diamond" ? "💎" : c === "bomb" ? "💣" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!winType ? (
        canCollect ? (
          <button className="m6c-cta m6c-cta-pulse" onClick={collect}>💰 Collecter maintenant</button>
        ) : (
          <button className="m6c-cta" disabled>
            {diamondCount === 0 ? "👆 Trouve 3 diamants" : `Encore ${3 - diamondCount} diamant${3 - diamondCount > 1 ? "s" : ""}`}
          </button>
        )
      ) : (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m6c-cta v3-cta m6c-cta-pulse">
          🎁 Récupérer mon bonus 100%
        </a>
      )}

      {winType ? (
        <button className="m6c-cta ghost" onClick={reset}>↻ Rejouer</button>
      ) : null}

      {popupOpen && winType ? (
        <div className="m6c-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m6c-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m6c-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m6c-popup-icon">{winType === "all" ? "🛡️" : "💎"}</div>
            <h2>{winType === "all" ? "TU AS SURVÉCU !" : "BIEN JOUÉ !"}</h2>
            {winType === "all" ? (
              <>
                <p>Tu as révélé tous les diamants en évitant la bombe.</p>
                <p><strong style={{ color: T.accent }}>JACKPOT 100%</strong> sur ton premier dépôt.</p>
              </>
            ) : (
              <>
                <p>Tu as collecté <strong>{diamondCount} diamants</strong> sans toucher la bombe.</p>
                <p>Bonus <strong style={{ color: T.accent }}>100%</strong> verrouillé pour toi.</p>
              </>
            )}
            {(dep || bon) ? (
              <div className="amounts">
                {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
                {dep && bon ? <span style={{ color: T.accent }}>→</span> : null}
                {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m6c-cta v3-cta">
              🎁 Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
