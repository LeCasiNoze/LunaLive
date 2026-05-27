// Extracted from AffiEditorPage.tsx — helpers used by ReferralLandingPage.

export interface AffiButton {
  id: string;
  label: string;
  link: string;
  imageUrl: string;
  bgColor: string;
  textColor: string;
  xPct: number;
  yPct: number;
  widthPx: number;
  heightPx: number;
  borderRadius: number;
  fontSize: number;
  objectFit: "contain" | "cover" | "fill";
  transparent?: boolean;
  gradientDark?: string;
  gradientLight?: string;
  glow?: boolean;
  letterSpacingEm?: number;
  fontFamily?: string;
  fontWeight?: number;
  hoverEffect?: boolean;
  shine?: boolean;
}

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  open?: boolean;
}

const MAX_FAQ_ITEMS = 15;
const MAX_FAQ_QUESTION_LEN = 160;
const MAX_FAQ_ANSWER_LEN = 400;

function makeFaqId(): string {
  return `faq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  { id: makeFaqId(), q: "Le bonus de 20€ est garanti ?", a: "Oui. Dès que ton premier dépôt de 20€ est validé, le bonus est ajouté automatiquement.", open: true },
  { id: makeFaqId(), q: "Le bonus s'applique-t-il à tous les dépôts ?", a: "Non. Il s'applique uniquement à ton tout premier dépôt validé." },
  { id: makeFaqId(), q: "Je peux retirer mes gains ?", a: "Oui. Retrait disponible quand tu veux. Délai habituel sous 24h." },
  { id: makeFaqId(), q: "C'est fiable et sécurisé ?", a: "Oui. Plateforme licenciée, transactions chiffrées SSL et compte protégé." },
  { id: makeFaqId(), q: "Je peux jouer depuis mon téléphone ?", a: "Oui. Le site est entièrement optimisé mobile, tablette et PC. Aucune application à installer." },
  { id: makeFaqId(), q: "Quels modes de paiement sont acceptés ?", a: "CB, virement bancaire et solutions e-wallet selon ta localisation. Toutes les options sont affichées à l'étape de dépôt." },
  { id: makeFaqId(), q: "Y a-t-il des conditions de mise sur le bonus ?", a: "Oui, des conditions de mise s'appliquent. Consulte les CGU du casino pour connaître les exigences exactes avant de jouer." },
];

export function parseFaqItems(json: string | undefined | null): FaqItem[] {
  if (!json) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
    const cleaned: FaqItem[] = [];
    let openSeen = false;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const q = typeof item.q === "string" ? item.q : "";
      const a = typeof item.a === "string" ? item.a : "";
      const id = typeof item.id === "string" && item.id ? item.id : makeFaqId();
      const open = !openSeen && item.open === true;
      if (open) openSeen = true;
      cleaned.push({ id, q: q.slice(0, MAX_FAQ_QUESTION_LEN), a: a.slice(0, MAX_FAQ_ANSWER_LEN), open });
      if (cleaned.length >= MAX_FAQ_ITEMS) break;
    }
    if (cleaned.length === 0) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
    if (!openSeen) cleaned[0].open = true;
    return cleaned;
  } catch {
    return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
  }
}

function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function parseAffiButtons(json: string | undefined | null): AffiButton[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((b) => b && typeof b === "object" && typeof b.id === "string")
      .map((b) => ({
        ...b,
        bgColor: isValidHexColor(b.bgColor) ? b.bgColor : "#000000",
        textColor: isValidHexColor(b.textColor) ? b.textColor : "#ffffff",
      }));
  } catch {
    return [];
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(255,215,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const BUTTON_FONT_GOOGLE_IMPORT =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Bebas+Neue",
    "family=Cinzel:wght@600;700",
    "family=DM+Sans:wght@400;500;700",
    "family=Inter:wght@400;600;800",
    "family=Montserrat:wght@400;700;800",
    "family=Poppins:wght@400;700;800",
    "family=Oswald:wght@400;700",
    "family=Anton",
    "family=Roboto:wght@400;700",
  ].join("&") + "&display=swap";

export function injectButtonsIntoIframe(
  iframe: HTMLIFrameElement,
  buttons: AffiButton[] | { mobile?: AffiButton[]; desktop?: AffiButton[] }
) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  const mobileBtns = Array.isArray(buttons) ? buttons : (buttons.mobile || []);
  const desktopBtns = Array.isArray(buttons) ? [] : (buttons.desktop || []);

  const existing = doc.querySelector("[data-affi-buttons-wrap]");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  let styleTag = doc.querySelector("style[data-affi-buttons-style]") as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = doc.createElement("style");
    styleTag.setAttribute("data-affi-buttons-style", "");
    (doc.head || doc.body).appendChild(styleTag);
  }
  styleTag.textContent = `
    @import url("${BUTTON_FONT_GOOGLE_IMPORT}");
    @media (max-width: 899px) { [data-affi-btn-device="desktop"] { display: none !important; } }
    @media (min-width: 900px) { [data-affi-btn-device="mobile"]  { display: none !important; } }
    @keyframes affi-btn-shine {
      0%   { transform: translateX(-120%) skewX(-20deg); }
      60%  { transform: translateX(260%)  skewX(-20deg); }
      100% { transform: translateX(260%)  skewX(-20deg); }
    }
    [data-affi-btn-hover="1"] {
      transition: transform 160ms ease, filter 160ms ease !important;
    }
    [data-affi-btn-hover="1"]:hover {
      transform: translateY(-2px) scale(1.03) !important;
      filter: brightness(1.08) !important;
    }
    .affi-btn-shine-overlay {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 45% !important;
      height: 100% !important;
      background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.55) 50%, transparent 100%) !important;
      animation: affi-btn-shine 3.2s ease-in-out infinite !important;
      pointer-events: none !important;
      z-index: 1 !important;
      mix-blend-mode: screen !important;
    }
  `;

  if (mobileBtns.length === 0 && desktopBtns.length === 0) return;

  const wrap = doc.createElement("div");
  wrap.setAttribute("data-affi-buttons-wrap", "");
  wrap.style.cssText = "display:contents!important;";

  const all: Array<{ btn: AffiButton; device: "mobile" | "desktop" }> = [
    ...mobileBtns.map((btn) => ({ btn, device: "mobile" as const })),
    ...desktopBtns.map((btn) => ({ btn, device: "desktop" as const })),
  ];

  for (const { btn: b, device } of all) {
    const rawX = Number(b.xPct);
    const rawY = Number(b.yPct);
    const xPct = (!Number.isFinite(rawX) || rawX < 0 || rawX > 95) ? 35 : rawX;
    const yPct = (!Number.isFinite(rawY) || rawY < 0 || rawY > 95) ? 5  : rawY;
    const widthPx = clamp(Number(b.widthPx), 20, 2000);
    const heightPx = clamp(Number(b.heightPx), 20, 2000);
    const borderRadius = clamp(Number(b.borderRadius), 0, 200);
    const fontSize = clamp(Number(b.fontSize), 8, 200);
    const hasImage = !!b.imageUrl;
    const isTransparent = !!b.transparent;
    const bgColor = /^#[0-9a-fA-F]{6}$/.test(b.bgColor) ? b.bgColor : "#000000";
    const textColor = /^#[0-9a-fA-F]{6}$/.test(b.textColor) ? b.textColor : "#ffffff";
    const hasGradient = !!b.gradientDark && !!b.gradientLight && !isTransparent && !hasImage;
    const hasGlow = !!b.glow;

    const el = doc.createElement(b.link ? "a" : "div") as HTMLAnchorElement | HTMLDivElement;
    if (b.link && el.tagName === "A") {
      (el as HTMLAnchorElement).href = b.link;
      (el as HTMLAnchorElement).target = "_blank";
      (el as HTMLAnchorElement).rel = "noopener noreferrer";
    }

    const bgSize = b.objectFit === "cover" ? "cover" : b.objectFit === "fill" ? "100% 100%" : "contain";
    const bgParts: string[] = [];
    if (hasImage) bgParts.push(`url("${b.imageUrl.replace(/"/g, "%22")}") center center / ${bgSize} no-repeat`);
    if (hasGradient) {
      bgParts.push(`linear-gradient(180deg, ${b.gradientDark} 0%, ${bgColor} 38%, ${b.gradientLight} 52%, ${bgColor} 72%, ${b.gradientDark} 100%)`);
    } else if (!isTransparent) {
      bgParts.push(bgColor);
    }
    const backgroundValue = bgParts.length > 0 ? bgParts.join(", ") : "transparent";

    let boxShadow: string;
    if (hasGlow) {
      const glowAccent = hasGradient ? (b.gradientDark || bgColor) : bgColor;
      const glowSoft = hexToRgba(bgColor, 0.45);
      boxShadow = `inset 0 1px 0 rgba(255,255,255,0.24), 0 0 30px ${glowSoft}, 0 14px 24px rgba(0,0,0,0.36)`;
      void glowAccent;
    } else if (hasImage || isTransparent) {
      boxShadow = "none";
    } else {
      boxShadow = "0 4px 14px rgba(0,0,0,.35)";
    }

    const border = hasGlow
      ? `1px solid ${b.gradientDark || bgColor}`
      : (hasImage || isTransparent)
        ? "none"
        : "1px solid rgba(255,255,255,.08)";

    const letterSpacing = typeof b.letterSpacingEm === "number" && Number.isFinite(b.letterSpacingEm)
      ? `${b.letterSpacingEm}em`
      : "normal";

    const fontFamily = b.fontFamily && b.fontFamily.trim()
      ? b.fontFamily
      : "inherit";

    const fontWeight = typeof b.fontWeight === "number" && b.fontWeight > 0 ? b.fontWeight : 800;

    if (b.hoverEffect) el.setAttribute("data-affi-btn-hover", "1");
    if (b.shine) el.setAttribute("data-affi-btn-shine", "1");
    el.setAttribute("data-affi-btn-device", device);
    el.setAttribute("data-affi-btn-ypct", String(yPct));

    el.style.cssText = [
      "position:absolute!important",
      "pointer-events:auto!important",
      `left:${xPct}%!important`,
      `top:${yPct}%!important`,
      `width:${widthPx}px!important`,
      `height:${heightPx}px!important`,
      `background:${backgroundValue}!important`,
      `color:${textColor}!important`,
      `border-radius:${borderRadius}px!important`,
      `font-size:${fontSize}px!important`,
      `font-weight:${fontWeight}!important`,
      `font-family:${fontFamily}!important`,
      `letter-spacing:${letterSpacing}!important`,
      "display:flex!important",
      "align-items:center!important",
      "justify-content:center!important",
      "text-align:center!important",
      "text-decoration:none!important",
      "overflow:hidden!important",
      `box-shadow:${boxShadow}!important`,
      `border:${border}!important`,
      "cursor:pointer!important",
      "box-sizing:border-box!important",
      "z-index:2147483647!important",
      "margin:0!important",
      "padding:0!important",
      "opacity:1!important",
      "visibility:visible!important",
    ].join(";");

    if (hasImage) {
      const img = doc.createElement("img");
      img.src = b.imageUrl;
      img.alt = "";
      img.style.cssText = `position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:${b.objectFit}!important;display:block!important;pointer-events:none!important;opacity:1!important;visibility:visible!important;`;
      el.appendChild(img);
    }

    if (b.shine) {
      const shine = doc.createElement("div");
      shine.className = "affi-btn-shine-overlay";
      el.appendChild(shine);
    }

    if (b.label) {
      const span = doc.createElement("span");
      span.textContent = b.label;
      span.style.cssText = `position:relative!important;z-index:2!important;padding:0 8px!important;text-shadow:${hasImage ? "0 2px 6px rgba(0,0,0,.65)" : "none"}!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:100%!important;`;
      el.appendChild(span);
    }

    wrap.appendChild(el);
  }

  doc.body.appendChild(wrap);

  const getDocHeight = () => Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    doc.documentElement.clientHeight,
  );
  const updateAllPositions = () => {
    const h = getDocHeight();
    doc.querySelectorAll<HTMLElement>("[data-affi-btn-ypct]").forEach((btn) => {
      const y = parseFloat(btn.getAttribute("data-affi-btn-ypct") || "0");
      const topPx = Math.max(0, (h * y) / 100);
      btn.style.setProperty("top", `${topPx}px`, "important");
    });
  };

  updateAllPositions();
  doc.querySelectorAll("img").forEach((img) => {
    if (!(img as HTMLImageElement).complete) {
      img.addEventListener("load", updateAllPositions, { once: true });
      img.addEventListener("error", updateAllPositions, { once: true });
    }
  });
  const win = iframe.contentWindow;
  if (win) {
    const prev = (win as any).__affiBtnResize;
    if (prev) win.removeEventListener("resize", prev);
    (win as any).__affiBtnResize = updateAllPositions;
    win.addEventListener("resize", updateAllPositions);
  }
  try {
    const RO = (win as any)?.ResizeObserver || (typeof ResizeObserver !== "undefined" ? ResizeObserver : null);
    if (RO) {
      const ro = new RO(updateAllPositions);
      ro.observe(doc.body);
    }
  } catch {}
  setTimeout(updateAllPositions, 250);
  setTimeout(updateAllPositions, 1000);
  setTimeout(updateAllPositions, 2500);
}
