// api/src/cosmetics/catalog.ts
export type CosmeticKind = "username" | "badge" | "title" | "frame" | "hat";
export type CosmeticUnlock = "shop" | "achievement" | "role" | "event" | "system";

export type CosmeticItem = {
  kind: CosmeticKind;
  code: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "exclusive";
  unlock: CosmeticUnlock;
  priceRubis: number | null; // null si non-shop rubis
  pricePrestige?: number | null; // ✅ null/undefined si pas achetable prestige
  active: boolean;
  meta?: any;
};

export const COSMETICS_CATALOG: CosmeticItem[] = [
  // ─────────────────────────────────────────────
  // BADGES — SHOP
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
  // HATS
  // - Luna cap => SHOP (50 rubis)
  // - Demon / Couronne / Halo => ACHIEVEMENTS
  // - Le reste => SHOP
  // ─────────────────────────────────────────────
  { kind: "hat", code: "hat_luna_cap", name: "Luna Cap", rarity: "rare", unlock: "shop", priceRubis: 50, active: true },

  { kind: "hat", code: "hat_carton_crown", name: "Carton Crown", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "hat", code: "hat_demon_horn", name: "Demon Horn", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "hat", code: "hat_eclipse_halo", name: "Eclipse Halo", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },

  { kind: "hat", code: "hat_astral_helmet", name: "Astral Helmet", rarity: "legendary", unlock: "shop", priceRubis: 90000, active: true },
  { kind: "hat", code: "hat_lotus_aureole", name: "Lotus Aureole", rarity: "mythic", unlock: "shop", priceRubis: 120000, active: true },

  // ─────────────────────────────────────────────
  // USERNAME
  // - Arc-en-ciel => ACHIEVEMENTS
  // - Chroma toggle => ACHIEVEMENTS
  // - Gold toggle => SHOP
  // - Néon => agenda 30 jours => SYSTEM (non-shop)
  // ─────────────────────────────────────────────
  { kind: "username", code: "uanim_rainbow_scroll", name: "Arc-en-ciel défilant", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },

  {
    kind: "username",
    code: "uanim_chroma_toggle",
    name: "Chroma (toggle)",
    rarity: "legendary",
    unlock: "achievement",
    priceRubis: null,
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

  { kind: "username", code: "uanim_neon_underline", name: "Néon + soulignage", rarity: "rare", unlock: "system", priceRubis: null, active: true },

  // ─────────────────────────────────────────────
  // MESSAGE FRAMES
  // - Gold => SHOP
  // - Lotus Crown + Eclipse => ACHIEVEMENTS
  // ─────────────────────────────────────────────
  { kind: "frame", code: "mframe_gold", name: "Cadran Gold", rarity: "mythic", unlock: "shop", priceRubis: 180000, active: true },
  { kind: "frame", code: "mframe_lotus_crown", name: "Cadran Lotus Crown", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "frame", code: "mframe_eclipse", name: "Cadran Eclipse", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },

  // ─────────────────────────────────────────────
  // TITLES
  // - Ratus / Ça tourne / Vrai Viewer / No Life / Batman => ACHIEVEMENTS
  // - BigMoula => SHOP (rubis)
  // - LunaKing / All-in Man => SHOP (prestige)
  // ─────────────────────────────────────────────
  { kind: "title", code: "title_ratus", name: "Ratus", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_ca_tourne", name: "Ça tourne !", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_vrai_viewer", name: "Vrai Viewer", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_no_life", name: "No Life", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_batman", name: "Batman", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },

  // Shop rubis
  { kind: "title", code: "title_bigmoula", name: "BigMoula", rarity: "legendary", unlock: "shop", priceRubis: 60000, active: true },

  // Shop prestige
  { kind: "title", code: "title_lunaking", name: "LunaKing", rarity: "mythic", unlock: "shop", priceRubis: null, pricePrestige: 25, active: true, meta: { currency: "prestige" } },
  { kind: "title", code: "title_allin_man", name: "All-in Man", rarity: "mythic", unlock: "shop", priceRubis: null, pricePrestige: 40, active: true, meta: { currency: "prestige" } },

];
