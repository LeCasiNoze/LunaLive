// api/src/economy/rewards_config.ts

// Cap journalier "FREE" (sources: wheel/login/chests/events)
// Zone 1: jusqu'à CAP_DAILY_FREE => weight normal
// Zone 2: CAP_DAILY_FREE..CAP_DAILY_FREE_LOW => weight 0.10 (event_platform)
// Au-delà => plus rien
export const CAP_DAILY_FREE = 2000;
export const CAP_DAILY_FREE_LOW = 3000;

// Weights (basis points)
export const WEIGHT_BP = {
  paid_topup: 10000,
  farm_watch: 3500,
  wheel_daily: 3000,
  achievement: 3000,
  chest_auto: 2500,
  chest_streamer: 2000,
  event_platform: 1000,
  earn_support: 10000,
} as const;

// Timezone business (Paris)
export const BUSINESS_TZ = "Europe/Paris";
