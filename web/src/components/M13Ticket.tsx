// ─────────────────────────────────────────────────────────────────────────────
// M13 — "Urgency Scarcity" : landing conversion brutale.
// Hero countdown XL (24h), barre de places restantes (35/50), live activity
// feed (gens qui reclament en temps reel), trust badges, double CTA bonus
// standard + section VIP capture email inline.
//
// Levers conversion :
//   - urgence temporelle (timer compte a rebours visible toujours)
//   - rarete (places restantes diminuent)
//   - preuve sociale (live feed de reservations)
//   - autorite (badges licence, paiement)
//   - capture VIP inline → recontact gros joueurs
//
// Respecte regles V3 : theme/pseudoStyle/X/Y/V3OfferPopup/V3SocialProof.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3InlineVipForm } from "./V3InlineVipForm";
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

const ACTIVITY_NAMES = [
  "Marc L.", "Sofia R.", "Karim B.", "Léa M.", "Yanis D.", "Inès K.",
  "Théo P.", "Nora S.", "Rayan T.", "Camille H.", "Mehdi A.", "Anaïs G.",
];

export function M13Ticket({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M13TicketProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
  };
  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus");

  const [popupOpen, setPopupOpen] = React.useState(false);
  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  // ─── Countdown 24h ─────────────────────────────────────────────────────────
  const targetMs = React.useMemo(() => {
    // Cible : minuit prochain + offset aleatoire 0-6h pour effet "expire bientot"
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime() - Math.floor(Math.random() * 6 * 3600 * 1000);
  }, []);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const remain = Math.max(0, targetMs - now);
  const hh = Math.floor(remain / 3600000);
  const mm = Math.floor((remain % 3600000) / 60000);
  const ss = Math.floor((remain % 60000) / 1000);

  // ─── Places restantes : decremente lentement ───────────────────────────────
  const [seatsLeft, setSeatsLeft] = React.useState(() => 28 + Math.floor(Math.random() * 12));
  const TOTAL_SEATS = 50;
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setSeatsLeft((s) => Math.max(7, s - (Math.random() < 0.3 ? 1 : 0)));
    }, 18000);
    return () => window.clearInterval(id);
  }, []);
  const seatsPct = (seatsLeft / TOTAL_SEATS) * 100;

  // ─── Live activity feed ────────────────────────────────────────────────────
  const [activities, setActivities] = React.useState<Array<{ id: number; name: string; amount: number; ago: string }>>(() => {
    return Array.from({ length: 3 }).map((_, i) => ({
      id: i,
      name: ACTIVITY_NAMES[Math.floor(Math.random() * ACTIVITY_NAMES.length)],
      amount: 50 + Math.floor(Math.random() * 450),
      ago: `${i * 2 + 1} min`,
    }));
  });
  React.useEffect(() => {
    let nextId = 100;
    const id = window.setInterval(() => {
      setActivities((prev) => {
        const newItem = {
          id: nextId++,
          name: ACTIVITY_NAMES[Math.floor(Math.random() * ACTIVITY_NAMES.length)],
          amount: 50 + Math.floor(Math.random() * 450),
          ago: "à l'instant",
        };
        return [newItem, ...prev.map((p, i) => ({ ...p, ago: i === 0 ? "1 min" : `${i * 2 + 1} min` }))].slice(0, 4);
      });
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m13-root">
      <style>{`
        .m13-root{position:relative;min-height:100vh;padding:0 0 160px;background:
          radial-gradient(80% 50% at 50% -5%,${T.accent}22 0%,transparent 60%),
          ${T.bgPage};
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff}

        /* ─── Top urgency banner ─── */
        .m13-top{padding:16px;background:linear-gradient(135deg,#dc2626,#ef4444);text-align:center;
          box-shadow:0 4px 18px rgba(220,38,38,.45);position:sticky;top:0;z-index:30}
        .m13-top-label{font-size:.66rem;letter-spacing:.34em;text-transform:uppercase;font-weight:800;opacity:.9;margin:0 0 6px}
        .m13-top-timer{display:flex;justify-content:center;gap:6px;align-items:center}
        .m13-top-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;width:54px;height:54px;border-radius:10px;
          background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.18);font-variant-numeric:tabular-nums}
        .m13-top-cell-num{font-size:1.35rem;font-weight:900;line-height:1;letter-spacing:-.02em}
        .m13-top-cell-lbl{font-size:.5rem;letter-spacing:.18em;opacity:.7;text-transform:uppercase;margin-top:3px}
        .m13-top-sep{font-size:1.3rem;opacity:.5;font-weight:900;animation:m13-blink 1s ease-in-out infinite}

        /* ─── Hero ─── */
        .m13-hero{padding:26px 18px 14px;max-width:460px;margin:0 auto;text-align:center}
        .m13-avatar{width:68px;height:68px;border-radius:50%;margin:0 auto 12px;overflow:hidden;border:2.5px solid ${T.accent};
          box-shadow:0 0 0 3px rgba(0,0,0,.4),0 10px 28px ${T.accentGlow}}
        .m13-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m13-avatar-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;opacity:.4}
        .m13-pseudo{margin:0;line-height:1.1}
        .m13-pre{margin:14px 0 6px;font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;opacity:.6;color:${T.accentLight}}
        .m13-headline{margin:0;font-size:clamp(1.9rem,7vw,2.6rem);line-height:1.05;font-weight:900;letter-spacing:-.025em}
        .m13-headline em{font-style:normal;background:linear-gradient(180deg,${T.accent},${T.accentLight});
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 14px ${T.accentGlow})}

        /* ─── Prize card ─── */
        .m13-prize{margin:22px auto 0;max-width:420px;padding:24px 22px;border-radius:22px;text-align:center;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});border:1.5px solid ${T.accent}55;
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 22px 60px ${T.accentGlow}80}
        .m13-prize-label{font-size:.66rem;letter-spacing:.3em;text-transform:uppercase;opacity:.65;margin:0}
        .m13-prize-dep{margin:8px 0 0;font-size:.86rem;font-weight:700;opacity:.85}
        .m13-prize-dep strong{color:${T.accent};font-weight:900}
        .m13-prize-amount{margin:10px 0 0;font-size:clamp(3.4rem,12vw,4.6rem);font-weight:900;line-height:.95;letter-spacing:-.035em;
          background:linear-gradient(180deg,#fff,${T.accent} 60%,${T.accentLight} 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 24px ${T.accentGlow})}
        .m13-prize-sub{margin:6px 0 0;font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;opacity:.6}

        /* ─── Seats bar ─── */
        .m13-seats{margin:18px auto 0;max-width:420px;padding:14px 16px;border-radius:14px;
          background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08)}
        .m13-seats-top{display:flex;justify-content:space-between;align-items:center;font-size:.74rem;font-weight:700;margin-bottom:8px}
        .m13-seats-top-label{opacity:.7;letter-spacing:.05em;display:flex;align-items:center;gap:6px}
        .m13-seats-top-label::before{content:"";width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;animation:m13-blink 1.2s ease-in-out infinite}
        .m13-seats-count{color:#ef4444;font-weight:900;font-size:.82rem;font-variant-numeric:tabular-nums}
        .m13-seats-track{position:relative;height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
        .m13-seats-fill{position:absolute;top:0;left:0;height:100%;border-radius:99px;
          background:linear-gradient(90deg,${T.accent},${T.accentLight});transition:width .6s ease;
          box-shadow:0 0 12px ${T.accentGlow}}

        /* ─── CTA principal ─── */
        .m13-cta-wrap{padding:20px 16px 8px;max-width:420px;margin:0 auto}
        .m13-cta{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:22px;border-radius:18px;
          font-family:inherit;font-size:1.1rem;font-weight:900;letter-spacing:.05em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 40px ${T.accentGlow},0 18px 40px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m13-breath 2.2s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m13-cta:active{transform:scale(.97)}
        .m13-cta::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m13-cta-sub{margin:10px 0 0;font-size:.72rem;text-align:center;opacity:.65}

        /* ─── Live activity ─── */
        .m13-live{padding:20px 16px;max-width:460px;margin:0 auto}
        .m13-live-title{display:flex;align-items:center;justify-content:center;gap:8px;font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;opacity:.7;margin:0 0 14px}
        .m13-live-title::before{content:"";width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:m13-blink 1.3s ease-in-out infinite}
        .m13-live-list{display:flex;flex-direction:column;gap:8px}
        .m13-live-item{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;
          background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);font-size:.85rem}
        .m13-live-ava{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;font-size:.82rem;flex-shrink:0;border:1.5px solid rgba(255,255,255,.9)}
        .m13-live-text{flex:1;min-width:0}
        .m13-live-text strong{font-weight:700}
        .m13-live-text em{font-style:normal;color:${T.accent};font-weight:800}
        .m13-live-time{font-size:.7rem;opacity:.5;white-space:nowrap}

        /* ─── Trust strip ─── */
        .m13-trust{padding:14px 16px;max-width:460px;margin:0 auto;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .m13-trust-item{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);font-size:.74rem;font-weight:600}
        .m13-trust-icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:${T.accent}22;color:${T.accent};font-size:.85rem;flex-shrink:0}

        /* ─── VIP section ─── */
        .m13-vip-section{padding:8px 16px 16px;max-width:480px;margin:0 auto}

        /* ─── Footer ─── */
        .m13-footer{padding:18px 22px 10px;text-align:center;opacity:.5;font-size:.66rem;line-height:1.7;max-width:460px;margin:0 auto}
        .m13-footer strong{color:#fff;font-weight:700}

        /* ─── Sticky CTA ─── */
        .m13-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 14px 16px;
          background:linear-gradient(to top,${T.bgPage} 55%,${T.bgPage}dd 85%,transparent)}
        .m13-sticky-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;max-width:420px;margin:0 auto;padding:16px;border-radius:16px;
          font-family:inherit;font-size:.98rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}55;text-shadow:0 1px 0 rgba(255,255,255,.3)}

        @keyframes m13-blink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes m13-breath{0%,100%{box-shadow:0 0 40px ${T.accentGlow},0 18px 40px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 60px ${T.accentLight},0 18px 40px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m13-top-sep,.m13-cta{animation:none !important}
        }
      `}</style>

      {/* Top urgency banner */}
      <div className="m13-top">
        <p className="m13-top-label">⚡ Cette offre expire dans</p>
        <div className="m13-top-timer">
          <div className="m13-top-cell">
            <div className="m13-top-cell-num">{String(hh).padStart(2,"0")}</div>
            <div className="m13-top-cell-lbl">Heures</div>
          </div>
          <div className="m13-top-sep">:</div>
          <div className="m13-top-cell">
            <div className="m13-top-cell-num">{String(mm).padStart(2,"0")}</div>
            <div className="m13-top-cell-lbl">Min</div>
          </div>
          <div className="m13-top-sep">:</div>
          <div className="m13-top-cell">
            <div className="m13-top-cell-num">{String(ss).padStart(2,"0")}</div>
            <div className="m13-top-cell-lbl">Sec</div>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="m13-hero">
        <div className="m13-avatar">
          {profileImageUrl ? <img src={profileImageUrl} alt={pseudo || ""} /> : <div className="m13-avatar-empty">👤</div>}
        </div>
        {pseudo ? <h1 className="m13-pseudo" style={nameStyle}>{pseudo}</h1> : null}
        <p className="m13-pre">Offre exclusive partenaire</p>
        <h2 className="m13-headline">Réclame ton<br /><em>bonus avant minuit</em></h2>

        <div className="m13-prize">
          <p className="m13-prize-label">Tu reçois</p>
          {dep ? <p className="m13-prize-dep">Dépose seulement <strong>{dep}</strong></p> : null}
          <div className="m13-prize-amount">+{bon || "BONUS"}</div>
          <p className="m13-prize-sub">Crédité instantanément</p>
        </div>

        <div className="m13-seats">
          <div className="m13-seats-top">
            <span className="m13-seats-top-label">Places restantes aujourd'hui</span>
            <span className="m13-seats-count">{seatsLeft} / {TOTAL_SEATS}</span>
          </div>
          <div className="m13-seats-track">
            <div className="m13-seats-fill" style={{ width: `${seatsPct}%` }} />
          </div>
        </div>
      </section>

      {/* CTA principal */}
      <section className="m13-cta-wrap">
        <a className="m13-cta v3-cta" href={safeAffi} onClick={onCta}>
          RÉCLAMER {bon || "MON BONUS"} MAINTENANT
        </a>
        <p className="m13-cta-sub">Inscription en 30s · 100% sécurisé · Sans CB requise</p>
      </section>

      {/* Live activity feed */}
      <section className="m13-live">
        <p className="m13-live-title">En direct sur la page</p>
        <div className="m13-live-list">
          <AnimatePresence initial={false}>
            {activities.map((a) => (
              <motion.div
                key={a.id}
                className="m13-live-item"
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, padding: 0, margin: 0 }}
                transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="m13-live-ava">{a.name[0]}</div>
                <div className="m13-live-text">
                  <strong>{a.name}</strong> a réclamé <em>+{a.amount}€</em>
                </div>
                <div className="m13-live-time">{a.ago}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Trust badges */}
      <div className="m13-trust">
        <div className="m13-trust-item"><span className="m13-trust-icon">✓</span> Licence officielle</div>
        <div className="m13-trust-item"><span className="m13-trust-icon">🔒</span> Paiement sécurisé</div>
        <div className="m13-trust-item"><span className="m13-trust-icon">⚡</span> Retrait sous 24h</div>
        <div className="m13-trust-item"><span className="m13-trust-icon">👥</span> +12K joueurs</div>
      </div>

      {/* VIP capture section */}
      <section className="m13-vip-section">
        <V3InlineVipForm
          accent={T.accent}
          accentLight={T.accentLight}
          accentGlow={T.accentGlow}
          href={safeAffi}
          title="Tu déposes plus de 100€ par mois ?"
          subtitle="Active ton statut VIP — un host dédié t'accompagne avec bonus exclusifs, cashback augmenté et retraits prioritaires."
          ctaLabel="Activer mon VIP"
        />
      </section>

      <footer className="m13-footer">
        <p>
          Jeu réservé aux 18+. Les jeux d'argent comportent des risques.
          Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
        </p>
      </footer>

      <div className="m13-sticky">
        <a className="m13-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          🚀 RÉCLAMER {bon || "MON BONUS"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Réservation de ta place", "Validation du bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
