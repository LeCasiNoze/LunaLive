// Arsenal du boss (burn_boss). Côté serveur, 1 rubis brûlé = 1 dégât
// (EVENT_REWARD_CONFIGS.burn_boss.boss.ratio = 1), donc chaque arme n'est
// qu'un montant préréglé passé à postBossBurn — aucune logique backend
// dédiée. `power` (0..1) pilote l'intensité du flinch/des braises ; `anim`
// choisit la cinématique jouée dans weaponFx.tsx.
export type BossWeaponAnim = "bullet" | "rocket" | "slash" | "chains" | "blades" | "orbital";

export type BossWeapon = {
  id: string;
  name: string;
  emoji: string;
  price: number; // rubis = dégâts
  anim: BossWeaponAnim;
  power: number; // 0..1 intensité visuelle
  tagline: string;
  hot?: boolean; // met en avant (populaire / ultime)
};

export const BOSS_WEAPONS: BossWeapon[] = [
  { id: "balle", name: "Balle", emoji: "🔫", price: 10, anim: "bullet", power: 0.18, tagline: "Tir sec" },
  { id: "roquette", name: "Roquette", emoji: "🚀", price: 200, anim: "rocket", power: 0.55, tagline: "Tête chercheuse", hot: true },
  { id: "sabre", name: "Sabre dimensionnel", emoji: "⚔️", price: 400, anim: "slash", power: 0.7, tagline: "Entaille l'écran" },
  { id: "chaines", name: "Châtiment enchaîné", emoji: "⛓️", price: 600, anim: "chains", power: 0.82, tagline: "Capture et broie" },
  { id: "lames", name: "Pluie de lames", emoji: "🗡️", price: 800, anim: "blades", power: 0.9, tagline: "Arsenal céleste", hot: true },
  { id: "orbital", name: "Frappe orbitale", emoji: "☄️", price: 1000, anim: "orbital", power: 1, tagline: "Apocalypse", hot: true },
];

// Délai (s) entre le tir et l'impact réel sur le boss — synchronise le
// flinch du boss et la gerbe de braises avec le moment où la cinématique
// touche (hitAt × durée, cf weaponFx.tsx).
export const ATTACK_IMPACT_DELAY: Record<BossWeaponAnim, number> = {
  bullet: 0.3,
  rocket: 1.61,
  slash: 0.64,
  chains: 2.05,
  blades: 1.6,
  orbital: 1.98,
};
