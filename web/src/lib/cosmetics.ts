// web/src/lib/cosmetics.ts

export type Tier = "bronze" | "silver" | "gold" | "master";

/**
 * Username effects (chat)
 * - "rainbow" : existant
 * - "rainbow_scroll" : alias (catalog V1)
 * - "neon_underline" : existant
 * - "chroma" / "gold" : shop toggles
 */
export type UsernameEffect =
  | "none"
  | "rainbow"
  | "rainbow_scroll"
  | "neon_underline"
  | "chroma"
  | "gold";

export type TitleEffect = "none" | "shimmer" | "aurora";

export type ChatBadge = {
  id: string;
  label: string; // ex: "777", "LUNA"
  icon?: string; // ex: "🌙"
  tier?: Tier;
};

export type TitleCosmetic = {
  text: string; // ex: Card Shark
  tier: Tier;
  effect?: TitleEffect;
};

export type HatId =
  | "none"
  | "luna_cap"
  | "carton_crown"
  | "demon_horn"
  | "eclipse_halo"
  | "astral_helmet"
  | "lotus_aureole";

export type AvatarCosmetic = {
  borderId?: "none" | "luna" | "diamond" | "ghost";
  hatId?: HatId;
  hatEmoji?: string;
  url?: string; // ✅ NEW (avatar upload)
};

export type FrameId =
  | "none"
  | "luna_petals"
  | "gold"
  | "eclipse"
  | "lotus_crown";

export type FrameCosmetic = {
  frameId?: FrameId;
  tier?: Tier; // généralement master/prestige
};

export type ChatCosmetics = {
  avatar?: AvatarCosmetic;
  badges?: ChatBadge[];
  title?: TitleCosmetic | null;

  username?: {
    color?: string | null; // override (optionnel)
    effect?: UsernameEffect; // anim/effet
  };

  frame?: FrameCosmetic | null;
};

export function getInitials(username: string) {
  const s = (username || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s_\-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts[1]?.[0] ?? s[1] ?? "";
  return (a + b).toUpperCase();
}

export function formatHHMM(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function usernameEffectClass(effect: any) {
  const e = String(effect || "").trim();
  if (!e || e === "none" || e === "default") return "";

  // compat codes catalog (uanim_*)
  if (e === "rainbow" || e === "rainbow_scroll" || e === "uanim_rainbow_scroll") return "username--rainbow";
  if (e === "neon_underline" || e === "uanim_neon_underline") return "username--neon";
  if (e === "chroma" || e === "uanim_chroma_toggle") return "username--chroma";
  if (e === "gold" || e === "uanim_gold_toggle") return "username--gold";

  return "";
}

export function titleTierClass(tier: Tier) {
  return `title--${tier}`;
}

export function titleEffectClass(effect: TitleEffect | undefined) {
  if (effect === "shimmer") return "titleFx--shimmer";
  if (effect === "aurora") return "titleFx--aurora";
  return "";
}

export function frameClass(frameId: any) {
  const raw = String(frameId || "").trim();
  if (!raw || raw === "none") return "";

  // support "frame_xxx"
  const k = raw.startsWith("frame_") ? raw.slice(6) : raw;

  if (k === "luna_petals") return "chatFrame--lunaPetals";
  if (k === "gold" || k === "gold_shop") return "chatFrame--gold";
  if (k === "eclipse" || k === "eclipse_master") return "chatFrame--eclipse";
  if (k === "lotus_crown" || k === "lotus_event") return "chatFrame--lotusCrown";

  return "";
}

export function avatarBorderClass(borderId: AvatarCosmetic["borderId"] | undefined) {
  if (!borderId || borderId === "none") return "";
  if (borderId === "luna") return "avatarBorder--luna";
  if (borderId === "diamond") return "avatarBorder--diamond";
  if (borderId === "ghost") return "avatarBorder--ghost";
  return "";
}
