import * as React from "react";

type PopupTheme = {
  accent?: string;
  accentLight?: string;
  accentGlow?: string;
  bgCard?: string;
  borderColor?: string;
  buttonText?: string;
};

export type V3OfferPopupProps = {
  open: boolean;
  onClose: () => void;
  theme?: PopupTheme;
  badge: string;
  badgeStrong?: string;
  score: string;
  title: string;
  body: string;
  depositAmount?: string;
  bonusAmount?: string;
  offerLabel?: string;
  steps?: readonly string[];
  href: string;
  ctaLabel?: string;
};

export function V3OfferPopup({
  open,
  onClose,
  theme,
  badge,
  badgeStrong,
  score,
  title,
  body,
  depositAmount,
  bonusAmount,
  offerLabel = "Ton offre",
  steps = [],
  href,
  ctaLabel = "Recuperer mon bonus",
}: V3OfferPopupProps) {
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    const timers = steps.map((_, index) =>
      window.setTimeout(() => setStepIndex(index + 1), 420 + index * 620)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, steps]);

  if (!open) return null;

  const accent = theme?.accent || "#f7c948";
  const accentLight = theme?.accentLight || "#fde68a";
  const accentGlow = theme?.accentGlow || "rgba(247,201,72,.42)";
  const bgCard = theme?.bgCard || "#0f172a";
  const borderColor = theme?.borderColor || "rgba(253,230,138,.22)";
  const buttonText = theme?.buttonText || "#17110a";

  return (
    <div
      className="v3p-overlay"
      onClick={onClose}
      style={{
        ["--v3p-accent" as any]: accent,
        ["--v3p-accent-light" as any]: accentLight,
        ["--v3p-accent-glow" as any]: accentGlow,
        ["--v3p-bg-card" as any]: bgCard,
        ["--v3p-border-color" as any]: borderColor,
        ["--v3p-button-text" as any]: buttonText,
      }}
    >
      <style>{`
        .v3p-overlay{position:fixed;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:v3p-fade .22s ease-out}
        .v3p-card{position:relative;background:
          radial-gradient(circle at top,rgba(255,255,255,.08),transparent 30%),
          linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01)),
          var(--v3p-bg-card);
          border:1px solid var(--v3p-border-color);border-radius:28px;padding:32px 24px 24px;text-align:center;max-width:396px;width:100%;box-shadow:0 28px 90px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04);animation:v3p-pop .36s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box;overflow:hidden}
        .v3p-card::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top,var(--v3p-accent-glow),transparent 34%);opacity:.6;pointer-events:none}
        .v3p-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:999px;background:rgba(15,23,42,.58);border:1px solid rgba(255,255,255,.08);color:#e2e8f0;font-size:20px;cursor:pointer;z-index:2}
        .v3p-close:hover{background:rgba(30,41,59,.82)}
        .v3p-badge{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(5,8,18,.58);border:1px solid rgba(255,255,255,.08);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#f8fafc;margin-bottom:14px}
        .v3p-dot{width:10px;height:10px;border-radius:50%;background:var(--v3p-accent);box-shadow:0 0 14px var(--v3p-accent-glow)}
        .v3p-badge strong{color:var(--v3p-accent-light)}
        .v3p-score{position:relative;z-index:1;font-size:3.1rem;font-weight:900;line-height:1;color:var(--v3p-accent-light);text-shadow:0 0 24px var(--v3p-accent-glow)}
        .v3p-copy{position:relative;z-index:1;margin:12px 0 0}
        .v3p-copy h2{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;margin:0;color:#fff;line-height:1.02}
        .v3p-copy p{margin:10px 0 0;font-size:.95rem;color:rgba(226,232,240,.8)}
        .v3p-offer{position:relative;z-index:1;margin:18px 0 18px;padding:14px 16px;background:rgba(2,6,23,.44);border:1px solid rgba(255,255,255,.08);border-radius:18px}
        .v3p-offer .lbl{font-size:.7rem;color:rgba(226,232,240,.6);letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}
        .v3p-offer .val{font-weight:800;color:#fff}
        .v3p-offer .val strong{color:var(--v3p-accent-light)}
        .v3p-steps{position:relative;z-index:1;display:grid;gap:8px;margin:0 0 18px;padding:0;list-style:none}
        .v3p-step{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.06);color:rgba(226,232,240,.6);text-align:left}
        .v3p-step.done{color:#fff;border-color:var(--v3p-border-color);background:rgba(255,255,255,.04)}
        .v3p-step-dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:.76rem;font-weight:900;background:rgba(148,163,184,.18);color:transparent}
        .v3p-step.done .v3p-step-dot{background:var(--v3p-accent);color:var(--v3p-button-text);box-shadow:0 0 16px var(--v3p-accent-glow)}
        .v3p-cta{display:block;width:100%;padding:16px 18px;background:linear-gradient(135deg,var(--v3p-accent-light),var(--v3p-accent));color:var(--v3p-button-text);font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:.9rem;border:none;border-radius:18px;text-decoration:none;text-align:center;box-shadow:0 10px 26px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.42)}
        .v3p-cta:hover{transform:translateY(-1px)}
        @keyframes v3p-fade{from{opacity:0}to{opacity:1}}
        @keyframes v3p-pop{0%{transform:translateY(20px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
      `}</style>

      <div className="v3p-card" onClick={(event) => event.stopPropagation()}>
        <button className="v3p-close" onClick={onClose} aria-label="Fermer">×</button>
        <div className="v3p-badge">
          <span className="v3p-dot" />
          {badge}
          {badgeStrong ? <strong>{badgeStrong}</strong> : null}
        </div>
        <div className="v3p-score">{score}</div>
        <div className="v3p-copy">
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        {(depositAmount || bonusAmount) ? (
          <div className="v3p-offer">
            <div className="lbl">{offerLabel}</div>
            <div className="val">
              {depositAmount ? <>Depose <strong>{depositAmount}</strong></> : null}
              {depositAmount && bonusAmount ? " · " : null}
              {bonusAmount ? <>Recois <strong>{bonusAmount}</strong></> : null}
            </div>
          </div>
        ) : null}
        {steps.length ? (
          <ul className="v3p-steps">
            {steps.map((label, index) => {
              const done = stepIndex > index;
              return (
                <li key={label} className={`v3p-step ${done ? "done" : ""}`}>
                  <span className="v3p-step-dot">{done ? "✓" : "•"}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <a href={href} target="_blank" rel="noreferrer" className="v3p-cta">
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
