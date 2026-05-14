// ─────────────────────────────────────────────────────────────────────────────
// M7 — Plinko : bille qui tombe à travers des pegs, atterrit toujours sur le
// slot JACKPOT (centre). Animation par étapes avec son "tic" à chaque peg.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";

export type M7PlinkoProps = {
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

// Layout : 9 rangées de pegs, 9 slots en bas
const ROWS = 9;
const SLOT_COUNT = 9;
const TARGET_SLOT = 4;  // slot du milieu = JACKPOT (toujours rigged)

// Multiplicateurs des slots (du gauche au droite). Center = 100x.
const SLOT_MULTIPLIERS = ["5x", "10x", "20x", "50x", "100x", "50x", "20x", "10x", "5x"];

// Pré-calcule un chemin "zigzag-ish" qui atterrit pile sur TARGET_SLOT.
// Ball commence en haut au-dessus du centre. À chaque rangée elle bouge de
// ±0.5 colonne. Sur ROWS rangées, déplacement total signé doit donner
// TARGET_SLOT - START_COL = 0 (puisque target = centre = start).
function computePath(): number[] {
  // L'idée : alternance gauche/droite avec petite asymétrie pour visuel
  // varié, mais somme = 0 pour finir au centre.
  const moves = [-1, +1, +1, -1, -1, +1, -1, +1, 0];  // 4 left, 4 right, 1 stay (= 0 sum)
  const positions: number[] = [TARGET_SLOT];  // start position = center
  let x = TARGET_SLOT;
  for (const m of moves) {
    x = Math.max(0, Math.min(SLOT_COUNT - 1, x + m * 0.5));
    positions.push(x);
  }
  return positions;
}

export function M7Plinko({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M7PlinkoProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    accentGlow:  theme?.accentGlow  || "rgba(212,168,67,.5)",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    chrome:      "#3a3a42",
  };

  const [phase, setPhase] = React.useState<"idle" | "falling" | "won">("idle");
  const [pathIdx, setPathIdx] = React.useState(0);  // index dans le path (= rangée actuelle)
  const [popupOpen, setPopupOpen] = React.useState(false);
  const path = React.useMemo(computePath, [phase === "falling"]);  // recalc à chaque drop

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const rewardScore = bon ? `+${bon}` : "100x";
  const popupSteps = React.useMemo(() => [
    "Verification de la chute",
    "Validation du palier central",
    "Lien bonus pret",
  ], []);

  const drop = () => {
    if (phase !== "idle") return;
    sfx.click();
    setPhase("falling");
    setPathIdx(0);

    // Anime la bille à travers les rangées. 280ms par rangée → ~2.5s total.
    let step = 0;
    const STEP_MS = 280;
    const tick = () => {
      step++;
      sfx.tick();
      setPathIdx(step);
      if (step < path.length - 1) {
        setTimeout(tick, STEP_MS);
      } else {
        // Atterrissage final
        setTimeout(() => {
          sfx.win();
          setPhase("won");
          setPopupOpen(true);
        }, 400);
      }
    };
    setTimeout(tick, STEP_MS);
  };

  // Position visuelle de la bille (x en %, y en %)
  const ballX = phase === "idle" ? 50 : (path[pathIdx] / (SLOT_COUNT - 1)) * 100;
  const ballY = phase === "idle" ? 4 : 4 + ((pathIdx) / (ROWS)) * 88;

  return (
    <div className="m7-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m7-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m7-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,${T.accentGlow}40,transparent 60%);pointer-events:none}

        .m7-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;position:relative;z-index:2}
        .m7-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m7-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m7-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m7-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:20px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m7-promo strong{color:${T.accent}}

        .m7-stage{position:relative;width:min(92vw,360px);aspect-ratio:.92/1;background:linear-gradient(180deg,${T.bgCard},#0a070f);border:2px solid #1f1d24;border-radius:10px;padding:14px 14px 0;margin-bottom:22px;box-shadow:0 12px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);overflow:hidden;z-index:2}
        .m7-stage::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,${T.accentGlow}40,transparent 50%);pointer-events:none}

        .m7-field{position:relative;width:100%;height:88%}
        .m7-peg{position:absolute;width:7px;height:7px;background:radial-gradient(circle at 30% 30%,#d1d5db,#71717a 50%,#3f3f46);border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 1px 2px rgba(0,0,0,.6)}
        .m7-ball{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${T.accentLight},${T.accent} 50%,${T.accentDark});box-shadow:0 0 16px ${T.accentGlow},inset 0 -2px 4px rgba(0,0,0,.3),inset 0 2px 0 rgba(255,255,255,.4);transform:translate(-50%,-50%);transition:left .28s cubic-bezier(.5,.1,.3,1),top .28s cubic-bezier(.4,.5,.3,1.1);z-index:3}

        .m7-slots{position:absolute;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(${SLOT_COUNT},1fr);gap:1px;padding:0 14px;height:34px}
        .m7-slot{display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;letter-spacing:.04em;color:rgba(245,241,230,.7);background:linear-gradient(180deg,#1a1a1d,#0d0d10);border:1px solid #27272a;border-top:none}
        .m7-slot.jackpot{background:linear-gradient(180deg,${T.accent},${T.accentDark});color:#0e0a05;border-color:${T.accent};font-weight:900}
        .m7-slot.jackpot.lit{box-shadow:0 0 16px ${T.accentGlow},inset 0 0 8px ${T.accentLight};animation:m7-jackpot-pulse .8s ease-in-out infinite alternate}

        .m7-cta{display:block;width:min(92vw,360px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease;position:relative;z-index:2}
        .m7-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark}}
        .m7-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}

        .m7-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m7-fade .2s ease-out}
        .m7-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 22px 22px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m7-pop .35s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box}
        .m7-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer}
        .m7-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m7-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m7-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m7-popup h2 span{color:${T.accent}}
        .m7-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px}
        .m7-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m7-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m7-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}
        .m7-popup .m7-cta{width:100%;font-size:.88rem;padding:14px 16px;letter-spacing:.12em}

        @keyframes m7-jackpot-pulse{from{box-shadow:0 0 16px ${T.accentGlow},inset 0 0 8px ${T.accentLight}}to{box-shadow:0 0 28px ${T.accentGlow},inset 0 0 14px ${T.accentLight}}}
        @keyframes m7-fade{from{opacity:0}to{opacity:1}}
        @keyframes m7-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m7-header">
        {profileImageUrl ? <div className="m7-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m7-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m7-promo">Plinko · <strong>1 bille gratuite</strong></div>

      <div className="m7-stage">
        <div className="m7-field">
          {/* Pegs en pyramide */}
          {Array.from({ length: ROWS }).map((_, r) => {
            const pegsInRow = 5 + r;
            const rowY = 6 + (r / (ROWS - 1)) * 80;  // % vertical
            const startX = 50 - ((pegsInRow - 1) * 100) / (2 * SLOT_COUNT * 2);
            const stepX = 100 / (SLOT_COUNT * 2);
            return Array.from({ length: pegsInRow }).map((_, p) => (
              <div
                key={`${r}-${p}`}
                className="m7-peg"
                style={{ left: `${startX + p * stepX}%`, top: `${rowY}%` }}
              />
            ));
          })}
          {/* La bille */}
          <div
            className="m7-ball"
            style={{ left: `${ballX}%`, top: `${ballY}%` }}
          />
        </div>

        {/* Slots en bas */}
        <div className="m7-slots">
          {SLOT_MULTIPLIERS.map((m, i) => (
            <div
              key={i}
              className={`m7-slot ${i === TARGET_SLOT ? "jackpot" : ""} ${i === TARGET_SLOT && phase === "won" ? "lit" : ""}`}
            >
              {m}
            </div>
          ))}
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m7-cta" onClick={drop}>Lâcher la bille</button>
      ) : phase === "falling" ? (
        <button className="m7-cta" disabled>Chute en cours…</button>
      ) : (
        <button className="m7-cta" onClick={() => setPopupOpen(true)}>Voir mon gain</button>
      )}

      <V3OfferPopup
        open={phase === "won" && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
