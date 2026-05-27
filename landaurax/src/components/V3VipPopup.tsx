// ─────────────────────────────────────────────────────────────────────────────
// V3VipPopup — popup dediee a la capture VIP gros joueurs.
//
// UI ultra simple : couronne + titre chrome + sous-titre + input email +
// bouton envoyer. Aucun bouton retour (croix close en haut suffit), aucun
// bloc detache. Tout dans un seul flow visuel coherent.
//
// Lead envoye au meme endpoint que V3OfferPopup : /api/public/affi-vip-leads
// Portal vers document.body (echappe le containing block du editor preview).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { createPortal } from "react-dom";

export type V3VipPopupProps = {
  open: boolean;
  onClose: () => void;
  /** Lien d'affi vers lequel rediriger apres submit reussi (optionnel). */
  href?: string;
  /** Theme accent (defaut or). */
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgCard?: string;
  };
  /** Titre principal. */
  title?: string;
  /** Sous-titre court. */
  subtitle?: string;
};

type Mode = "idle" | "sending" | "sent" | "error";

export function V3VipPopup({
  open, onClose, href: _href, theme,
  title = "Programme VIP exclusif",
  subtitle = "Tu déposes entre 500€ et 1 000€ par mois (ou plus) ? Tu mérites un traitement à la hauteur.",
}: V3VipPopupProps) {
  const [email, setEmail] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("idle");
  const [error, setError] = React.useState<string | null>(null);

  // Reset state quand le popup s'ouvre
  React.useEffect(() => {
    if (open) {
      setEmail("");
      setMode("idle");
      setError(null);
    }
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const accent = theme?.accent || "#FFB930";
  const accentLight = theme?.accentLight || "#FFE9D6";
  const accentGlow = theme?.accentGlow || "rgba(255,185,48,.55)";
  const bgCard = theme?.bgCard || "#0F1B3D";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Email invalide");
      setMode("error");
      return;
    }
    setError(null);
    setMode("sending");
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
    // Pas d'auto-redirect : l'user doit lire les infos mail (boite/spam/promo)
    // avant de fermer. Il ferme la popup quand il veut via la croix.
  };

  return createPortal((
    <div
      className="v3vip-overlay"
      onClick={onClose}
      style={{
        ["--v3vip-accent" as any]: accent,
        ["--v3vip-accent-light" as any]: accentLight,
        ["--v3vip-accent-glow" as any]: accentGlow,
        ["--v3vip-bg-card" as any]: bgCard,
      }}
    >
      <style>{`
        .v3vip-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;
          background:rgba(2,6,23,.84);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          animation:v3vip-fade .25s ease-out}
        .v3vip-card{position:relative;width:100%;max-width:420px;padding:30px 26px 26px;border-radius:24px;text-align:center;overflow:hidden;
          background:
            radial-gradient(120% 80% at 50% 0%, ${accent}26 0%, transparent 60%),
            linear-gradient(180deg, ${bgCard}, ${bgCard}f0);
          border:1.5px solid ${accent}66;
          box-shadow:0 0 0 1px ${accent}22 inset, 0 30px 80px ${accentGlow}, 0 0 60px ${accentGlow}55;
          animation:v3vip-pop .35s cubic-bezier(.2,1.4,.5,1) both}
        /* Conic border anime */
        .v3vip-card::before{content:"";position:absolute;inset:-1.5px;border-radius:24px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--vip-ang,0deg), ${accent}, ${accentLight}, ${accent}, ${accent});
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;
          animation:v3vip-spin 5s linear infinite;opacity:.7}
        @property --vip-ang{syntax:'<angle>';inherits:false;initial-value:0deg}

        .v3vip-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;
          background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.12);color:#e2e8f0;
          font-size:18px;cursor:pointer;z-index:2;
          display:flex;align-items:center;justify-content:center;
          transition:background .2s,transform .15s}
        .v3vip-close:hover{background:rgba(15,23,42,.9);transform:scale(1.08)}

        .v3vip-crown-wrap{position:relative;width:72px;height:72px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center}
        .v3vip-crown-halo{position:absolute;inset:-20%;border-radius:50%;
          background:radial-gradient(circle, ${accentGlow} 0%, transparent 60%);
          filter:blur(14px);animation:v3vip-halo 2.4s ease-in-out infinite}
        .v3vip-crown{position:relative;font-size:3rem;line-height:1;
          filter:drop-shadow(0 4px 14px ${accentGlow});
          animation:v3vip-crown-bob 3s ease-in-out infinite}

        .v3vip-title{margin:0;font-family:"Bagel Fat One","Inter",cursive;font-size:1.85rem;line-height:1.1;letter-spacing:.01em;
          background:linear-gradient(180deg, #fff 0%, ${accentLight} 35%, ${accent} 70%, #8a6724 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 3px 10px ${accentGlow})}
        .v3vip-subtitle{margin:10px 0 0;font-size:.92rem;line-height:1.5;color:rgba(255,255,255,.85);font-weight:500}
        .v3vip-subtitle strong{color:${accent};font-weight:800}

        .v3vip-perks{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:14px 0 0}
        .v3vip-perk{font-size:.7rem;font-weight:700;padding:5px 10px;border-radius:999px;
          background:${accent}1a;border:1px solid ${accent}55;color:#fff;letter-spacing:.02em}

        .v3vip-form{margin:18px 0 0;display:flex;gap:8px;flex-wrap:wrap}
        .v3vip-input{flex:1;min-width:180px;padding:14px 16px;border-radius:14px;
          border:1.5px solid rgba(255,255,255,.18);background:rgba(0,0,0,.45);color:#fff;
          font:inherit;font-size:.95rem;outline:none;transition:border-color .2s,box-shadow .2s}
        .v3vip-input:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}33}
        .v3vip-input::placeholder{color:rgba(255,255,255,.4)}

        .v3vip-submit{padding:14px 22px;border-radius:14px;border:none;cursor:pointer;
          font:inherit;font-size:.92rem;font-weight:900;letter-spacing:.06em;color:#1a0f08;
          background:linear-gradient(135deg, ${accent}, ${accentLight});
          box-shadow:0 6px 22px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,.45);
          text-shadow:0 1px 0 rgba(255,255,255,.3);
          transition:transform .12s,filter .2s;white-space:nowrap}
        .v3vip-submit:hover{filter:brightness(1.08)}
        .v3vip-submit:active{transform:scale(.97)}
        .v3vip-submit:disabled{opacity:.6;cursor:wait}

        .v3vip-error{margin:10px 0 0;font-size:.78rem;color:#FCA5A5;font-weight:700;text-align:center}

        .v3vip-trust{margin:14px 0 0;display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:.66rem;opacity:.6;font-weight:600;letter-spacing:.04em}
        .v3vip-trust span{display:flex;align-items:center;gap:5px}
        .v3vip-trust span::before{content:"";width:5px;height:5px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}

        /* Success state */
        .v3vip-success{display:flex;flex-direction:column;align-items:center;padding:24px 8px 8px;animation:v3vip-success-in .4s cubic-bezier(.2,1.4,.5,1) both}
        .v3vip-success-check{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#86efac);
          display:flex;align-items:center;justify-content:center;color:#0a3320;font-size:2rem;font-weight:900;
          box-shadow:0 0 0 6px rgba(34,197,94,.18),0 12px 30px rgba(34,197,94,.5)}
        .v3vip-success-title{margin:14px 0 0;font-size:1.15rem;font-weight:900;color:#86EFAC}
        .v3vip-success-sub{margin:6px 0 0;font-size:.85rem;opacity:.85;line-height:1.5}
        /* Carte mail : explique au user qu'un mail vient d'arriver dans sa boite */
        .v3vip-mail-card{margin:18px 0 8px;width:100%;padding:14px 16px;border-radius:14px;text-align:left;
          background:linear-gradient(135deg,${accent}1f,${accentLight}14);
          border:1.5px solid ${accent}66;
          box-shadow:0 6px 20px ${accentGlow}55, inset 0 1px 0 rgba(255,255,255,.08)}
        .v3vip-mail-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;
          background:linear-gradient(135deg,${accent},${accentLight});color:#1a0f08;font-size:1.1rem;flex-shrink:0;
          box-shadow:0 4px 10px ${accentGlow}}
        .v3vip-mail-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .v3vip-mail-head-title{font-size:.95rem;font-weight:900;color:#fff;letter-spacing:.01em}
        .v3vip-mail-meta{font-size:.78rem;line-height:1.55;color:rgba(255,255,255,.85)}
        .v3vip-mail-meta strong{color:${accent};font-weight:800}
        .v3vip-mail-meta code{background:rgba(0,0,0,.4);padding:1px 6px;border-radius:4px;font-size:.74rem;color:#fff;font-family:'SF Mono','Consolas',monospace}
        .v3vip-mail-hint{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .v3vip-mail-folder{font-size:.7rem;font-weight:700;padding:4px 9px;border-radius:6px;
          background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;letter-spacing:.02em}

        @keyframes v3vip-fade{from{opacity:0}to{opacity:1}}
        @keyframes v3vip-pop{from{opacity:0;transform:scale(.85) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes v3vip-spin{to{--vip-ang:360deg}}
        @keyframes v3vip-halo{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        @keyframes v3vip-crown-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4px) rotate(3deg)}}
        @keyframes v3vip-success-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}

        @media (prefers-reduced-motion:reduce){
          .v3vip-card::before,.v3vip-crown-halo,.v3vip-crown{animation:none !important}
        }
      `}</style>

      <div className="v3vip-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v3vip-close" onClick={onClose} aria-label="Fermer">×</button>

        {mode === "sent" ? (
          <div className="v3vip-success">
            <div className="v3vip-success-check">✓</div>
            <h3 className="v3vip-success-title">Demande reçue !</h3>
            <p className="v3vip-success-sub">Un host VIP dédié te contacte sous 24h sur Telegram.</p>

            {/* Indication mail auto envoyé — guide l'user vers sa boîte */}
            <div className="v3vip-mail-card">
              <div className="v3vip-mail-head">
                <span className="v3vip-mail-icon">📨</span>
                <div className="v3vip-mail-head-title">Un email vient de t'être envoyé</div>
              </div>
              <div className="v3vip-mail-meta">
                Expéditeur&nbsp;: <strong>Aurix VIP</strong> &lt;<code>aurixvip@gmail.com</code>&gt;<br />
                Objet&nbsp;: 👑 Bienvenue au Club VIP Celsius Casino
              </div>
              <div className="v3vip-mail-hint">
                <span className="v3vip-mail-folder">📥 Boîte de réception</span>
                <span className="v3vip-mail-folder">📣 Promotions</span>
                <span className="v3vip-mail-folder">⚠️ Spam</span>
              </div>
              <p className="v3vip-mail-meta" style={{ marginTop: "10px", fontSize: ".75rem", opacity: 0.75 }}>
                Pense à vérifier les <strong>3 dossiers</strong>. Il contient les instructions complètes + le lien direct vers ton host.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="v3vip-crown-wrap">
              <div className="v3vip-crown-halo" />
              <div className="v3vip-crown">👑</div>
            </div>

            <h2 className="v3vip-title">{title}</h2>
            <p className="v3vip-subtitle">{subtitle}</p>

            <div className="v3vip-perks">
              <span className="v3vip-perk">Cashback augmenté</span>
              <span className="v3vip-perk">Bonus exclusifs</span>
              <span className="v3vip-perk">Retraits prioritaires</span>
              <span className="v3vip-perk">Host dédié 24/7</span>
            </div>

            <form className="v3vip-form" onSubmit={submit}>
              <input
                type="email"
                className="v3vip-input"
                placeholder="ton.email@exemple.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (mode === "error") setMode("idle"); }}
                disabled={mode === "sending"}
                required
                autoComplete="email"
                autoFocus
              />
              <button type="submit" className="v3vip-submit" disabled={mode === "sending"}>
                {mode === "sending" ? "..." : "ENVOYER"}
              </button>
            </form>

            {error ? <p className="v3vip-error">{error}</p> : null}

            <div className="v3vip-trust">
              <span>Données chiffrées</span>
              <span>Sans engagement</span>
              <span>Réponse 24h</span>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}
