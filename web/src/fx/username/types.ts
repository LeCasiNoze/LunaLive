// Moteur d'effets pseudo — contrats partagés.
// IMPORTANT : uniquement des imports TYPE de pixi.js ici (le code pixi/gsap
// ne doit exister que derrière un import() dynamique — contrainte bundle).
import type { Container, Text } from "pixi.js";
import type { UsernameFxRuntime } from "./runtime";

export type FxQuality = "low" | "medium" | "high";
export type FxContext = "chat" | "card" | "shop" | "lab";
export type FxRarity = "rare" | "epic" | "legendary" | "mythic";

/** Un graphème rendu (1 Pixi.Text) + sa position de repos. */
export type FxGrapheme = {
  text: Text;
  /** position de repos (layout centré), à restaurer après toute anim */
  homeX: number;
  homeY: number;
  index: number;
};

/** Contexte fourni à un effet au montage. */
export type FxEffectContext = {
  runtime: UsernameFxRuntime;
  /** conteneur racine de l'instance (déjà attaché à la scène) */
  stage: Container;
  /** conteneur des graphèmes (centré dans la zone) */
  textLayer: Container;
  /** couche SOUS le texte (fumée, racines, halos…) */
  behind: Container;
  /** couche AU-DESSUS du texte (braises, éclats, arcs…) */
  front: Container;
  graphemes: FxGrapheme[];
  username: string;
  /** zone logique de dessin (padding compris) */
  width: number;
  height: number;
  /** taille de police logique */
  fontSize: number;
  quality: FxQuality;
  intensity: number; // 0..1
  rarity: FxRarity;
  context: FxContext;
};

/** Instance vivante d'un effet. */
export type FxEffectHandle = {
  play(): void;
  pause(): void;
  restart(): void;
  setQuality(q: FxQuality): void;
  handleEvent?(name: string, payload?: unknown): void;
  /** libère TOUT (timelines, particules, listeners) — les graphèmes/stage
      sont détruits par le runtime après cet appel */
  destroy(): void;
};

/** Fabrique enregistrée dans le registry. */
export type FxEffectFactory = {
  id: string;
  label: string;
  rarity: FxRarity;
  /** durée de boucle indicative (affichage labo) */
  loopSeconds?: number;
  /** padding autour du texte en multiples de fontSize (défaut 1.4 / 1.2) */
  pad?: { x?: number; y?: number };
  /** précharge les textures partagées nécessaires */
  preload?(runtime: UsernameFxRuntime): Promise<void> | void;
  create(ctx: FxEffectContext): FxEffectHandle;
};
