export type M5V1Variant =
  | "gold" | "ruby" | "emerald" | "sapphire"
  | "amethyst" | "obsidian" | "rose" | "jade";

export const M5V1_VARIANTS: Array<{
  value: M5V1Variant;
  label: string;
  accent: string;
}> = [
  { value: "gold",     label: "Or",        accent: "#d4a843" },
  { value: "ruby",     label: "Rubis",     accent: "#bf6861" },
  { value: "emerald",  label: "Émeraude",  accent: "#69b98d" },
  { value: "sapphire", label: "Saphir",    accent: "#6f96cf" },
  { value: "amethyst", label: "Améthyste", accent: "#b06fd8" },
  { value: "obsidian", label: "Obsidian",  accent: "#c9aa60" },
  { value: "rose",     label: "Rose",      accent: "#e87aaa" },
  { value: "jade",     label: "Jade",      accent: "#5cb87a" },
];

export interface M5V1QuickConfig {
  affiLink: string;
  pseudo?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  profileImageUrl?: string;
  chestUrl?: string;
  visualMode?: "chest" | "jeux" | "none";
  jeuxUrl?: string;
  backgroundUrl?: string;
  telegramUrl?: string;
}

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const escAttr = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function darkenHex(hex: string, ratio = 0.65): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, Math.min(255, Math.round(parseInt(m[1], 16) * ratio)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(m[2], 16) * ratio)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(m[3], 16) * ratio)));
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function buildM5V1TelegramButton(url: string, variant: M5V1Variant): string {
  const accent = M5V1_VARIANTS.find((v) => v.value === variant)?.accent || "#d4a843";
  const dark = darkenHex(accent, 0.65);
  const safe = escAttr(url.trim());
  const rgb = accent.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const glow = rgb
    ? `rgba(${parseInt(rgb[1], 16)},${parseInt(rgb[2], 16)},${parseInt(rgb[3], 16)},.45)`
    : "rgba(0,0,0,.4)";
  return `<a href="${safe}" class="btn-telegram" target="_top" rel="sponsored noopener" style="display:inline-flex;align-items:center;justify-content:center;gap:10px;margin:-2px auto 10px;padding:13px 22px;border-radius:14px;background:linear-gradient(135deg,${accent} 0%,${darkenHex(accent, 0.85)} 50%,${dark} 100%);color:#fff;font-weight:800;font-family:inherit;letter-spacing:.02em;text-decoration:none;box-shadow:0 8px 22px ${glow},0 0 0 1px rgba(255,255,255,.18) inset;border:2px solid rgba(255,255,255,.35);width:100%;max-width:340px;font-size:.92rem;text-shadow:0 1px 2px rgba(0,0,0,.25)"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.054 5.56-5.022c.242-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.654-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg><span>Rejoindre le Telegram</span></a>`;
}

export function applyM5V1Config(
  htmlIn: string,
  cfg: M5V1QuickConfig,
  variant: M5V1Variant
): string {
  let html = htmlIn;

  html = html.replace(/__VARIANT__/g, variant);

  const dep = cfg.depositAmount != null ? String(cfg.depositAmount) : "20";
  const bon = cfg.bonusAmount != null ? String(cfg.bonusAmount) : "20";
  const tot = String((Number(dep) || 0) + (Number(bon) || 0));

  html = html.replace(/data-offer-deposit="[^"]*"/, `data-offer-deposit="${escAttr(dep)}"`);
  html = html.replace(/data-offer-bonus="[^"]*"/, `data-offer-bonus="${escAttr(bon)}"`);
  html = html.replace(/data-offer-total="[^"]*"/, `data-offer-total="${escAttr(tot)}"`);

  html = html.replace(
    /<h1 class="hero-title">[^<]*<span>[^<]*<\/span><\/h1>/,
    `<h1 class="hero-title">D&Eacute;POSEZ ${esc(dep)}&euro; <span>RECEVEZ ${esc(bon)}&euro;</span></h1>`
  );
  html = html.replace(
    /<p class="hero-subtitle"><strong>\+[^<]*<\/strong>[^<]*<\/p>/,
    `<p class="hero-subtitle"><strong>+${esc(bon)}&euro; offerts</strong> d&egrave;s ton premier d&eacute;p&ocirc;t.</p>`
  );
  html = html.replace(
    /<span class="step-deposit">[^<]*<\/span>/,
    `<span class="step-deposit">DEPOSEZ ${esc(dep)}EUR</span>`
  );
  html = html.replace(
    /<span class="step-receive">[^<]*<\/span>/,
    `<span class="step-receive">RECEVEZ ${esc(bon)}EUR</span>`
  );

  const newCtaInner = `R&Eacute;CLAMEZ VOS <span data-bind-offer-value="bonus">${esc(bon)}&euro;</span>`;
  html = html.replace(
    /<a([^>]*class="btn-jouer"[^>]*)>[\s\S]*?<\/a>/,
    `<a$1>${newCtaInner}</a>`
  );
  html = html.replace(
    /<a([^>]*class="sticky-cta"[^>]*)>[\s\S]*?<\/a>/,
    `<a$1>${newCtaInner}</a>`
  );

  const verticalOffsetCss = `<style data-affi-m5-v3-offset>
.hero-content { padding-top: 113px !important; }
@media (max-width: 720px) {
  .hero-content { padding-top: 80px !important; }
}
</style>`;
  html = html.replace(/<\/head>/, `${verticalOffsetCss}\n</head>`);

  const pseudoTrim = (cfg.pseudo || "").trim();
  html = html.replace(
    /<span class="brand-logo-main">[^<]*<\/span>/,
    `<span class="brand-logo-main">${esc(pseudoTrim)}</span>`
  );
  if (!pseudoTrim) {
    const hideSig = `<style data-affi-m5-hide-sig>.brand-signature{display:none !important;}</style>`;
    html = html.replace(/<\/head>/, `${hideSig}\n</head>`);
  }

  if (cfg.affiLink && cfg.affiLink.trim()) {
    const safe = escAttr(cfg.affiLink.trim());
    html = html.replace(/href="[^"]*" class="(btn-jouer[^"]*)"/g, `href="${safe}" class="$1"`);
    html = html.replace(/href="[^"]*" class="sticky-cta"/g, `href="${safe}" class="sticky-cta"`);
    html = html.replace(/href="[^"]*" class="chest-link"/g, `href="${safe}" class="chest-link"`);
    html = html.replace(/href="[^"]*" class="final-chest-link"/g, `href="${safe}" class="final-chest-link"`);
    html = html.replace(/href="[^"]*" class="trustpilot-button"/g, `href="${safe}" class="trustpilot-button"`);
  }

  if (cfg.profileImageUrl && cfg.profileImageUrl.trim()) {
    const safeAvatarUrl = escAttr(cfg.profileImageUrl.trim());
    const avatarBlock = `<div class="hero-avatar" data-affi-avatar><img src="${safeAvatarUrl}" alt="" loading="eager" decoding="async"></div>`;
    const avatarCss = `<style data-affi-avatar-style>
.hero-avatar{display:flex;justify-content:center;margin:0 auto 18px;width:clamp(96px,22vw,160px);aspect-ratio:1/1;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.12),0 0 0 4px var(--accent-soft,rgba(255,215,0,.18)),0 14px 36px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.06);background:rgba(0,0,0,.35)}
.hero-avatar img{width:100%;height:100%;object-fit:cover;display:block}
@media (min-width:900px){.hero-avatar{width:clamp(120px,12vw,176px);margin-bottom:22px}}
</style>`;
    html = html.replace(/<\/head>/, `${avatarCss}\n</head>`);
    html = html.replace(/<div class="brand-signature">/, `${avatarBlock}\n          <div class="brand-signature">`);
  }

  const visualMode = cfg.visualMode || "chest";
  if (visualMode === "none") {
    html = html.replace(
      /<\/style>/,
      `.chest-link, .final-chest-link, .cta-final-chest, .info-box, .gold-panel-final, .hero-card, #section-cta-final { display: none !important; min-height: 0 !important; }
.hero-content { justify-content: center !important; }
@media (max-width: 720px) {
  .hero-content { min-height: auto !important; }
  .hero-section { padding-bottom: clamp(28px, 6vh, 48px) !important; }
}
</style>`
    );
  } else if (visualMode === "jeux" && cfg.jeuxUrl && cfg.jeuxUrl.trim()) {
    const safe = escAttr(cfg.jeuxUrl.trim());
    html = html.replace(
      /<img data-visual-img="hero"[^>]*>/,
      `<img data-visual-img="hero" src="${safe}" alt="Visuel jeux" data-asset-img>`
    );
    html = html.replace(
      /<img data-visual-img="final"[^>]*>/,
      `<img data-visual-img="final" src="${safe}" alt="Visuel jeux final">`
    );
  } else if (cfg.chestUrl && cfg.chestUrl.trim()) {
    const safe = escAttr(cfg.chestUrl.trim());
    html = html.replace(
      /<img data-visual-img="hero"[^>]*>/,
      `<img data-visual-img="hero" src="${safe}" alt="Visuel bonus" data-asset-img>`
    );
    html = html.replace(
      /<img data-visual-img="final"[^>]*>/,
      `<img data-visual-img="final" src="${safe}" alt="Visuel bonus final">`
    );
  }

  if (cfg.backgroundUrl && cfg.backgroundUrl.trim()) {
    const safe = escAttr(cfg.backgroundUrl.trim());
    html = html.replace(
      /<img class="hero-bg-media"[^>]*>/,
      `<img class="hero-bg-media" src="${safe}" alt="">`
    );
  }

  if (cfg.telegramUrl && cfg.telegramUrl.trim()) {
    const tgBtn = buildM5V1TelegramButton(cfg.telegramUrl, variant);
    const wrapped = `<div class="m5v1-telegram-slot" style="display:flex;justify-content:center;width:100%">${tgBtn}</div>\n`;
    html = html.replace(
      /(<div class="brand-signature">[\s\S]*?<\/div>\s*)(<div class="offer-copy")/,
      `$1${wrapped}$2`
    );
  }

  const clickToEditScript = `<script data-affi-m5-v3-click-to-edit>
(function() {
  const MAP = [
    [".brand-logo-main", "pseudo"],
    [".brand-logo-sub", "pseudo"],
    [".hero-avatar", "profile"],
    [".hero-title", "amounts"],
    [".step-deposit", "amounts"],
    [".step-receive", "amounts"],
    [".hero-subtitle", "amounts"],
    [".btn-jouer", "amounts"],
    [".sticky-cta", "amounts"],
    [".promo-image-container", "visual"],
    [".chest-link", "visual"],
    [".final-chest-link", "visual"],
    [".hero-bg-media", "background"],
    [".hero-bg", "background"],
  ];
  function findKey(el) {
    while (el && el !== document.body) {
      for (const [sel, key] of MAP) {
        if (el.matches && el.matches(sel)) return key;
      }
      el = el.parentElement;
    }
    return null;
  }
  document.addEventListener("click", function(e) {
    const key = findKey(e.target);
    if (key) {
      e.preventDefault();
      e.stopPropagation();
      try { window.parent.postMessage({ type: "v3-m5-click", key: key }, "*"); } catch (_) {}
    }
  }, true);
  const style = document.createElement("style");
  style.textContent = ".brand-logo-main:hover, .brand-logo-sub:hover, .hero-avatar:hover, .hero-title:hover, .step-deposit:hover, .step-receive:hover, .hero-subtitle:hover, .btn-jouer:hover, .sticky-cta:hover, .promo-image-container:hover, .chest-link:hover, .final-chest-link:hover { outline: 2px dashed rgba(124,92,255,.6); outline-offset: 4px; cursor: pointer !important; }";
  document.head.appendChild(style);
})();
</script>`;
  html = html.replace(/<\/body>/, `${clickToEditScript}\n</body>`);

  return html;
}

export function buildM5V1ConfigForSave(cfg: M5V1QuickConfig): Record<string, string> {
  const dep = cfg.depositAmount != null ? String(cfg.depositAmount) : "20";
  const bon = cfg.bonusAmount != null ? String(cfg.bonusAmount) : "20";
  const tot = String((Number(dep) || 0) + (Number(bon) || 0));
  const out: Record<string, string> = {
    affiLink: cfg.affiLink || "",
    goldenBrandMain: cfg.pseudo?.trim() || "",
    goldenDepositAmount: dep,
    goldenBonusAmount: bon,
    goldenTotalAmount: tot,
    goldenProfileImageUrl: cfg.profileImageUrl?.trim() || "",
    goldenVisualMode: cfg.visualMode || "chest",
    goldenChestUrl: cfg.chestUrl?.trim() || "",
    goldenGameImageUrl: cfg.jeuxUrl?.trim() || "",
    goldenBackgroundUrl: cfg.backgroundUrl?.trim() || "",
    goldenTelegramUrl: cfg.telegramUrl?.trim() || "",
  };
  return out;
}
