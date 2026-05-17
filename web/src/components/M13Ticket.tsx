// ─────────────────────────────────────────────────────────────────────────────
// M13 — "Ticket Scratch" : grand ticket de loterie style rétro à gratter.
// Hero ticket avec perforations, numero de tirage, encart "BONUS GAGNE", zone
// scratch interactive (revele Y€), section barcode + footer perfo. CTA =
// "ENCAISSER MAINTENANT".
//
// Respecte regles V3 : theme/pseudoStyle/X/Y/V3OfferPopup/V3SocialProof.
// Pas d'images embarquees : illustration full-CSS (perfos = radial-gradients).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { pseudoTextStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M13TicketProps = {
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
  };
  pseudoStyle?: V3LineStyleLike;
};

export function M13Ticket({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M13TicketProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#1a0f08",
    bgCard:      theme?.bgCard      || "#2a1810",
  };
  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus");

  const [popupOpen, setPopupOpen] = React.useState(false);
  const [scratchPct, setScratchPct] = React.useState(0);
  const revealed = scratchPct >= 60;

  // Scratch interaction : track pointer movement % of canvas
  const scratchRef = React.useRef<HTMLDivElement>(null);
  const cellsRef = React.useRef<Set<number>>(new Set());
  const GRID = 20; // 20x20 cellules

  const onPointer = (e: React.PointerEvent) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const el = scratchRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * GRID);
    const y = Math.floor(((e.clientY - r.top) / r.height) * GRID);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    // marque la cellule + voisines (effet brosse)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = x + dx, cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < GRID && cy < GRID) {
          cellsRef.current.add(cy * GRID + cx);
        }
      }
    }
    const pct = Math.round((cellsRef.current.size / (GRID * GRID)) * 100);
    setScratchPct(pct);
  };

  const revealAll = () => {
    cellsRef.current = new Set(Array.from({ length: GRID * GRID }, (_, i) => i));
    setScratchPct(100);
  };

  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const tilt = useMotionValue(0);
  const tiltY = useTransform(tilt, [-50, 50], [4, -4]);
  const tiltX = useTransform(tilt, [-50, 50], [-2, 2]);

  // Tirage du jour : date + numero pseudo-random stable
  const drawNumber = React.useMemo(() => {
    const today = new Date();
    return `#${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9000)+1000)}`;
  }, []);

  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m13-root">
      <style>{`
        .m13-root{position:relative;min-height:100vh;padding:32px 16px 160px;background:
          radial-gradient(140% 60% at 50% -10%,${T.accent}1a,transparent 65%),
          radial-gradient(80% 50% at 50% 100%,${T.accent}14,transparent 70%),
          ${T.bgPage};
          font-family:"Courier New","Courier",monospace;color:#1a0f08}

        .m13-stage{max-width:420px;margin:0 auto;perspective:1200px}

        /* Ticket : papier creme legerement texture */
        .m13-ticket{position:relative;background:linear-gradient(180deg,#fdf6e3 0%,#f5ebd0 100%);
          padding:28px 22px;border-radius:6px;color:#2a1810;
          box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.08);
          transform-style:preserve-3d;will-change:transform}
        .m13-ticket::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:6px;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='1'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.18'/></svg>");
          mix-blend-mode:multiply;opacity:.4}

        /* Perforations top/bottom (radial-gradient pattern) */
        .m13-perfo{position:relative;height:18px;margin:14px -22px;background:
          radial-gradient(circle 7px at 12px 50%,${T.bgPage} 98%,transparent 100%) 0 0/24px 18px repeat-x}
        .m13-perfo::before{content:"";position:absolute;left:22px;right:22px;top:50%;border-top:1.5px dashed rgba(42,24,16,.4)}

        .m13-masthead{text-align:center;margin-bottom:14px}
        .m13-brand{font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:1.6rem;letter-spacing:.18em;margin:0;color:#1a0f08}
        .m13-tagline{font-size:.62rem;letter-spacing:.34em;text-transform:uppercase;margin:4px 0 0;opacity:.5}

        .m13-row{display:flex;justify-content:space-between;align-items:center;margin:6px 0;font-size:.68rem;text-transform:uppercase;letter-spacing:.12em}
        .m13-row strong{font-weight:700;color:#1a0f08}
        .m13-row span{opacity:.65}

        .m13-pseudo-wrap{display:flex;align-items:center;gap:12px;padding:10px;margin:10px 0 14px;border:1px solid rgba(42,24,16,.25);border-radius:4px;background:rgba(0,0,0,.03)}
        .m13-pseudo-avatar{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${T.accent};background:#fff}
        .m13-pseudo-avatar img{width:100%;height:100%;object-fit:cover}
        .m13-pseudo-avatar-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:1.2rem;opacity:.4;color:#1a0f08}
        .m13-pseudo-meta{flex:1;min-width:0}
        .m13-pseudo-label{font-size:.58rem;letter-spacing:.2em;opacity:.55;text-transform:uppercase;margin:0}
        .m13-pseudo-name{margin:2px 0 0;line-height:1}

        .m13-prize-box{padding:16px 18px;margin:14px 0;border:2px dashed rgba(42,24,16,.5);border-radius:6px;text-align:center;background:rgba(255,255,255,.5)}
        .m13-prize-label{font-size:.66rem;letter-spacing:.28em;text-transform:uppercase;margin:0;opacity:.65}
        .m13-prize-amount{margin:6px 0 0;font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:3.2rem;line-height:.95;letter-spacing:.02em;
          background:linear-gradient(180deg,${T.accent} 0%,${T.accentLight} 60%,#8a6724 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 0 rgba(0,0,0,.18))}
        .m13-prize-sub{margin:4px 0 0;font-size:.7rem;letter-spacing:.15em;opacity:.6;text-transform:uppercase}

        /* Scratch area */
        .m13-scratch-wrap{position:relative;margin:14px 0;border-radius:8px;overflow:hidden;border:1px solid rgba(42,24,16,.2);background:#fff}
        .m13-scratch-reveal{padding:28px 18px;text-align:center;background:linear-gradient(135deg,#fff5cc,#fffaf0)}
        .m13-scratch-pre{font-size:.62rem;letter-spacing:.28em;opacity:.6;text-transform:uppercase;margin:0}
        .m13-scratch-amount{margin:6px 0 4px;font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:2.8rem;line-height:1;color:${T.accent};
          text-shadow:0 2px 0 rgba(0,0,0,.12)}
        .m13-scratch-hint{font-size:.68rem;opacity:.65;margin:0}
        .m13-scratch-overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none;
          background:repeating-linear-gradient(45deg,#8a8580 0 6px,#a8a39c 6px 12px);
          transition:opacity .4s ease}
        .m13-scratch-overlay.gone{opacity:0;pointer-events:none}
        .m13-scratch-overlay::after{content:"GRATTE ICI";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          color:rgba(255,255,255,.85);font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:1.4rem;letter-spacing:.25em;
          text-shadow:0 2px 0 rgba(0,0,0,.3)}
        .m13-scratch-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(${GRID},1fr);grid-template-rows:repeat(${GRID},1fr)}
        .m13-scratch-cell{background:transparent;transition:opacity .15s ease}
        .m13-scratch-cell.gone{opacity:0;background:transparent}
        .m13-scratch-pct{position:absolute;top:8px;right:10px;font-size:.7rem;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6);z-index:2}

        .m13-cta{display:flex;align-items:center;justify-content:center;width:100%;padding:18px;margin-top:14px;border-radius:6px;
          font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:1.4rem;letter-spacing:.14em;color:#1a0f08;text-decoration:none;cursor:pointer;
          background:linear-gradient(180deg,${T.accentLight} 0%,${T.accent} 100%);
          border:2px solid #1a0f08;box-shadow:4px 4px 0 #1a0f08;transition:transform .12s,box-shadow .12s}
        .m13-cta:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #1a0f08}
        .m13-cta:disabled,.m13-cta.dim{opacity:.45;cursor:not-allowed;filter:grayscale(.5)}

        .m13-barcode{display:flex;gap:2px;justify-content:center;align-items:flex-end;height:48px;margin:18px 0 6px}
        .m13-barcode span{display:inline-block;width:2px;background:#1a0f08;border-radius:1px}
        .m13-barcode-num{text-align:center;font-size:.72rem;letter-spacing:.4em;opacity:.6}

        .m13-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:14px 16px 18px;
          background:linear-gradient(to top,${T.bgPage} 50%,${T.bgPage}dd 85%,transparent)}
        .m13-sticky-cta{display:flex;align-items:center;justify-content:center;width:100%;max-width:400px;margin:0 auto;padding:18px;border-radius:8px;
          font-family:"Bebas Neue","Anton","Impact",sans-serif;font-size:1.3rem;letter-spacing:.12em;color:#1a0f08;text-decoration:none;
          background:linear-gradient(180deg,${T.accentLight},${T.accent});
          border:2px solid ${T.accent};box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}66}

        .m13-footer{padding:20px 18px 14px;text-align:center;opacity:.55;font-size:.68rem;line-height:1.6;max-width:420px;margin:0 auto;color:#fff;font-family:'Inter',sans-serif}
        .m13-footer strong{color:#fff;font-weight:700}
      `}</style>

      <div className="m13-stage">
        <motion.div
          className="m13-ticket"
          style={{ rotateX: tiltX, rotateY: tiltY }}
          onPointerMove={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            tilt.set(((e.clientX - r.left) / r.width - 0.5) * 100);
          }}
          onPointerLeave={() => tilt.set(0)}
        >
          {/* Masthead */}
          <div className="m13-masthead">
            <h1 className="m13-brand">LUNA CASINO</h1>
            <div className="m13-tagline">Ticket Bonus · Édition Limitée</div>
          </div>

          <div className="m13-perfo" />

          <div className="m13-row"><span>Tirage</span><strong>{drawNumber}</strong></div>
          <div className="m13-row"><span>Validité</span><strong>24H</strong></div>
          {dep ? <div className="m13-row"><span>Dépôt requis</span><strong>{dep}</strong></div> : null}

          {/* Pseudo */}
          <div className="m13-pseudo-wrap">
            <div className="m13-pseudo-avatar">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={pseudo || ""} />
              ) : (
                <div className="m13-pseudo-avatar-empty">👤</div>
              )}
            </div>
            <div className="m13-pseudo-meta">
              <p className="m13-pseudo-label">Bénéficiaire</p>
              <h2 className="m13-pseudo-name" style={{ ...nameStyle, color: "#1a0f08", textShadow: "none", fontSize: "1.1rem" }}>{pseudo || "Joueur invité"}</h2>
            </div>
          </div>

          {/* Prize box */}
          <div className="m13-prize-box">
            <p className="m13-prize-label">Bonus à gagner</p>
            <div className="m13-prize-amount">{bon || "BONUS"}</div>
            <p className="m13-prize-sub">+ Free Spins inclus</p>
          </div>

          {/* Scratch area */}
          <div className="m13-scratch-wrap" ref={scratchRef} onPointerDown={onPointer} onPointerMove={onPointer}>
            <div className="m13-scratch-reveal">
              <p className="m13-scratch-pre">Ton code bonus</p>
              <div className="m13-scratch-amount">{bon || "BONUS-100"}</div>
              <p className="m13-scratch-hint">Présente ce ticket pour activer</p>
            </div>
            {!revealed ? (
              <div className="m13-scratch-overlay">
                <div className="m13-scratch-grid">
                  {Array.from({ length: GRID * GRID }).map((_, i) => (
                    <div key={i} className={`m13-scratch-cell ${cellsRef.current.has(i) ? "gone" : ""}`}
                      style={{ background: cellsRef.current.has(i) ? "transparent" : "linear-gradient(45deg,#8a8580 25%,#a8a39c 25%,#a8a39c 50%,#8a8580 50%,#8a8580 75%,#a8a39c 75%)", backgroundSize: "8px 8px" }}
                    />
                  ))}
                </div>
                <div className="m13-scratch-pct">{scratchPct}%</div>
              </div>
            ) : null}
          </div>

          {!revealed ? (
            <button type="button" className="m13-cta dim" onClick={revealAll}>
              GRATTE OU CLIQUE POUR RÉVÉLER
            </button>
          ) : (
            <a className="m13-cta v3-cta" href={safeAffi} onClick={onCta}>
              ENCAISSER {bon || "LE BONUS"}
            </a>
          )}

          <div className="m13-perfo" />

          {/* Barcode */}
          <div className="m13-barcode">
            {Array.from({ length: 48 }).map((_, i) => (
              <span key={i} style={{ height: `${20 + Math.floor((Math.sin(i * 1.3) + 1) * 14)}px`, width: i % 5 === 0 ? "3px" : "2px" }} />
            ))}
          </div>
          <div className="m13-barcode-num">{drawNumber.replace("#", "")}</div>
        </motion.div>

        <footer className="m13-footer">
          <p>
            Jeu réservé aux 18+. Jouer comporte des risques.
            Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
          </p>
        </footer>
      </div>

      <div className="m13-sticky">
        <a className="m13-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          ENCAISSER {bon || "LE BONUS"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Validation du ticket", "Génération du code", "Activation prête"]}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
