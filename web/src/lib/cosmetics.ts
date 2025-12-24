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
  // plus tard: url image
  hatEmoji?: string; // ex: "🧢"
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

export function usernameEffectClass(effect: UsernameEffect | undefined) {
  if (effect === "rainbow" || effect === "rainbow_scroll") return "username--rainbow";
  if (effect === "neon_underline") return "username--neon";
  if (effect === "chroma") return "username--chroma";
  if (effect === "gold") return "username--gold";
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

export function frameClass(frameId: FrameCosmetic["frameId"] | undefined) {
  if (frameId === "luna_petals") return "chatFrame--lunaPetals";
  if (frameId === "gold") return "chatFrame--gold";
  if (frameId === "eclipse") return "chatFrame--eclipse";
  if (frameId === "lotus_crown") return "chatFrame--lotusCrown";
  return "";
}

export function avatarBorderClass(borderId: AvatarCosmetic["borderId"] | undefined) {
  if (!borderId || borderId === "none") return "";
  if (borderId === "luna") return "avatarBorder--luna";
  if (borderId === "diamond") return "avatarBorder--diamond";
  if (borderId === "ghost") return "avatarBorder--ghost";
  return "";
}
