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
  // Prix: 250 rubis (LUNA + 777)
  // ─────────────────────────────────────────────
  {
    kind: "badge",
    code: "badge_luna",
    name: "Badge LUNA",
    rarity: "uncommon",
    unlock: "shop",
    priceRubis: 250,
    active: true,
    meta: { shape: "rect", text: "LUNA" },
  },
  {
    kind: "badge",
    code: "badge_777",
    name: "Badge 777",
    rarity: "legendary",
    unlock: "shop",
    priceRubis: 250,
    active: true,
    meta: { shape: "rect", text: "777" },
  },

  // ─────────────────────────────────────────────
  // HATS
  // Prix shop: 500 rubis
  // Achievement: pas achetable (priceRubis: null)
  // ─────────────────────────────────────────────
  { kind: "hat", code: "hat_luna_cap", name: "Luna Cap", rarity: "rare", unlock: "shop", priceRubis: 500, active: true },

  { kind: "hat", code: "hat_carton_crown", name: "Carton Crown", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "hat", code: "hat_demon_horn", name: "Demon Horn", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "hat", code: "hat_eclipse_halo", name: "Eclipse Halo", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },

  { kind: "hat", code: "hat_astral_helmet", name: "Astral Helmet", rarity: "legendary", unlock: "shop", priceRubis: 500, active: true },
  { kind: "hat", code: "hat_lotus_aureole", name: "Lotus Aureole", rarity: "mythic", unlock: "shop", priceRubis: 500, active: true },

  // ─────────────────────────────────────────────
  // USERNAME
  // Prix shop: 2000 rubis
  // Achievement/system: pas achetable rubis (null)
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
    priceRubis: 2000,
    active: true,
    meta: { toggle: true, style: "gold" },
  },

  { kind: "username", code: "uanim_neon_underline", name: "Néon + soulignage", rarity: "rare", unlock: "system", priceRubis: null, active: true },
  // ─── USERNAME — FROST ───────────────────────────────────────────────────────
  {
    kind: "username",
    code: "uanim_frost",
    name: "Frost (glacé)",
    rarity: "rare",
    unlock: "shop",
    priceRubis: 2000,
    active: true,
    meta: { style: "frost" },
  },

  // ─── USERNAME — EMBER ───────────────────────────────────────────────────────
  {
    kind: "username",
    code: "uanim_ember",
    name: "Ember (braise)",
    rarity: "epic",
    unlock: "shop",
    priceRubis: 2000,
    active: true,
    meta: { style: "ember" },
  },

  // ─────────────────────────────────────────────
  // MESSAGE FRAMES
  // Gold (shop): 3000 rubis
  // Achievements: pas achetable (null)
  // ─────────────────────────────────────────────
  { kind: "frame", code: "mframe_gold", name: "Cadran Gold", rarity: "mythic", unlock: "shop", priceRubis: 3000, active: true },
  { kind: "frame", code: "mframe_lotus_crown", name: "Cadran Lotus Crown", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "frame", code: "mframe_eclipse", name: "Cadran Eclipse", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  {
    kind: "frame",
    code: "mframe_void",
    name: "Cadran Void",
    rarity: "legendary",
    unlock: "shop",
    priceRubis: 3000,
    active: true,
  },

  // ─── FRAME — AURORA ─────────────────────────────────────────────────────────
  {
    kind: "frame",
    code: "mframe_aurora",
    name: "Cadran Aurora",
    rarity: "epic",
    unlock: "shop",
    priceRubis: 3000,
    active: true,
  },
  // ─────────────────────────────────────────────
  // TITLES (Sprint 3.5b — uniquement débloqués via succès)
  // Tous les titres deviennent achievement-only. Les anciens titres shop
  // (BigMoula, LunaKing, All-in Man) sont conservés mais en source achievement
  // pour compatibilité — les users qui les ont déjà gardent leur entitlement.
  // ─────────────────────────────────────────────
  { kind: "title", code: "title_ratus", name: "Ratus", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_ca_tourne", name: "Ça tourne !", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_vrai_viewer", name: "Vrai Viewer", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_no_life", name: "No Life", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_batman", name: "Batman", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_bigmoula", name: "BigMoula", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_lunaking", name: "LunaKing", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "title", code: "title_allin_man", name: "All-in Man", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
];
