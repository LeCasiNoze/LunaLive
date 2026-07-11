// Registre des effets moteur. Les effets s'auto-enregistrent à l'import
// (side-effect) depuis mount.ts — un seul point d'entrée dynamique.
import type { FxEffectFactory } from "./types";

const effects = new Map<string, FxEffectFactory>();

export function registerEffect(factory: FxEffectFactory) {
  effects.set(factory.id, factory);
}

export function getEffect(id: string): FxEffectFactory | undefined {
  return effects.get(id);
}

export function listEffects(): FxEffectFactory[] {
  return Array.from(effects.values());
}
