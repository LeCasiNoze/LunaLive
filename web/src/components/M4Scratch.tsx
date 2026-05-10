// ─────────────────────────────────────────────────────────────────────────────
// M4 — Scratch Card : ticket à gratter qui révèle "100% bonus".
//
// L'user gratte (mouse/touch drag) la zone dorée. À 30% révélé, auto-reveal
// du reste + popup CTA "Bonus débloqué".
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

export function M4Scratch({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M4ScratchProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const isDrawing = React.useRef(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    // Couche à gratter : gradient or
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, T.accent);
    grad.addColorStop(.5, T.accentLight);
    grad.addColorStop(1, T.accent);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Texture pailletée
    ctx.fillStyle = "rgba(255,255,255,.18)";
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.font = "900 22px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✦ GRATTE ICI ✦", w / 2, h / 2 - 6);
    ctx.font = "700 13px Poppins, sans-serif";
    ctx.fillText("Tu peux gagner un bonus", w / 2, h / 2 + 18);
  }, [T.accent, T.accentLight]);

  const computeProgress = () => {
    const c = canvasRef.current;
    if (!c) return 0;
    const ctx = c.getContext("2d"); if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let cleared = 0;
    const sample = 800;
    for (let i = 0; i < sample; i++) {
      const px = Math.floor(Math.random() * (data.length / 4)) * 4;
      if (data[px + 3] < 32) cleared++;
    }
    return cleared / sample;
  };

  const scratch = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c || revealed) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const rect = c.getBoundingClientRect();
    const x = (clientX - rect.left);
    const y = (clientY - rect.top);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerDown = (e: React.PointerEvent) => { isDrawing.current = true; scratch(e.clientX, e.clientY); };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    scratch(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    isDrawing.current = false;
    const p = computeProgress();
    setProgress(p);
    if (p > 0.30 && !revealed) {
      // Auto-reveal complet
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      }
      setRevealed(true);
    }
  };

  return (
    <div className="m4s-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m4s-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 80px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m4s-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at top,${T.accentGlow},transparent 70%);pointer-events:none}
        .m4s-avatar{width:88px;height:88px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden;margin-bottom:14px;position:relative;z-index:1}
        .m4s-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4s-pseudo{font-size:1.4rem;font-weight:900;letter-spacing:.05em;margin-bottom:4px;text-shadow:0 0 14px ${T.accentGlow};position:relative;z-index:1}
        .m4s-tag{font-size:.92rem;color:rgba(255,255,255,.7);margin-bottom:24px;letter-spacing:.04em;position:relative;z-index:1}
        .m4s-card{position:relative;width:min(86vw,360px);aspect-ratio:1.5/1;background:${T.bgCard};border:3px solid ${T.accent};border-radius:18px;overflow:hidden;box-shadow:0 0 40px ${T.accentGlow},0 12px 40px rgba(0,0,0,.6);margin-bottom:24px;z-index:1}
        .m4s-prize{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}
        .m4s-prize .pct{font-size:3.2rem;font-weight:900;color:${T.accent};text-shadow:0 0 16px ${T.accentGlow};line-height:1}
        .m4s-prize .lbl{font-size:1.1rem;font-weight:700;letter-spacing:.05em;color:#fff;margin-top:6px}
        .m4s-prize .sub{font-size:.85rem;color:rgba(255,255,255,.7);margin-top:8px}
        .m4s-canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
        .m4s-canvas:active{cursor:grabbing}
        .m4s-progress{position:relative;z-index:1;width:min(86vw,360px);height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;margin-bottom:18px}
        .m4s-progress-bar{height:100%;background:linear-gradient(90deg,${T.accent},${T.accentLight});width:${Math.min(100, Math.round(progress * 333))}%;transition:width .2s ease}
        .m4s-cta{display:inline-flex;align-items:center;justify-content:center;width:min(86vw,360px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.1em;font-size:1.1rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 8px 24px ${T.accentGlow};text-decoration:none;position:relative;z-index:1;animation:m4s-pulse 2.4s ease-in-out infinite}
        .m4s-cta:hover{transform:translateY(-2px)}
        @keyframes m4s-pulse{0%,100%{box-shadow:0 8px 24px ${T.accentGlow}}50%{box-shadow:0 8px 36px ${T.accentGlow},0 0 0 8px rgba(255,214,0,.05)}}
      `}</style>

      {profileImageUrl ? <div className="m4s-avatar"><img src={profileImageUrl} alt="" /></div> : null}
      {pseudo ? <div className="m4s-pseudo">{pseudo}</div> : null}
      <div className="m4s-tag">Gratte ton ticket bonus exclusif</div>

      <div className="m4s-card">
        <div className="m4s-prize">
          <div className="pct">100%</div>
          <div className="lbl">BONUS DÉBLOQUÉ</div>
          <div className="sub">{dep || "X€"} → <strong style={{ color: T.accent }}>{bon || "Y€"}</strong></div>
        </div>
        {!revealed ? (
          <canvas
            ref={canvasRef}
            className="m4s-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        ) : null}
      </div>

      {!revealed ? (
        <div className="m4s-progress"><div className="m4s-progress-bar" /></div>
      ) : null}

      {revealed ? (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m4s-cta v3-cta">
          🎁 Récupérer mon bonus
        </a>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginTop: 4, position: "relative", zIndex: 1 }}>
          {progress > 0 ? `${Math.round(progress * 100)}% gratté` : "Glisse ton doigt sur la carte"}
        </div>
      )}
    </div>
  );
}
