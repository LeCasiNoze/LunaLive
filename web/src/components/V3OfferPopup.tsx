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
  /** Redirection auto vers href après autoRedirectMs si l'user ne clique pas
   *  (déclenchée après la fin des steps + un délai de courtoisie). */
  autoRedirectMs?: number;
  /** Bannière VIP discrète en bas du popup (programme high-roller). Default true. */
  showVipBanner?: boolean;
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
  autoRedirectMs = 5000,
  showVipBanner = true,
}: V3OfferPopupProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [autoRedirect, setAutoRedirect] = React.useState<{ remaining: number; total: number } | null>(null);
  const [cancelled, setCancelled] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setCancelled(false);
    setAutoRedirect(null);
    const timers = steps.map((_, index) =>
      window.setTimeout(() => setStepIndex(index + 1), 420 + index * 620)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, steps]);

  // Démarre le countdown après que les steps soient finis
  React.useEffect(() => {
    if (!open || cancelled || !autoRedirectMs || !href || href === "#") return;
    const stepsDone = steps.length === 0 || stepIndex > steps.length - 1;
    if (!stepsDone) return;
    const total = autoRedirectMs;
    setAutoRedirect({ remaining: total, total });
    const interval = window.setInterval(() => {
      setAutoRedirect((cur) => {
        if (!cur) return cur;
        const next = cur.remaining - 100;
        if (next <= 0) {
          window.clearInterval(interval);
          // Redirection auto vers href dans un nouvel onglet
          try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
          return null;
        }
        return { ...cur, remaining: next };
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [open, cancelled, autoRedirectMs, href, steps.length, stepIndex]);

  const cancelAutoRedirect = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCancelled(true);
    setAutoRedirect(null);
  };

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
        .v3p-cta{display:block;width:100%;padding:16px 18px;background:linear-gradient(135deg,var(--v3p-accent-light),var(--v3p-accent));color:var(--v3p-button-text);font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:.9rem;border:none;border-radius:18px;text-decoration:none;text-align:center;box-shadow:0 10px 26px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.42);position:relative;z-index:1;animation:v3p-cta-glow 2.2s ease-in-out infinite}
        .v3p-cta:hover{transform:translateY(-1px)}

        /* Countdown auto-redirect */
        .v3p-countdown{position:relative;z-index:1;margin:14px 0 0;display:flex;flex-direction:column;align-items:center;gap:6px}
        .v3p-countdown-text{font-size:.72rem;color:rgba(226,232,240,.65);letter-spacing:.04em}
        .v3p-countdown-text strong{color:var(--v3p-accent-light);font-weight:800;font-size:.8rem}
        .v3p-countdown-bar{width:100%;height:3px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}
        .v3p-countdown-fill{height:100%;background:linear-gradient(90deg,var(--v3p-accent),var(--v3p-accent-light));border-radius:999px;box-shadow:0 0 8px var(--v3p-accent-glow)}
        .v3p-countdown-cancel{margin-top:2px;background:none;border:none;color:rgba(148,163,184,.7);font-size:.7rem;cursor:pointer;text-decoration:underline;letter-spacing:.04em}
        .v3p-countdown-cancel:hover{color:rgba(248,250,252,.9)}

        /* VIP banner — discret mais visible */
        .v3p-vip{position:relative;z-index:1;margin:18px -8px 0;padding:12px 14px;background:linear-gradient(135deg,rgba(15,23,42,.6),rgba(15,23,42,.3));border-top:1px solid rgba(255,255,255,.06);border-radius:0 0 22px 22px;display:flex;align-items:center;gap:10px;text-align:left}
        .v3p-vip-icon{flex-shrink:0;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid var(--v3p-border-color);display:grid;place-items:center;font-size:.95rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
        .v3p-vip-body{flex:1;min-width:0}
        .v3p-vip-title{display:flex;align-items:center;gap:6px;font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--v3p-accent-light);margin-bottom:2px}
        .v3p-vip-title em{font-style:normal;background:linear-gradient(90deg,var(--v3p-accent),var(--v3p-accent-light));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .v3p-vip-copy{font-size:.7rem;color:rgba(203,213,225,.7);line-height:1.4}
        .v3p-vip-copy a{color:var(--v3p-accent-light);text-decoration:underline;font-weight:700;letter-spacing:.02em}

        /* Effet shimmer décoratif */
        .v3p-card::after{content:"";position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,.04) 50%,transparent 60%);pointer-events:none;animation:v3p-shimmer 6s linear infinite;z-index:0}

        @keyframes v3p-fade{from{opacity:0}to{opacity:1}}
        @keyframes v3p-pop{0%{transform:translateY(20px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
        @keyframes v3p-cta-glow{0%,100%{box-shadow:0 10px 26px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.42)}50%{box-shadow:0 14px 34px var(--v3p-accent-glow),0 0 0 4px rgba(255,255,255,.03),inset 0 1px 0 rgba(255,255,255,.42)}}
        @keyframes v3p-shimmer{from{transform:translate(-30%,-30%) rotate(0)}to{transform:translate(-30%,-30%) rotate(360deg)}}
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
        <a href={href} target="_blank" rel="noreferrer" className="v3p-cta v3-cta">
          {ctaLabel}
        </a>

        {autoRedirect ? (
          <div className="v3p-countdown">
            <div className="v3p-countdown-text">
              Redirection automatique dans <strong>{Math.ceil(autoRedirect.remaining / 1000)}s</strong>
            </div>
            <div className="v3p-countdown-bar">
              <div className="v3p-countdown-fill" style={{
                width: `${Math.max(0, Math.min(100, (autoRedirect.remaining / autoRedirect.total) * 100))}%`,
                transition: "width .1s linear",
              }} />
            </div>
            <button className="v3p-countdown-cancel" onClick={cancelAutoRedirect}>Annuler la redirection auto</button>
          </div>
        ) : null}

        {showVipBanner ? (
          <div className="v3p-vip" onClick={(e) => e.stopPropagation()}>
            <div className="v3p-vip-icon">👑</div>
            <div className="v3p-vip-body">
              <div className="v3p-vip-title">Club <em>VIP</em></div>
              <div className="v3p-vip-copy">
                Tu joues 500€+ / mois ? Demande un <a href={href} target="_blank" rel="noreferrer">host dédié</a> + bonus exclusifs.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
