// ─────────────────────────────────────────────────────────────────────────────
// M5 — Slot 3 lignes independantes.
// 3 rangees x 3 symboles = 9 cellules au total, revelees une par une.
// L1 : perdante (3 symboles differents)
// L2 : bait — 7 7 💎 (presque jackpot)
// L3 : winner — 3 💎 = bonus 100%
// Pas de grille 3x3, pas de "ligne centrale", pas de bloc statut/mise/bonus.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";

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

const SPIN_POOL = ["🍒", "🍋", "🍇", "🍀", "🔔", "🪙", "⭐", "7️⃣", "💎"];

const ROW_RESULTS: ReadonlyArray<readonly [string, string, string]> = [
  ["🍒", "🔔", "🍋"],   // L1 perdante
  ["7️⃣", "7️⃣", "💎"], // L2 bait
  ["💎", "💎", "💎"],   // L3 win
];

type RowKind = "loss" | "bait" | "win";
const ROW_KINDS: ReadonlyArray<RowKind> = ["loss", "bait", "win"];

// Timing : chaque cellule cycle des symboles pdt CELL_SPIN_MS puis se verrouille
const CELL_SPIN_MS = 600;
const CELL_GAP_MS = 220;          // intervalle entre 2 lock dans la meme ligne
const ROW_GAP_MS = 460;           // pause entre fin d'une ligne et debut de la suivante
const CELL_TICK_MS = 65;          // vitesse de cycle des symboles pendant le spin
const POPUP_DELAY_MS = 700;       // delai apres derniere cellule revealee avant popup

const POPUP_STEPS = [
  "Verification de la ligne gagnante",
  "Preparation de l'offre",
  "Lien de recuperation pret",
] as const;

export function M5Slot({
  pseudo,
  profileImageUrl,
  depositAmount,
  bonusAmount,
  affiLink,
  theme,
  pseudoStyle,
}: M5SlotProps) {
  const T = {
    accent: theme?.accent || "#f7c948",
    accentLight: theme?.accentLight || "#fde68a",
    accentGlow: theme?.accentGlow || "rgba(247,201,72,.42)",
    bgPage: theme?.bgPage || "#060811",
    bgCard: theme?.bgCard || "#0f172a",
    borderColor: theme?.borderColor || "rgba(253,230,138,.26)",
  };

  // phase globale du jeu
  const [phase, setPhase] = React.useState<"idle" | "playing" | "won">("idle");
  // revealedCount = nombre de cellules deja verrouillees (0 a 9)
  const [revealedCount, setRevealedCount] = React.useState(0);
  // ticker pour faire defiler les symboles aleatoires sur les cellules pas encore lockees
  const [tick, setTick] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardHeadline = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  // Ticker de symboles aleatoires pdt le spin
  React.useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setTick((t) => t + 1), CELL_TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const play = () => {
    if (phase !== "idle") return;
    sfx.click();
    setPopupOpen(false);
    setRevealedCount(0);
    setPhase("playing");

    // Schedule des 9 verrouillages
    let cumul = 0;
    for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
      for (let colIdx = 0; colIdx < 3; colIdx++) {
        const cellGlobalIdx = rowIdx * 3 + colIdx + 1; // 1..9
        cumul += CELL_GAP_MS;
        // ajout du spin initial seulement avant la 1ere cellule
        if (rowIdx === 0 && colIdx === 0) cumul = CELL_SPIN_MS;
        // pause supplementaire entre lignes
        if (colIdx === 0 && rowIdx > 0) cumul += ROW_GAP_MS;
        const at = cumul;
        const isLastOfRow = colIdx === 2;
        const rowKind = ROW_KINDS[rowIdx];
        window.setTimeout(() => {
          setRevealedCount(cellGlobalIdx);
          sfx.reelStop();
          if (isLastOfRow) {
            if (rowKind === "win") sfx.win();
            else if (rowKind === "bait") sfx.tension(400);
            else sfx.loss();
          }
        }, at);
      }
    }
    // Apres derniere cellule
    const totalDuration = cumul + POPUP_DELAY_MS;
    window.setTimeout(() => {
      setPhase("won");
      setPopupOpen(true);
    }, totalDuration);
  };

  const rowState = (rowIdx: number): "idle" | "spinning" | "revealed" => {
    if (phase === "idle") return "idle";
    const cellsRevealedInRow = Math.max(0, Math.min(3, revealedCount - rowIdx * 3));
    if (cellsRevealedInRow === 0) return "spinning";
    if (cellsRevealedInRow === 3) return "revealed";
    return "spinning";
  };

  const cellSymbol = (rowIdx: number, colIdx: number): string => {
    const globalIdx = rowIdx * 3 + colIdx + 1;
    if (revealedCount >= globalIdx) return ROW_RESULTS[rowIdx][colIdx];
    // Encore en train de spin : symbole pseudo-aleatoire decale par index pour avoir des cellules desynchronisees
    return SPIN_POOL[(tick + rowIdx * 7 + colIdx * 3) % SPIN_POOL.length];
  };

  const ROW_LABELS: ReadonlyArray<{ idle: string; revealed: (kind: RowKind) => string }> = [
    { idle: "Ligne 1", revealed: (k) => k === "win" ? "Gagnant" : k === "bait" ? "Presque" : "Perdu" },
    { idle: "Ligne 2", revealed: (k) => k === "win" ? "Gagnant" : k === "bait" ? "Presque !" : "Perdu" },
    { idle: "Ligne 3", revealed: (k) => k === "win" ? "Bonus 100%" : k === "bait" ? "Presque" : "Perdu" },
  ];

  return (
    <div className="m5-root" style={{ color: "#f8fafc" }}>
      <style>{`
        .m5-root{position:relative;display:flex;flex-direction:column;align-items:center;padding:32px 16px 56px;font-family:'Inter',-apple-system,sans-serif;overflow:hidden;min-height:100%;background:radial-gradient(circle at 20% 10%,#1a0a2e 0%,transparent 45%),radial-gradient(circle at 80% 20%,#0a1a3e 0%,transparent 45%),radial-gradient(circle at 50% 90%,#2a0a3e 0%,transparent 50%),${T.bgPage}}
        .m5-bg-mesh{position:absolute;inset:-20%;background:
          radial-gradient(circle at 30% 40%,${T.accentGlow} 0%,transparent 40%),
          radial-gradient(circle at 70% 60%,rgba(168,85,247,.32) 0%,transparent 40%),
          radial-gradient(circle at 50% 20%,rgba(6,182,212,.22) 0%,transparent 40%);
          filter:blur(40px);animation:m5-mesh 18s ease-in-out infinite alternate;pointer-events:none;z-index:0}

        .m5-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px;position:relative;z-index:3}
        .m5-avatar{width:74px;height:74px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(0,0,0,.4),0 0 22px ${T.accentGlow}}
        .m5-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m5-pseudo-wrap{display:flex;justify-content:center;margin-top:2px;position:relative;isolation:isolate}
        .m5-pseudo-wrap::before{content:"";position:absolute;inset:-6px -14px;border-radius:999px;background:radial-gradient(ellipse at center,${T.accentGlow} 0%,transparent 70%);z-index:-1;animation:m5-pseudo-glow 2.6s ease-in-out infinite;pointer-events:none}

        .m5-promo{position:relative;z-index:3;display:inline-flex;align-items:center;gap:10px;padding:9px 18px;margin-bottom:24px;background:rgba(10,5,25,.85);border:1px solid ${T.accent}66;border-radius:999px;font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(248,250,252,.92);box-shadow:0 0 18px ${T.accentGlow}}
        .m5-promo strong{color:${T.accentLight};font-weight:800}

        .m5-rows{position:relative;z-index:3;display:flex;flex-direction:column;gap:14px;width:min(94vw,420px);margin-bottom:24px}
        .m5-row{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:12px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01)),rgba(8,12,28,.7);border:1px solid rgba(255,255,255,.07);box-shadow:0 8px 22px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.05);transition:border-color .3s ease,box-shadow .3s ease,transform .3s ease}
        .m5-row.revealed.loss{border-color:rgba(239,68,68,.4);box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 18px rgba(239,68,68,.18)}
        .m5-row.revealed.bait{border-color:rgba(251,146,60,.55);box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 22px rgba(251,146,60,.3)}
        .m5-row.revealed.win{border-color:${T.accent};box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 28px ${T.accentGlow},inset 0 0 0 1px ${T.accentLight}55;animation:m5-row-win-pulse 1.6s ease-in-out infinite}

        .m5-row-num{font-size:.6rem;font-weight:900;letter-spacing:.14em;color:rgba(226,232,240,.55);text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);padding:4px 2px}
        .m5-row.revealed.win .m5-row-num{color:${T.accentLight}}
        .m5-row.revealed.bait .m5-row-num{color:#fb923c}
        .m5-row.revealed.loss .m5-row-num{color:#ef4444}

        .m5-cells{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .m5-cell{position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:2.3rem;border-radius:14px;background:linear-gradient(180deg,#0a0f20,#050811);border:1px solid rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.02),inset 0 8px 20px rgba(0,0,0,.45);overflow:hidden;line-height:1}
        .m5-cell.spinning{filter:blur(2px);opacity:.55}
        .m5-cell.locked{animation:m5-cell-lock .4s cubic-bezier(.34,1.56,.64,1)}
        .m5-cell.win.locked{box-shadow:inset 0 0 0 1px ${T.accent},0 0 18px ${T.accentGlow}}
        .m5-cell.bait.locked{box-shadow:inset 0 0 0 1px rgba(251,146,60,.55),0 0 14px rgba(251,146,60,.3)}

        .m5-row-status{font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;text-align:right;min-width:60px}
        .m5-row.idle .m5-row-status,.m5-row.spinning .m5-row-status{color:rgba(226,232,240,.4)}
        .m5-row.revealed.loss .m5-row-status{color:#ef4444}
        .m5-row.revealed.bait .m5-row-status{color:#fb923c;animation:m5-bait-flash 1.4s ease-in-out infinite}
        .m5-row.revealed.win .m5-row-status{color:${T.accentLight};text-shadow:0 0 12px ${T.accentGlow}}

        .m5-cta{position:relative;display:block;width:min(94vw,420px);padding:18px 24px;background:linear-gradient(180deg,${T.accentLight} 0%,${T.accent} 100%);color:#0a0508;font-weight:800;text-transform:uppercase;letter-spacing:.16em;font-size:.95rem;border:1px solid ${T.accentLight};border-radius:10px;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 22px ${T.accentGlow},0 0 44px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 0 rgba(0,0,0,.18);text-decoration:none;text-align:center;font-family:inherit;transition:transform .12s ease,box-shadow .2s ease;z-index:3;animation:m5-cta-pulse 2.2s ease-in-out infinite}
        .m5-cta:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 30px ${T.accentGlow},0 0 60px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18)}
        .m5-cta:not(:disabled):active{transform:translateY(1px)}
        .m5-cta:disabled{background:linear-gradient(180deg,#2a2a32,#1a1a20);color:rgba(255,255,255,.5);border-color:#2a2a32;cursor:not-allowed;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);animation:none}

        @keyframes m5-mesh{0%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(-30px,20px) rotate(8deg)}100%{transform:translate(20px,-15px) rotate(-6deg)}}
        @keyframes m5-pseudo-glow{0%,100%{opacity:.55;transform:scale(.95)}50%{opacity:1;transform:scale(1.08)}}
        @keyframes m5-cell-lock{0%{transform:scale(.7);opacity:.4}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
        @keyframes m5-row-win-pulse{0%,100%{box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 28px ${T.accentGlow},inset 0 0 0 1px ${T.accentLight}55}50%{box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 44px ${T.accentGlow},inset 0 0 0 1px ${T.accentLight}88}}
        @keyframes m5-bait-flash{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes m5-cta-pulse{0%,100%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 22px ${T.accentGlow},0 0 44px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 0 rgba(0,0,0,.18)}50%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 30px ${T.accentLight},0 0 60px ${T.accent},inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18)}}
      `}</style>

      <div className="m5-bg-mesh" />

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

      <div className="m5-promo">
        Slot · <strong>3 tirages indépendants</strong>
      </div>

      <div className="m5-rows">
        {ROW_KINDS.map((kind, rowIdx) => {
          const state = rowState(rowIdx);
          const revealed = state === "revealed";
          const label = revealed ? ROW_LABELS[rowIdx].revealed(kind) : ROW_LABELS[rowIdx].idle;
          return (
            <div key={rowIdx} className={`m5-row ${state} ${revealed ? kind : ""}`}>
              <div className="m5-row-num">L{rowIdx + 1}</div>
              <div className="m5-cells">
                {[0, 1, 2].map((colIdx) => {
                  const globalIdx = rowIdx * 3 + colIdx + 1;
                  const locked = revealedCount >= globalIdx;
                  return (
                    <div
                      key={colIdx}
                      className={`m5-cell ${locked ? "locked" : "spinning"} ${locked ? kind : ""}`}
                    >
                      {cellSymbol(rowIdx, colIdx)}
                    </div>
                  );
                })}
              </div>
              <div className="m5-row-status">{label}</div>
            </div>
          );
        })}
      </div>

      {phase === "idle" ? (
        <button className="m5-cta" onClick={play}>Lancer la machine</button>
      ) : phase === "playing" ? (
        <button className="m5-cta" disabled>Lecture en cours…</button>
      ) : (
        <button className="m5-cta" onClick={() => setPopupOpen(true)}>Voir mon bonus</button>
      )}

      <V3OfferPopup
        open={phase === "won" && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardHeadline}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
