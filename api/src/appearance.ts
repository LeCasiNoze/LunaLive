// api/src/appearance.ts

export type SubBadge = {
  enabled: boolean;
  text: string; // <= 8 chars
  borderColor: string;
  textColor: string;
};

export type SubHat = {
  id: string | null; // placeholder
};

export type ChatSubAppearance = {
  usernameColor: string;
  messageColor: string;
  badge: SubBadge;
  hat: SubHat;
};

export type ChatAppearance = {
  viewerSkinsLevel?: 1 | 2 | 3; // ✅ NEW
  usernameColor: string;
  messageColor: string;
  sub: ChatSubAppearance;
};

export type Appearance = {
  chat: ChatAppearance;
};

export const PRESET_COLORS = [
  { id: "ghost_purple", name: "Ghost Purple", hex: "#7C4DFF" },
  { id: "blue_lotus", name: "Blue Lotus", hex: "#4AA3FF" },
  { id: "neon_mint", name: "Neon Mint", hex: "#2EF2B3" },
  { id: "rose_nova", name: "Rose Nova", hex: "#FF4DD8" },
  { id: "sunset", name: "Sunset", hex: "#FF7A59" },
  { id: "gold_soft", name: "Soft Gold", hex: "#FFD54A" },
  { id: "ice", name: "Ice", hex: "#9AE6FF" },
  { id: "lime", name: "Lime", hex: "#A3FF4A" },
] as const;

export const DEFAULT_APPEARANCE: Appearance = {
  chat: {
    viewerSkinsLevel: 1, // ✅ NEW
    usernameColor: "#7C4DFF",
    messageColor: "#FFFFFF",
    sub: {
      usernameColor: "#9AE6FF",
      messageColor: "#FFFFFF",
      badge: {
        enabled: true,
        text: "SUB",
        borderColor: "#7C4DFF",
        textColor: "#FFFFFF",
      },
      hat: { id: null },
    },
  },
};

function clampViewerSkinsLevel(v: any): 1 | 2 | 3 {
  const n = Number(v);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

// ✅ aligné avec le front (6 ou 8 hex)
function isHexColor(s: any): s is string {
  if (typeof s !== "string") return false;
  const v = s.trim();
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
}

function clampBadgeText(s: any) {
  const t = String(s ?? "").trim();
  const safe = t.replace(/[^\w\-]/g, "");
  return (safe || "SUB").slice(0, 8);
}

function pickHex(input: any, fallback: string) {
  return isHexColor(input) ? input.trim().toUpperCase() : fallback;
}

export function normalizeAppearance(raw: any): Appearance {
  const base = DEFAULT_APPEARANCE;

  const chatRaw = raw?.chat ?? raw ?? {};

  const viewerSkinsLevel = clampViewerSkinsLevel(chatRaw?.viewerSkinsLevel ?? base.chat.viewerSkinsLevel);

  const usernameColor = pickHex(chatRaw?.usernameColor, base.chat.usernameColor);
  const messageColor = pickHex(chatRaw?.messageColor, base.chat.messageColor);

  const subRaw = chatRaw?.sub ?? {};
  const subUsernameColor = pickHex(subRaw?.usernameColor, base.chat.sub.usernameColor);
  const subMessageColor = pickHex(subRaw?.messageColor, base.chat.sub.messageColor);

  const badgeRaw = subRaw?.badge ?? {};
  const badgeEnabled = typeof badgeRaw?.enabled === "boolean" ? badgeRaw.enabled : base.chat.sub.badge.enabled;

  const badgeText = clampBadgeText(badgeRaw?.text ?? base.chat.sub.badge.text);
  const badgeBorderColor = pickHex(badgeRaw?.borderColor, base.chat.sub.badge.borderColor);
  const badgeTextColor = pickHex(badgeRaw?.textColor, base.chat.sub.badge.textColor);

  const hatRaw = subRaw?.hat ?? {};
  const hatId = hatRaw?.id === null || typeof hatRaw?.id === "string" ? hatRaw.id : base.chat.sub.hat.id;

  return {
    chat: {
      viewerSkinsLevel,
      usernameColor,
      messageColor,
      sub: {
        usernameColor: subUsernameColor,
        messageColor: subMessageColor,
        badge: {
          enabled: !!badgeEnabled,
          text: badgeText,
          borderColor: badgeBorderColor,
          textColor: badgeTextColor,
        },
        hat: { id: hatId ?? null },
      },
    },
  };
}

export default normalizeAppearance;

export function mergeAppearance(base: any, patch: any): Appearance {
  const b = normalizeAppearance(base);
  const p = patch ?? {};

  const out: any = JSON.parse(JSON.stringify(b));
  const chat = p?.chat ?? p;

  if (chat && typeof chat === "object") {
    if (chat.viewerSkinsLevel !== undefined) out.chat.viewerSkinsLevel = chat.viewerSkinsLevel;

    if (chat.usernameColor !== undefined) out.chat.usernameColor = chat.usernameColor;
    if (chat.messageColor !== undefined) out.chat.messageColor = chat.messageColor;

    const sub = chat.sub;
    if (sub && typeof sub === "object") {
      if (sub.usernameColor !== undefined) out.chat.sub.usernameColor = sub.usernameColor;
      if (sub.messageColor !== undefined) out.chat.sub.messageColor = sub.messageColor;

      const badge = sub.badge;
      if (badge && typeof badge === "object") {
        if (badge.enabled !== undefined) out.chat.sub.badge.enabled = badge.enabled;
        if (badge.text !== undefined) out.chat.sub.badge.text = badge.text;
        if (badge.borderColor !== undefined) out.chat.sub.badge.borderColor = badge.borderColor;
        if (badge.textColor !== undefined) out.chat.sub.badge.textColor = badge.textColor;
      }

      const hat = sub.hat;
      if (hat && typeof hat === "object") {
        if (hat.id !== undefined) out.chat.sub.hat.id = hat.id;
      }
    }
  }

  return normalizeAppearance(out);
}
