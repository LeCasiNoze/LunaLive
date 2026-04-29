// api/src/economy/config.ts
//
// @deprecated Utiliser `api/src/economy.ts` à la place.
// Ce fichier est conservé pour rétro-compat des imports legacy uniquement.
// Les valeurs ci-dessous ne reflètent plus la réalité runtime — la source
// de vérité est dans `api/src/economy.ts` (weightBp + sqlWeightBpExpr).

export const RUBIS_PER_EUR = 100;
export const SUB_PRICE_RUBIS = 500;
export const SUB_PRICE_EUR = 5;

export type RubisOrigin =
  | "paid_topup"
  | "farm_watch"
  | "wheel_daily"
  | "achievement"
  | "chest_auto"
  | "chest_streamer"
  | "event_platform"
  | "earn_support"
  | "legacy";

/** @deprecated Utiliser `weightBp()` de `api/src/economy.ts`. */
export const ORIGIN_WEIGHT_BP: Record<RubisOrigin, number> = {
  paid_topup: 10000,
  farm_watch: 0,
  wheel_daily: 0,
  achievement: 0,
  chest_auto: 0,
  chest_streamer: 0,
  event_platform: 0,
  earn_support: 0,
  legacy: 0,
};

export type SpendKind = "support" | "sink";
