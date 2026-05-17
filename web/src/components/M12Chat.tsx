// ─────────────────────────────────────────────────────────────────────────────
// M12 — "Chat" : conversation simulée style iMessage / Discord. Le streamer
// raconte sa victoire à un pote, bulles qui apparaissent progressivement avec
// typing indicator, image preview (screenshot gain), puis CTA "ouvrir
// l'invitation". Format engagement viral, mobile-first natif.
//
// Respecte les regles V3 :
//   - theme (M1Theme) : accent / accentLight / accentGlow / bgPage / bgCard
//   - pseudoStyle (V3LineStyle) : font / color / size / weight / glow appliquees
//     au nom du contact en header
//   - X (depositAmount) / Y (bonusAmount) : affichees dans la bulle de victoire
//   - V3OfferPopup au CTA + V3SocialProof
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { pseudoTextStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M12ChatProps = {
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

type Bubble =
  | { side: "in"; kind: "text"; content: string; delay: number }
  | { side: "in"; kind: "image"; content: string; delay: number }
  | { side: "out"; kind: "text"; content: string; delay: number }
  | { side: "in"; kind: "cta"; content: string; delay: number };

export function M12Chat({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M12ChatProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
  };
  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const popupSteps = React.useMemo(() => [
    "Confirmation de l'invitation",
    "Génération du lien",
    "Lien prêt",
  ], []);

  const [popupOpen, setPopupOpen] = React.useState(false);
  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  // Sequence de bulles. Delays cumulatifs (en ms).
  const sequence: Bubble[] = React.useMemo(() => {
    const winText = bon ? `Frérot j'ai claqué ${bon} en 30 minutes 😭🔥` : `Frérot j'ai claqué un bonus de fou en 30 min 😭🔥`;
    const depText = dep ? `j'ai mis ${dep} sur leur promo` : `j'ai utilisé leur promo`;
    return [
      { side: "in",  kind: "text",  content: "Yo t'es là ?",                                    delay: 300 },
      { side: "out", kind: "text",  content: "Wesh quoi de neuf",                                delay: 1100 },
      { side: "in",  kind: "text",  content: winText,                                            delay: 2100 },
      { side: "in",  kind: "text",  content: depText,                                            delay: 3000 },
      { side: "out", kind: "text",  content: "Sérieux ?? T'as une preuve ?",                    delay: 3800 },
      { side: "in",  kind: "image", content: "WIN",                                              delay: 5000 },
      { side: "out", kind: "text",  content: "OK je veux le lien",                               delay: 6300 },
      { side: "in",  kind: "text",  content: "Tiens fais vite avant que ça parte 👇",            delay: 7000 },
      { side: "in",  kind: "cta",   content: bon ? `RÉCLAMER ${bon}` : "OUVRIR L'INVITATION",   delay: 7800 },
    ];
  }, [dep, bon]);

  const [visibleCount, setVisibleCount] = React.useState(0);
  const [typing, setTyping] = React.useState<"in" | "out" | null>("in");

  React.useEffect(() => {
    const timers: number[] = [];
    sequence.forEach((b, i) => {
      // typing indicator 600ms avant chaque bulle
      timers.push(window.setTimeout(() => setTyping(b.side), Math.max(0, b.delay - 700)));
      timers.push(window.setTimeout(() => {
        setTyping(null);
        setVisibleCount(i + 1);
      }, b.delay));
    });
    return () => { timers.forEach((id) => window.clearTimeout(id)); };
  }, [sequence]);

  const visible = sequence.slice(0, visibleCount);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount, typing]);

  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m12-root">
      <style>{`
        .m12-root{position:relative;min-height:100vh;background:
          radial-gradient(80% 50% at 50% 0%,${T.accent}22 0%,transparent 70%),${T.bgPage};
          font-family:-apple-system,'SF Pro Text','Inter',sans-serif;color:#fff;padding-bottom:160px}
        .m12-phone{max-width:420px;margin:0 auto;padding:20px 14px 8px}
        .m12-header{display:flex;align-items:center;gap:12px;padding:14px 14px 12px;border-radius:18px 18px 0 0;
          background:rgba(255,255,255,.05);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-bottom:none}
        .m12-back{font-size:1.4rem;color:${T.accent};margin-right:2px}
        .m12-avatar{width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${T.accent};
          background:linear-gradient(135deg,${T.bgCard},${T.bgPage})}
        .m12-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m12-avatar-empty{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.4rem;opacity:.4}
        .m12-meta{flex:1;min-width:0}
        .m12-name{margin:0;line-height:1.1}
        .m12-status{margin:2px 0 0;font-size:.7rem;color:#34d399;font-weight:600;display:flex;align-items:center;gap:5px}
        .m12-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}

        .m12-chat{height:60vh;min-height:480px;max-height:580px;overflow-y:auto;padding:20px 14px;background:
          linear-gradient(180deg,${T.bgCard}cc 0%,${T.bgPage}cc 100%);
          border:1px solid rgba(255,255,255,.08);border-top:none;border-radius:0 0 18px 18px;
          backdrop-filter:blur(20px);scroll-behavior:smooth}
        .m12-chat::-webkit-scrollbar{width:4px}
        .m12-chat::-webkit-scrollbar-thumb{background:${T.accent}44;border-radius:4px}

        .m12-bubble-wrap{display:flex;margin-bottom:8px;animation:m12-pop .35s cubic-bezier(.2,.7,.2,1) both}
        .m12-bubble-wrap.out{justify-content:flex-end}
        .m12-bubble-wrap.in{justify-content:flex-start}
        .m12-bubble{max-width:78%;padding:10px 14px;border-radius:18px;font-size:.95rem;line-height:1.4;word-wrap:break-word;
          box-shadow:0 1px 0 rgba(0,0,0,.2)}
        .m12-bubble.in{background:rgba(255,255,255,.1);border-bottom-left-radius:6px;color:#fff}
        .m12-bubble.out{background:linear-gradient(135deg,${T.accent},${T.accentLight});border-bottom-right-radius:6px;color:#000;font-weight:600;text-shadow:0 1px 0 rgba(255,255,255,.2)}

        .m12-typing{display:inline-flex;gap:4px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.1);border-bottom-left-radius:6px;margin-bottom:8px}
        .m12-typing.out{background:linear-gradient(135deg,${T.accent}cc,${T.accentLight}cc)}
        .m12-typing span{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.6;animation:m12-typing 1.2s ease-in-out infinite}
        .m12-typing span:nth-child(2){animation-delay:.18s}
        .m12-typing span:nth-child(3){animation-delay:.36s}

        .m12-img-bubble{max-width:78%;padding:6px;border-radius:18px;background:rgba(255,255,255,.1);border-bottom-left-radius:6px;
          box-shadow:0 4px 16px rgba(0,0,0,.4)}
        .m12-img-fake{position:relative;width:240px;aspect-ratio:9/16;border-radius:14px;overflow:hidden;
          background:linear-gradient(135deg,${T.bgPage},${T.bgCard});display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;border:1.5px solid ${T.accent}55}
        .m12-img-label{font-size:.62rem;font-weight:700;letter-spacing:.2em;opacity:.6;text-transform:uppercase}
        .m12-img-amount{margin-top:8px;font-family:"Bagel Fat One","Inter",cursive;font-size:2.6rem;line-height:1;
          background:linear-gradient(180deg,#fff,${T.accent});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 0 18px ${T.accentGlow})}
        .m12-img-tag{margin-top:12px;font-size:.7rem;color:#34d399;font-weight:700}

        .m12-cta-bubble{display:inline-flex;align-items:center;gap:10px;max-width:78%;padding:14px 22px;border-radius:18px;border-bottom-left-radius:6px;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;font-size:1rem;letter-spacing:.04em;
          box-shadow:0 8px 26px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5);text-decoration:none;cursor:pointer;
          animation:m12-pulse 2.2s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3)}
        .m12-cta-bubble::after{content:"→";font-size:1.2rem;margin-left:4px}

        .m12-input-fake{margin-top:10px;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.85rem;color:rgba(255,255,255,.4)}
        .m12-input-fake span{flex:1}
        .m12-input-fake i{font-style:normal;color:${T.accent};opacity:.6}

        .m12-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:14px 16px 18px;
          background:linear-gradient(to top,${T.bgPage} 50%,${T.bgPage}dd 85%,transparent)}
        .m12-sticky-cta{display:flex;align-items:center;justify-content:center;width:100%;max-width:400px;margin:0 auto;
          padding:18px;border-radius:18px;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m12-pulse 2.4s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3)}

        .m12-footer{padding:20px 18px 14px;text-align:center;opacity:.5;font-size:.68rem;line-height:1.6;max-width:420px;margin:0 auto}
        .m12-footer strong{color:#fff;font-weight:700}

        @keyframes m12-pop{from{opacity:0;transform:translateY(8px) scale(.95)}to{opacity:1;transform:none}}
        @keyframes m12-typing{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
        @keyframes m12-pulse{0%,100%{box-shadow:0 8px 26px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 8px 36px ${T.accentLight},inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m12-bubble-wrap,.m12-cta-bubble,.m12-sticky-cta,.m12-typing span{animation:none !important}
        }
      `}</style>

      <div className="m12-phone">
        <div className="m12-header">
          <div className="m12-back">‹</div>
          <div className="m12-avatar">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt={pseudo || ""} />
            ) : (
              <div className="m12-avatar-empty">👤</div>
            )}
          </div>
          <div className="m12-meta">
            <h2 className="m12-name" style={{ ...nameStyle, fontSize: "1.05rem" }}>{pseudo || "Le streamer"}</h2>
            <div className="m12-status">En ligne · vu à l'instant</div>
          </div>
          <div style={{ fontSize: "1.3rem", opacity: 0.6 }}>📞</div>
        </div>

        <div className="m12-chat" ref={scrollRef}>
          {visible.map((b, i) => {
            if (b.kind === "text") {
              return (
                <div key={i} className={`m12-bubble-wrap ${b.side}`}>
                  <div className={`m12-bubble ${b.side}`}>{b.content}</div>
                </div>
              );
            }
            if (b.kind === "image") {
              return (
                <div key={i} className={`m12-bubble-wrap ${b.side}`}>
                  <div className="m12-img-bubble">
                    <div className="m12-img-fake">
                      <div className="m12-img-label">Solde · Casino</div>
                      <div className="m12-img-amount">{bon || "Bonus"}</div>
                      <div className="m12-img-tag">✓ Crédité automatiquement</div>
                    </div>
                  </div>
                </div>
              );
            }
            // cta
            return (
              <div key={i} className={`m12-bubble-wrap ${b.side}`}>
                <a className="m12-cta-bubble v3-cta" href={safeAffi} onClick={onCta}>{b.content}</a>
              </div>
            );
          })}

          {typing && visibleCount < sequence.length ? (
            <div className={`m12-bubble-wrap ${typing}`}>
              <div className={`m12-typing ${typing}`}>
                <span /><span /><span />
              </div>
            </div>
          ) : null}

          <div className="m12-input-fake">
            <span>Message…</span>
            <i>⊕</i>
          </div>
        </div>

        <footer className="m12-footer">
          <p>
            Jeu réservé aux 18+. Les jeux d'argent comportent des risques.
            Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
          </p>
        </footer>
      </div>

      <div className="m12-sticky">
        <a className="m12-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          {bon ? `RÉCLAMER ${bon}` : "OUVRIR L'INVITATION"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
