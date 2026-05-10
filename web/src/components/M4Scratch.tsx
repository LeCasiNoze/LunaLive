// ─────────────────────────────────────────────────────────────────────────────
// M4 — Mystery Boxes : 3 coffres, l'user en choisit un, il contient TOUJOURS
// le bonus 100%. Les 2 autres se révèlent ensuite avec des prix moindres
// (frustration sociale "j'ai eu de la chance").
//
// (Le fichier garde le nom M4Scratch pour ne pas casser les imports/saves.)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

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
};

type BoxSpec = {
  label: string;        // texte sur le coffre fermé
  prize: string;        // contenu révélé
  win: boolean;         // true = box gagnante (toujours celle choisie)
  emoji: string;        // emoji de récompense
};

// Les 3 coffres sont visuellement identiques tant qu'ils sont fermés. La box
// choisie par l'user devient automatiquement la "win" — on prepare 2 prix
// moindres pour les 2 autres.
const FILLER_PRIZES: Array<{ prize: string; emoji: string }> = [
  { prize: "0%",  emoji: "💨" },
  { prize: "20%", emoji: "🥈" },
  { prize: "0%",  emoji: "💨" },
  { prize: "10%", emoji: "🥉" },
];

export function M4Scratch({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M4ScratchProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFE552",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };

  // L'index choisi par l'user (-1 si pas encore choisi)
  const [picked, setPicked] = React.useState<number>(-1);
  const [revealedOthers, setRevealedOthers] = React.useState<boolean>(false);
  const [popupOpen, setPopupOpen] = React.useState(false);

  // Au mount, on tire 2 prix loosers aléatoires pour les 2 boxes non choisies.
  const [losers] = React.useState<BoxSpec[]>(() => {
    const shuffled = [...FILLER_PRIZES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2).map((p) => ({
      label: "Coffre",
      prize: p.prize,
      win: false,
      emoji: p.emoji,
    }));
  });

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  // Construit l'array final de boxes selon le pick
  const boxes: BoxSpec[] = React.useMemo(() => {
    const winBox: BoxSpec = { label: "Coffre", prize: "100%", win: true, emoji: "💎" };
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
    setPicked(i);
    // Animation : on attend que le coffre choisi s'ouvre, puis on ouvre les 2 autres
    setTimeout(() => setRevealedOthers(true), 1200);
    setTimeout(() => setPopupOpen(true), 2400);
  };

  const reset = () => {
    setPicked(-1);
    setRevealedOthers(false);
    setPopupOpen(false);
  };

  return (
    <div className="m4mb-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m4mb-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 100px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m4mb-root::before{content:"";position:absolute;inset:-20%;background:radial-gradient(ellipse at 50% 30%,${T.accentGlow},transparent 55%);pointer-events:none;opacity:.55}
        .m4mb-root::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 20% 20%,${T.accent}10 1.5px,transparent 1.5px),radial-gradient(circle at 80% 70%,${T.accent}10 1.5px,transparent 1.5px);background-size:50px 50px,70px 70px;pointer-events:none;opacity:.4}

        .m4mb-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;position:relative;z-index:2}
        .m4mb-avatar{width:78px;height:78px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden}
        .m4mb-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4mb-pseudo{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:#fff;text-shadow:0 0 16px ${T.accentGlow};margin-top:6px}

        .m4mb-offer{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 24px;margin-bottom:14px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid ${T.accent}55;border-radius:14px;backdrop-filter:blur(8px);box-shadow:0 0 30px ${T.accentGlow}40}
        .m4mb-offer-mini{font-size:.72rem;font-weight:700;letter-spacing:.18em;color:${T.accent};text-transform:uppercase}
        .m4mb-offer-main{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;color:#fff;text-align:center;line-height:1.1}
        .m4mb-offer-main .accent{color:${T.accent};text-shadow:0 0 14px ${T.accentGlow}}

        .m4mb-step{font-size:.85rem;color:rgba(255,255,255,.7);margin-bottom:18px;letter-spacing:.04em;position:relative;z-index:2;text-align:center}
        .m4mb-step strong{color:${T.accent}}

        .m4mb-grid{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:min(94vw,420px);margin-bottom:24px}

        .m4mb-box{position:relative;aspect-ratio:.85/1;perspective:1200px;cursor:pointer;transition:transform .2s ease}
        .m4mb-box.idle:hover{transform:translateY(-6px) scale(1.02)}
        .m4mb-box.disabled{cursor:default}
        .m4mb-box.dim{opacity:.6;filter:saturate(.7)}
        .m4mb-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.4,1.6,.6,1)}
        .m4mb-box.opened .m4mb-inner{transform:rotateY(180deg)}
        .m4mb-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;text-align:center;box-shadow:0 8px 16px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08)}

        /* Face fermée : coffre stylé */
        .m4mb-face-front{background:linear-gradient(180deg,#5a3a1a,#3a2410);border:2px solid #8a6020;color:#fff}
        .m4mb-box.idle .m4mb-face-front{box-shadow:0 8px 24px ${T.accentGlow}40,inset 0 1px 0 rgba(255,255,255,.1)}
        .m4mb-chest{position:relative;width:62%;aspect-ratio:1.2/1;background:linear-gradient(180deg,#7a4f25,#4a2e14);border:2px solid #2a1808;border-radius:8px 8px 12px 12px;box-shadow:inset 0 -6px 8px rgba(0,0,0,.4)}
        .m4mb-chest::before{content:"";position:absolute;left:0;right:0;top:30%;height:8px;background:linear-gradient(180deg,${T.accentLight},${T.accent});border-top:1px solid rgba(255,255,255,.2);border-bottom:1px solid rgba(0,0,0,.3)}
        .m4mb-chest::after{content:"🔒";position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);font-size:1rem;background:radial-gradient(circle,#aaa,#666);width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center}
        .m4mb-front-label{font-family:'Playfair Display',serif;font-size:.92rem;font-weight:700;letter-spacing:.05em;margin-top:8px;color:${T.accent}}
        .m4mb-front-num{position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:.7rem;font-weight:900;color:rgba(255,255,255,.5);letter-spacing:.1em}

        /* Face ouverte : prix révélé */
        .m4mb-face-back{transform:rotateY(180deg);background:linear-gradient(180deg,#1a0d2a,${T.bgCard});border:2px solid ${T.border};color:#fff}
        .m4mb-face-back.win{background:linear-gradient(180deg,${T.accent},${T.accentLight});border-color:#fff;box-shadow:0 0 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.6);color:#000}
        .m4mb-face-back.win .m4mb-back-prize{text-shadow:0 0 20px rgba(255,255,255,.4)}
        .m4mb-back-emoji{font-size:1.8rem;line-height:1;margin-bottom:4px}
        .m4mb-back-prize{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;line-height:1}
        .m4mb-back-label{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-top:4px;opacity:.85}

        /* Glow ring on hover */
        .m4mb-box.idle::after{content:"";position:absolute;inset:-4px;border-radius:18px;border:2px solid transparent;transition:border-color .2s ease;pointer-events:none}
        .m4mb-box.idle:hover::after{border-color:${T.accent}}

        .m4mb-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:min(94vw,420px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:1.08rem;border:none;border-radius:14px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15);text-decoration:none;position:relative;z-index:2}
        .m4mb-cta:disabled{opacity:.5;cursor:not-allowed;animation:none}
        .m4mb-cta-pulse{animation:m4mb-pulse 2s ease-in-out infinite}
        .m4mb-cta.ghost{background:transparent;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.2);box-shadow:none;font-size:.85rem;padding:10px 18px;width:auto;letter-spacing:.06em;margin-top:10px}

        .m4mb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m4mb-fade .3s ease-out}
        .m4mb-popup{position:relative;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});border:2px solid ${T.accent};border-radius:22px;padding:30px 22px 22px;text-align:center;max-width:380px;width:100%;box-shadow:0 0 80px ${T.accentGlow};animation:m4mb-pop .4s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box}
        .m4mb-popup-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .m4mb-popup-close:hover{background:rgba(255,255,255,.18)}
        .m4mb-popup-icon{font-size:2.2rem;margin-bottom:4px}
        .m4mb-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:900;margin:0 0 8px;color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m4mb-popup p{color:rgba(255,255,255,.85);margin:0 0 6px;font-size:.92rem;line-height:1.5}
        .m4mb-popup .amounts{display:inline-flex;align-items:center;gap:8px;font-size:.85rem;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;padding:8px 12px;border-radius:10px;margin:12px 0 18px;flex-wrap:wrap;justify-content:center}
        .m4mb-popup .amounts strong{color:${T.accent};font-weight:900;font-size:1rem;text-shadow:0 0 10px ${T.accentGlow}}
        .m4mb-popup .m4mb-cta{width:100%;font-size:.95rem;padding:14px 18px;letter-spacing:.08em}

        @keyframes m4mb-pulse{0%,100%{box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}50%{box-shadow:0 14px 40px ${T.accentGlow},0 0 0 6px ${T.accent}25,inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}}
        @keyframes m4mb-fade{from{opacity:0}to{opacity:1}}
        @keyframes m4mb-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>

      <div className="m4mb-header">
        {profileImageUrl ? <div className="m4mb-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m4mb-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m4mb-offer">
        <div className="m4mb-offer-mini">✦ Mystery Boxes ✦</div>
        <div className="m4mb-offer-main">
          {dep ? <>Dépose <span className="accent">{dep}</span> · </> : null}
          {bon ? <>Reçois <span className="accent">{bon}</span></> : "Bonus 100% garanti"}
        </div>
      </div>

      <div className="m4mb-step">
        {picked === -1
          ? <>Choisis <strong>1 coffre parmi les 3</strong></>
          : !revealedOthers
            ? <strong>✨ Tu as trouvé le bon coffre !</strong>
            : <strong>🎁 Tu débloques 100% de bonus</strong>}
      </div>

      <div className="m4mb-grid">
        {boxes.map((b, i) => {
          const isOpened = picked === i || (revealedOthers && picked !== -1);
          const isPicked = picked === i;
          const isDimmed = picked !== -1 && !isPicked && !revealedOthers;
          return (
            <div
              key={i}
              className={`m4mb-box ${picked === -1 ? "idle" : "disabled"} ${isOpened ? "opened" : ""} ${isDimmed ? "dim" : ""}`}
              onClick={() => pick(i)}
            >
              <div className="m4mb-inner">
                <div className="m4mb-face m4mb-face-front">
                  <span className="m4mb-front-num">N°{i + 1}</span>
                  <div className="m4mb-chest" />
                  <div className="m4mb-front-label">{b.label}</div>
                </div>
                <div className={`m4mb-face m4mb-face-back ${b.win ? "win" : ""}`}>
                  <div className="m4mb-back-emoji">{b.emoji}</div>
                  <div className="m4mb-back-prize">{b.prize}</div>
                  <div className="m4mb-back-label">{b.win ? "MEGA BONUS" : "Pas cette fois"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {picked === -1 ? (
        <button className="m4mb-cta" disabled>👆 Choisis un coffre</button>
      ) : !revealedOthers ? (
        <button className="m4mb-cta" disabled>🔓 Ouverture…</button>
      ) : (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m4mb-cta m4mb-cta-pulse v3-cta">
          🎁 Récupérer mon bonus 100%
        </a>
      )}

      {revealedOthers ? (
        <button className="m4mb-cta ghost" onClick={reset}>↻ Rejouer</button>
      ) : null}

      {popupOpen && revealedOthers ? (
        <div className="m4mb-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m4mb-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m4mb-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m4mb-popup-icon">💎</div>
            <h2>BIEN CHOISI !</h2>
            <p>Tu as ouvert le bon coffre.</p>
            <p><strong style={{ color: T.accent }}>100% offert</strong> sur ton premier dépôt.</p>
            {(dep || bon) ? (
              <div className="amounts">
                {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
                {dep && bon ? <span style={{ color: T.accent }}>→</span> : null}
                {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m4mb-cta v3-cta">
              🎁 Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
