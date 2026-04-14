import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicAffiPage } from "../lib/api_affi_pages";

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
  goldenHeroTitleBefore: "DEPOSE 20EUR",
  goldenHeroTitleSpan: "JOUE A 40EUR",
  goldenHeroSubtitle: "+20EUR offerts des ton premier depot.",
  goldenPageTitle: "Landing bonus",
  goldenChestUrl: "",
  goldenGameImageUrl: "",
  goldenVisualMode: "chest",
  goldenBackgroundUrl: "",
};

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
        `.chest-link, .final-chest-link, .cta-final-chest, .info-box { display: none !important; }
.hero-bg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
  display: block;
}
.hero-section { position: relative; z-index: 2; }
.no-chest-cta { margin-top: 18px !important; }
.no-chest-cta .btn-jouer { margin-top: 0 !important; }
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
  if (liveCount && ctaCluster) {
    ctaCluster.classList.add('no-chest-cta');
    liveCount.parentNode.insertBefore(ctaCluster, liveCount.nextSibling);
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
      <iframe title="landing-affiliee" srcDoc={srcDoc} style={styles.iframe} />
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
