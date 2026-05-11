import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicAffiPage } from "../lib/api_affi_pages";
import { parseAffiButtons, injectButtonsIntoIframe, parseFaqItems } from "./AffiEditorPage";

const REF_KEY = "ref_slug";

type GoldenChanceVariant = "gold" | "ruby" | "emerald" | "sapphire";

type Config = {
  bgPage: string;
  bgCard: string;
  brandGold: string;
  brandRuby: string;
  casinoGreen: string;
  borderColor: string;
  imgUrl: string;
  imgUrl1: string;
  imgUrl2: string;
  imgFit?: "cover" | "contain" | "fill" | "native";
  affiLink: string;
  offerTitle: string;
  depositText: string;
  receiveText: string;
  depositText2: string;
  receiveText2: string;
  badgeText: string;
  m4TitleMainGold?: string;
  m4TitleSpanGold?: string;
  m4TitleStacked?: string;
  heroTitleAfter?: string;
  colorTitleAfter?: string;
  colorBadge?: string;
  colorTitleMain?: string;
  colorTitleSpan?: string;
  colorSubtitle?: string;
  colorBtn?: string;
  colorSticky?: string;
  colorReviewText?: string;
  heroTitleBefore: string;
  heroTitleSpan: string;
  heroSubtitle: string;
  btnText: string;
  stickyText: string;
  casinoName: string;
  casinoLogoUrl?: string;
  pageTitle: string;
  goldenBrandMain: string;
  goldenBrandSub: string;
  goldenHideName?: string;     // "1" = masquer le pseudo (+ lignes d'encadrement)
  goldenLandingOnly?: string;  // "1" = masquer tout ce qui est sous le hero
  goldenHeroTitleBefore: string;
  goldenHeroTitleSpan: string;
  goldenHeroSubtitle: string;
  goldenPageTitle: string;
  goldenChestUrl: string;
  goldenGameImageUrl: string;
  goldenVisualMode: string;
  goldenBackgroundUrl: string;
  goldenProfileImageUrl?: string;
  goldenCtaPosition: string;
  // Montants
  goldenDepositAmount: string;
  goldenBonusAmount: string;
  goldenTotalAmount: string;
  goldenHeroCtaText: string;
  // Typography base
  t_brandFs: string;
  t_brandFf: string;
  t_brandLs: string;
  t_brandColor: string;
  t_titleFs: string;
  t_titleFf: string;
  t_titleLs: string;
  t_titleColor: string;
  t_subFs: string;
  t_subFf: string;
  t_subLs: string;
  t_subColor: string;
  t_ctaFs: string;
  t_ctaFf: string;
  t_ctaLs: string;
  // Mobile overrides
  t_brandFsM: string;
  t_titleFsM: string;
  t_subFsM: string;
  t_ctaFsM: string;
  // Desktop overrides
  t_brandFsD: string;
  t_titleFsD: string;
  t_subFsD: string;
  t_ctaFsD: string;
  // Position offsets
  p_brandX: string;
  p_brandY: string;
  p_offerX: string;
  p_offerY: string;
  p_ctaX: string;
  p_ctaY: string;
};

const DEFAULT_CONFIG: Config = {
  bgPage: "#080212",
  bgCard: "#150821",
  brandGold: "#FFD700",
  brandRuby: "#E0115F",
  casinoGreen: "#00E676",
  borderColor: "#331A47",
  imgUrl: "",
  imgUrl1: "",
  imgUrl2: "",
  imgFit: "cover",
  affiLink: "",
  offerTitle: "Offre de Bienvenue",
  depositText: "Deposez 10EUR",
  receiveText: "Recevez 20EUR",
  depositText2: "Deposez 20EUR",
  receiveText2: "Recevez 40EUR",
  badgeText: "Club VIP Certifie",
  m4TitleMainGold: "",
  m4TitleSpanGold: "1",
  m4TitleStacked: "",
  heroTitleAfter: "",
  colorTitleAfter: "",
  colorBadge: "",
  colorTitleMain: "",
  colorTitleSpan: "",
  colorSubtitle: "",
  colorBtn: "",
  colorSticky: "",
  colorReviewText: "",
  heroTitleBefore: "Acces VIP : Doublez votre capital",
  heroTitleSpan: "immediatement.",
  heroSubtitle:
    "Rejoignez un cercle de jeu exclusif et regule. Votre premier depot est double automatiquement.",
  btnText: "JOUER",
  stickyText: "RECLAME TES OFFERTS",
  casinoName: "Celsius Games",
  casinoLogoUrl: "",
  pageTitle: "Offre VIP | Jouer Maintenant",
  goldenBrandMain: "LeCasiNoze",
  goldenBrandSub: "",
  goldenHeroTitleBefore: "",
  goldenHeroTitleSpan: "",
  goldenHeroSubtitle: "",
  goldenPageTitle: "Landing bonus",
  goldenChestUrl: "",
  goldenGameImageUrl: "",
  goldenVisualMode: "chest",
  goldenBackgroundUrl: "",
  goldenProfileImageUrl: "",
  goldenCtaPosition: "top",
  goldenDepositAmount: "20",
  goldenBonusAmount: "20",
  goldenTotalAmount: "40",
  goldenHeroCtaText: "",
  t_brandFs: "",
  t_brandFf: "",
  t_brandLs: "",
  t_brandColor: "",
  t_titleFs: "",
  t_titleFf: "",
  t_titleLs: "",
  t_titleColor: "",
  t_subFs: "",
  t_subFf: "",
  t_subLs: "",
  t_subColor: "",
  t_ctaFs: "",
  t_ctaFf: "",
  t_ctaLs: "",
  t_brandFsM: "",
  t_titleFsM: "",
  t_subFsM: "",
  t_ctaFsM: "",
  t_brandFsD: "",
  t_titleFsD: "",
  t_subFsD: "",
  t_ctaFsD: "",
  p_brandX: "",
  p_brandY: "",
  p_offerX: "",
  p_offerY: "",
  p_ctaX: "",
  p_ctaY: "",
};

const FONT_MAP: Record<string, string> = {
  "Cinzel": "Cinzel:wght@400;600;700",
  "Bebas Neue": "Bebas+Neue",
  "Oswald": "Oswald:wght@400;500;700",
  "Montserrat": "Montserrat:wght@400;600;700;800",
  "Playfair Display": "Playfair+Display:wght@700;900",
  "Raleway": "Raleway:wght@400;600;700;800",
  "Inter": "Inter:wght@400;500;600;700;800",
  "Anton": "Anton",
  "Roboto Condensed": "Roboto+Condensed:wght@400;700",
};

function buildCustomVarsCSS(cfg: Config): string {
  const lines: string[] = [];

  const base = (prop: string, val: string) => {
    if (val) lines.push(`:root { ${prop}: ${val}; }`);
  };
  const mobile = (prop: string, val: string) => {
    if (val) lines.push(`@media (max-width: 720px) { :root { ${prop}: ${val}; } }`);
  };
  const desktop = (prop: string, val: string) => {
    if (val) lines.push(`@media (min-width: 721px) { :root { ${prop}: ${val}; } }`);
  };

  base("--cu-brand-fs", cfg.t_brandFs);
  mobile("--cu-brand-fs", cfg.t_brandFsM);
  desktop("--cu-brand-fs", cfg.t_brandFsD);

  base("--cu-title-fs", cfg.t_titleFs);
  mobile("--cu-title-fs", cfg.t_titleFsM);
  desktop("--cu-title-fs", cfg.t_titleFsD);

  base("--cu-sub-fs", cfg.t_subFs);
  mobile("--cu-sub-fs", cfg.t_subFsM);
  desktop("--cu-sub-fs", cfg.t_subFsD);

  base("--cu-cta-fs", cfg.t_ctaFs);
  mobile("--cu-cta-fs", cfg.t_ctaFsM);
  desktop("--cu-cta-fs", cfg.t_ctaFsD);

  base("--cu-brand-ff", cfg.t_brandFf ? `"${cfg.t_brandFf}", sans-serif` : "");
  base("--cu-brand-ls", cfg.t_brandLs);
  base("--cu-brand-color", cfg.t_brandColor);

  base("--cu-title-ff", cfg.t_titleFf ? `"${cfg.t_titleFf}", sans-serif` : "");
  base("--cu-title-ls", cfg.t_titleLs);
  base("--cu-title-color", cfg.t_titleColor);

  base("--cu-sub-ff", cfg.t_subFf ? `"${cfg.t_subFf}", sans-serif` : "");
  base("--cu-sub-ls", cfg.t_subLs);
  base("--cu-sub-color", cfg.t_subColor);

  base("--cu-cta-ff", cfg.t_ctaFf ? `"${cfg.t_ctaFf}", sans-serif` : "");
  base("--cu-cta-ls", cfg.t_ctaLs);

  const bx = cfg.p_brandX || "";
  const by = cfg.p_brandY || "";
  const ox = cfg.p_offerX || "";
  const oy = cfg.p_offerY || "";
  const cx = cfg.p_ctaX || "";
  const cy = cfg.p_ctaY || "";

  if (bx || by || ox || oy || cx || cy) {
    const vars: string[] = [];
    if (bx) vars.push(`--cu-brand-tx: ${bx};`);
    if (by) vars.push(`--cu-brand-ty: ${by};`);
    if (ox) vars.push(`--cu-offer-tx: ${ox};`);
    if (oy) vars.push(`--cu-offer-ty: ${oy};`);
    if (cx) vars.push(`--cu-cta-tx: ${cx};`);
    if (cy) vars.push(`--cu-cta-ty: ${cy};`);
    if (vars.length) lines.push(`:root { ${vars.join(" ")} }`);
  }

  return lines.join("\n");
}

function getGoogleFontsUrl(cfg: Config): string | null {
  const ffs = [cfg.t_brandFf, cfg.t_titleFf, cfg.t_subFf, cfg.t_ctaFf].filter(Boolean);
  const unique = [...new Set(ffs)];
  const families = unique.map((f) => FONT_MAP[f]).filter(Boolean);
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

function esc(str: string) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str: string) {
  return esc(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getGoldenVisualMode(cfg: Config): "chest" | "games" | "none" {
  const v = String(cfg.goldenVisualMode || "").trim().toLowerCase();
  if (v === "games") return "games";
  if (v === "none") return "none";
  return "chest";
}

function getGoldenVisualCandidates(cfg: Config, goldenVariant: GoldenChanceVariant) {
  if (getGoldenVisualMode(cfg) === "games") {
    const custom = String(cfg.goldenGameImageUrl || "").trim();
    if (custom) return [custom];
    return [
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.webp`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.png`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpg`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpeg`,
    ];
  }

  const custom = String(cfg.goldenChestUrl || "").trim();
  if (custom) return [custom];
  return [
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.webp`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.png`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.jpg`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.jpeg`,
  ];
}

function applyConfig(
  html: string,
  cfg: Config,
  model: number,
  goldenVariant: GoldenChanceVariant
): string {
  if (model === 5) {
    html = html.replace(/__VARIANT__/g, goldenVariant);

    // Fix mobile — zoom uniforme sur <390px + fix iPhone SE
    const SHORT_SCREEN_FIX = `<style data-affi-short-screen-fix>
      @media (max-width: 389px) {
        html { zoom: calc(100vw / 390); }
      }
      @media (max-width: 430px) and (max-height: 860px) {
        .hero-card { transform: none !important; }
        .promo-image-container img { --chest-translate: 0 !important; }
        .hero-section {
          padding-top: 4px !important;
          padding-bottom: 16px !important;
        }
        .hero-content { padding-top: 0 !important; }
        .brand-signature { margin-bottom: 6px !important; }
        .cta-cluster { margin-top: -4px !important; }
      }
    </style>`;
    html = html.replace(/<\/head>/, `${SHORT_SCREEN_FIX}\n</head>`);

    // Polish Desktop (≥900px) — rendu pro & clean
    const DESKTOP_POLISH = `<style data-affi-desktop-polish>
      @media (min-width: 900px) {
        .hero-content {
          width: min(100%, 1080px) !important;
          padding: clamp(28px, 4vh, 52px) clamp(36px, 4vw, 64px) !important;
          grid-template-columns: 1.05fr 0.95fr !important;
          gap: 0 clamp(36px, 3.5vw, 56px) !important;
        }
        .hero-section {
          min-height: 100svh !important;
          min-height: 100dvh !important;
        }
        .brand-signature { margin-bottom: 22px !important; }
        .brand-logo-text .brand-logo-main {
          font-size: clamp(2.2rem, 3.2vw, 3.4rem) !important;
          letter-spacing: 0.2em !important;
        }
        .hero-title {
          font-size: clamp(3rem, 4.2vw, 4.2rem) !important;
          line-height: 0.95 !important;
          letter-spacing: 0.035em !important;
        }
        .hero-subtitle {
          max-width: 26rem !important;
          margin-top: 16px !important;
          font-size: clamp(0.95rem, 1.05vw, 1.05rem) !important;
          line-height: 1.6 !important;
          color: rgba(248, 244, 239, 0.92) !important;
          font-weight: 500 !important;
        }
        .live-count {
          margin-top: 14px !important;
          font-size: 0.84rem !important;
          color: var(--accent-light) !important;
          font-weight: 600 !important;
          letter-spacing: 0.02em !important;
        }
        .promo-image-container {
          width: min(100%, 420px) !important;
          margin: 0 auto !important;
        }
        .hero-card { padding: 8px 0 !important; }
        .info-box {
          margin-bottom: 14px !important;
          padding: 12px 16px !important;
          background: rgba(0, 0, 0, 0.18) !important;
          backdrop-filter: blur(6px) !important;
        }
        .offer-title {
          font-size: 1.5rem !important;
          margin-bottom: 8px !important;
        }
        .cta-cluster {
          width: min(100%, 380px) !important;
          margin: 18px auto 0 !important;
        }
        .btn-jouer {
          width: 100% !important;
          padding: 18px 22px !important;
          font-size: 1.15rem !important;
          letter-spacing: 0.2em !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.28),
            0 0 38px var(--accent-soft),
            0 14px 28px rgba(0, 0, 0, 0.38) !important;
        }
        .micro-proof {
          margin-top: 14px !important;
          font-size: 0.78rem !important;
          color: var(--accent-light) !important;
          font-weight: 600 !important;
          letter-spacing: 0.03em !important;
        }
        .micro-proof-icon {
          color: var(--accent-light) !important;
          margin-right: 4px !important;
        }
      }
    </style>`;
    html = html.replace(/<\/head>/, `${DESKTOP_POLISH}\n</head>`);

    // Montants
    const deposit = String(cfg.goldenDepositAmount || "20").trim() || "20";
    const bonus = String(cfg.goldenBonusAmount || "20").trim() || "20";
    const total = String(cfg.goldenTotalAmount || "40").trim() || "40";
    html = html.replace(/data-offer-deposit="[^"]*"/, `data-offer-deposit="${escAttr(deposit)}"`);
    html = html.replace(/data-offer-bonus="[^"]*"/, `data-offer-bonus="${escAttr(bonus)}"`);
    html = html.replace(/data-offer-total="[^"]*"/, `data-offer-total="${escAttr(total)}"`);
    html = html.replace(
      /<h1 class="hero-title">[^<]*<span>[^<]*<\/span><\/h1>/,
      `<h1 class="hero-title">D&Eacute;POSE ${esc(deposit)}&euro; <span>JOUE A ${esc(total)}&euro;</span></h1>`
    );
    html = html.replace(
      /<p class="hero-subtitle"><strong>\+[^<]*<\/strong>[^<]*<\/p>/,
      `<p class="hero-subtitle"><strong>+${esc(bonus)}&euro; offerts</strong> d&egrave;s ton premier d&eacute;p&ocirc;t.</p>`
    );
    html = html.replace(
      /<span class="step-deposit">[^<]*<\/span>/,
      `<span class="step-deposit">DEPOSE ${esc(deposit)}EUR</span>`
    );
    html = html.replace(
      /<span class="step-receive">[^<]*<\/span>/,
      `<span class="step-receive">RECOIS ${esc(bonus)}EUR</span>`
    );

    if (cfg.affiLink) {
      const safeAffiLink = escAttr(cfg.affiLink);
      html = html.replace(/href="[^"]*" class="(btn-jouer[^"]*)"/g, `href="${safeAffiLink}" class="$1"`);
      html = html.replace(/href="[^"]*" class="sticky-cta"/g, `href="${safeAffiLink}" class="sticky-cta"`);
      html = html.replace(/href="[^"]*" class="chest-link"/g, `href="${safeAffiLink}" class="chest-link"`);
      html = html.replace(
        /href="[^"]*" class="final-chest-link"/g,
        `href="${safeAffiLink}" class="final-chest-link"`
      );
    }

    if (getGoldenVisualMode(cfg) === "none") {
      html = html.replace(
        /<\/style>/,
        `.chest-link, .final-chest-link, .cta-final-chest, .info-box, .gold-panel-final, .hero-card, #section-cta-final { display: none !important; min-height: 0 !important; }
.hero-content { justify-content: center !important; }
@media (max-width: 720px) {
  .hero-content { min-height: auto !important; }
  .hero-section { padding-bottom: clamp(28px, 6vh, 48px) !important; }
}
.hero-bg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
  display: block;
}
.hero-section { position: relative; z-index: 2; }
${String(cfg.goldenCtaPosition || "").trim() === "bottom"
  ? `.no-chest-cta {
  position: absolute;
  bottom: clamp(20px, 4vh, 36px);
  left: 50%;
  transform: translateX(-50%);
  width: min(90%, 360px);
  z-index: 3;
  margin: 0 !important;
}
.no-chest-cta .btn-jouer { margin-top: 0 !important; width: 100%; }`
  : `.no-chest-cta { margin-top: 18px !important; }
.no-chest-cta .btn-jouer { margin-top: 0 !important; }`
}
</style>`
      );
      html = html.replace(
        /<\/body>/,
        `<script>
(function () {
  var jouerBtn = document.querySelector('.btn-jouer');
  if (jouerBtn) {
    var href = jouerBtn.getAttribute('href');
    var target = jouerBtn.getAttribute('target') || '_blank';
    var rel = jouerBtn.getAttribute('rel') || 'noopener noreferrer';
    if (href) {
      var overlay = document.createElement('a');
      overlay.href = href;
      overlay.target = target;
      overlay.rel = rel;
      overlay.className = 'hero-bg-overlay';
      var heroBg = document.querySelector('.hero-bg');
      if (heroBg) heroBg.appendChild(overlay);
    }
  }
  var liveCount = document.querySelector('.live-count');
  var ctaCluster = document.querySelector('.cta-cluster');
  if (ctaCluster) {
    ctaCluster.classList.add('no-chest-cta');
    ${String(cfg.goldenCtaPosition || "").trim() === "bottom"
      ? `var heroSection = document.querySelector('.hero-section');
    if (heroSection) { heroSection.appendChild(ctaCluster); }`
      : `var liveCount = document.querySelector('.live-count');
    if (liveCount) { liveCount.parentNode.insertBefore(ctaCluster, liveCount.nextSibling); }`
    }
  }
})();
</script>
</body>`
      );
    } else {
      const goldenVisualUrl = getGoldenVisualCandidates(cfg, goldenVariant)[0];
      if (goldenVisualUrl) {
        const safeChestUrl = escAttr(goldenVisualUrl);
        html = html.replace(/(<img[^>]*data-visual-img="hero"[^>]*src=")[^"]*(")/, `$1${safeChestUrl}$2`);
        html = html.replace(/(<img[^>]*data-visual-img="final"[^>]*src=")[^"]*(")/, `$1${safeChestUrl}$2`);
      }
    }

    if (cfg.goldenBackgroundUrl) {
      const safeBgUrl = escAttr(cfg.goldenBackgroundUrl);
      html = html.replace(
        /(<img[^>]*class="hero-bg-media"[^>]*src=")[^"]*(")/,
        `$1${safeBgUrl}$2`
      );
    }

    html = html.replace(/(<span class="brand-logo-main">)([^<]*)(<\/span>)/, `$1${esc(cfg.goldenBrandMain)}$3`);
    html = html.replace(/(<span class="brand-logo-sub">)([^<]*)(<\/span>)/, `$1${esc(cfg.goldenBrandSub)}$3`);

    // Photo de profil ronde (M5) — au-dessus du brand-signature
    const avatarUrl = String(cfg.goldenProfileImageUrl || "").trim();
    if (avatarUrl) {
      const safeAvatarUrl = escAttr(avatarUrl);
      const avatarBlock = `<div class="hero-avatar" data-affi-avatar><img src="${safeAvatarUrl}" alt="" loading="eager" decoding="async"></div>`;
      const avatarCss = `<style data-affi-avatar-style>
.hero-avatar{display:flex;justify-content:center;margin:0 auto 18px;width:clamp(96px,22vw,160px);aspect-ratio:1/1;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.12),0 0 0 4px var(--accent-soft,rgba(255,215,0,.18)),0 14px 36px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.06);background:rgba(0,0,0,.35)}
.hero-avatar img{width:100%;height:100%;object-fit:cover;display:block}
@media (min-width:900px){.hero-avatar{width:clamp(120px,12vw,176px);margin-bottom:22px}}
</style>`;
      html = html.replace(/<\/head>/, `${avatarCss}\n</head>`);
      html = html.replace(/<div class="brand-signature">/, `${avatarBlock}\n          <div class="brand-signature">`);
    }

    // Safety : masque le badge "Club VIP Certifié" — pas dans le template
    // courant mais le CSS shared définit la règle, donc on force display:none
    // pour garantir qu'aucune injection résiduelle ne le fasse apparaître.
    {
      const noVip = `<style data-affi-m5-no-vip-badge>.badge-premium{display:none !important;}</style>`;
      html = html.replace(/<\/head>/, `${noVip}\n</head>`);
    }

    // Options d'affichage (synchro avec AffiEditorPage.applyConfig)
    const hideName = cfg.goldenHideName === "1" || !String(cfg.goldenBrandMain || "").trim();
    const landingOnly = cfg.goldenLandingOnly === "1";
    if (hideName || landingOnly) {
      const rules: string[] = [];
      if (hideName) rules.push(".brand-signature { display: none !important; }");
      if (landingOnly) {
        rules.push(".gold-panel-section { display: none !important; }");
        rules.push(".section:not(.hero-section) { display: none !important; }");
        rules.push("footer.page-footer, .page-footer { display: none !important; }");
      }
      html = html.replace(/<\/head>/, `<style data-affi-m5-display>${rules.join("\n")}</style>\n</head>`);
    }
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.goldenHeroTitleBefore)} <span>${esc(cfg.goldenHeroTitleSpan)}</span></h1>`
    );
    html = html.replace(/<p class="hero-subtitle">[\s\S]*?<\/p>/, `<p class="hero-subtitle">${esc(cfg.goldenHeroSubtitle)}</p>`);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.goldenPageTitle)}</title>`);

    // Texte custom du bouton RÉCLAME (hero + sticky mobile)
    if (cfg.goldenHeroCtaText && cfg.goldenHeroCtaText.trim()) {
      const ctaText = esc(cfg.goldenHeroCtaText.trim());
      html = html.replace(
        /(<a[^>]*class="btn-jouer"[^>]*>)[\s\S]*?(<\/a>)/g,
        `$1${ctaText}$2`
      );
      html = html.replace(
        /(<a[^>]*class="sticky-cta"[^>]*>)[\s\S]*?(<\/a>)/g,
        `$1${ctaText}$2`
      );
    }

    // FAQ — injection dans .faq-list-modern (cohérent avec AffiEditorPage.applyConfig)
    const faqItems = parseFaqItems((cfg as any).faqItemsJson);
    const faqHtml = faqItems.map((it) => {
      const q = esc(it.q.trim());
      const a = esc(it.a.trim());
      if (!q && !a) return "";
      return `            <details class="faq-card-modern"${it.open ? " open" : ""}>
              <summary><span class="faq-question-text">${q}</span></summary>
              <div class="faq-answer-modern">${a}</div>
            </details>`;
    }).filter(Boolean).join("\n\n");
    if (faqHtml) {
      html = html.replace(
        /(<div class="faq-list-modern">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
        `$1\n${faqHtml}\n          $2`
      );
    }

    // Inject CSS custom vars before </style>
    const cssVars = buildCustomVarsCSS(cfg);
    if (cssVars) {
      html = html.replace(/<\/style>/, `${cssVars}\n</style>`);
    }

    // Inject Google Fonts link if needed
    const fontsUrl = getGoogleFontsUrl(cfg);
    if (fontsUrl) {
      html = html.replace(/<\/head>/, `  <link rel="stylesheet" href="${fontsUrl}">\n</head>`);
    }

    return html;
  }

  const colorVars: Array<[string, string]> = [
    ["--bg-page", cfg.bgPage],
    ["--bg-card", cfg.bgCard],
    ["--brand-gold", cfg.brandGold],
    ["--brand-ruby", cfg.brandRuby],
    ["--casino-green", cfg.casinoGreen],
    ["--border-color", cfg.borderColor],
  ];

  for (const [varName, value] of colorVars) {
    if (!value) continue;
    const escaped = varName.replace(/-/g, "\\-");
    html = html.replace(new RegExp(`(${escaped}:\\s*)#[0-9a-fA-F]{3,6}`, "g"), (_, prefix) => prefix + value);
  }

  if (model === 4) {
    let imgCount = 0;
    html = html.replace(/(<div class="promo-image-container">\s*<img) src="[^"]*"/g, (match, before) => {
      imgCount += 1;
      if (imgCount === 1 && cfg.imgUrl1) return `${before} src="${cfg.imgUrl1}"`;
      if (imgCount === 2 && cfg.imgUrl2) return `${before} src="${cfg.imgUrl2}"`;
      return match;
    });
  } else if (cfg.imgUrl) {
    let replaced = false;
    html = html.replace(/(<div class="promo-image-container">\s*<img) src="[^"]*"/g, (match, before) => {
      if (replaced) return match;
      replaced = true;
      return `${before} src="${cfg.imgUrl}"`;
    });
  }

  if (cfg.affiLink) {
    const safeAffiLink = escAttr(cfg.affiLink);
    html = html.replace(/href="[^"]*" class="btn-jouer"/g, `href="${safeAffiLink}" class="btn-jouer"`);
    html = html.replace(/href="[^"]*" class="sticky-cta"/g, `href="${safeAffiLink}" class="sticky-cta"`);
  }

  // Image fit mode (applique object-fit sur .promo-image-container img)
  // — synchro avec AffiEditorPage.applyConfig. Sans ça, le rendu publié
  // ignorait le choix "Remplir/Étirer/Adapter" fait dans l'éditeur.
  if (cfg.imgFit && cfg.imgFit !== "cover") {
    const fitCss =
      cfg.imgFit === "native"
        ? `<style data-affi-img-fit>.promo-image-container { aspect-ratio: auto !important; } .promo-image-container img { object-fit: contain !important; width: 100% !important; height: auto !important; aspect-ratio: auto !important; }</style>`
        : `<style data-affi-img-fit>.promo-image-container img { object-fit: ${cfg.imgFit} !important; }</style>`;
    html = html.replace(/<\/head>/, `${fitCss}\n</head>`);
  }

  if (cfg.offerTitle) {
    html = html.replace(/<div class="offer-title">[^<]*<\/div>/g, `<div class="offer-title">${esc(cfg.offerTitle)}</div>`);
  }

  if (model === 4) {
    const deps = [cfg.depositText, cfg.depositText2];
    const recs = [cfg.receiveText, cfg.receiveText2];
    let depositIndex = 0;
    let receiveIndex = 0;
    html = html.replace(/<span class="step-deposit">[^<]*<\/span>/g, () => {
      const text = deps[depositIndex] || deps[0];
      depositIndex += 1;
      return `<span class="step-deposit">${esc(text)}</span>`;
    });
    html = html.replace(/<span class="step-receive">[^<]*<\/span>/g, () => {
      const text = recs[receiveIndex] || recs[0];
      receiveIndex += 1;
      return `<span class="step-receive">${esc(text)}</span>`;
    });
  } else {
    html = html.replace(/<span class="step-deposit">[^<]*<\/span>/, `<span class="step-deposit">${esc(cfg.depositText)}</span>`);
    html = html.replace(/<span class="step-receive">[^<]*<\/span>/, `<span class="step-receive">${esc(cfg.receiveText)}</span>`);
  }

  // Badge VIP : champ vide → cache, sinon → remplace texte
  if (typeof cfg.badgeText === "string" && cfg.badgeText.trim() === "") {
    const css = `<style data-affi-no-badge>.badge-premium{display:none !important;}</style>`;
    html = html.replace(/<\/head>/, `${css}\n</head>`);
  } else {
    html = html.replace(
      /(class="badge-premium">[^<]*<\/svg>\s*)([^<]*?)(\s*<\/div>)/,
      (_, before, _old, after) => `${before}${esc(cfg.badgeText)}${after}`
    );
  }

  // M4 : couleur du H1 — toggles indépendants pour le texte principal et
  // le span "en or" (synchro avec AffiEditorPage.applyConfig).
  if (model === 4) {
    const rules: string[] = [];
    if (cfg.m4TitleMainGold === "1") {
      rules.push(".hero-title{color:var(--brand-gold) !important;text-shadow:0 0 15px var(--brand-gold) !important;}");
    }
    if (cfg.m4TitleSpanGold === "" || cfg.m4TitleSpanGold === "0") {
      rules.push(".hero-title span{color:inherit !important;text-shadow:none !important;}");
    }
    if (cfg.m4TitleStacked === "1") {
      rules.push(".hero-title span{display:block !important;margin-top:.18em !important;}");
    }
    // Couleurs custom individuelles (synchro avec AffiEditorPage)
    if (cfg.colorBadge)      rules.push(`.badge-premium{color:${cfg.colorBadge} !important;}`);
    if (cfg.colorTitleMain)  rules.push(`.hero-title{color:${cfg.colorTitleMain} !important;text-shadow:none !important;}`);
    if (cfg.colorTitleSpan)  rules.push(`.hero-title span{color:${cfg.colorTitleSpan} !important;text-shadow:none !important;}`);
    if (cfg.colorSubtitle)   rules.push(`.hero-subtitle{color:${cfg.colorSubtitle} !important;}`);
    if (cfg.colorBtn)        rules.push(`.btn-jouer{color:${cfg.colorBtn} !important;}`);
    if (cfg.colorSticky)     rules.push(`.sticky-cta{color:${cfg.colorSticky} !important;}`);
    if (cfg.colorReviewText) rules.push(`.review-text{color:${cfg.colorReviewText} !important;}`);
    if (cfg.heroTitleAfter && cfg.heroTitleAfter.trim()) {
      const c = cfg.colorTitleAfter && /^#[0-9a-fA-F]{6}$/.test(cfg.colorTitleAfter) ? cfg.colorTitleAfter : "#ffffff";
      rules.push(`.hero-title-after{display:block !important;color:${c} !important;text-shadow:none !important;margin-top:.18em !important;}`);
    }
    if (rules.length) {
      const css = `<style data-affi-m4-h1-color>${rules.join("")}</style>`;
      html = html.replace(/<\/head>/, `${css}\n</head>`);
    }
  }

  // ✅ Ne réécrit le H1 que si au moins un champ texte est défini —
  // évite d'écraser le H1 par défaut du template par un H1 vide quand
  // l'user n'a customisé aucune ligne (cas notable : pages M5 anciennes
  // qui utilisent goldenHeroTitleBefore/Span dans une autre branche).
  if (cfg.heroTitleBefore || cfg.heroTitleSpan || cfg.heroTitleAfter) {
    const afterPart = cfg.heroTitleAfter && cfg.heroTitleAfter.trim()
      ? `<span class="hero-title-after">${esc(cfg.heroTitleAfter)}</span>`
      : "";
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.heroTitleBefore)} <span>${esc(cfg.heroTitleSpan)}</span>${afterPart}</h1>`
    );
  }
  html = html.replace(/<p class="hero-subtitle">[^<]*<\/p>/, `<p class="hero-subtitle">${esc(cfg.heroSubtitle)}</p>`);
  html = html.replace(
    /(href="[^"]*" class="btn-jouer">\s*)([^<]*)(\s*<\/a>)/g,
    (_, before, _old, after) => `${before}${esc(cfg.btnText)}${after}`
  );
  html = html.replace(/(class="sticky-cta">)([^<]*)(<\/a>)/, (_, before, _old, after) => `${before}${cfg.stickyText}${after}`);

  if (cfg.casinoName && cfg.casinoName !== "Celsius Games") {
    html = html.replace(/Celsius Games/g, esc(cfg.casinoName));
  }

  if (cfg.casinoLogoUrl && String(cfg.casinoLogoUrl).trim()) {
    const safeLogoUrl = escAttr(String(cfg.casinoLogoUrl).trim());
    const logoCss = `<style data-casino-logo>
      .nav-mark, .brand-mark, .hero-mark {
        background-image: url("${safeLogoUrl}") !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-color: transparent !important;
      }
      .nav-mark::after, .brand-mark::after, .hero-mark::after { display: none !important; }
    </style>`;
    html = html.replace(/<\/head>/, `${logoCss}\n</head>`);
  }

  if (cfg.pageTitle) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.pageTitle)}</title>`);
  }

  // ── Strip universel des meta tags preview-générant (sync avec AffiEditorPage) ──
  html = html.replace(
    /<meta\b[^>]*?(?:name|property)\s*=\s*"(?:og:[^"]*|twitter:[^"]*|description)"[^>]*?\/?>/gis,
    ""
  );
  html = html.replace(/<link\b[^>]*?rel\s*=\s*"canonical"[^>]*?\/?>/gis, "");
  html = html.replace(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<meta\b[^>]*?name\s*=\s*"robots"[^>]*?\/?>/gis, "");
  html = html.replace(/<head>/i, '<head>\n  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">');
  const customTitle = (model === 5 ? cfg.goldenPageTitle : cfg.pageTitle) || "";
  if (!String(customTitle).trim()) {
    html = html.replace(/<title>[^<]*<\/title>/, "<title> </title>");
  }

  return html;
}

function redirectToLegacyReferral(slug: string, navigate: ReturnType<typeof useNavigate>) {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) {
    navigate("/", { replace: true });
    return;
  }

  sessionStorage.setItem(REF_KEY, safeSlug);
  sessionStorage.setItem("force_register", "1");
  navigate(`/s/${encodeURIComponent(safeSlug)}`, { replace: true });
}

// Lazy-loaded V2 renderer pour ne pas charger le code V2 inutilement
// quand on consulte une page V1.
const RenderV2Page = React.lazy(() =>
  import("../lib/editor_v2_render").then((m) => ({ default: m.RenderV2Page }))
);

// V3 analytics : POST best-effort vers /api/public/affi-events.
// Utilise sendBeacon si dispo (survit au unload de la page lors d'un click_cta).
function trackAffiEvent(slug: string, event: "view" | "click_cta") {
  if (!slug) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      slug,
      event,
      referrer: document.referrer || null,
      utmSource: params.get("utm_source") || null,
      utmMedium: params.get("utm_medium") || null,
      utmCampaign: params.get("utm_campaign") || null,
    });
    const url = "/api/public/affi-events";
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* noop */ }
}

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [srcDoc, setSrcDoc] = React.useState("");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  // V2 : si la page est éditée en V2, on stocke son objet V2Page et le
  // rendu est délégué à RenderV2Page (pas d'iframe + template HTML).
  const [v2Page, setV2Page] = React.useState<any | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const buttonsRef = React.useRef<{ mobile: ReturnType<typeof parseAffiButtons>; desktop: ReturnType<typeof parseAffiButtons> }>({ mobile: [], desktop: [] });

  // V3 analytics : log "view" dès que la page est ready (une fois par mount).
  const viewLoggedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (status !== "ready") return;
    const safeSlug = String(slug || "").trim();
    if (!safeSlug || viewLoggedRef.current === safeSlug) return;
    viewLoggedRef.current = safeSlug;
    trackAffiEvent(safeSlug, "view");
  }, [status, slug]);

  // V3 analytics : intercepte les clics sur CTA d'affi en délégation globale
  // (via capture). Détection : <a> avec href externe OU class incluant
  // btn-jouer / sticky-cta / chest-link / final-chest-link / cta-final-btn.
  React.useEffect(() => {
    const safeSlug = String(slug || "").trim();
    if (!safeSlug) return;
    const isCta = (a: HTMLAnchorElement) => {
      const cls = a.className || "";
      if (typeof cls === "string" && /\b(btn-jouer|sticky-cta|chest-link|final-chest-link|cta-final-btn|v3-cta)\b/.test(cls)) return true;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("/")) return false;
      try {
        const u = new URL(href, window.location.origin);
        return u.origin !== window.location.origin;
      } catch { return false; }
    };
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest && (target.closest("a") as HTMLAnchorElement | null);
      if (!a) return;
      if (isCta(a)) trackAffiEvent(safeSlug, "click_cta");
    };
    document.addEventListener("click", handler, true);
    // postMessage venant de l'iframe (V1/M2) → tracker click_cta côté parent
    const msgHandler = (ev: MessageEvent) => {
      const data: any = ev.data;
      if (data && data.type === "v3-cta-click") trackAffiEvent(safeSlug, "click_cta");
    };
    window.addEventListener("message", msgHandler);
    return () => {
      document.removeEventListener("click", handler, true);
      window.removeEventListener("message", msgHandler);
    };
  }, [slug]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLanding() {
      const safeSlug = String(slug || "").trim();
      if (!safeSlug) {
        redirectToLegacyReferral("", navigate);
        return;
      }

      try {
        const { page } = await getPublicAffiPage(safeSlug);
        // V2 : aucun template HTML — on rend directement l'arbre de blocs
        // via RenderV2Page. Le iframe reste utile pour isoler le style mais
        // on injecte le JSX V2 dedans (via portal-like approach : srcDoc
        // minimal puis ReactDOM render dans le contentDocument). Plus simple :
        // on ne passe pas par l'iframe pour V2, on rend en SPA direct.
        if ((page as any).editorVersion === 2 && page.config && (page.config as any).zones) {
          if (cancelled) return;
          setV2Page(page.config);
          setStatus("ready");
          return;
        }

        const model = Number(page.model || 5);
        const variant = (page.variant || "gold") as GoldenChanceVariant;
        const cfg = { ...DEFAULT_CONFIG, ...(page.config || {}) } as Config;

        const templateResponse = await fetch(`/affi_templates/model${encodeURIComponent(String(model))}.html`);
        if (!templateResponse.ok) throw new Error(`template_${model}_missing`);
        const template = await templateResponse.text();

        let html = applyConfig(template, cfg, model, variant).replace(
          "<head>",
          `<head>\n  <base href="${window.location.origin}/">`
        );
        // V3 analytics : injecte un script qui détecte les clics CTA dans
        // l'iframe et postMessage au parent → trackAffiEvent("click_cta").
        const trackingScript = `<script data-affi-v3-track>(function(){
          function isCta(a){var c=a.className||"";if(typeof c==="string"&&/(btn-jouer|sticky-cta|chest-link|final-chest-link|cta-final-btn|v3-cta)/.test(c))return true;var h=a.getAttribute("href")||"";if(!h||h[0]==="#")return false;try{var u=new URL(h,location.origin);return u.origin!==location.origin}catch(_){return false}}
          document.addEventListener("click",function(e){var t=e.target;if(!t)return;var a=t.closest&&t.closest("a");if(!a||!isCta(a))return;try{window.parent.postMessage({type:"v3-cta-click"},"*")}catch(_){}},true);
        })();</script>`;
        html = html.replace(/<\/body>/, trackingScript + "\n</body>");

        if (cancelled) return;
        buttonsRef.current = {
          mobile: parseAffiButtons((cfg as any).customButtonsJson),
          desktop: parseAffiButtons((cfg as any).customButtonsJsonDesktop),
        };
        setSrcDoc(html);
        setStatus("ready");
      } catch (error: any) {
        if (cancelled) return;
        if (String(error?.message || "").includes("not_found")) {
          redirectToLegacyReferral(String(slug || ""), navigate);
          return;
        }
        console.error("ReferralLandingPage: failed to load landing", error);
        setStatus("error");
      }
    }

    void loadLanding();
    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  if (status === "error") {
    return (
      <div style={styles.stateWrap}>
        <div style={styles.stateCard}>
          <div style={styles.stateTitle}>Impossible de charger cette landing</div>
          <div style={styles.stateText}>Verifie le slug publie ou reconnecte-toi a l&apos;editor pour la republier.</div>
        </div>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div style={styles.stateWrap}>
        <div style={styles.stateCard}>
          <div style={styles.stateTitle}>Chargement de l&apos;offre</div>
          <div style={styles.stateText}>Preparation de la landing publiee...</div>
        </div>
      </div>
    );
  }

  // V2 render path — pas d'iframe, rendu SPA direct
  if (v2Page) {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 720;
    return (
      <div style={{ ...styles.root, overflowY: "auto" }}>
        <React.Suspense fallback={<div style={styles.stateWrap}><div style={styles.stateCard}><div style={styles.stateText}>Chargement…</div></div></div>}>
          <RenderV2Page page={v2Page} isMobile={isMobile} />
        </React.Suspense>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <iframe
        ref={iframeRef}
        title="landing-affiliee"
        srcDoc={srcDoc}
        style={styles.iframe}
        onLoad={() => {
          const iframe = iframeRef.current;
          if (!iframe) return;
          try {
            injectButtonsIntoIframe(iframe, buttonsRef.current);
          } catch (err) {
            console.error("[ReferralLanding] inject buttons failed:", err);
          }
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    background: "#000",
  },
  iframe: {
    display: "block",
    width: "100%",
    height: "100%",
    border: "none",
    background: "#000",
  },
  stateWrap: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "#0b0911",
    color: "#f6efe0",
    padding: 24,
    textAlign: "center",
  },
  stateCard: {
    maxWidth: 420,
    padding: 24,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(22,18,30,0.92)",
    boxShadow: "0 22px 54px rgba(0,0,0,0.38)",
  },
  stateTitle: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  stateText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 1.6,
    color: "rgba(246,239,224,0.74)",
  },
};
