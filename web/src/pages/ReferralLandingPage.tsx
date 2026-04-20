import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicAffiPage } from "../lib/api_affi_pages";
import { parseAffiButtons, injectButtonsIntoIframe } from "./AffiEditorPage";

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
  affiLink: string;
  offerTitle: string;
  depositText: string;
  receiveText: string;
  depositText2: string;
  receiveText2: string;
  badgeText: string;
  heroTitleBefore: string;
  heroTitleSpan: string;
  heroSubtitle: string;
  btnText: string;
  stickyText: string;
  casinoName: string;
  pageTitle: string;
  goldenBrandMain: string;
  goldenBrandSub: string;
  goldenHeroTitleBefore: string;
  goldenHeroTitleSpan: string;
  goldenHeroSubtitle: string;
  goldenPageTitle: string;
  goldenChestUrl: string;
  goldenGameImageUrl: string;
  goldenVisualMode: string;
  goldenBackgroundUrl: string;
  goldenCtaPosition: string;
  // Montants
  goldenDepositAmount: string;
  goldenBonusAmount: string;
  goldenTotalAmount: string;
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
  affiLink: "",
  offerTitle: "Offre de Bienvenue",
  depositText: "Deposez 10EUR",
  receiveText: "Recevez 20EUR",
  depositText2: "Deposez 20EUR",
  receiveText2: "Recevez 40EUR",
  badgeText: "Club VIP Certifie",
  heroTitleBefore: "Acces VIP : Doublez votre capital",
  heroTitleSpan: "immediatement.",
  heroSubtitle:
    "Rejoignez un cercle de jeu exclusif et regule. Votre premier depot est double automatiquement.",
  btnText: "JOUER",
  stickyText: "RECLAME TES OFFERTS",
  casinoName: "Celsius Games",
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
  goldenCtaPosition: "top",
  goldenDepositAmount: "20",
  goldenBonusAmount: "20",
  goldenTotalAmount: "40",
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
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.png`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.webp`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpg`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpeg`,
    ];
  }

  const custom = String(cfg.goldenChestUrl || "").trim();
  if (custom) return [custom];
  return [
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.png`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.webp`,
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

    // Layout lock : rendu mobile consistant avec la preview éditeur
    const SCALE_INJECTION = `<style data-affi-scale-lock>
      @media (max-width: 720px) {
        .hero-section {
          min-height: auto !important;
          padding: 24px 18px 32px !important;
          display: block !important;
          overflow: visible !important;
        }
        .hero-content {
          min-height: auto !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-start !important;
          padding-top: 0 !important;
        }
        .hero-card {
          transform: none !important;
          margin-top: 18px !important;
        }
        .btn-jouer {
          margin-top: 14px !important;
        }
        .cta-cluster {
          margin-top: 14px !important;
        }
        .promo-image-container {
          margin-bottom: 14px !important;
        }
        .offer-copy {
          margin-top: 8px !important;
        }
        .hero-subtitle {
          margin-top: 12px !important;
        }
        .live-count {
          margin-top: 12px !important;
        }
      }
      @media (max-width: 389px) {
        html { zoom: calc(100vw / 390); }
        @supports not (zoom: 1) {
          body {
            width: 390px !important;
            transform-origin: top left;
            transform: scale(calc(100vw / 390));
          }
        }
      }
    </style>`;
    html = html.replace(/<\/head>/, `${SCALE_INJECTION}\n</head>`);

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
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.goldenHeroTitleBefore)} <span>${esc(cfg.goldenHeroTitleSpan)}</span></h1>`
    );
    html = html.replace(/<p class="hero-subtitle">[\s\S]*?<\/p>/, `<p class="hero-subtitle">${esc(cfg.goldenHeroSubtitle)}</p>`);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.goldenPageTitle)}</title>`);

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

  html = html.replace(
    /(class="badge-premium">[^<]*<\/svg>\s*)([^<]*?)(\s*<\/div>)/,
    (_, before, _old, after) => `${before}${esc(cfg.badgeText)}${after}`
  );
  html = html.replace(
    /<h1 class="hero-title">[\s\S]*?<\/h1>/,
    `<h1 class="hero-title">${esc(cfg.heroTitleBefore)} <span>${esc(cfg.heroTitleSpan)}</span></h1>`
  );
  html = html.replace(/<p class="hero-subtitle">[^<]*<\/p>/, `<p class="hero-subtitle">${esc(cfg.heroSubtitle)}</p>`);
  html = html.replace(
    /(href="[^"]*" class="btn-jouer">\s*)([^<]*)(\s*<\/a>)/g,
    (_, before, _old, after) => `${before}${esc(cfg.btnText)}${after}`
  );
  html = html.replace(/(class="sticky-cta">)([^<]*)(<\/a>)/, (_, before, _old, after) => `${before}${cfg.stickyText}${after}`);

  if (cfg.casinoName && cfg.casinoName !== "Celsius Games") {
    html = html.replace(/Celsius Games/g, esc(cfg.casinoName));
  }

  if (cfg.pageTitle) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.pageTitle)}</title>`);
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

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [srcDoc, setSrcDoc] = React.useState("");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const buttonsRef = React.useRef<ReturnType<typeof parseAffiButtons>>([]);

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
        const model = Number(page.model || 5);
        const variant = (page.variant || "gold") as GoldenChanceVariant;
        const cfg = { ...DEFAULT_CONFIG, ...(page.config || {}) } as Config;

        const templateResponse = await fetch(`/affi_templates/model${encodeURIComponent(String(model))}.html`);
        if (!templateResponse.ok) throw new Error(`template_${model}_missing`);
        const template = await templateResponse.text();

        const html = applyConfig(template, cfg, model, variant).replace(
          "<head>",
          `<head>\n  <base href="${window.location.origin}/">`
        );

        if (cancelled) return;
        buttonsRef.current = parseAffiButtons((cfg as any).customButtonsJson);
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
