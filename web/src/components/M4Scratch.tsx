// ─────────────────────────────────────────────────────────────────────────────
// M4 — Scratch tickets : 4 cartes (3 "presque gagnantes" + 1 BONUS 100%).
//
// L'user gratte chaque ticket. Tickets 1-3 révèlent 20% / 0% / 0% (frustration
// montante) puis le 4ème ticket (BONUS) devient brillant. Une fois gratté,
// "Wow tu as gagné 100%" → popup CTA.
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

type Ticket = {
  id: number;
  reveal: string;        // texte révélé
  bonus: boolean;        // true = ticket gagnant
  msg: string;           // sous-texte
};

const TICKETS: Ticket[] = [
  { id: 0, reveal: "20%", bonus: false, msg: "Pas mal…" },
  { id: 1, reveal: "0%",  bonus: false, msg: "Aïe, raté." },
  { id: 2, reveal: "0%",  bonus: false, msg: "Pas de chance." },
  { id: 3, reveal: "100%", bonus: true,  msg: "🎉 BONUS LÉGENDAIRE" },
];

function ScratchTicket({
  ticket, locked, scratched, onScratched, accent, accentLight,
}: {
  ticket: Ticket;
  locked: boolean;
  scratched: boolean;
  onScratched: () => void;
  accent: string;
  accentLight: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const isDrawing = React.useRef(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c || scratched) return;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    // Foil doré pour les non-bonus, rainbow gold animé pour le bonus
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (ticket.bonus) {
      grad.addColorStop(0, accentLight);
      grad.addColorStop(.4, accent);
      grad.addColorStop(.7, "#fff7c2");
      grad.addColorStop(1, accent);
    } else {
      grad.addColorStop(0, "#a8a39a");
      grad.addColorStop(.5, "#bdb6ab");
      grad.addColorStop(1, "#8a847a");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Texture pailletée
    ctx.fillStyle = "rgba(255,255,255,.22)";
    for (let i = 0; i < 50; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.font = "900 14px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ticket.bonus ? "✦ TICKET BONUS ✦" : "GRATTE ICI", w / 2, h / 2 - 4);
    ctx.font = "700 10px Poppins, sans-serif";
    ctx.fillText("Tente ta chance", w / 2, h / 2 + 14);
  }, [ticket.bonus, accent, accentLight, scratched]);

  const computeProgress = () => {
    const c = canvasRef.current;
    if (!c) return 0;
    const ctx = c.getContext("2d"); if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let cleared = 0;
    const sample = 400;
    for (let i = 0; i < sample; i++) {
      const px = Math.floor(Math.random() * (data.length / 4)) * 4;
      if (data[px + 3] < 32) cleared++;
    }
    return cleared / sample;
  };

  const scratch = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c || scratched || locked) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 16, 0, Math.PI * 2);
    ctx.fill();
  };
  const onPointerDown = (e: React.PointerEvent) => { if (!locked) { isDrawing.current = true; scratch(e.clientX, e.clientY); } };
  const onPointerMove = (e: React.PointerEvent) => { if (isDrawing.current) scratch(e.clientX, e.clientY); };
  const onPointerUp = () => {
    isDrawing.current = false;
    const p = computeProgress();
    setProgress(p);
    if (p > 0.30 && !scratched) {
      const c = canvasRef.current;
      if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      onScratched();
    }
  };

  return (
    <div className={`m4t-card ${ticket.bonus ? "bonus" : ""} ${scratched ? "done" : ""} ${locked ? "locked" : ""}`}>
      <div className="m4t-prize">
        <div className={`m4t-pct ${ticket.bonus ? "bonus" : "loser"}`}>{ticket.reveal}</div>
        <div className="m4t-msg">{ticket.msg}</div>
      </div>
      {!scratched ? (
        <canvas
          ref={canvasRef}
          className="m4t-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ pointerEvents: locked ? "none" : "auto" }}
        />
      ) : null}
      {!scratched && progress > 0 && progress < 0.30 ? (
        <div className="m4t-progress">{Math.round(progress * 100)}%</div>
      ) : null}
      {locked ? <div className="m4t-locked-badge">🔒</div> : null}
    </div>
  );
}

export function M4Scratch({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M4ScratchProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFE552",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [scratched, setScratched] = React.useState<boolean[]>([false, false, false, false]);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const losersDone = scratched[0] && scratched[1] && scratched[2];
  const bonusDone = scratched[3];

  const markScratched = (i: number) => {
    setScratched((s) => {
      const next = [...s];
      next[i] = true;
      return next;
    });
    if (i === 3) setTimeout(() => setPopupOpen(true), 600);
  };

  return (
    <div className="m4s-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m4s-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 100px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m4s-root::before{content:"";position:absolute;inset:-20%;background:radial-gradient(ellipse at 50% 0%,${T.accentGlow},transparent 55%);pointer-events:none;opacity:.5}
        .m4s-root::after{content:"";position:absolute;inset:0;background-image:linear-gradient(45deg,${T.accent}06 25%,transparent 25%,transparent 75%,${T.accent}06 75%),linear-gradient(45deg,${T.accent}06 25%,transparent 25%,transparent 75%,${T.accent}06 75%);background-size:24px 24px;background-position:0 0,12px 12px;pointer-events:none;opacity:.5}

        .m4s-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:16px;position:relative;z-index:2}
        .m4s-avatar{width:78px;height:78px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden}
        .m4s-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4s-pseudo{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:#fff;text-shadow:0 0 16px ${T.accentGlow};margin-top:6px}

        .m4s-offer{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 24px;margin-bottom:18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid ${T.accent}55;border-radius:14px;backdrop-filter:blur(8px);box-shadow:0 0 30px ${T.accentGlow}40}
        .m4s-offer-mini{font-size:.72rem;font-weight:700;letter-spacing:.18em;color:${T.accent};text-transform:uppercase}
        .m4s-offer-main{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;color:#fff;text-align:center;line-height:1.1}
        .m4s-offer-main .accent{color:${T.accent};text-shadow:0 0 14px ${T.accentGlow}}

        .m4s-step{font-size:.85rem;color:rgba(255,255,255,.7);margin-bottom:18px;letter-spacing:.04em;position:relative;z-index:2;text-align:center}
        .m4s-step strong{color:${T.accent}}

        .m4s-grid{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:14px;width:min(94vw,460px);margin-bottom:24px}

        .m4t-card{position:relative;aspect-ratio:1.05/1;background:${T.bgCard};border:2px solid ${T.border};border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.5)}
        .m4t-card.bonus{border-color:${T.accent};box-shadow:0 0 32px ${T.accentGlow},0 12px 32px rgba(0,0,0,.5);animation:m4t-glow 2.4s ease-in-out infinite}
        .m4t-card.locked{opacity:.55;filter:saturate(.5)}
        .m4t-card.done.bonus{animation:m4t-celebrate .9s ease-out}

        .m4t-prize{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;text-align:center}
        .m4t-pct{font-family:'Playfair Display',serif;font-size:2.4rem;font-weight:900;line-height:1}
        .m4t-pct.loser{color:rgba(255,255,255,.55)}
        .m4t-pct.bonus{color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m4t-msg{font-size:.78rem;font-weight:600;color:rgba(255,255,255,.65);margin-top:8px;letter-spacing:.04em}
        .m4t-card.bonus .m4t-msg{color:${T.accent}}

        .m4t-canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
        .m4t-canvas:active{cursor:grabbing}
        .m4t-progress{position:absolute;bottom:8px;right:8px;font-size:11px;font-weight:700;color:#000;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:6px;pointer-events:none}
        .m4t-locked-badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;padding:4px 8px;border-radius:8px;font-size:11px;pointer-events:none}

        .m4s-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:min(94vw,460px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:1.08rem;border:none;border-radius:14px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15);text-decoration:none;position:relative;z-index:2}
        .m4s-cta-pulse{animation:m4t-pulse 2s ease-in-out infinite}

        .m4s-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m4t-fade .3s ease-out}
        .m4s-popup{position:relative;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});border:2px solid ${T.accent};border-radius:22px;padding:36px 28px 28px;text-align:center;max-width:420px;width:100%;box-shadow:0 0 80px ${T.accentGlow};animation:m4t-pop .4s cubic-bezier(.17,.84,.34,1.27)}
        .m4s-popup-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .m4s-popup-close:hover{background:rgba(255,255,255,.18)}
        .m4s-popup-icon{font-size:2.4rem;margin-bottom:6px}
        .m4s-popup h2{font-family:'Playfair Display',serif;font-size:2.1rem;font-weight:900;margin:0 0 10px;color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m4s-popup p{color:rgba(255,255,255,.85);margin:0 0 8px;font-size:.96rem;line-height:1.5}
        .m4s-popup .amounts{display:inline-flex;align-items:center;gap:10px;font-size:.95rem;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;padding:10px 16px;border-radius:10px;margin:14px 0 22px}
        .m4s-popup .amounts strong{color:${T.accent};font-weight:900;font-size:1.1rem;text-shadow:0 0 10px ${T.accentGlow}}

        @keyframes m4t-glow{0%,100%{box-shadow:0 0 32px ${T.accentGlow},0 12px 32px rgba(0,0,0,.5)}50%{box-shadow:0 0 50px ${T.accentGlow},0 0 0 6px ${T.accent}25,0 12px 32px rgba(0,0,0,.5)}}
        @keyframes m4t-pulse{0%,100%{box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}50%{box-shadow:0 14px 40px ${T.accentGlow},0 0 0 6px ${T.accent}25,inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}}
        @keyframes m4t-celebrate{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
        @keyframes m4t-fade{from{opacity:0}to{opacity:1}}
        @keyframes m4t-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>

      <div className="m4s-header">
        {profileImageUrl ? <div className="m4s-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m4s-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m4s-offer">
        <div className="m4s-offer-mini">✦ Offre exclusive ✦</div>
        <div className="m4s-offer-main">
          {dep ? <>Dépose <span className="accent">{dep}</span> · </> : null}
          {bon ? <>Reçois <span className="accent">{bon}</span></> : "Bonus 100% garanti"}
        </div>
      </div>

      <div className="m4s-step">
        {bonusDone ? <strong>🎉 Ticket bonus gratté</strong>
          : losersDone ? <strong>Gratte le dernier ticket pour débloquer ton bonus</strong>
          : <>Gratte les 4 tickets · {scratched.filter(Boolean).length}/4</>}
      </div>

      <div className="m4s-grid">
        {TICKETS.map((t, i) => (
          <ScratchTicket
            key={t.id}
            ticket={t}
            locked={t.bonus && !losersDone}
            scratched={scratched[i]}
            onScratched={() => markScratched(i)}
            accent={T.accent}
            accentLight={T.accentLight}
          />
        ))}
      </div>

      {bonusDone ? (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m4s-cta m4s-cta-pulse v3-cta">
          🎁 Récupérer mon bonus 100%
        </a>
      ) : (
        <button className="m4s-cta" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
          {losersDone ? "👆 Gratte le ticket bonus" : "Continue à gratter…"}
        </button>
      )}

      {bonusDone && popupOpen ? (
        <div className="m4s-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m4s-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m4s-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m4s-popup-icon">🎉</div>
            <h2>WOW, INCROYABLE !</h2>
            <p>Tu as débloqué le ticket BONUS exclusif.</p>
            <p><strong style={{ color: T.accent }}>100% offert</strong> sur ton premier dépôt en créant ton compte.</p>
            {(dep || bon) ? (
              <div className="amounts">
                {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
                {dep && bon ? <span style={{ color: T.accent }}>→</span> : null}
                {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m4s-cta v3-cta">
              🎁 Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
