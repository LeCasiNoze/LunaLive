// api/src/economy.ts
export const RUBIS_PER_EUR = 100;
export const SUB_PRICE_RUBIS = 500;

export type RubisOrigin =
  | "paid_topup"
  | "farm_watch"
  | "wheel_daily"
  | "achievement"
  | "chest_auto"
  | "chest_streamer"
  | "event_platform"
  | "legacy";

export const ORIGIN_W_BP: Record<RubisOrigin, number> = {
  paid_topup: 10000,
  farm_watch: 3500,
  wheel_daily: 3000,
  achievement: 3000,
  chest_auto: 2500,
  chest_streamer: 2000,
  event_platform: 1000,
  legacy: 2000, // backfill conservateur
};

export function weightBp(origin: string): number {
  return (ORIGIN_W_BP as any)[origin] ?? 1000;
}

// SQL CASE pour ORDER BY
export function sqlWeightBpExpr(alias = "wl") {
  return `CASE ${alias}.origin
    WHEN 'paid_topup' THEN 10000
    WHEN 'farm_watch' THEN 3500
    WHEN 'wheel_daily' THEN 3000
    WHEN 'achievement' THEN 3000
    WHEN 'chest_auto' THEN 2500
    WHEN 'chest_streamer' THEN 2000
    WHEN 'event_platform' THEN 1000
    WHEN 'legacy' THEN 2000
    ELSE 1000 END`;
}
