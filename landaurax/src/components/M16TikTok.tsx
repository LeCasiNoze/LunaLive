import * as React from "react";

export type M16TikTokProps = {
  pseudo?: string;
  profileImageUrl?: string;
  affiLink: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  theme?: any;
  pseudoStyle?: any;
};

const ASSET_BASE = "/affi_templates/m16_tiktok";

const reviews = [
  {
    img: `${ASSET_BASE}/chat-proof-1.webp`,
    name: "Thomas M.",
    text: "Interface simple et rapide, bonus automatique comme annonce.",
    time: "Il y a 2 jours",
  },
  {
    img: `${ASSET_BASE}/chat-proof-2.webp`,
    name: "Laura K.",
    text: "Test avec 20 EUR, tout s'est active directement.",
    time: "Il y a 5 jours",
  },
  {
    img: `${ASSET_BASE}/chat-proof-3.webp`,
    name: "Lena D.",
    text: "Les mini-jeux sont varies et le bonus x2 est vraiment cool.",
    time: "Il y a 1 semaine",
  },
  {
    img: `${ASSET_BASE}/chat-proof-4.webp`,
    name: "Sophie L.",
    text: "La page mobile est claire, inscription rapide.",
    time: "Il y a 1 semaine",
  },
];

const faqItems = [
  {
    q: "Y'a un bonus quand je depose ?",
    a: "Oui, c'est automatique. Des que tu deposes, ton depot est double selon l'offre affichee sur la page.",
  },
  {
    q: "Comment je joue aux mini-jeux ?",
    a: "Tu cliques sur le bouton, tu crees ton compte, puis ton acces est active directement.",
  },
  {
    q: "C'est gratuit de s'inscrire ?",
    a: "Oui, l'inscription est gratuite. Tu choisis ensuite si tu veux deposer pour profiter du bonus.",
  },
  {
    q: "C'est un partenariat ?",
    a: "Oui, c'est un lien d'affiliation officiel. Reserve aux 18+, jouez responsable.",
  },
];

function money(value: number | null | undefined): string {
  return value == null ? "" : `${value} EUR`;
}

export function M16TikTok({
  pseudo,
  profileImageUrl,
  affiLink,
  depositAmount,
  bonusAmount,
}: M16TikTokProps) {
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const safeAffi = affiLink || "#";
  const name = (pseudo || "").trim();
  const dep = money(depositAmount);
  const bon = money(bonusAmount);
  const profile = profileImageUrl?.trim() || "";

  return (
    <div className="m16-root">
      <style>{`
        .m16-root{min-height:100vh;position:relative;overflow-x:hidden;background:radial-gradient(120% 70% at 50% 0%,rgba(138,79,255,.22) 0%,transparent 55%),radial-gradient(80% 50% at 50% 100%,rgba(90,40,180,.16) 0%,transparent 60%),#14082a;color:#fff;font-family:"Chakra Petch","Trebuchet MS",system-ui,sans-serif;padding-bottom:108px}
        .m16-wrap{width:min(100%,430px);margin:0 auto;padding:0 20px}
        .m16-header{display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 20px 12px}
        .m16-avatar-shell{width:78px;height:78px;border-radius:50%;padding:3px;background:linear-gradient(135deg,#ff7a00 0%,#e84393 50%,#8a4fff 100%);box-shadow:0 0 26px rgba(138,79,255,.38)}
        .m16-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#14082a;display:block}
        .m16-name{margin:12px 0 0;font-size:1.05rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
        .m16-card{display:block;position:relative;overflow:hidden;border-radius:28px;border:1px solid rgba(178,140,255,.5);box-shadow:0 0 36px rgba(138,79,255,.3),0 14px 32px rgba(0,0,0,.6);text-decoration:none;color:inherit;transform:translateZ(0)}
        .m16-card:active,.m16-strip:active,.m16-cta:active{transform:scale(.98)}
        .m16-hero-media{position:relative;aspect-ratio:4/5;width:100%;overflow:hidden;background:#210f3f}
        .m16-hero-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .m16-hero-media:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,8,42,.88) 0%,rgba(20,8,42,.38) 46%,transparent 72%)}
        .m16-hero-copy{position:absolute;inset:auto 16px 24px 20px;z-index:2}
        .m16-kicker{display:inline-flex;margin-bottom:12px;border:1px solid rgba(57,255,20,.45);border-radius:999px;padding:6px 10px;background:rgba(57,255,20,.1);color:#89ff75;font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
        .m16-title{margin:0;font-family:Impact,"Arial Black",sans-serif;font-size:clamp(2.05rem,10vw,3.6rem);line-height:.92;letter-spacing:0;text-transform:uppercase;text-shadow:0 2px 14px rgba(0,0,0,.9)}
        .m16-title span{display:block;color:#22e07a}
        .m16-pill{display:inline-flex;align-items:center;justify-content:center;margin-top:16px;padding:11px 16px;border-radius:999px;background:linear-gradient(180deg,#ffb347 0%,#ff7a00 50%,#e85d00 100%);border:1px solid rgba(255,200,140,.7);box-shadow:0 0 22px rgba(255,122,0,.55),inset 0 1px 0 rgba(255,255,255,.45);color:#1a0a00;font-family:Impact,"Arial Black",sans-serif;font-size:.9rem;letter-spacing:.08em;text-transform:uppercase}
        .m16-strip{display:flex;gap:12px;align-items:center;margin-top:12px;border-radius:18px;padding:14px 16px;background:linear-gradient(180deg,#8a5a2a 0%,#6b4220 100%);border:1px solid rgba(255,179,71,.45);box-shadow:0 8px 22px rgba(0,0,0,.45);color:inherit;text-decoration:none}
        .m16-strip-title{margin:0;color:#fff;font-size:.8rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
        .m16-strip-text{margin:4px 0 0;color:rgba(255,235,210,.92);font-size:.76rem;line-height:1.35}
        .m16-offer{margin:28px auto 0;border-radius:22px;padding:20px;text-align:center;background:linear-gradient(180deg,rgba(255,179,71,.12) 0%,rgba(255,122,0,.08) 100%);border:1px solid rgba(255,179,71,.35);box-shadow:0 0 24px rgba(255,122,0,.18)}
        .m16-offer h2{margin:0 0 10px;font-size:.9rem;letter-spacing:.08em;text-transform:uppercase}
        .m16-offer strong{display:block;color:#ffb347;font-family:Impact,"Arial Black",sans-serif;font-size:1.85rem;line-height:1.05;letter-spacing:0;text-transform:uppercase}
        .m16-offer p{margin:10px 0 0;color:rgba(255,255,255,.82);font-size:.88rem;line-height:1.45}
        .m16-cta{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;width:100%;min-height:58px;border-radius:18px;background:linear-gradient(180deg,#ffb347 0%,#ff7a00 50%,#e85d00 100%);border:1px solid rgba(255,200,140,.7);box-shadow:0 0 28px rgba(255,122,0,.55),0 10px 24px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.45);color:#1a0a00;text-decoration:none;font-family:Impact,"Arial Black",sans-serif;font-size:1.18rem;letter-spacing:.08em;text-transform:uppercase;transition:transform .15s ease}
        .m16-cta:after{content:"";position:absolute;top:0;left:-40%;width:34%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);transform:skewX(-15deg);animation:m16-sheen 3.2s ease-in-out infinite}
        .m16-proof{padding-top:32px}
        .m16-proof h2{text-align:center;margin:0 0 18px;font-size:1rem;letter-spacing:.06em;text-transform:uppercase}
        .m16-proof h2 span{color:#ffb347}
        .m16-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .m16-review{border-radius:14px;padding:12px;background:rgba(178,140,255,.05);border:1px solid rgba(178,140,255,.16)}
        .m16-review-img{width:100%;aspect-ratio:1/1;border-radius:10px;object-fit:cover;background:#fff;display:block;margin-bottom:10px}
        .m16-review-head{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:4px}
        .m16-review-name{font-size:.8rem;font-weight:900;line-height:1.1}
        .m16-stars{color:#ffb347;font-size:.62rem;white-space:nowrap}
        .m16-review-text{font-size:.72rem;line-height:1.35;color:rgba(255,255,255,.78);margin:0}
        .m16-review-time{font-size:.62rem;color:rgba(255,255,255,.42);margin:8px 0 0}
        .m16-faq{padding-top:42px}
        .m16-faq h2{text-align:center;margin:0 0 16px;font-size:1.05rem;letter-spacing:.06em;text-transform:uppercase}
        .m16-faq-item{border-radius:14px;overflow:hidden;margin-top:9px;background:rgba(178,140,255,.05);border:1px solid rgba(178,140,255,.16)}
        .m16-faq-item.open{border-color:rgba(178,140,255,.55);box-shadow:0 0 18px rgba(138,79,255,.22)}
        .m16-faq-button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;background:transparent;color:#fff;text-align:left;padding:15px 16px;font:inherit;font-size:.9rem;font-weight:900;cursor:pointer}
        .m16-faq-icon{color:#c9a6ff;font-size:1.35rem;line-height:1;transform:rotate(0deg);transition:transform .2s ease}
        .m16-faq-item.open .m16-faq-icon{transform:rotate(45deg)}
        .m16-faq-answer{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s ease}
        .m16-faq-item.open .m16-faq-answer{grid-template-rows:1fr}
        .m16-faq-answer-inner{overflow:hidden}
        .m16-faq-answer p{margin:0;padding:0 16px 16px;color:rgba(255,255,255,.72);font-size:.84rem;line-height:1.5}
        .m16-final{padding:28px 0 18px}
        .m16-sub{text-align:center;color:rgba(255,255,255,.72);font-size:.74rem;letter-spacing:.03em;margin:10px 0 0}
        .m16-footer{padding:24px 20px 36px;text-align:center;border-top:1px solid rgba(178,140,255,.12);color:rgba(255,255,255,.42)}
        .m16-footer p{margin:6px 0;font-size:.65rem;line-height:1.45}
        .m16-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:16px 16px 14px;background:linear-gradient(to top,#14082a 65%,rgba(20,8,42,.9) 90%,transparent);display:flex;justify-content:center}
        .m16-sticky-inner{width:min(100%,430px)}
        .m16-sticky .m16-cta{min-height:56px;flex-direction:column;font-size:1.08rem}
        .m16-sticky small{font-family:system-ui,sans-serif;font-size:.62rem;letter-spacing:.05em;color:rgba(26,10,0,.75);font-weight:700;margin-top:2px}
        @keyframes m16-sheen{0%{left:-45%}55%,100%{left:120%}}
        @media (min-width:760px){.m16-root{padding-bottom:118px}.m16-wrap{width:min(100%,460px)}.m16-card{border-radius:32px}.m16-grid{gap:14px}}
        @media (max-width:360px){.m16-wrap{padding:0 14px}.m16-grid{gap:9px}.m16-review{padding:9px}.m16-title{font-size:2rem}.m16-cta{font-size:1.02rem}}
      `}</style>

      <header className="m16-header">
        {profile ? (
          <div className="m16-avatar-shell">
            <img className="m16-avatar" src={profile} alt={name || "Profil"} />
          </div>
        ) : null}
        {name ? <p className="m16-name">{name}</p> : null}
      </header>

      <main className="m16-wrap">
        <a className="m16-card v3-cta" href={safeAffi} target="_blank" rel="sponsored noopener noreferrer">
          <div className="m16-hero-media">
            <img src={`${ASSET_BASE}/bdv-piano-hero.webp`} alt="Mini-jeux" fetchPriority="high" />
            <div className="m16-hero-copy">
              <span className="m16-kicker">{name ? `Bonus ${name} actif` : "Bonus actif"}</span>
              <h1 className="m16-title">
                Mini-jeux
                <span>depot double</span>
              </h1>
              <span className="m16-pill">Clique pour jouer</span>
            </div>
          </div>
        </a>

        <a className="m16-strip v3-cta" href={safeAffi} target="_blank" rel="sponsored noopener noreferrer">
          <div>
            <p className="m16-strip-title">Offre limitee</p>
            <p className="m16-strip-text">
              Offre de bienvenue: depose {dep || "maintenant"} et joue avec {bon || "ton bonus"}.
            </p>
          </div>
          <span aria-hidden>→</span>
        </a>

        <section className="m16-offer">
          <h2>Offre de bienvenue</h2>
          <strong>{dep && bon ? `${dep} -> ${bon}` : "Bonus actif"}</strong>
          <p>
            Ton bonus est applique automatiquement via le lien officiel.
          </p>
          <p>
            <a className="m16-cta v3-cta" href={safeAffi} target="_blank" rel="sponsored noopener noreferrer">
              Je prends mon bonus
            </a>
          </p>
        </section>

        <section className="m16-proof">
          <h2>Approuve par <span>+1 800 joueurs</span></h2>
          <div className="m16-grid">
            {reviews.map((review) => (
              <article className="m16-review" key={review.name}>
                <img className="m16-review-img" src={review.img} alt={review.name} loading="lazy" />
                <div className="m16-review-head">
                  <div className="m16-review-name">{review.name}</div>
                  <div className="m16-stars">★★★★★</div>
                </div>
                <p className="m16-review-text">{review.text}</p>
                <p className="m16-review-time">{review.time}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="m16-faq">
          <h2>Questions rapides</h2>
          {faqItems.map((item, index) => {
            const isOpen = openFaq === index;
            return (
              <div className={`m16-faq-item ${isOpen ? "open" : ""}`} key={item.q}>
                <button className="m16-faq-button" type="button" onClick={() => setOpenFaq(isOpen ? null : index)}>
                  <span>{item.q}</span>
                  <span className="m16-faq-icon">+</span>
                </button>
                <div className="m16-faq-answer">
                  <div className="m16-faq-answer-inner">
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="m16-final">
          <a className="m16-cta v3-cta" href={safeAffi} target="_blank" rel="sponsored noopener noreferrer">
            Clique pour jouer
          </a>
          <p className="m16-sub">
            {dep ? `Depose ${dep}` : "Inscription rapide"} {bon ? `· joue avec ${bon}` : ""}
          </p>
          <p className="m16-sub">Inscription 30 sec · Partenariat officiel</p>
        </section>
      </main>

      <footer className="m16-footer">
        <p>#ad · Partenariat remunere</p>
        <p>18+ · Jouer comporte des risques: endettement, dependance. 09 74 75 13 13 · joueurs-info-service.fr</p>
        <p>© {new Date().getFullYear()} · Lien d'affiliation</p>
      </footer>

      <div className="m16-sticky">
        <div className="m16-sticky-inner">
          <a className="m16-cta v3-cta" href={safeAffi} target="_blank" rel="sponsored noopener noreferrer">
            <span>Clique pour jouer</span>
            <small>{dep && bon ? `Depose ${dep} · joue avec ${bon}` : "Bonus actif"}</small>
          </a>
        </div>
      </div>
    </div>
  );
}

export default M16TikTok;
