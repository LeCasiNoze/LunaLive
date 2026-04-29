// api/src/economy/rewards_config.ts
//
// @deprecated Utiliser `api/src/economy.ts` (weightBp / sqlWeightBpExpr).
// Ce fichier reste pour rétro-compat. La constante CAP_DAILY_FREE n'est
// pas encore enforced (cf. roadmap éco — side-quest audit).

export const CAP_DAILY_FREE = 2000;
export const CAP_DAILY_FREE_LOW = 3000;

/** @deprecated Source de vérité = `api/src/economy.ts`. */
export const WEIGHT_BP = {
  paid_topup: 10000,
  farm_watch: 0,
  wheel_daily: 0,
  achievement: 0,
  chest_auto: 0,
  chest_streamer: 0,
  event_platform: 0,
  earn_support: 0,
} as const;

export const BUSINESS_TZ = "Europe/Paris";
