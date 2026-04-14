// web/src/pages/AffiEditorPage.tsx
// Éditeur de templates d'affiliation — accessible sur /editorFSN
// Aucun topbar ni footer : la page prend tout l'écran.

import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { canAccessFsbBoard } from "../lib/fsb_access";
import {
  createFsbAffiPage,
  deleteFsbAffiPage,
  listFsbAffiPages,
  type FsbAffiPage,
  updateFsbAffiPage,
} from "../lib/api_affi_pages";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Config {
  // Colors
  bgPage: string;
  bgCard: string;
  brandGold: string;
  brandRuby: string;
  casinoGreen: string;
  borderColor: string;
  // Image / link
  imgUrl: string;
  imgUrl1: string; // model4 card1
  imgUrl2: string; // model4 card2
  affiLink: string;
  // Offer
  offerTitle: string;
  depositText: string;
  receiveText: string;
  depositText2: string; // model4 card2
  receiveText2: string;
  // Texts
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
}

type GoldenChanceVariant = "gold" | "ruby" | "emerald" | "sapphire";

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
  depositText: "Déposez 10€",
  receiveText: "Recevez 20€",
  depositText2: "Déposez 20€",
  receiveText2: "Recevez 40€",
  badgeText: "Club VIP Certifié",
  heroTitleBefore: "Accès VIP : Doublez votre capital",
  heroTitleSpan: "immédiatement.",
  heroSubtitle:
    "Rejoignez un cercle de jeu exclusif et régulé. Votre premier dépôt est doublé automatiquement sur votre solde en toute discrétion et sécurité.",
  btnText: "JOUER",
  stickyText: "🎰 JOUER MAINTENANT",
  casinoName: "Celsius Games",
  pageTitle: "Offre VIP | Jouer Maintenant",
  goldenBrandMain: "LeCasiNoze",
  goldenBrandSub: "",
  goldenHeroTitleBefore: "DEPOSE 20EUR",
  goldenHeroTitleSpan: "JOUE A 40EUR",
  goldenHeroSubtitle: "+20EUR offerts dès ton premier dépôt.",
  goldenPageTitle: "LeCasiNoze - Dépose 20€, joue avec 40€",
  goldenChestUrl: "",
  goldenGameImageUrl: "",
  goldenVisualMode: "chest",
  goldenBackgroundUrl: "",
};

// ─── APPLY CONFIG ─────────────────────────────────────────────────────────────

function esc(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str: string) {
  return esc(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function replaceAllLiteral(source: string, search: string, replacement: string) {
  return source.split(search).join(replacement);
}

function absolutizeAffiTemplateUrls(html: string, origin: string) {
  return html
    .replace(/(["'(])\/affi_templates\//g, `$1${origin}/affi_templates/`)
    .replace(/(`)\/affi_templates\//g, `$1${origin}/affi_templates/`);
}

async function fetchAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error(`Unable to convert ${url} to data URL`));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${url}`));
    reader.readAsDataURL(blob);
  });
}

async function inlineAssetCandidates(html: string, candidates: string[]) {
  for (const candidate of candidates) {
    if (!html.includes(candidate)) continue;
    try {
      const dataUrl = await fetchAsDataUrl(candidate);
      html = replaceAllLiteral(html, candidate, dataUrl);
      return html;
    } catch {
      // try next candidate
    }
  }

  return html;
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
      html = html.replace(
        /href="[^"]*" class="(btn-jouer[^"]*)"/g,
        `href="${safeAffiLink}" class="$1"`
      );
      html = html.replace(
        /href="[^"]*" class="sticky-cta"/g,
        `href="${safeAffiLink}" class="sticky-cta"`
      );
      html = html.replace(
        /href="[^"]*" class="chest-link"/g,
        `href="${safeAffiLink}" class="chest-link"`
      );
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
        html = html.replace(
          /(<img[^>]*data-visual-img="hero"[^>]*src=")[^"]*(")/,
          `$1${safeChestUrl}$2`
        );
        html = html.replace(
          /(<img[^>]*data-visual-img="final"[^>]*src=")[^"]*(")/,
          `$1${safeChestUrl}$2`
        );
      }
    }

    if (cfg.goldenBackgroundUrl) {
      const safeBgUrl = escAttr(cfg.goldenBackgroundUrl);
      html = html.replace(
        /(<img[^>]*class="hero-bg-media"[^>]*src=")[^"]*(")/,
        `$1${safeBgUrl}$2`
      );
    }

    if (cfg.goldenBrandMain) {
      html = html.replace(
        /(<span class="brand-logo-main">)([^<]*)(<\/span>)/,
        `$1${esc(cfg.goldenBrandMain)}$3`
      );
    }

    if (cfg.goldenBrandSub) {
      html = html.replace(
        /(<span class="brand-logo-sub">)([^<]*)(<\/span>)/,
        `$1${esc(cfg.goldenBrandSub)}$3`
      );
    }

    if (cfg.goldenHeroTitleBefore || cfg.goldenHeroTitleSpan) {
      html = html.replace(
        /<h1 class="hero-title">[\s\S]*?<\/h1>/,
        `<h1 class="hero-title">${esc(cfg.goldenHeroTitleBefore)} <span>${esc(cfg.goldenHeroTitleSpan)}</span></h1>`
      );
    }

    if (cfg.goldenHeroSubtitle) {
      html = html.replace(
        /<p class="hero-subtitle">[\s\S]*?<\/p>/,
        `<p class="hero-subtitle">${esc(cfg.goldenHeroSubtitle)}</p>`
      );
    }

    if (cfg.goldenPageTitle) {
      html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${esc(cfg.goldenPageTitle)}</title>`
      );
    }

    return html;
  }

  const colorVars: [string, string][] = [
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
    html = html.replace(
      new RegExp(`(${escaped}:\\s*)#[0-9a-fA-F]{3,6}`, "g"),
      (_, prefix) => prefix + value
    );
  }

  if (model === 4) {
    let imgCount = 0;
    html = html.replace(
      /(<div class="promo-image-container">\s*<img) src="[^"]*"/g,
      (match, before) => {
        imgCount++;
        if (imgCount === 1 && cfg.imgUrl1) return `${before} src="${cfg.imgUrl1}"`;
        if (imgCount === 2 && cfg.imgUrl2) return `${before} src="${cfg.imgUrl2}"`;
        return match;
      }
    );
  } else if (cfg.imgUrl) {
    let replaced = false;
    html = html.replace(
      /(<div class="promo-image-container">\s*<img) src="[^"]*"/g,
      (match, before) => {
        if (!replaced) {
          replaced = true;
          return `${before} src="${cfg.imgUrl}"`;
        }
        return match;
      }
    );
  }

  if (cfg.affiLink) {
    const safeAffiLink = escAttr(cfg.affiLink);
    html = html.replace(
      /href="[^"]*" class="btn-jouer"/g,
      `href="${safeAffiLink}" class="btn-jouer"`
    );
    html = html.replace(
      /href="[^"]*" class="sticky-cta"/g,
      `href="${safeAffiLink}" class="sticky-cta"`
    );
  }

  if (cfg.offerTitle) {
    html = html.replace(
      /<div class="offer-title">[^<]*<\/div>/g,
      `<div class="offer-title">${esc(cfg.offerTitle)}</div>`
    );
  }

  if (model === 4) {
    const deps = [cfg.depositText, cfg.depositText2];
    const recs = [cfg.receiveText, cfg.receiveText2];
    let d = 0;
    let r = 0;
    html = html.replace(/<span class="step-deposit">[^<]*<\/span>/g, () => {
      const t = deps[d] || deps[0];
      d++;
      return `<span class="step-deposit">${esc(t)}</span>`;
    });
    html = html.replace(/<span class="step-receive">[^<]*<\/span>/g, () => {
      const t = recs[r] || recs[0];
      r++;
      return `<span class="step-receive">${esc(t)}</span>`;
    });
  } else {
    if (cfg.depositText)
      html = html.replace(
        /<span class="step-deposit">[^<]*<\/span>/,
        `<span class="step-deposit">${esc(cfg.depositText)}</span>`
      );
    if (cfg.receiveText)
      html = html.replace(
        /<span class="step-receive">[^<]*<\/span>/,
        `<span class="step-receive">${esc(cfg.receiveText)}</span>`
      );
  }

  if (cfg.badgeText) {
    html = html.replace(
      /(class="badge-premium">[^<]*<\/svg>\s*)([^<]*?)(\s*<\/div>)/,
      (_, before, _old, after) => `${before}${esc(cfg.badgeText)}${after}`
    );
  }

  if (cfg.heroTitleBefore || cfg.heroTitleSpan) {
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.heroTitleBefore)} <span>${esc(cfg.heroTitleSpan)}</span></h1>`
    );
  }

  if (cfg.heroSubtitle) {
    html = html.replace(
      /<p class="hero-subtitle">[^<]*<\/p>/,
      `<p class="hero-subtitle">${esc(cfg.heroSubtitle)}</p>`
    );
  }

  if (cfg.btnText) {
    html = html.replace(
      /(href="[^"]*" class="btn-jouer">\s*)([^<]*)(\s*<\/a>)/g,
      (_, before, _old, after) => `${before}${esc(cfg.btnText)}${after}`
    );
  }

  if (cfg.stickyText) {
    html = html.replace(
      /(class="sticky-cta">)([^<]*)(<\/a>)/,
      (_, b, _o, a) => `${b}${cfg.stickyText}${a}`
    );
  }

  if (cfg.casinoName && cfg.casinoName !== "Celsius Games") {
    html = html.replace(/Celsius Games/g, esc(cfg.casinoName));
  }

  if (cfg.pageTitle) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.pageTitle)}</title>`);
  }

  return html;
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function ModelThumb({ n }: { n: number }) {
  const thumbs: Record<number, React.ReactNode> = {
    1: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="40" height="3" rx="1" fill="#252545" />
        <rect x="4" y="30" width="18" height="6" rx="1" fill="#332200" />
        <rect x="64" y="4" width="52" height="24" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="10" rx="2" fill="#FFD70025" />
        <rect x="64" y="30" width="52" height="4" rx="1" fill="#252545" />
        <rect x="64" y="37" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    2: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="40" height="3" rx="1" fill="#252545" />
        <rect x="64" y="4" width="52" height="28" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="14" rx="2" fill="#E0115F25" />
        <rect x="64" y="34" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    3: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="64" y="4" width="52" height="28" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="14" rx="2" fill="#00E67625" />
        <rect x="64" y="34" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    4: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="14" y="4" width="92" height="6" rx="2" fill="#1e1e3a" />
        <rect x="24" y="13" width="72" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="54" height="26" rx="2" fill="#1e1e3a" />
        <rect x="4" y="22" width="54" height="11" rx="2" fill="#FFD70025" />
        <rect x="4" y="40" width="54" height="8" rx="2" fill="#FFD700" />
        <rect x="62" y="22" width="54" height="26" rx="2" fill="#1e1e3a" />
        <rect x="62" y="22" width="54" height="11" rx="2" fill="#E0115F25" />
        <rect x="62" y="40" width="54" height="8" rx="2" fill="#FFD700" />
        <rect x="4" y="54" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    5: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" rx="8" fill="#15131c" />
        <rect x="8" y="5" width="104" height="60" rx="10" fill="#2b2833" stroke="#524e59" />
        <rect x="22" y="10" width="76" height="4" rx="2" fill="#d4a843" opacity="0.9" />
        <rect x="30" y="18" width="60" height="14" rx="4" fill="#1e1b22" />
        <rect x="24" y="36" width="72" height="5" rx="2.5" fill="#f5efe4" />
        <rect x="32" y="44" width="56" height="5" rx="2.5" fill="#d4a843" />
        <rect x="17" y="54" width="86" height="7" rx="3.5" fill="#4a4040" />
      </svg>
    ),
  };
  return <>{thumbs[n]}</>;
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={s.colorPicker}
        />
        <input
          type="text"
          value={value}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
          }}
          style={{ ...s.input, fontFamily: "monospace", flex: 1 }}
        />
      </div>
    </div>
  );
}

// ─── PRESET IMAGES ───────────────────────────────────────────────────────────

const PRESET_IMAGES = [
  {
    url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png",
    label: "Penalty Duel",
  },
  {
    url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png",
    label: "Jeu des Mines",
  },
  {
    url: "https://cdn.phototourl.com/member/2026-04-10-af97004c-818f-40d3-b081-404c3ad3dfa7.png",
    label: "Nouveau 1",
  },
  {
    url: "https://cdn.phototourl.com/member/2026-04-10-ec62e857-165d-4a93-9cec-a314c7636d9c.jpg",
    label: "Nouveau 2",
  },
];

const GOLDEN_VARIANTS: Array<{
  value: GoldenChanceVariant;
  label: string;
  accent: string;
}> = [
  { value: "gold", label: "Or", accent: "#d4a843" },
  { value: "ruby", label: "Rubis", accent: "#bf6861" },
  { value: "emerald", label: "Emeraude", accent: "#69b98d" },
  { value: "sapphire", label: "Saphir", accent: "#6f96cf" },
];

interface ImagePickerProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ImagePicker({ label, value, onChange }: ImagePickerProps) {
  const isCustom = value !== "" && !PRESET_IMAGES.some((p) => p.url === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  function select(url: string) {
    setShowCustom(false);
    onChange(url);
  }

  function openCustom() {
    setShowCustom(true);
    onChange("");
  }

  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {/* Grille 2×2 presets + bouton custom */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        {PRESET_IMAGES.map((p) => {
          const active = value === p.url;
          return (
            <button
              key={p.url}
              onClick={() => select(p.url)}
              title={p.label}
              style={{
                position: "relative",
                padding: 0,
                border: `2px solid ${active ? "#FFD700" : "#2a2a4a"}`,
                borderRadius: 6,
                overflow: "hidden",
                cursor: "pointer",
                background: "#000",
                aspectRatio: "16/9",
                transition: "border-color 0.15s",
              }}
            >
              <img
                src={p.url}
                alt={p.label}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
              {active && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(255,215,0,0.12)",
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  paddingBottom: 4,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#FFD700", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 3 }}>
                    ✓
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {/* Bouton URL personnalisée */}
        <button
          onClick={openCustom}
          style={{
            border: `2px solid ${showCustom ? "#FFD700" : "#2a2a4a"}`,
            borderRadius: 6,
            background: showCustom ? "rgba(255,215,0,0.06)" : "#1c1c35",
            color: showCustom ? "#FFD700" : "#666",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            aspectRatio: "16/9",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          <span style={{ fontSize: 16 }}>🔗</span>
          <span>URL custom</span>
        </button>
      </div>

      {/* Champ texte : affiché si custom sélectionné */}
      {showCustom && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          autoFocus
          style={{ ...s.input, marginTop: 2 }}
        />
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}
function TextField({ label, value, onChange, placeholder, multiline, type = "text" }: TextFieldProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...s.input, minHeight: 56, resize: "vertical" }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={s.input}
        />
      )}
    </div>
  );
}

interface VariantPickerProps {
  value: GoldenChanceVariant;
  onChange: (value: GoldenChanceVariant) => void;
}
function VariantPicker({ value, onChange }: VariantPickerProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>Variante couleur</label>
      <div style={s.variantGrid}>
        {GOLDEN_VARIANTS.map((variant) => {
          const active = value === variant.value;
          return (
            <button
              key={variant.value}
              onClick={() => onChange(variant.value)}
              style={{
                ...s.variantBtn,
                ...(active ? s.variantBtnActive : {}),
                borderColor: active ? variant.accent : "#2a2a4a",
              }}
            >
              <span
                style={{
                  ...s.variantSwatch,
                  background: `linear-gradient(135deg, ${variant.accent}, rgba(255,255,255,0.92))`,
                }}
              />
              <span>{variant.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}
function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={s.section}>
      <button style={s.sectionHeader} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}

function slugifyLandingSegment(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildPublishedPageSlug(model: number, cfg: Config, variant: GoldenChanceVariant) {
  const brandSource =
    model === 5
      ? cfg.goldenBrandMain || cfg.goldenPageTitle || "landing"
      : cfg.casinoName || cfg.pageTitle || `modele-${model}`;
  const brandPart = slugifyLandingSegment(brandSource) || "landing";
  return model === 5
    ? `${brandPart}-golden-chest-${variant}`
    : `${brandPart}-model${model}`;
}

function buildPublishedBrandName(model: number, cfg: Config) {
  const raw = model === 5 ? cfg.goldenBrandMain : cfg.casinoName;
  return String(raw || "").trim() || `Modele ${model}`;
}

function buildPublishedTitle(model: number, cfg: Config) {
  const raw = model === 5 ? cfg.goldenPageTitle : cfg.pageTitle;
  return String(raw || "").trim() || buildPublishedBrandName(model, cfg);
}

function buildPublishedPayload(model: number, cfg: Config, variant: GoldenChanceVariant) {
  return {
    slug: buildPublishedPageSlug(model, cfg, variant),
    model,
    variant: model === 5 ? variant : null,
    brandName: buildPublishedBrandName(model, cfg),
    title: buildPublishedTitle(model, cfg),
    config: { ...cfg },
  };
}

function buildPageSignature(input: {
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  config: Record<string, string>;
}) {
  return JSON.stringify({
    model: Number(input.model || 0),
    variant: input.variant ?? null,
    brandName: String(input.brandName || ""),
    title: String(input.title || ""),
    config: input.config || {},
  });
}

function formatPublishedPageDate(value: string | null | undefined) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isGoldenVariant(value: string | null | undefined): value is GoldenChanceVariant {
  return value === "gold" || value === "ruby" || value === "emerald" || value === "sapphire";
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AffiEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [currentModel, setCurrentModel] = useState(1);
  const [goldenVariant, setGoldenVariant] = useState<GoldenChanceVariant>("gold");
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [templates, setTemplates] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [savedPages, setSavedPages] = useState<FsbAffiPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [pageAction, setPageAction] = useState<"create" | "update" | "delete" | null>(null);
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("returnTo") || "/FSB_Board?section=tools";
  }, [location.search]);
  const canManagePublishedPages = canAccessFsbBoard(user);
  const selectedPage = useMemo(
    () => savedPages.find((page) => page.id === selectedPageId) ?? null,
    [savedPages, selectedPageId]
  );
  const publishedSlugPreview = useMemo(
    () => buildPublishedPageSlug(currentModel, cfg, goldenVariant),
    [currentModel, cfg, goldenVariant]
  );
  const publishedUrlPreview = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/r/${publishedSlugPreview}`;
  }, [publishedSlugPreview]);
  const draftPayload = useMemo(
    () => buildPublishedPayload(currentModel, cfg, goldenVariant),
    [currentModel, cfg, goldenVariant]
  );
  const selectedPageSignature = useMemo(() => {
    if (!selectedPage) return "";
    const selectedConfig = {
      ...DEFAULT_CONFIG,
      ...(selectedPage.config || {}),
    } as Record<string, string>;
    return buildPageSignature({
      model: Number(selectedPage.model || 0),
      variant: selectedPage.model === 5 ? selectedPage.variant ?? null : null,
      brandName: String(selectedPage.brandName || ""),
      title: String(selectedPage.title || ""),
      config: selectedConfig,
    });
  }, [selectedPage]);
  const draftSignature = useMemo(
    () =>
      buildPageSignature({
        model: draftPayload.model,
        variant: draftPayload.variant,
        brandName: draftPayload.brandName,
        title: draftPayload.title,
        config: draftPayload.config,
      }),
    [draftPayload]
  );
  const hasUnsavedChanges = Boolean(selectedPage && draftSignature !== selectedPageSignature);
  const otherPages = useMemo(
    () => savedPages.filter((page) => page.id !== selectedPageId),
    [savedPages, selectedPageId]
  );

  // ── Load templates ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const loaded: Record<number, string> = {};
      try {
        for (const i of [1, 4, 5]) {
          const r = await fetch(`/affi_templates/model${i}.html`);
          if (!r.ok) throw new Error(`model${i}.html HTTP ${r.status}`);
          loaded[i] = await r.text();
        }
        setTemplates(loaded);

        // Init image/link defaults from template 1
        const m1 = loaded[1];
        const m4 = loaded[4];
        const m5 = loaded[5];
        const imgMatch = m1.match(/<div class="promo-image-container">\s*<img src="([^"]+)"/);
        const linkMatch = m1.match(/href="([^"]+)" class="btn-jouer"/);
        const linkMatch5 = m5.match(/href="([^"]+)" class="btn-jouer"/);
        const imgs4 = [...m4.matchAll(/<div class="promo-image-container">\s*<img src="([^"]+)"/g)];
        const brandMainMatch = m5.match(/<span class="brand-logo-main">([^<]+)</);
        const brandSubMatch = m5.match(/<span class="brand-logo-sub">([^<]+)</);

        setCfg((prev) => ({
          ...prev,
          imgUrl: imgMatch?.[1] ?? "",
          affiLink: linkMatch5?.[1] ?? linkMatch?.[1] ?? "",
          imgUrl1: imgs4[0]?.[1] ?? "",
          imgUrl2: imgs4[1]?.[1] ?? "",
          goldenBrandMain: brandMainMatch?.[1] ?? prev.goldenBrandMain,
          goldenBrandSub: brandSubMatch?.[1] ?? prev.goldenBrandSub,
        }));
      } catch (e) {
        console.error("AffiEditor: failed to load templates", e);
        setLoadError(true);
      }
    })();
  }, []);

  async function refreshPublishedPages(nextSelectedId?: number | null) {
    if (!token || !canManagePublishedPages) return;
    setLoadingPages(true);
    setPageError(null);
    try {
      const response = await listFsbAffiPages(token);
      setSavedPages(response.items);
      if (typeof nextSelectedId === "number") {
        setSelectedPageId(nextSelectedId);
      } else if (nextSelectedId === null) {
        setSelectedPageId(null);
      }
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de charger les pages publiees."));
    } finally {
      setLoadingPages(false);
    }
  }

  useEffect(() => {
    if (!token || !canManagePublishedPages) return;
    void refreshPublishedPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canManagePublishedPages]);

  function loadPublishedPageInEditor(page: FsbAffiPage) {
    setCurrentModel(Number(page.model || 5));
    if (isGoldenVariant(page.variant)) {
      setGoldenVariant(page.variant);
    }
    setCfg({ ...DEFAULT_CONFIG, ...(page.config || {}) });
    setSelectedPageId(page.id);
    setPageError(null);
    setPageNotice(`Edition chargee : /r/${page.slug}`);
  }

  function resetDraft() {
    setCfg({ ...DEFAULT_CONFIG });
    setGoldenVariant("gold");
    setSelectedPageId(null);
    setPageError(null);
    setPageNotice(null);
  }

  async function publishCurrentPage() {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour publier une page sur le site.");
      return;
    }

    const payload = draftPayload;

    const isUpdate = Boolean(selectedPageId);
    setPageAction(isUpdate ? "update" : "create");
    setPageError(null);
    setPageNotice(null);

    try {
      const response = isUpdate
        ? await updateFsbAffiPage(token, Number(selectedPageId), payload)
        : await createFsbAffiPage(token, payload);
      const page = response.item;
      await refreshPublishedPages(page.id);
      loadPublishedPageInEditor(page);
      setPageNotice(
        isUpdate
          ? `Page mise a jour : ${window.location.origin}/r/${page.slug}`
          : `Page creee : ${window.location.origin}/r/${page.slug}`
      );
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de publier cette page."));
    } finally {
      setPageAction(null);
    }
  }

  async function saveCurrentPageAsVariant() {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour creer une variante.");
      return;
    }

    setPageAction("create");
    setPageError(null);
    setPageNotice(null);

    try {
      const response = await createFsbAffiPage(token, draftPayload);
      const page = response.item;
      await refreshPublishedPages(page.id);
      loadPublishedPageInEditor(page);
      setPageNotice(`Variante creee : ${window.location.origin}/r/${page.slug}`);
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de creer cette variante."));
    } finally {
      setPageAction(null);
    }
  }

  async function removePublishedPage(page: FsbAffiPage) {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour supprimer une page.");
      return;
    }
    if (!window.confirm(`Supprimer la page ${page.slug} ?`)) return;

    setPageAction("delete");
    setPageError(null);
    setPageNotice(null);

    try {
      await deleteFsbAffiPage(token, page.id);
      const shouldClearSelection = selectedPageId === page.id;
      await refreshPublishedPages(shouldClearSelection ? null : selectedPageId);
      if (shouldClearSelection) {
        resetDraft();
      } else {
        setPageNotice(`Page supprimee : /r/${page.slug}`);
      }
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de supprimer cette page."));
    } finally {
      setPageAction(null);
    }
  }

  // ── Live preview ───────────────────────────────────────────────────────────
  function pushPreview(tmpl: string, c: Config, model: number, variant: GoldenChanceVariant) {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const raw = applyConfig(tmpl, c, model, variant);
    const base = `<base href="${window.location.origin}/">`;
    const html = raw.replace("<head>", `<head>\n  ${base}`);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([html], { type: "text/html" });
    blobUrlRef.current = URL.createObjectURL(blob);
    iframe.src = blobUrlRef.current;
  }

  // Immédiat quand on change de modèle / variante / templates chargés
  useEffect(() => {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    pushPreview(tmpl, cfg, currentModel, goldenVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel, goldenVariant, templates]);

  // Debounced pour l'édition live des champs
  useEffect(() => {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    const tid = setTimeout(() => pushPreview(tmpl, cfg, currentModel, goldenVariant), 120);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // Cleanup blob URL à la destruction
  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  // ── Set a single config key ────────────────────────────────────────────────
  const set = (key: keyof Config) => (value: string) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  // ── Export ─────────────────────────────────────────────────────────────────
  async function exportHtml() {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    let html = applyConfig(tmpl, cfg, currentModel, goldenVariant);

    if (currentModel === 5) {
      const origin = window.location.origin;

      // Inliner landing-base.css pour un export autonome
      try {
        const cssResp = await fetch("/affi_templates/golden_chance_chest/shared/landing-base.css");
        if (cssResp.ok) {
          const css = await cssResp.text();
          html = html.replace(
            /<link rel="stylesheet" href="\/affi_templates\/golden_chance_chest\/shared\/landing-base\.css">\s*/i,
            `<style>\n${css}\n</style>`
          );
        }
      } catch { /* garde le lien externe en fallback */ }

      // Inliner landing-base.js
      try {
        const jsResp = await fetch("/affi_templates/golden_chance_chest/shared/landing-base.js");
        if (jsResp.ok) {
          const js = await jsResp.text();
          html = html.replace(
            /<script src="\/affi_templates\/golden_chance_chest\/shared\/landing-base\.js"><\/script>\s*/i,
            `<script>\n${js}\n</script>`
          );
        }
      } catch { /* garde le lien externe en fallback */ }

      if (cfg.goldenBackgroundUrl) {
        html = await inlineAssetCandidates(html, [cfg.goldenBackgroundUrl]);
      } else {
        const backgroundCandidates = [
          `/affi_templates/golden_chance_chest/variants/${goldenVariant}/background.png`,
          `/affi_templates/golden_chance_chest/variants/${goldenVariant}/background.jpg`,
        ];
        html = await inlineAssetCandidates(html, backgroundCandidates);
      }

      html = await inlineAssetCandidates(html, getGoldenVisualCandidates(cfg, goldenVariant));

      // Fallback robuste: liens absolus vers l'instance qui a généré l'export
      html = absolutizeAffiTemplateUrls(html, origin);

      // Les navigateurs Chromium sont capricieux avec les fichiers locaux + target=_blank.
      // En export autonome, on préfère une navigation simple dans le même onglet.
      html = html.replace(/target="_blank"/g, 'target="_self"');
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentModel === 5
      ? `golden_chance_chest_${goldenVariant}.html`
      : `affi_model${currentModel}_export.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Iframe width by viewport ───────────────────────────────────────────────
  const iframeWidth = viewport === "desktop" ? "100%" : viewport === "tablet" ? "768px" : "390px";

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.logo}>🎨 <span style={{ color: "#eee", fontWeight: 400 }}>Affi</span> Editor</div>
        <div style={{ flex: 1 }} />
        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => navigate(returnTo)}>
          Retour au board
        </button>
        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={resetDraft}>
          Réinitialiser
        </button>
        {selectedPageId && hasUnsavedChanges && (
          <button
            style={{ ...s.btn, ...s.btnVariant, opacity: canManagePublishedPages ? 1 : 0.55 }}
            onClick={saveCurrentPageAsVariant}
            disabled={!canManagePublishedPages || pageAction === "create" || pageAction === "update"}
            title="Creer une nouvelle page a partir de cette version modifiee"
          >
            Enregistrer une variante
          </button>
        )}
        <button
          style={{ ...s.btn, ...s.btnSuccess, opacity: canManagePublishedPages ? 1 : 0.55 }}
          onClick={publishCurrentPage}
          disabled={!canManagePublishedPages || pageAction === "create" || pageAction === "update"}
          title={canManagePublishedPages ? publishedUrlPreview : "Acces FSB requis"}
        >
          {selectedPageId ? "Mettre à jour" : "Créer"}
        </button>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={exportHtml}>
          ⬇ Exporter HTML
        </button>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div style={s.body}>

        {/* ── MODEL PICKER ──────────────────────────────────────────────────── */}
        <div style={s.picker}>
          <div style={s.pickerTitle}>MODÈLE</div>
          {([1, 4, 5] as const).map((n) => (
            <button
              key={n}
              style={{
                ...s.modelCard,
                ...(currentModel === n ? s.modelCardActive : {}),
              }}
              onClick={() => setCurrentModel(n)}
            >
              <div style={s.modelThumb}>
                <ModelThumb n={n} />
              </div>
              <div style={s.modelLabel}>Modèle {n}</div>
              <div style={s.modelDesc}>
                {n === 1 ? "Side-by-side" : n === 4 ? "2 cartes" : "Golden Chest"}
              </div>
            </button>
          ))}
        </div>

        {/* ── CONFIG PANEL ──────────────────────────────────────────────────── */}
        <div style={s.configPanel}>

          {loadError && (
            <div style={s.errorBanner}>
              Impossible de charger les templates depuis <code>/affi_templates/</code>.<br />
              Vérifiez que les fichiers sont bien dans <code>web/public/affi_templates/</code>.
            </div>
          )}

          <Section title="Pages créées" defaultOpen={true}>
            <div style={s.helperText}>URL publiee pour ce brouillon</div>
            <div style={s.urlPreview}>{publishedUrlPreview}</div>
            <div style={s.savedPageStats}>
              <div style={s.savedPageStatCard}>
                <div style={s.savedPageStatValue}>{savedPages.length}</div>
                <div style={s.savedPageStatLabel}>pages</div>
              </div>
              <div style={s.savedPageStatCard}>
                <div style={s.savedPageStatValue}>{selectedPage ? "1" : "0"}</div>
                <div style={s.savedPageStatLabel}>active</div>
              </div>
            </div>

            {!canManagePublishedPages && (
              <div style={s.inlineWarn}>
                Acces FSB requis pour creer, modifier ou supprimer des pages publiees.
              </div>
            )}

            {selectedPage && (
              <div style={s.inlineInfo}>
                Edition en cours : <strong>/r/{selectedPage.slug}</strong>
              </div>
            )}
            {selectedPage && hasUnsavedChanges && (
              <div style={s.inlineWarn}>
                Cette page a des modifications locales non enregistrees. Tu peux la mettre a jour ou enregistrer une variante.
              </div>
            )}

            {pageError && <div style={s.inlineError}>{pageError}</div>}
            {pageNotice && <div style={s.inlineNotice}>{pageNotice}</div>}

            <div style={s.savedPageTools}>
              <button style={s.smallActionBtn} onClick={resetDraft}>
                Nouveau brouillon
              </button>
              {selectedPage && (
                <button
                  style={s.smallActionBtn}
                  onClick={() => window.open(`${window.location.origin}/r/${selectedPage.slug}`, "_blank", "noopener,noreferrer")}
                >
                  Ouvrir la page
                </button>
              )}
            </div>

            <div style={s.savedPageList}>
              {loadingPages ? (
                <div style={s.savedPageEmpty}>Chargement des pages...</div>
              ) : savedPages.length === 0 ? (
                <div style={s.savedPageEmpty}>Aucune page creee pour le moment.</div>
              ) : (
                <>
                  {selectedPage && (
                    <>
                      <div style={s.savedPageGroupTitle}>Page active</div>
                      <div style={{ ...s.savedPageCard, ...s.savedPageCardActive }}>
                        <div style={s.savedPageHeader}>
                          <div style={{ minWidth: 0 }}>
                            <div style={s.savedPageTitle}>{selectedPage.brandName || selectedPage.slug}</div>
                            <div style={s.savedPageSlug}>/r/{selectedPage.slug}</div>
                            <div style={s.savedPageMeta}>
                              Modèle {selectedPage.model}
                              {selectedPage.variant ? ` · ${selectedPage.variant}` : ""}
                              {selectedPage.updatedAt ? ` · ${formatPublishedPageDate(selectedPage.updatedAt)}` : ""}
                            </div>
                          </div>
                          <span style={s.savedPageBadge}>Active</span>
                        </div>
                        <div style={s.savedPageActions}>
                          <button style={s.smallActionBtn} onClick={() => loadPublishedPageInEditor(selectedPage)}>
                            Recharger
                          </button>
                          <button
                            style={s.smallActionBtn}
                            onClick={() => window.open(`${window.location.origin}/r/${selectedPage.slug}`, "_blank", "noopener,noreferrer")}
                          >
                            Ouvrir
                          </button>
                          <button
                            style={{ ...s.smallActionBtn, ...s.smallActionBtnDanger }}
                            onClick={() => void removePublishedPage(selectedPage)}
                            disabled={pageAction === "delete"}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {otherPages.length > 0 && <div style={s.savedPageGroupTitle}>Autres pages</div>}
                  {otherPages.map((page) => {
                  return (
                    <div
                      key={page.id}
                      style={s.savedPageCard}
                    >
                      <div style={s.savedPageHeader}>
                        <div style={{ minWidth: 0 }}>
                          <div style={s.savedPageTitle}>{page.brandName || page.slug}</div>
                          <div style={s.savedPageSlug}>/r/{page.slug}</div>
                          <div style={s.savedPageMeta}>
                            /r/{page.slug} · Modèle {page.model}
                            {page.variant ? ` · ${page.variant}` : ""}
                          </div>
                        </div>
                        <span style={s.savedPageTag}>{page.variant ? page.variant : `M${page.model}`}</span>
                      </div>
                      <div style={s.savedPageActions}>
                        <button style={s.smallActionBtn} onClick={() => loadPublishedPageInEditor(page)}>
                          Charger
                        </button>
                        <button
                          style={s.smallActionBtn}
                          onClick={() => window.open(`${window.location.origin}/r/${page.slug}`, "_blank", "noopener,noreferrer")}
                        >
                          Ouvrir
                        </button>
                        <button
                          style={{ ...s.smallActionBtn, ...s.smallActionBtnDanger }}
                          onClick={() => void removePublishedPage(page)}
                          disabled={pageAction === "delete"}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
                </>
              )}
            </div>
          </Section>

          {currentModel !== 5 && (
            <>
              <Section title="Couleurs">
                <ColorField label="Fond page" value={cfg.bgPage} onChange={set("bgPage")} />
                <ColorField label="Fond carte" value={cfg.bgCard} onChange={set("bgCard")} />
                <ColorField label="Or (accent principal)" value={cfg.brandGold} onChange={set("brandGold")} />
                <ColorField label="Ruby (secondaire)" value={cfg.brandRuby} onChange={set("brandRuby")} />
                <ColorField label="Vert (casino-green)" value={cfg.casinoGreen} onChange={set("casinoGreen")} />
                <ColorField label="Bordure" value={cfg.borderColor} onChange={set("borderColor")} />
              </Section>

              <Section title="Image & Lien d'affiliation">
                {currentModel !== 4 ? (
                  <ImagePicker
                    label="Image principale"
                    value={cfg.imgUrl}
                    onChange={set("imgUrl")}
                  />
                ) : (
                  <>
                    <ImagePicker
                      label="Image carte 1"
                      value={cfg.imgUrl1}
                      onChange={set("imgUrl1")}
                    />
                    <ImagePicker
                      label="Image carte 2"
                      value={cfg.imgUrl2}
                      onChange={set("imgUrl2")}
                    />
                  </>
                )}
                <TextField
                  label="Lien d'affiliation"
                  value={cfg.affiLink}
                  onChange={set("affiLink")}
                  placeholder="https://casino.com/ref/..."
                  type="url"
                />
              </Section>

              <Section title="Offre">
                <TextField label="Titre offre" value={cfg.offerTitle} onChange={set("offerTitle")} />
                <TextField label="Texte dépôt" value={cfg.depositText} onChange={set("depositText")} />
                <TextField label="Texte reçu" value={cfg.receiveText} onChange={set("receiveText")} />
                {currentModel === 4 && (
                  <>
                    <div style={{ ...s.label, color: "#FFD700", marginTop: 8 }}>Carte 2</div>
                    <TextField label="Texte dépôt (carte 2)" value={cfg.depositText2} onChange={set("depositText2")} />
                    <TextField label="Texte reçu (carte 2)" value={cfg.receiveText2} onChange={set("receiveText2")} />
                  </>
                )}
              </Section>

              <Section title="Textes" defaultOpen={false}>
                <TextField label="Badge VIP" value={cfg.badgeText} onChange={set("badgeText")} />
                <TextField label="H1 — texte principal" value={cfg.heroTitleBefore} onChange={set("heroTitleBefore")} />
                <TextField label="H1 — texte en or" value={cfg.heroTitleSpan} onChange={set("heroTitleSpan")} />
                <TextField label="Sous-titre" value={cfg.heroSubtitle} onChange={set("heroSubtitle")} multiline />
                <TextField label="Texte bouton (carte)" value={cfg.btnText} onChange={set("btnText")} />
                <TextField label="Sticky CTA" value={cfg.stickyText} onChange={set("stickyText")} />
                <TextField label="Nom du casino (footer)" value={cfg.casinoName} onChange={set("casinoName")} />
                <TextField label="Balise <title>" value={cfg.pageTitle} onChange={set("pageTitle")} />
              </Section>
            </>
          )}

          {currentModel === 5 && (
            <>
              <Section title="Palette & assets">
                <VariantPicker value={goldenVariant} onChange={setGoldenVariant} />
              </Section>

              <Section title="Lien & visuels">
                <TextField
                  label="Lien d'affiliation"
                  value={cfg.affiLink}
                  onChange={set("affiLink")}
                  placeholder="https://casino.com/ref/..."
                  type="url"
                />
                <div style={s.field}>
                  <label style={s.label}>Visuel principal</label>
                  <div style={s.variantGrid}>
                    <button
                      style={{
                        ...s.variantBtn,
                        ...(getGoldenVisualMode(cfg) === "chest" ? s.variantBtnActive : {}),
                      }}
                      onClick={() => set("goldenVisualMode")("chest")}
                    >
                      <span style={s.visualModeIcon}>🧰</span>
                      <span>Coffre</span>
                    </button>
                    <button
                      style={{
                        ...s.variantBtn,
                        ...(getGoldenVisualMode(cfg) === "games" ? s.variantBtnActive : {}),
                      }}
                      onClick={() => set("goldenVisualMode")("games")}
                    >
                      <span style={s.visualModeIcon}>🎮</span>
                      <span>Image jeux</span>
                    </button>
                    <button
                      style={{
                        ...s.variantBtn,
                        ...(getGoldenVisualMode(cfg) === "none" ? s.variantBtnActive : {}),
                      }}
                      onClick={() => set("goldenVisualMode")("none")}
                    >
                      <span style={s.visualModeIcon}>🚫</span>
                      <span>Aucun</span>
                    </button>
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Image du coffre (optionnelle)</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="url"
                      value={cfg.goldenChestUrl}
                      onChange={(e) => set("goldenChestUrl")(e.target.value)}
                      placeholder="https://.../chest.png"
                      style={{ ...s.input, flex: 1, marginTop: 0 }}
                    />
                    {cfg.goldenChestUrl && (
                      <button
                        style={{ ...s.btn, ...s.btnSecondary, padding: "5px 10px", fontSize: "0.78rem" }}
                        onClick={() => set("goldenChestUrl")("")}
                        title="Retirer l'image du coffre"
                      >
                        ✕ Retirer
                      </button>
                    )}
                  </div>
                </div>
                <TextField
                  label="Image jeux (optionnelle)"
                  value={cfg.goldenGameImageUrl}
                  onChange={set("goldenGameImageUrl")}
                  placeholder="https://.../jeux.png"
                  type="url"
                />
                <TextField
                  label="Image de fond (optionnelle)"
                  value={cfg.goldenBackgroundUrl}
                  onChange={set("goldenBackgroundUrl")}
                  placeholder="https://.../background.jpg"
                  type="url"
                />
                <div style={s.helperText}>
                  Si `Coffre` est selectionne, le template utilise `chest` de la couleur en cours.
                  Si `Image jeux` est selectionnee, il utilise automatiquement `jeux` dans le dossier de la variante.
                  L'image de fond remplace le background par defaut de la variante.
                </div>
              </Section>

              <Section title="Hero">
                <TextField label="Pseudo / marque" value={cfg.goldenBrandMain} onChange={set("goldenBrandMain")} />
                <TextField label="Sous-ligne logo (optionnelle)" value={cfg.goldenBrandSub} onChange={set("goldenBrandSub")} />
                <TextField label="Titre ligne 1" value={cfg.goldenHeroTitleBefore} onChange={set("goldenHeroTitleBefore")} />
                <TextField label="Titre ligne 2" value={cfg.goldenHeroTitleSpan} onChange={set("goldenHeroTitleSpan")} />
                <TextField label="Sous-titre" value={cfg.goldenHeroSubtitle} onChange={set("goldenHeroSubtitle")} multiline />
                <TextField label="Balise <title>" value={cfg.goldenPageTitle} onChange={set("goldenPageTitle")} />
              </Section>
            </>
          )}

        </div>

        {/* ── PREVIEW ─────────────────────────────────────────────────────── */}
        <div style={s.previewPanel}>
          <div style={s.previewToolbar}>
            <span style={{ fontSize: 12, color: "#888" }}>
              Aperçu live — Modèle {currentModel}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {(["desktop", "tablet", "mobile"] as const).map((v) => (
                <button
                  key={v}
                  style={{
                    ...s.vpBtn,
                    ...(viewport === v ? s.vpBtnActive : {}),
                  }}
                  onClick={() => setViewport(v)}
                >
                  {v === "desktop" ? "Desktop" : v === "tablet" ? "Tablette" : "Mobile"}
                </button>
              ))}
            </div>
          </div>
          <div style={s.previewWrap}>
            <iframe
              ref={iframeRef}
              style={{
                ...s.iframe,
                width: iframeWidth,
                maxWidth: iframeWidth,
              }}
              title="preview"
            />
          </div>
        </div>

      </div>{/* .body */}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#0d0d1a",
    color: "#e0e0f0",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  header: {
    height: 52,
    background: "#141428",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: 10,
    flexShrink: 0,
  },
  logo: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#FFD700",
    letterSpacing: "0.3px",
    whiteSpace: "nowrap",
  },
  btn: {
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    background: "#FFD700",
    color: "#000",
  },
  btnSuccess: {
    background: "#2ccf85",
    color: "#07110c",
  },
  btnVariant: {
    background: "#2a2348",
    color: "#f2e7ff",
    border: "1px solid rgba(194, 146, 255, 0.36)",
  },
  btnSecondary: {
    background: "#1c1c35",
    color: "#e0e0f0",
    border: "1px solid #2a2a4a",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },

  // Picker
  picker: {
    width: 148,
    background: "#141428",
    borderRight: "1px solid #2a2a4a",
    overflowY: "auto",
    padding: "10px 8px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  pickerTitle: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#666",
    padding: "0 4px",
    marginBottom: 2,
  },
  modelCard: {
    background: "#1c1c35",
    border: "2px solid #2a2a4a",
    borderRadius: 8,
    padding: "8px 6px",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.15s",
    width: "100%",
  },
  modelCardActive: {
    borderColor: "#FFD700",
    background: "rgba(255,215,0,0.06)",
  },
  modelThumb: {
    width: "100%",
    height: 68,
    borderRadius: 4,
    marginBottom: 6,
    overflow: "hidden",
    background: "#0a0a15",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modelLabel: {
    fontSize: "0.76rem",
    fontWeight: 600,
    color: "#e0e0f0",
  },
  modelDesc: {
    fontSize: "0.66rem",
    color: "#666",
    marginTop: 2,
  },

  // Config panel
  configPanel: {
    width: 300,
    background: "#0d0d1a",
    borderRight: "1px solid #2a2a4a",
    overflowY: "auto",
    flexShrink: 0,
    paddingBottom: 20,
  },
  section: {
    borderBottom: "1px solid #1e1e38",
    overflow: "hidden",
  },
  sectionHeader: {
    width: "100%",
    padding: "11px 16px",
    fontSize: "0.76rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#888",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "none",
    border: "none",
    color2: "#e0e0f0",
  } as React.CSSProperties,
  sectionBody: {
    padding: "2px 16px 14px",
  },
  field: {
    marginBottom: 10,
  },
  label: {
    display: "block",
    fontSize: "0.72rem",
    color: "#888",
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 5,
    color: "#e0e0f0",
    padding: "6px 9px",
    fontSize: "0.8rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  colorPicker: {
    width: 34,
    height: 28,
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    background: "none",
    cursor: "pointer",
    padding: 1,
    flexShrink: 0,
  },
  variantGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10,
  },
  variantBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 12px",
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 8,
    color: "#e0e0f0",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    textAlign: "left",
  },
  variantBtnActive: {
    background: "rgba(255,255,255,0.04)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
  },
  variantSwatch: {
    width: 14,
    height: 14,
    borderRadius: 999,
    flexShrink: 0,
  },
  visualModeIcon: {
    width: 16,
    textAlign: "center",
    flexShrink: 0,
  },
  helperText: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #2a2a4a",
    borderRadius: 6,
    color: "#b8b9c7",
    fontSize: "0.72rem",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  urlPreview: {
    marginBottom: 10,
    padding: "12px 13px",
    background: "linear-gradient(180deg, #18182c 0%, #121225 100%)",
    border: "1px solid rgba(255, 215, 0, 0.14)",
    borderRadius: 10,
    color: "#f7efc5",
    fontSize: "0.74rem",
    fontFamily: "monospace",
    lineHeight: 1.5,
    wordBreak: "break-all",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  savedPageStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10,
  },
  savedPageStatCard: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #262642",
    background: "linear-gradient(180deg, #17172b 0%, #121223 100%)",
  },
  savedPageStatValue: {
    fontSize: "1rem",
    fontWeight: 800,
    color: "#f4f0df",
  },
  savedPageStatLabel: {
    marginTop: 3,
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: ".08em",
    color: "#8f8fb4",
  },
  inlineError: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255, 96, 96, 0.12)",
    border: "1px solid rgba(255, 96, 96, 0.26)",
    borderRadius: 8,
    color: "#ffb2b2",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineWarn: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255, 215, 0, 0.09)",
    border: "1px solid rgba(255, 215, 0, 0.22)",
    borderRadius: 8,
    color: "#f2d978",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineNotice: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(44, 207, 133, 0.12)",
    border: "1px solid rgba(44, 207, 133, 0.26)",
    borderRadius: 8,
    color: "#a9efd0",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineInfo: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(111, 150, 207, 0.12)",
    border: "1px solid rgba(111, 150, 207, 0.22)",
    borderRadius: 8,
    color: "#c8daf8",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  savedPageTools: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  smallActionBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #2a2a4a",
    background: "#1c1c35",
    color: "#e0e0f0",
    fontSize: "0.7rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallActionBtnDanger: {
    color: "#ffb2b2",
    borderColor: "rgba(255, 96, 96, 0.28)",
    background: "rgba(95, 26, 34, 0.42)",
  },
  savedPageList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  savedPageGroupTitle: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: ".12em",
    fontWeight: 800,
    color: "#9f9fc1",
    marginTop: 2,
    marginBottom: 2,
  },
  savedPageCard: {
    border: "1px solid #2a2a46",
    borderRadius: 12,
    background: "linear-gradient(180deg, #17172c 0%, #111120 100%)",
    padding: 12,
    boxShadow: "0 12px 24px rgba(0,0,0,0.16)",
  },
  savedPageCardActive: {
    borderColor: "#FFD700",
    boxShadow: "0 0 0 1px rgba(255, 215, 0, 0.18) inset, 0 14px 28px rgba(0,0,0,0.18)",
  },
  savedPageHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  savedPageTitle: {
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#f4f0df",
    wordBreak: "break-word",
  },
  savedPageSlug: {
    marginTop: 6,
    display: "inline-flex",
    maxWidth: "100%",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#d7dbf6",
    fontSize: "0.65rem",
    fontFamily: "monospace",
    lineHeight: 1.35,
    wordBreak: "break-all",
  },
  savedPageMeta: {
    fontSize: "0.66rem",
    color: "#8f8fb4",
    marginTop: 8,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  savedPageBadge: {
    padding: "4px 7px",
    borderRadius: 999,
    fontSize: "0.6rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    background: "rgba(255, 215, 0, 0.14)",
    color: "#FFD700",
    border: "1px solid rgba(255, 215, 0, 0.24)",
    flexShrink: 0,
  },
  savedPageTag: {
    padding: "4px 7px",
    borderRadius: 999,
    fontSize: "0.6rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    background: "rgba(111, 150, 207, 0.14)",
    color: "#c8daf8",
    border: "1px solid rgba(111, 150, 207, 0.22)",
    flexShrink: 0,
  },
  savedPageActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  savedPageEmpty: {
    border: "1px dashed #2a2a4a",
    borderRadius: 10,
    padding: 12,
    color: "#8b8ba9",
    fontSize: "0.72rem",
    lineHeight: 1.45,
    textAlign: "center",
    background: "#121222",
  },
  errorBanner: {
    margin: 12,
    padding: "12px 14px",
    background: "rgba(224,17,95,0.08)",
    border: "1px solid rgba(224,17,95,0.3)",
    borderRadius: 6,
    fontSize: "0.78rem",
    color: "#e0115f",
    lineHeight: 1.6,
  },

  // Preview
  previewPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#111",
  },
  previewToolbar: {
    height: 36,
    background: "#141428",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    flexShrink: 0,
  },
  vpBtn: {
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    color: "#888",
    padding: "3px 10px",
    borderRadius: 4,
    fontSize: "0.72rem",
    cursor: "pointer",
  },
  vpBtnActive: {
    borderColor: "#FFD700",
    color: "#FFD700",
  },
  previewWrap: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    justifyContent: "center",
    background: "#111",
  },
  iframe: {
    border: "none",
    background: "white",
    height: "100%",
    transition: "width 0.2s",
  },
};
