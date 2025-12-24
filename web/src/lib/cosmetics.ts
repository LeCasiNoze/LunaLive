// web/src/lib/cosmetics.ts
export type Tier = "bronze" | "silver" | "gold" | "master";

export type UsernameEffect = "none" | "rainbow" | "neon_underline";
export type TitleEffect = "none" | "shimmer" | "aurora";

export type ChatBadge = {
  id: string;
  label: string;      // ex: "SUB", "LUNA"
  icon?: string;      // ex: "🌙"
  tier?: Tier;
};

export type TitleCosmetic = {
  text: string;       // ex: Card Shark
  tier: Tier;
  effect?: TitleEffect;
};

export type AvatarCosmetic = {
  borderId?: "none" | "luna" | "diamond" | "ghost";
  hatId?: "none" | "luna_cap";
  // plus tard: url image
  hatEmoji?: string; // ex: "🧢"
};

export type FrameCosmetic = {
  frameId?: "none" | "luna_petals";
  tier?: Tier; // généralement master/prestige
};

export type ChatCosmetics = {
  avatar?: AvatarCosmetic;
  badges?: ChatBadge[];
  title?: TitleCosmetic | null;

  username?: {
    color?: string | null;       // override (optionnel)
    effect?: UsernameEffect;     // anim/effet
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
  if (effect === "rainbow") return "username--rainbow";
  if (effect === "neon_underline") return "username--neon";
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
  return "";
}

export function avatarBorderClass(borderId: AvatarCosmetic["borderId"] | undefined) {
  if (!borderId || borderId === "none") return "";
  if (borderId === "luna") return "avatarBorder--luna";
  if (borderId === "diamond") return "avatarBorder--diamond";
  if (borderId === "ghost") return "avatarBorder--ghost";
  return "";
}
