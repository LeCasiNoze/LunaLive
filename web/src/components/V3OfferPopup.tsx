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
  /** Badge optionnel en haut. Si omis, pas de badge. */
  badge?: string;
  badgeStrong?: string;
  score: string;
  /** Titre court (h2). Si omis, "X% bonus debloque" calcule auto, sinon "Bonus debloque". */
  title?: string;
  /** Texte secondaire court. Si vide, masque. */
  body?: string;
  depositAmount?: string;
  bonusAmount?: string;
  /** Label personnalise du bloc offre. Si omis, genere "Ton offre de X% bonus !". */
  offerLabel?: string;
  /** Affiche le bloc offre detaille. Default false (info deja dans title+score). */
  showOffer?: boolean;
  steps?: readonly string[];
  href: string;
  ctaLabel?: string;
  autoRedirectMs?: number;
  showVipBanner?: boolean;
};

// Durees irregulieres pour chaque etape (effet "chargement reel")
const STEP_DURATIONS = [1180, 760, 1520, 980, 1340, 820];

function parseEuro(value?: string): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

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
  offerLabel,
  showOffer = false,
  steps = [],
  href,
  ctaLabel = "Recuperer mon bonus",
  autoRedirectMs = 5000,
  showVipBanner = true,
}: V3OfferPopupProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [stepProgress, setStepProgress] = React.useState(0);
  const [autoRedirect, setAutoRedirect] = React.useState<{ remaining: number; total: number } | null>(null);
  const [cancelled, setCancelled] = React.useState(false);
  const [vipMode, setVipMode] = React.useState<"closed" | "form" | "sending" | "sent">("closed");
  const [vipEmail, setVipEmail] = React.useState("");
  const [vipError, setVipError] = React.useState<string | null>(null);

  // Reset + lance la sequence d'etapes avec timings irreguliers
  React.useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setStepProgress(0);
    setCancelled(false);
    setAutoRedirect(null);
  }, [open, steps.length]);

  React.useEffect(() => {
    if (!open || steps.length === 0 || stepIndex >= steps.length) return;
    const duration = STEP_DURATIONS[stepIndex % STEP_DURATIONS.length];
    const tickMs = 50;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(1, elapsed / duration);
      setStepProgress(ratio);
      if (ratio >= 1) {
        window.clearInterval(interval);
        setStepIndex((i) => i + 1);
        setStepProgress(0);
      }
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [open, stepIndex, steps.length]);

  React.useEffect(() => {
    if (!open || cancelled || !autoRedirectMs || !href || href === "#") return;
    if (vipMode !== "closed") return; // pause si l'user remplit le form VIP
    const stepsDone = steps.length === 0 || stepIndex >= steps.length;
    if (!stepsDone) return;
    const total = autoRedirectMs;
    setAutoRedirect({ remaining: total, total });
    const interval = window.setInterval(() => {
      setAutoRedirect((cur) => {
        if (!cur) return cur;
        const next = cur.remaining - 100;
        if (next <= 0) {
          window.clearInterval(interval);
          try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
          return null;
        }
        return { ...cur, remaining: next };
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [open, cancelled, autoRedirectMs, href, steps.length, stepIndex, vipMode]);

  const cancelAutoRedirect = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCancelled(true);
    setAutoRedirect(null);
  };

  const submitVipEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const email = vipEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setVipError("Email invalide");
      return;
    }
    setVipError(null);
    setVipMode("sending");
    // Slug derive de l'URL /r/<slug> si disponible
    let slug = "";
    try {
      const path = window.location.pathname || "";
      const m = path.match(/\/r\/([^/?#]+)/);
      if (m && m[1]) slug = decodeURIComponent(m[1]);
    } catch { /* noop */ }
    const base = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
    try {
      await fetch(`${base}/api/public/affi-vip-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug || "unknown", email, referrer: document.referrer || null }),
      });
    } catch { /* lead perdu mais on continue */ }
    // Notifie le parent (cas iframe editor)
    try { window.parent?.postMessage({ type: "v3-vip-lead", email, slug }, "*"); } catch { /* noop */ }
    setVipMode("sent");
    // Redirige vers le lien d'affiliation apres 1.6s
    window.setTimeout(() => {
      try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
    }, 1600);
  };

  if (!open) return null;

  const accent = theme?.accent || "#f7c948";
  const accentLight = theme?.accentLight || "#fde68a";
  const accentGlow = theme?.accentGlow || "rgba(247,201,72,.42)";
  const bgCard = theme?.bgCard || "#0f172a";
  const borderColor = theme?.borderColor || "rgba(253,230,138,.22)";
  const buttonText = theme?.buttonText || "#17110a";

  // Calcule le % de bonus si on a les deux montants
  const dep = parseEuro(depositAmount);
  const bon = parseEuro(bonusAmount);
  const pct = (dep != null && bon != null && dep > 0) ? Math.round(((bon - dep) / dep) * 100) : null;
  const computedOfferLabel = offerLabel
    ?? (pct != null && pct > 0 ? `Ton offre de ${pct}% bonus !` : "Ton offre");
  const computedTitle = (title !== undefined ? title : (pct != null && pct > 0 ? `${pct}% bonus débloqué` : "Bonus débloqué"));

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
        .v3p-copy h2{font-family:'Playfair Display',serif;font-size:1.7rem;font-weight:700;margin:0;color:#fff;line-height:1.05}
        .v3p-copy p{margin:8px 0 0;font-size:.92rem;color:rgba(226,232,240,.78)}
        .v3p-offer{position:relative;z-index:1;margin:18px 0 18px;padding:14px 16px;background:rgba(2,6,23,.44);border:1px solid var(--v3p-border-color);border-radius:18px;box-shadow:0 0 18px var(--v3p-accent-glow)}
        .v3p-offer .lbl{font-size:.78rem;color:var(--v3p-accent-light);letter-spacing:.06em;text-transform:none;margin-bottom:6px;font-weight:800}
        .v3p-offer .val{font-weight:800;color:#fff;font-size:1.05rem}
        .v3p-offer .val strong{color:var(--v3p-accent-light);font-size:1.15rem}

        .v3p-steps{position:relative;z-index:1;display:grid;gap:8px;margin:20px 0 18px;padding:0;list-style:none}
        .v3p-step{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.06);color:rgba(226,232,240,.5);text-align:left;overflow:hidden}
        .v3p-step.done{color:#fff;border-color:var(--v3p-border-color);background:rgba(255,255,255,.04)}
        .v3p-step.active{color:#fff;border-color:var(--v3p-accent);background:rgba(255,255,255,.04)}
        .v3p-step-dot{position:relative;z-index:1;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:.76rem;font-weight:900;background:rgba(148,163,184,.18);color:transparent;flex-shrink:0}
        .v3p-step.done .v3p-step-dot{background:var(--v3p-accent);color:var(--v3p-button-text);box-shadow:0 0 16px var(--v3p-accent-glow)}
        .v3p-step.active .v3p-step-dot{background:transparent;border:2px solid var(--v3p-accent);box-sizing:border-box;animation:v3p-step-spin .9s linear infinite;color:transparent}
        .v3p-step.active .v3p-step-dot::after{content:"";position:absolute;top:-2px;left:-2px;width:14px;height:14px;border:2px solid transparent;border-top-color:var(--v3p-accent-light);border-radius:50%}
        .v3p-step-label{position:relative;z-index:1;flex:1}
        .v3p-step.active .v3p-step-label::after{content:"*";color:var(--v3p-accent-light);margin-left:4px;animation:v3p-blink 1s ease-in-out infinite}
        .v3p-step-progress{position:absolute;left:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--v3p-accent),var(--v3p-accent-light));border-radius:0 2px 2px 0;box-shadow:0 0 6px var(--v3p-accent-glow);transition:width .05s linear;z-index:0}
        .v3p-step-pct{position:relative;z-index:1;font-size:.7rem;color:var(--v3p-accent-light);font-weight:700;font-variant-numeric:tabular-nums;min-width:32px;text-align:right}

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

        /* VIP banner — carte */
        .v3p-vip-card{position:relative;z-index:1;display:flex;align-items:stretch;gap:12px;width:100%;margin:14px 0 0;padding:14px;background:linear-gradient(135deg,rgba(2,6,23,.72),rgba(15,23,42,.4));border:1px solid var(--v3p-accent);border-radius:16px;text-align:left;box-shadow:0 0 0 4px rgba(0,0,0,.18),0 0 22px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden}
        .v3p-vip-card::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 100% 0,var(--v3p-accent-glow),transparent 60%);opacity:.45;pointer-events:none}
        .v3p-vip-crown{position:relative;z-index:1;flex-shrink:0;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--v3p-accent-light),var(--v3p-accent));display:grid;place-items:center;font-size:1.5rem;box-shadow:0 6px 18px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.5);animation:v3p-vip-crown-bob 2.6s ease-in-out infinite}
        .v3p-vip-content{position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
        .v3p-vip-title{font-size:.86rem;font-weight:800;color:#fff;line-height:1.25}
        .v3p-vip-title em{font-style:normal;color:var(--v3p-accent-light);text-shadow:0 0 8px var(--v3p-accent-glow)}
        .v3p-vip-sub{font-size:.7rem;color:rgba(203,213,225,.75);line-height:1.35}
        .v3p-vip-action{position:relative;z-index:1;align-self:stretch;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;margin-top:auto;background:linear-gradient(135deg,var(--v3p-accent-light),var(--v3p-accent));color:var(--v3p-button-text);font-weight:800;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.4);transition:transform .12s ease,box-shadow .15s ease;width:100%}
        .v3p-vip-action:hover{transform:translateY(-1px);box-shadow:0 6px 16px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.4)}
        .v3p-vip-action::after{content:"→";font-weight:900;font-size:.8rem}

        /* VIP form expanded */
        .v3p-vip-form{position:relative;z-index:1;margin:14px -8px 0;padding:16px 16px;background:linear-gradient(135deg,rgba(15,23,42,.85),rgba(15,23,42,.6));border-top:1px solid rgba(255,255,255,.1);border-radius:0 0 22px 22px;text-align:left;animation:v3p-fade .2s ease-out}
        .v3p-vip-form-title{font-size:.78rem;font-weight:800;letter-spacing:.06em;color:var(--v3p-accent-light);margin-bottom:4px}
        .v3p-vip-form-sub{font-size:.72rem;color:rgba(203,213,225,.75);margin-bottom:10px;line-height:1.4}
        .v3p-vip-form-row{display:flex;gap:8px}
        .v3p-vip-form input{flex:1;padding:10px 12px;background:rgba(2,6,23,.7);border:1px solid var(--v3p-border-color);border-radius:10px;color:#fff;font-size:.85rem;font-family:inherit;outline:none}
        .v3p-vip-form input:focus{border-color:var(--v3p-accent);box-shadow:0 0 0 3px var(--v3p-accent-glow)}
        .v3p-vip-form button{padding:10px 16px;background:linear-gradient(135deg,var(--v3p-accent-light),var(--v3p-accent));color:var(--v3p-button-text);font-weight:800;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px var(--v3p-accent-glow)}
        .v3p-vip-form button:disabled{opacity:.6;cursor:not-allowed}
        .v3p-vip-form-error{margin-top:6px;font-size:.7rem;color:#fca5a5}
        .v3p-vip-form-back{margin-top:8px;background:none;border:none;color:rgba(148,163,184,.7);font-size:.7rem;cursor:pointer;text-decoration:underline;padding:0}
        .v3p-vip-sent{padding:14px;text-align:center}
        .v3p-vip-sent-check{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--v3p-accent);color:var(--v3p-button-text);font-size:1.1rem;font-weight:900;margin-bottom:8px;box-shadow:0 0 22px var(--v3p-accent-glow);animation:v3p-pop .3s cubic-bezier(.17,.84,.34,1.27)}
        .v3p-vip-sent-text{font-size:.82rem;color:#fff;font-weight:700}
        .v3p-vip-sent-sub{margin-top:2px;font-size:.7rem;color:rgba(203,213,225,.7)}

        .v3p-card::after{content:"";position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,.04) 50%,transparent 60%);pointer-events:none;animation:v3p-shimmer 6s linear infinite;z-index:0}

        @keyframes v3p-fade{from{opacity:0}to{opacity:1}}
        @keyframes v3p-pop{0%{transform:translateY(20px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
        @keyframes v3p-cta-glow{0%,100%{box-shadow:0 10px 26px var(--v3p-accent-glow),inset 0 1px 0 rgba(255,255,255,.42)}50%{box-shadow:0 14px 34px var(--v3p-accent-glow),0 0 0 4px rgba(255,255,255,.03),inset 0 1px 0 rgba(255,255,255,.42)}}
        @keyframes v3p-shimmer{from{transform:translate(-30%,-30%) rotate(0)}to{transform:translate(-30%,-30%) rotate(360deg)}}
        @keyframes v3p-step-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes v3p-blink{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes v3p-vip-crown-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-3px) rotate(4deg)}}
      `}</style>

      <div className="v3p-card" onClick={(event) => event.stopPropagation()}>
        <button className="v3p-close" onClick={onClose} aria-label="Fermer">×</button>
        {badge ? (
          <div className="v3p-badge">
            <span className="v3p-dot" />
            {badge}
            {badgeStrong ? <strong>{badgeStrong}</strong> : null}
          </div>
        ) : null}
        <div className="v3p-score">{score}</div>
        {(computedTitle || body) ? (
          <div className="v3p-copy">
            {computedTitle ? <h2>{computedTitle}</h2> : null}
            {body ? <p>{body}</p> : null}
          </div>
        ) : null}
        {showOffer && bonusAmount ? (
          <div className="v3p-offer">
            <div className="lbl">{computedOfferLabel}</div>
            <div className="val">Recois <strong>{bonusAmount}</strong></div>
          </div>
        ) : null}
        {steps.length ? (
          <ul className="v3p-steps">
            {steps.map((label, index) => {
              const done = stepIndex > index;
              const active = stepIndex === index;
              const pct = active ? Math.round(stepProgress * 100) : (done ? 100 : 0);
              return (
                <li key={label} className={`v3p-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                  <span className="v3p-step-dot">{done ? "✓" : ""}</span>
                  <span className="v3p-step-label">{label}</span>
                  {active ? <span className="v3p-step-pct">{pct}%</span> : null}
                  {active ? <span className="v3p-step-progress" style={{ width: `${pct}%` }} /> : null}
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

        {showVipBanner && vipMode === "closed" ? (
          <div className="v3p-vip-card" onClick={(e) => e.stopPropagation()}>
            <div className="v3p-vip-crown">👑</div>
            <div className="v3p-vip-content">
              <div className="v3p-vip-title">Vous êtes un <em>gros joueur</em> ?</div>
              <div className="v3p-vip-sub">500€–1K€ de dépôt par mois ? Un host dédié + bonus exclusifs t'attendent.</div>
              <button
                type="button"
                className="v3p-vip-action"
                onClick={(e) => { e.stopPropagation(); setVipMode("form"); }}
              >
                Demander mon host VIP
              </button>
            </div>
          </div>
        ) : null}

        {showVipBanner && (vipMode === "form" || vipMode === "sending") ? (
          <form className="v3p-vip-form" onClick={(e) => e.stopPropagation()} onSubmit={submitVipEmail}>
            <div className="v3p-vip-form-title">👑 Club VIP — gros joueurs (500€–1K€ / mois)</div>
            <div className="v3p-vip-form-sub">Laisse ton email, un host dédié te contacte sous 24h : bonus exclusifs + suivi perso.</div>
            <div className="v3p-vip-form-row">
              <input
                type="email"
                placeholder="ton.email@exemple.com"
                value={vipEmail}
                onChange={(e) => { setVipEmail(e.target.value); setVipError(null); }}
                disabled={vipMode === "sending"}
                autoFocus
                required
              />
              <button type="submit" disabled={vipMode === "sending"}>
                {vipMode === "sending" ? "..." : "Envoyer"}
              </button>
            </div>
            {vipError ? <div className="v3p-vip-form-error">{vipError}</div> : null}
            <button type="button" className="v3p-vip-form-back" onClick={() => { setVipMode("closed"); setVipError(null); }}>
              Retour
            </button>
          </form>
        ) : null}

        {showVipBanner && vipMode === "sent" ? (
          <div className="v3p-vip-form" onClick={(e) => e.stopPropagation()}>
            <div className="v3p-vip-sent">
              <div className="v3p-vip-sent-check">✓</div>
              <div className="v3p-vip-sent-text">Demande envoyée</div>
              <div className="v3p-vip-sent-sub">Un host dédié te recontacte sous 24h. Redirection vers ton bonus…</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
