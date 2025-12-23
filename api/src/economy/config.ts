// api/src/economy/config.ts
export const RUBIS_PER_EUR = 100;     // 100 rubis (w=1.0) = 1€
export const SUB_PRICE_RUBIS = 500;   // sub = 500 rubis
export const SUB_PRICE_EUR = 5;       // sub ≈ 5€

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

export const ORIGIN_WEIGHT_BP: Record<RubisOrigin, number> = {
  paid_topup: 10000,
  farm_watch: 3500,
  wheel_daily: 3000,
  achievement: 3000,
  chest_auto: 2500,
  chest_streamer: 2000,
  event_platform: 1000,
  earn_support: 10000,
  legacy: 3500,
};

export type SpendKind = "support" | "sink";
