// ─────────────────────────────────────────────────────────────────────────────
// M5 V1 — applyConfig minimal pour la prévisualisation V3
//
// Ce module est un sous-ensemble FOCUSED du `applyConfig()` de
// AffiEditorPage.tsx. Il ne couvre QUE les substitutions exposées par le
// wizard V3 rapide (pseudo, montants, lien d'affi, variant, image profil,
// chest URL custom). Pour la fidélité totale du V1, l'utilisateur peut ouvrir
// la page dans `/editorFSN`.
//
// Source de vérité du template : web/public/affi_templates/model5.html
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Lien d'affi propagé sur tous les CTA. */
  affiLink: string;
  /** Pseudo affiché en brand-logo-main. Vide → garde "LeCasiNoze" du template. */
  pseudo?: string;
  /** X (en €) — déposé. Default 20. */
  depositAmount?: number | null;
  /** Y (en €) — bonus. Default 20. */
  bonusAmount?: number | null;
  /** Image profil ronde au-dessus du brand. */
  profileImageUrl?: string;
  /** URL custom pour le coffre. Si absent, garde le default variant-spécifique. */
  chestUrl?: string;
  /** "chest" (default), "jeux" ou "none" pour cacher tout le visuel. */
  visualMode?: "chest" | "jeux" | "none";
  /** URL custom pour l'image jeux (si visualMode=jeux). */
  jeuxUrl?: string;
  /** URL custom pour le background hero. */
  backgroundUrl?: string;
}

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const escAttr = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export function applyM5V1Config(
  htmlIn: string,
  cfg: M5V1QuickConfig,
  variant: M5V1Variant
): string {
  let html = htmlIn;

  // 1) Variant — remplace tous les __VARIANT__ par la valeur
  html = html.replace(/__VARIANT__/g, variant);

  // 2) Montants — deposit, bonus, total = deposit + bonus
  const dep = cfg.depositAmount != null ? String(cfg.depositAmount) : "20";
  const bon = cfg.bonusAmount != null ? String(cfg.bonusAmount) : "20";
  const tot = String((Number(dep) || 0) + (Number(bon) || 0));

  // data-offer-* (le script landing-base.js propage vers [data-bind-offer-value])
  html = html.replace(/data-offer-deposit="[^"]*"/, `data-offer-deposit="${escAttr(dep)}"`);
  html = html.replace(/data-offer-bonus="[^"]*"/, `data-offer-bonus="${escAttr(bon)}"`);
  html = html.replace(/data-offer-total="[^"]*"/, `data-offer-total="${escAttr(tot)}"`);

  // Textes hardcodés non touchés par le script
  html = html.replace(
    /<h1 class="hero-title">[^<]*<span>[^<]*<\/span><\/h1>/,
    `<h1 class="hero-title">D&Eacute;POSE ${esc(dep)}&euro; <span>JOUE A ${esc(tot)}&euro;</span></h1>`
  );
  html = html.replace(
    /<p class="hero-subtitle"><strong>\+[^<]*<\/strong>[^<]*<\/p>/,
    `<p class="hero-subtitle"><strong>+${esc(bon)}&euro; offerts</strong> d&egrave;s ton premier d&eacute;p&ocirc;t.</p>`
  );
  html = html.replace(
    /<span class="step-deposit">[^<]*<\/span>/,
    `<span class="step-deposit">DEPOSE ${esc(dep)}EUR</span>`
  );
  html = html.replace(
    /<span class="step-receive">[^<]*<\/span>/,
    `<span class="step-receive">RECOIS ${esc(bon)}EUR</span>`
  );

  // 3) Pseudo (brand-logo-main)
  if (cfg.pseudo && cfg.pseudo.trim()) {
    html = html.replace(
      /<span class="brand-logo-main">[^<]*<\/span>/,
      `<span class="brand-logo-main">${esc(cfg.pseudo.trim())}</span>`
    );
  }

  // 4) Affi link sur tous les CTAs
  if (cfg.affiLink && cfg.affiLink.trim()) {
    const safe = escAttr(cfg.affiLink.trim());
    html = html.replace(/href="[^"]*" class="(btn-jouer[^"]*)"/g, `href="${safe}" class="$1"`);
    html = html.replace(/href="[^"]*" class="sticky-cta"/g, `href="${safe}" class="sticky-cta"`);
    html = html.replace(/href="[^"]*" class="chest-link"/g, `href="${safe}" class="chest-link"`);
    html = html.replace(/href="[^"]*" class="final-chest-link"/g, `href="${safe}" class="final-chest-link"`);
    html = html.replace(/href="[^"]*" class="trustpilot-button"/g, `href="${safe}" class="trustpilot-button"`);
  }

  // 5) Image profil ronde au-dessus du brand-signature.
  // Mirror EXACT du V1 applyConfig (AffiEditorPage:1027) pour parité preview/publié.
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

  // 6) Visuel : chest URL custom OU jeux URL OU mode "none" (cache tout le visuel)
  const visualMode = cfg.visualMode || "chest";
  if (visualMode === "none") {
    // Hide visual + adjust hero layout (extrait du applyConfig V1 pour mode "none")
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

  // 7) Background hero custom
  if (cfg.backgroundUrl && cfg.backgroundUrl.trim()) {
    const safe = escAttr(cfg.backgroundUrl.trim());
    html = html.replace(
      /<img class="hero-bg-media"[^>]*>/,
      `<img class="hero-bg-media" src="${safe}" alt="">`
    );
  }

  return html;
}

/** Construit la Config V1 (legacy format) à partir des inputs V3 wizard.
 *  Cette config est sauvegardée en DB avec editorVersion=1, model=5,
 *  variant=goldenVariant. ReferralLandingPage la rend ensuite via le
 *  pipeline V1 standard (applyConfig + iframe). */
export function buildM5V1ConfigForSave(cfg: M5V1QuickConfig): Record<string, string> {
  const dep = cfg.depositAmount != null ? String(cfg.depositAmount) : "20";
  const bon = cfg.bonusAmount != null ? String(cfg.bonusAmount) : "20";
  const tot = String((Number(dep) || 0) + (Number(bon) || 0));
  const out: Record<string, string> = {
    affiLink: cfg.affiLink || "",
    goldenBrandMain: cfg.pseudo?.trim() || "LeCasiNoze",
    goldenDepositAmount: dep,
    goldenBonusAmount: bon,
    goldenTotalAmount: tot,
    goldenProfileImageUrl: cfg.profileImageUrl?.trim() || "",
    goldenVisualMode: cfg.visualMode || "chest",
    goldenChestUrl: cfg.chestUrl?.trim() || "",
    goldenGameImageUrl: cfg.jeuxUrl?.trim() || "",
    goldenBackgroundUrl: cfg.backgroundUrl?.trim() || "",
  };
  return out;
}
