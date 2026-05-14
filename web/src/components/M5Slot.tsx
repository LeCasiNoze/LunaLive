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

const SYMBOLS = ["🍒", "🍋", "🍇", "🍀", "🔔", "7️⃣", "🪙", "⭐", "💎"];
const WIN = "💎";
const CELL_H = 86;
const STRIP_LEN = 44;
const TARGET_IDX = 34;
const POPUP_STEPS = [
  "Verification de la ligne bonus",
  "Preparation de l'offre",
  "Lien de recuperation pret",
] as const;

type ResultRows = {
  top: string[];
  bottom: string[];
};

function pickSymbol(exclude: string[] = []): string {
  const pool = SYMBOLS.filter((symbol) => !exclude.includes(symbol));
  return pool[Math.floor(Math.random() * pool.length)] || WIN;
}

function buildLosingRow(): string[] {
  let row = [pickSymbol(), pickSymbol(), pickSymbol()];
  while (row.every((symbol) => symbol === row[0]) || row.every((symbol) => symbol === WIN)) {
    row = [pickSymbol(), pickSymbol(), pickSymbol()];
  }
  return row;
}

function buildResultRows(): ResultRows {
  return {
    top: buildLosingRow(),
    bottom: buildLosingRow(),
  };
}

function Reel({
  phase,
  duration,
  spinKey,
  reelIndex,
  resultRows,
}: {
  phase: "idle" | "spinning" | "tension" | "won";
  duration: number;
  spinKey: number;
  reelIndex: number;
  resultRows: ResultRows;
}) {
  const rowSignature = `${resultRows.top.join("")}|${resultRows.bottom.join("")}`;
  const strip = React.useMemo(() => {
    const values = Array.from({ length: STRIP_LEN }, () => pickSymbol());
    values[TARGET_IDX - 1] = resultRows.top[reelIndex];
    values[TARGET_IDX] = WIN;
    values[TARGET_IDX + 1] = resultRows.bottom[reelIndex];
    return values;
  }, [reelIndex, resultRows.bottom, resultRows.top, rowSignature, spinKey]);

  const translateY = phase === "idle" ? 0 : -((TARGET_IDX - 1) * CELL_H);

  return (
    <div className={`m5-reel ${phase === "tension" && reelIndex === 2 ? "armed" : ""} ${phase === "won" ? "won" : ""}`}>
      <div
        className="m5-strip"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: phase === "idle" ? "none" : `transform ${duration}s cubic-bezier(.17,.67,.16,.99)`,
        }}
      >
        {strip.map((symbol, index) => (
          <div key={index} className="m5-cell">{symbol}</div>
        ))}
      </div>
    </div>
  );
}

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
    accentDark: "#6f4f10",
    bgPage: theme?.bgPage || "#060811",
    bgCard: theme?.bgCard || "#0f172a",
    borderColor: theme?.borderColor || "rgba(253,230,138,.26)",
    panel: "#132240",
    panelDark: "#0b1428",
  };

  const [phase, setPhase] = React.useState<"idle" | "spinning" | "tension" | "won">("idle");
  const [spinKey, setSpinKey] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [resultRows, setResultRows] = React.useState<ResultRows>(() => buildResultRows());

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardHeadline = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const REEL_DURATIONS = [1.7, 2.45, 3.2] as const;
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  const play = () => {
    if (phase !== "idle") return;
    sfx.click();
    setPopupOpen(false);
    setResultRows(buildResultRows());
    setSpinKey((value) => value + 1);
    setPhase("spinning");
    window.setTimeout(() => sfx.reelStop(), REEL_DURATIONS[0] * 1000);
    window.setTimeout(() => {
      sfx.reelStop();
      setPhase("tension");
      sfx.tension(REEL_DURATIONS[2] * 1000 - REEL_DURATIONS[1] * 1000);
    }, REEL_DURATIONS[1] * 1000);
    window.setTimeout(() => {
      sfx.reelStop();
      setPhase("won");
      sfx.win();
      window.setTimeout(() => setPopupOpen(true), 620);
    }, REEL_DURATIONS[2] * 1000);
  };

  return (
    <div className="m5-root" style={{ background: T.bgPage, color: "#f8fafc" }}>
      <style>{`
        .m5-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative;overflow:hidden}
        .m5-root::before{content:"";position:absolute;inset:0;background:
          radial-gradient(circle at 50% 0%,${T.accentGlow},transparent 35%),
          radial-gradient(circle at 10% 20%,rgba(255,255,255,.08),transparent 18%),
          linear-gradient(180deg,${T.bgPage},#03050c 100%);
          pointer-events:none}
        .m5-root::after{content:"";position:absolute;inset:auto 0 0 0;height:42%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.34));pointer-events:none}

        .m5-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:16px;position:relative;z-index:2}
        .m5-avatar{width:74px;height:74px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(255,255,255,.05),0 12px 28px rgba(0,0,0,.35)}
        .m5-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m5-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m5-promo{position:relative;z-index:2;display:inline-flex;align-items:center;gap:10px;padding:10px 18px;margin-bottom:16px;background:rgba(6,12,26,.62);border:1px solid ${T.borderColor};border-radius:999px;font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(248,250,252,.88);backdrop-filter:blur(10px);box-shadow:0 16px 40px rgba(0,0,0,.24)}
        .m5-promo-dot{width:10px;height:10px;border-radius:50%;background:${T.accent};box-shadow:0 0 14px ${T.accentGlow}}

        .m5-topline{position:relative;z-index:2;text-align:center;margin-bottom:16px}
        .m5-topline strong{display:block;font-family:'Playfair Display',serif;font-size:2rem;line-height:1;color:#fff;text-shadow:0 0 22px rgba(255,255,255,.12)}
        .m5-topline span{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(8,15,30,.55);border:1px solid rgba(255,255,255,.08);font-size:.78rem;color:rgba(226,232,240,.82);letter-spacing:.1em;text-transform:uppercase}
        .m5-topline span em{font-style:normal;color:${T.accentLight}}

        .m5-cabinet{position:relative;z-index:2;width:min(94vw,430px);padding:18px 16px 16px;background:
          linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.02)),
          linear-gradient(180deg,#132648,#081224);
          border:1px solid ${T.borderColor};border-radius:28px;box-shadow:0 22px 52px rgba(0,0,0,.46),inset 0 1px 0 rgba(255,255,255,.08);margin-bottom:16px;overflow:hidden}
        .m5-cabinet::before{content:"";position:absolute;left:12px;right:12px;top:12px;height:72px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0));pointer-events:none}
        .m5-marquee{position:relative;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;margin-bottom:14px;border-radius:20px;background:rgba(3,7,18,.72);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px)}
        .m5-marquee-title{font-family:'Playfair Display',serif;font-size:1.12rem;font-weight:700;letter-spacing:.06em;color:#fff}
        .m5-marquee-copy{font-size:.72rem;font-weight:800;letter-spacing:.14em;color:${T.accentLight};text-transform:uppercase}

        .m5-lights{display:flex;gap:8px}
        .m5-light{width:10px;height:10px;border-radius:50%;background:${T.accent};box-shadow:0 0 14px ${T.accentGlow}}

        .m5-screen-shell{position:relative;padding:12px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border-radius:24px;border:1px solid rgba(255,255,255,.08)}
        .m5-screen{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;background:linear-gradient(180deg,#050911,#09101d);border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),inset 0 18px 50px rgba(0,0,0,.45)}
        .m5-screen::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 22%,transparent 78%,rgba(255,255,255,.05));pointer-events:none;z-index:3}

        .m5-reel{position:relative;height:${CELL_H * 3}px;background:linear-gradient(180deg,${T.panel},${T.panelDark});border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}
        .m5-reel::before,.m5-reel::after{content:"";position:absolute;left:0;right:0;height:28px;z-index:2;pointer-events:none}
        .m5-reel::before{top:0;background:linear-gradient(180deg,rgba(2,6,23,.95),transparent)}
        .m5-reel::after{bottom:0;background:linear-gradient(0deg,rgba(2,6,23,.95),transparent)}
        .m5-reel.armed{box-shadow:inset 0 0 36px ${T.accentGlow},0 0 24px rgba(255,255,255,.05)}
        .m5-reel.won{box-shadow:inset 0 0 30px rgba(255,255,255,.08),0 0 24px rgba(255,255,255,.04)}
        .m5-strip{display:flex;flex-direction:column;will-change:transform}
        .m5-cell{height:${CELL_H}px;display:flex;align-items:center;justify-content:center;font-size:2.35rem;flex-shrink:0}

        .m5-row-highlight{position:absolute;left:10px;right:10px;top:${CELL_H + 10}px;height:${CELL_H}px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);display:flex;align-items:center;justify-content:flex-end;padding-right:14px;font-size:.7rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:rgba(226,232,240,.42);pointer-events:none;z-index:2;transition:all .25s ease}
        .m5-row-highlight.armed{border-color:rgba(255,255,255,.12);color:rgba(248,250,252,.68)}
        .m5-row-highlight.won{border-color:${T.accent};background:linear-gradient(90deg,rgba(255,255,255,.03),${T.accentGlow},rgba(255,255,255,.03));color:${T.accentLight};box-shadow:0 0 20px ${T.accentGlow},inset 0 0 0 1px rgba(255,255,255,.08)}
        .m5-row-highlight span{position:relative;z-index:1}

        .m5-lanes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
        .m5-lane{padding:10px 12px;border-radius:16px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.06);font-size:.76rem;color:rgba(226,232,240,.72);text-transform:uppercase;letter-spacing:.12em}
        .m5-lane strong{display:block;margin-top:6px;font-size:1rem;color:#fff;letter-spacing:normal;text-transform:none}
        .m5-lane.active{border-color:${T.accent};background:linear-gradient(180deg,rgba(255,255,255,.06),${T.accentGlow});box-shadow:0 0 20px ${T.accentGlow}}
        .m5-lane.active strong{color:${T.accentLight}}

        .m5-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding:12px 14px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.06);border-radius:18px;font-size:.82rem;color:rgba(226,232,240,.72)}
        .m5-bar strong{display:block;margin-top:4px;color:#fff;font-size:1.02rem}

        .m5-cta{display:block;width:min(94vw,430px);padding:18px 24px;background:linear-gradient(135deg,${T.accentLight},${T.accent});color:#18120a;font-weight:900;text-transform:uppercase;letter-spacing:.14em;font-size:.92rem;border:none;border-radius:18px;cursor:pointer;box-shadow:0 10px 26px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.42);text-decoration:none;text-align:center;font-family:inherit;transition:transform .12s ease,box-shadow .12s ease;position:relative;z-index:2}
        .m5-cta:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 14px 30px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.42)}
        .m5-cta:disabled{background:rgba(148,163,184,.22);color:rgba(226,232,240,.6);cursor:not-allowed;box-shadow:none}

        .m5-overlay{position:fixed;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m5-fade .22s ease-out}
        .m5-popup{position:relative;background:
          radial-gradient(circle at top,rgba(255,255,255,.08),transparent 30%),
          linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01)),
          ${T.bgCard};
          border:1px solid ${T.borderColor};border-radius:28px;padding:32px 24px 24px;text-align:center;max-width:396px;width:100%;box-shadow:0 28px 90px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04);animation:m5-pop .36s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box;overflow:hidden}
        .m5-popup::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top,${T.accentGlow},transparent 34%);opacity:.6;pointer-events:none}
        .m5-popup-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:999px;background:rgba(15,23,42,.58);border:1px solid rgba(255,255,255,.08);color:#e2e8f0;font-size:20px;cursor:pointer;z-index:2}
        .m5-popup-close:hover{background:rgba(30,41,59,.82)}
        .m5-popup-badge{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(5,8,18,.58);border:1px solid rgba(255,255,255,.08);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#f8fafc;margin-bottom:14px}
        .m5-popup-badge strong{color:${T.accentLight}}
        .m5-popup-score{position:relative;z-index:1;font-size:3.1rem;font-weight:900;line-height:1;color:${T.accentLight};text-shadow:0 0 24px ${T.accentGlow}}
        .m5-popup-copy{position:relative;z-index:1;margin:12px 0 0}
        .m5-popup-copy h2{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;margin:0;color:#fff;line-height:1.02}
        .m5-popup-copy p{margin:10px 0 0;font-size:.95rem;color:rgba(226,232,240,.8)}
        .m5-popup-offer{position:relative;z-index:1;margin:18px 0 18px;padding:14px 16px;background:rgba(2,6,23,.44);border:1px solid rgba(255,255,255,.08);border-radius:18px}
        .m5-popup-offer .lbl{font-size:.7rem;color:rgba(226,232,240,.6);letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}
        .m5-popup-offer .val{font-weight:800;color:#fff}
        .m5-popup-offer .val strong{color:${T.accentLight}}
        .m5-popup-steps{position:relative;z-index:1;display:grid;gap:8px;margin:0 0 18px;padding:0;list-style:none}
        .m5-popup-step{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.06);color:rgba(226,232,240,.6);text-align:left}
        .m5-popup-step.done{color:#fff;border-color:${T.borderColor};background:rgba(255,255,255,.04)}
        .m5-popup-step-dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:.76rem;font-weight:900;background:rgba(148,163,184,.18);color:transparent}
        .m5-popup-step.done .m5-popup-step-dot{background:${T.accent};color:#20160a;box-shadow:0 0 16px ${T.accentGlow}}
        .m5-popup .m5-cta{width:100%;font-size:.9rem;padding:16px 18px;letter-spacing:.12em}

        @keyframes m5-fade{from{opacity:0}to{opacity:1}}
        @keyframes m5-pop{0%{transform:translateY(20px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
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

      <div className="m5-promo">
        <span className="m5-promo-dot" />
        Demo slot 3x3
        <strong>ligne bonus centrale</strong>
      </div>

      <div className="m5-topline">
        <strong>Sequence bonus</strong>
        <span>
          <em>3 lignes</em> · animation visuelle avec ligne 2 mise en avant
        </span>
      </div>

      <div className="m5-cabinet">
        <div className="m5-marquee">
            <div>
            <div className="m5-marquee-copy">Sequence bonus</div>
            <div className="m5-marquee-title">Night Spin Matrix</div>
          </div>
          <div className="m5-lights">
            <span className="m5-light" />
            <span className="m5-light" />
            <span className="m5-light" />
          </div>
        </div>

        <div className="m5-screen-shell">
          <div className="m5-screen">
            <Reel phase={phase} duration={REEL_DURATIONS[0]} spinKey={spinKey} reelIndex={0} resultRows={resultRows} />
            <Reel phase={phase} duration={REEL_DURATIONS[1]} spinKey={spinKey + 100} reelIndex={1} resultRows={resultRows} />
            <Reel phase={phase} duration={REEL_DURATIONS[2]} spinKey={spinKey + 200} reelIndex={2} resultRows={resultRows} />
            <div className={`m5-row-highlight ${phase === "tension" ? "armed" : ""} ${phase === "won" ? "won" : ""}`}>
              <span>{phase === "won" ? "ligne bonus validee" : "ligne bonus"}</span>
            </div>
          </div>
        </div>

        <div className="m5-lanes">
          <div className="m5-lane">
            Ligne 1
            <strong>{phase === "won" ? resultRows.top.join(" ") : "En attente"}</strong>
          </div>
          <div className={`m5-lane ${phase === "won" ? "active" : ""}`}>
            Ligne 2
            <strong>{phase === "won" ? `${WIN} ${WIN} ${WIN}` : "Bonus central"}</strong>
          </div>
          <div className="m5-lane">
            Ligne 3
            <strong>{phase === "won" ? resultRows.bottom.join(" ") : "En attente"}</strong>
          </div>
        </div>

        <div className="m5-bar">
          <div>
            Mise
            <strong>{dep || "—"}</strong>
          </div>
          <div>
            Bonus
            <strong>{bon || "100%"}</strong>
          </div>
          <div>
            Statut
            <strong>{phase === "won" ? "Ligne 2 allumee" : phase === "tension" ? "Suspense" : phase === "spinning" ? "Spin" : "Pret"}</strong>
          </div>
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m5-cta" onClick={play}>Lancer la machine</button>
      ) : phase === "spinning" ? (
        <button className="m5-cta" disabled>Spin en cours...</button>
      ) : phase === "tension" ? (
        <button className="m5-cta" disabled>Lecture des 3 lignes...</button>
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
