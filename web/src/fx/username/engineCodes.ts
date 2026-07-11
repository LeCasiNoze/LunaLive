// Codes des effets pseudo rendus par le MOTEUR (canvas Pixi/GSAP).
// Module LÉGER, importable dans le bundle principal : aucun import de
// pixi/gsap ici (le moteur ne charge que via AnimatedUsername → import()).
import type { FxRarity } from "./types";

// code catalogue (= id du registre moteur) → rareté (pilote la qualité/pad)
export const ENGINE_USERNAME_RARITY: Record<string, FxRarity> = {
  "garden-of-ashes": "mythic",
  "jackpot-divin": "mythic",
  "leviathan-abyssal": "mythic",
  "forge-celeste": "mythic",
  "nuee-obsidienne": "mythic",
  "sablier-eternite": "mythic",
  "coeur-du-reacteur": "mythic",
  "eveil-lunaire": "legendary",
  "orage-interieur": "legendary",
  spectre: "legendary",
  cristallisation: "legendary",
  "ufx-chroma": "legendary",
  "ufx-glitch": "legendary",
  "ufx-galaxy": "legendary",
  "ufx-ice": "legendary",
  "ufx-fire": "epic",
  "ufx-gold": "epic",
  "ufx-pulse-red": "epic",
  "ufx-pulse-blue": "epic",
  "ufx-rainbow": "epic",
  "ufx-silver": "rare",
  "ufx-purple": "rare",
  "ufx-crimson": "rare",
  "ufx-neon": "rare",
};

// Anciens codes CSS (désactivés au catalogue mais encore possédés/équipés
// en DB) → leur remplaçant moteur. uanim_ember n'a pas d'équivalent : feu.
export const LEGACY_UANIM_TO_ENGINE: Record<string, string> = {
  uanim_pulse_red: "ufx-pulse-red",
  uanim_pulse_blue: "ufx-pulse-blue",
  uanim_glitch: "ufx-glitch",
  uanim_fire: "ufx-fire",
  uanim_ice: "ufx-ice",
  uanim_silver_toggle: "ufx-silver",
  uanim_purple_toggle: "ufx-purple",
  uanim_galaxy: "ufx-galaxy",
  uanim_rainbow_scroll: "ufx-rainbow",
  uanim_crimson: "ufx-crimson",
  uanim_chroma_toggle: "ufx-chroma",
  uanim_gold_toggle: "ufx-gold",
  uanim_neon_underline: "ufx-neon",
  uanim_ember: "ufx-fire",
};

/** Résout un code d'effet pseudo (moteur ou legacy) vers l'effet moteur. */
export function resolveEngineUsernameFx(code: string | null | undefined): { id: string; rarity: FxRarity } | null {
  const c = String(code || "");
  if (!c || c === "none") return null;
  const id = ENGINE_USERNAME_RARITY[c] ? c : LEGACY_UANIM_TO_ENGINE[c];
  if (!id) return null;
  return { id, rarity: ENGINE_USERNAME_RARITY[id] ?? "epic" };
}
