export type CosmeticKind = "username" | "badge" | "title" | "frame" | "hat";
export type CosmeticUnlock = "shop" | "achievement" | "role" | "event" | "system";

export type CosmeticItem = {
  kind: CosmeticKind;
  code: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "exclusive";
  unlock: CosmeticUnlock;
  priceRubis: number | null; // null si non-shop
  active: boolean;
  meta?: any;
};

export const COSMETICS_CATALOG: CosmeticItem[] = [
  // ─────────────────────────────────────────────
  // BADGES (rectangle letters) — SHOP
  // ─────────────────────────────────────────────
  {
    kind: "badge",
    code: "badge_luna",
    name: "Badge LUNA",
    rarity: "uncommon",
    unlock: "shop",
    priceRubis: 12000,
    active: true,
    meta: { shape: "rect", text: "LUNA" },
  },
  {
    kind: "badge",
    code: "badge_777",
    name: "Badge 777",
    rarity: "legendary",
    unlock: "shop",
    priceRubis: 90000,
    active: true,
    meta: { shape: "rect", text: "777" },
  },

  // ─────────────────────────────────────────────
  // HATS — SHOP (ta liste)
  // ─────────────────────────────────────────────
  { kind: "hat", code: "hat_luna_cap", name: "Luna Cap", rarity: "rare", unlock: "shop", priceRubis: 25000, active: true },
  { kind: "hat", code: "hat_carton_crown", name: "Carton Crown", rarity: "epic", unlock: "shop", priceRubis: 40000, active: true },
  { kind: "hat", code: "hat_demon_horn", name: "Demon Horn", rarity: "epic", unlock: "shop", priceRubis: 45000, active: true },
  { kind: "hat", code: "hat_eclipse_halo", name: "Eclipse Halo", rarity: "legendary", unlock: "shop", priceRubis: 70000, active: true },
  { kind: "hat", code: "hat_astral_helmet", name: "Astral Helmet", rarity: "legendary", unlock: "shop", priceRubis: 90000, active: true },
  { kind: "hat", code: "hat_lotus_aureole", name: "Lotus Aureole", rarity: "mythic", unlock: "shop", priceRubis: 120000, active: true },

  // ─────────────────────────────────────────────
  // USERNAME (animations) — SHOP
  // NOTE: rainbow + neon => achievements (pas shop)
  // ─────────────────────────────────────────────
  {
    kind: "username",
    code: "uanim_chroma_toggle",
    name: "Chroma (toggle)",
    rarity: "legendary",
    unlock: "shop",
    priceRubis: 140000,
    active: true,
    meta: { toggle: true, style: "chroma" },
  },
  {
    kind: "username",
    code: "uanim_gold_toggle",
    name: "Gold (toggle)",
    rarity: "epic",
    unlock: "shop",
    priceRubis: 100000,
    active: true,
    meta: { toggle: true, style: "gold" },
  },

  // ─────────────────────────────────────────────
  // USERNAME — ACHIEVEMENTS (locked pour l’instant)
  // ─────────────────────────────────────────────
  { kind: "username", code: "uanim_rainbow_scroll", name: "Arc-en-ciel défilant", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
  { kind: "username", code: "uanim_neon_underline", name: "Néon + soulignage", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },

  // ─────────────────────────────────────────────
  // MESSAGE FRAMES — 1 shop (gold) + rares rewards
  // ─────────────────────────────────────────────
  { kind: "frame", code: "mframe_gold", name: "Cadran Gold", rarity: "mythic", unlock: "shop", priceRubis: 180000, active: true },
  { kind: "frame", code: "mframe_eclipse", name: "Cadran Eclipse", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "frame", code: "mframe_lotus_crown", name: "Cadran Lotus Crown", rarity: "mythic", unlock: "event", priceRubis: null, active: true },

  // ─────────────────────────────────────────────
  // TITLES => tu les gères via achievements (donc on laisse vide/shop none)
  // ─────────────────────────────────────────────
];
