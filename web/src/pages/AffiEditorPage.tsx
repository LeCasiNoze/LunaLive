// web/src/pages/AffiEditorPage.tsx
// Éditeur de templates d'affiliation — accessible sur /editorFSN
// Aucun topbar ni footer : la page prend tout l'écran.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
};

// ─── APPLY CONFIG ─────────────────────────────────────────────────────────────

function esc(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str: string) {
  return esc(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

    if (cfg.goldenChestUrl) {
      const safeChestUrl = escAttr(cfg.goldenChestUrl);
      html = html.replace(
        /(<img src=")[^"]*(" alt="Coffre bonus" data-asset-img>)/,
        `$1${safeChestUrl}$2`
      );
      html = html.replace(
        /(<img src=")[^"]*(" alt="Coffre bonus final">)/,
        `$1${safeChestUrl}$2`
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AffiEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentModel, setCurrentModel] = useState(1);
  const [goldenVariant, setGoldenVariant] = useState<GoldenChanceVariant>("gold");
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [templates, setTemplates] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("returnTo") || "/FSB_Board?section=tools";
  }, [location.search]);

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

  // ── Live preview ───────────────────────────────────────────────────────────
  const updatePreview = useCallback(() => {
    if (!templates[currentModel] || !iframeRef.current) return;
    const html = applyConfig(templates[currentModel], cfg, currentModel, goldenVariant);
    iframeRef.current.srcdoc = html;
  }, [templates, currentModel, cfg, goldenVariant]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(updatePreview, 120);
  }, [updatePreview]);

  // ── Set a single config key ────────────────────────────────────────────────
  const set = (key: keyof Config) => (value: string) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportHtml() {
    if (!templates[currentModel]) return;
    let html = applyConfig(templates[currentModel], cfg, currentModel, goldenVariant);
    if (currentModel === 5) {
      html = html.replace(/\/affi_templates\//g, "./");
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
        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => { setCfg(DEFAULT_CONFIG); setGoldenVariant("gold"); }}>
          Réinitialiser
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

              <Section title="Lien & coffre">
                <TextField
                  label="Lien d'affiliation"
                  value={cfg.affiLink}
                  onChange={set("affiLink")}
                  placeholder="https://casino.com/ref/..."
                  type="url"
                />
                <TextField
                  label="Image du coffre (optionnelle)"
                  value={cfg.goldenChestUrl}
                  onChange={set("goldenChestUrl")}
                  placeholder="https://.../chest.png"
                  type="url"
                />
                <div style={s.helperText}>
                  Laisse ce champ vide pour utiliser automatiquement le coffre de la couleur selectionnee.
                </div>
              </Section>

              <Section title="Hero">
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
