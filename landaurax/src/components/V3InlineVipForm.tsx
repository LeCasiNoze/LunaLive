// ─────────────────────────────────────────────────────────────────────────────
// V3InlineVipForm — capture email VIP **inline dans la landing** (pas popup).
// Cible : gros joueurs (500€+/mois). Les leads atterrissent dans le meme
// endpoint que le VIP form du V3OfferPopup → /api/public/affi-vip-leads.
//
// Usage : a placer dans une section "Club VIP" en bas de landing M13/M14,
// ou comme tier ultime de M12 (palier Diamond).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type V3InlineVipFormProps = {
  /** Couleur accent (theme.accent). */
  accent: string;
  /** Couleur accent clair (theme.accentLight). */
  accentLight?: string;
  /** Glow color (theme.accentGlow). */
  accentGlow?: string;
  /** Lien d'affiliation cible (ouvert apres submit reussi). */
  href: string;
  /** Titre court personnalisable (defaut "Club VIP — gros joueurs"). */
  title?: string;
  /** Sous-titre court personnalisable. */
  subtitle?: string;
  /** Texte du bouton submit. */
  ctaLabel?: string;
  /** Layout compact (pour palier dans une card) vs full (pour section dediee). */
  variant?: "card" | "section";
};

type Mode = "idle" | "sending" | "sent" | "error";

export function V3InlineVipForm({
  accent,
  accentLight,
  accentGlow,
  href,
  title = "Club VIP — Gros joueurs (500€+/mois)",
  subtitle = "Un host dédié te contacte sous 24h : bonus exclusifs, cashback augmenté, suivi personnalisé.",
  ctaLabel = "Demander mon host VIP",
  variant = "section",
}: V3InlineVipFormProps) {
  const [email, setEmail] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Email invalide"); setMode("error"); return;
    }
    setError(null); setMode("sending");
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
        body: JSON.stringify({ slug: slug || "unknown", email: v, referrer: document.referrer || null }),
      });
    } catch { /* lead perdu mais on continue */ }
    try { window.parent?.postMessage({ type: "v3-vip-lead", email: v, slug }, "*"); } catch { /* noop */ }
    setMode("sent");
    window.setTimeout(() => {
      try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
    }, 1600);
  };

  const glow = accentGlow || `${accent}55`;
  const light = accentLight || accent;

  return (
    <div className={`v3vip v3vip-${variant}`}>
      <style>{`
        .v3vip{position:relative;border-radius:20px;background:linear-gradient(135deg,rgba(0,0,0,.5),rgba(0,0,0,.25));
          border:1.5px solid ${accent}55;box-shadow:0 0 0 1px ${accent}22 inset, 0 10px 40px ${glow};
          color:#fff;font-family:'Inter','Space Grotesk',sans-serif}
        .v3vip-section{padding:24px 22px;max-width:460px;margin:24px auto}
        .v3vip-card{padding:18px 16px;margin-top:14px}
        .v3vip-crown{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;
          background:linear-gradient(135deg,${accent},${light});color:#000;font-size:1.4rem;margin-bottom:10px;
          box-shadow:0 6px 20px ${glow}}
        .v3vip-title{margin:0;font-size:1.05rem;font-weight:900;letter-spacing:.02em;line-height:1.25;color:#fff}
        .v3vip-sub{margin:6px 0 14px;font-size:.82rem;opacity:.75;line-height:1.5}
        .v3vip-form{display:flex;gap:8px;flex-wrap:wrap}
        .v3vip-input{flex:1;min-width:0;padding:14px 14px;border-radius:12px;border:1.5px solid rgba(255,255,255,.15);
          background:rgba(0,0,0,.4);color:#fff;font-size:.92rem;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s}
        .v3vip-input:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}33}
        .v3vip-input::placeholder{color:rgba(255,255,255,.4)}
        .v3vip-btn{padding:14px 20px;border-radius:12px;border:none;cursor:pointer;
          background:linear-gradient(135deg,${accent},${light});color:#000;font-weight:900;font-size:.85rem;letter-spacing:.04em;
          box-shadow:0 6px 22px ${glow},inset 0 1px 0 rgba(255,255,255,.35);
          transition:transform .12s,filter .2s;font-family:inherit;white-space:nowrap}
        .v3vip-btn:hover{filter:brightness(1.08)}
        .v3vip-btn:active{transform:scale(.97)}
        .v3vip-btn:disabled{opacity:.6;cursor:wait}
        .v3vip-error{margin:8px 0 0;font-size:.78rem;color:#FCA5A5;font-weight:600}
        .v3vip-success{padding:18px 14px;text-align:center;border-radius:14px;
          background:linear-gradient(135deg,rgba(52,211,153,.2),rgba(52,211,153,.08));border:1px solid rgba(52,211,153,.4)}
        .v3vip-success-icon{font-size:2rem;margin-bottom:8px}
        .v3vip-success-title{margin:0;font-weight:800;font-size:1rem;color:#86EFAC}
        .v3vip-success-sub{margin:6px 0 0;font-size:.78rem;opacity:.85}
        .v3vip-perks{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 14px}
        .v3vip-perk{font-size:.7rem;padding:5px 10px;border-radius:999px;background:${accent}1a;border:1px solid ${accent}55;color:#fff;font-weight:600}
      `}</style>

      {mode === "sent" ? (
        <div className="v3vip-success">
          <div className="v3vip-success-icon">👑</div>
          <p className="v3vip-success-title">Email reçu — un host VIP te contacte sous 24h</p>
          <p className="v3vip-success-sub">Redirection vers ton bonus…</p>
        </div>
      ) : (
        <>
          <div className="v3vip-crown">👑</div>
          <h3 className="v3vip-title">{title}</h3>
          <p className="v3vip-sub">{subtitle}</p>
          <div className="v3vip-perks">
            <span className="v3vip-perk">✓ Cashback augmenté</span>
            <span className="v3vip-perk">✓ Bonus exclusifs</span>
            <span className="v3vip-perk">✓ Retraits prioritaires</span>
          </div>
          <form className="v3vip-form" onSubmit={submit}>
            <input
              className="v3vip-input"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="ton.email@exemple.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (mode === "error") setMode("idle"); }}
              disabled={mode === "sending"}
            />
            <button className="v3vip-btn" type="submit" disabled={mode === "sending"}>
              {mode === "sending" ? "Envoi…" : ctaLabel}
            </button>
          </form>
          {error ? <p className="v3vip-error">{error}</p> : null}
        </>
      )}
    </div>
  );
}
