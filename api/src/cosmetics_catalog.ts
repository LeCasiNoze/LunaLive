// api/src/cosmetics_catalog.ts
export type CosmeticKind = "username" | "badge" | "title" | "frame" | "hat";
export type CosmeticUnlock = "shop" | "achievement" | "role" | "event" | "system";

export type CosmeticCatalogItem = {
  kind: CosmeticKind;
  code: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "exclusive";
  unlock: CosmeticUnlock;
  priceRubis: number | null; // null si pas achetable
  active: boolean;
  meta?: any;
};

// ✅ Catalogue V1 (aligné avec ta décision)
export const COSMETICS_CATALOG: CosmeticCatalogItem[] = [
  // ── BADGES shop (rectangles LUNA / 777)
  { kind: "badge", code: "badge_luna", name: "Badge LUNA", rarity: "uncommon", unlock: "shop", priceRubis: 2500, active: true },
  { kind: "badge", code: "badge_777",  name: "Badge 777",  rarity: "legendary", unlock: "shop", priceRubis: 20000, active: true },

  // ── HATS (ceux que tu gardes)
  { kind: "hat", code: "hat_luna_cap",       name: "Luna Cap",       rarity: "uncommon", unlock: "shop", priceRubis: 6000, active: true },
  { kind: "hat", code: "hat_carton_crown",   name: "Carton Crown",   rarity: "rare",     unlock: "shop", priceRubis: 12000, active: true },
  { kind: "hat", code: "hat_demon_horn",     name: "Demon Horn",     rarity: "rare",     unlock: "shop", priceRubis: 14000, active: true },
  { kind: "hat", code: "hat_eclipse_halo",   name: "Eclipse Halo",   rarity: "epic",     unlock: "shop", priceRubis: 22000, active: true },
  { kind: "hat", code: "hat_astral_helmet",  name: "Astral Helmet",  rarity: "epic",     unlock: "shop", priceRubis: 28000, active: true },
  { kind: "hat", code: "hat_lotus_aureole",  name: "Lotus Aureole",  rarity: "epic",     unlock: "shop", priceRubis: 32000, active: true },

  // ── ANIMS pseudo (shop: chroma toggle + gold toggle)
  { kind: "username", code: "uanim_chroma_toggle", name: "Chroma (toggle)", rarity: "legendary", unlock: "shop", priceRubis: 35000, active: true },
  { kind: "username", code: "uanim_gold_toggle",   name: "Gold (toggle)",   rarity: "epic",      unlock: "shop", priceRubis: 25000, active: true },

  // ── ANIMS pseudo (succès, pas shop)
  { kind: "username", code: "uanim_rainbow_scroll", name: "Arc-en-ciel défilant", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
  { kind: "username", code: "uanim_neon_underline", name: "Néon + soulignage",   rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },

  // ── CADRANS message (1 achetable gold + quelques rares hors shop pour plus tard)
  { kind: "frame", code: "frame_gold_shop",      name: "Cadran Gold",        rarity: "legendary", unlock: "shop",        priceRubis: 40000, active: true },
  { kind: "frame", code: "frame_eclipse_master", name: "Cadran Eclipse",     rarity: "mythic",    unlock: "achievement", priceRubis: null,  active: true },
  { kind: "frame", code: "frame_lotus_event",    name: "Cadran Lotus Crown", rarity: "mythic",    unlock: "event",       priceRubis: null,  active: true },

  // ── TITRES : tu as dit “gérés par achievements” → on peut laisser vide pour l’instant.
];
