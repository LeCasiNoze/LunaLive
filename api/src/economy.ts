// api/src/economy.ts
//
// 🎯 SOURCE DE VÉRITÉ UNIQUE pour les poids des rubis (rubis_origin → weight_bp).
//
// Modèle simplifié (depuis 2026-04) :
//   - paid_topup       → 10000 (1.0) : seul rubis cashable plein
//   - event_full_value → 10000 (1.0) : override ponctuel pour events spéciaux
//   - tout le reste    → 0          : "show value", utilisable en cosmétique
//                                      ou sub mais 0 valeur en cashout streamer
//
// Pourquoi : empêche le farming free → cashout streamer. Les rubis gagnés
// circulent dans l'économie (cosmétiques, subs "show") mais ne se convertissent
// pas en euros pour le streamer. Seuls les vrais achats (paid_topup) ou les
// événements explicitement valorisés (event_full_value) le font.
//
// Les fichiers `api/src/economy/config.ts` et `api/src/economy/rewards_config.ts`
// sont @deprecated et ne doivent plus être importés.
export const RUBIS_PER_EUR = 100;
export const SUB_PRICE_RUBIS = 500;

/** Origins explicitement reconnues. Les autres → 0 weight (show value). */
export type RubisOrigin =
  | "paid_topup"
  | "event_full_value"
  | "farm_watch"
  | "wheel_daily"
  | "achievement"
  | "chest_auto"
  | "chest_streamer"
  | "event_platform"
  | "legacy"
  | "discord_claim"
  | "discord_blackjack_natural"
  | "discord_blackjack_win"
  | "discord_blackjack_push"
  | "discord_blackjack_pairs"
  | "discord_blackjack_21p3"
  | "prediction_win"
  | "prediction_shield_refund"
  | "daily_bonus_mon"
  | "daily_bonus_tue"
  | "daily_bonus_wed"
  | "daily_bonus_thu"
  | "daily_bonus_fri"
  | "daily_bonus_sat"
  | "daily_bonus_sun"
  | "monthly_bonus_5"
  | "monthly_bonus_10"
  | "monthly_bonus_20_fallback"
  | "monthly_bonus_30_fallback"
  | "sub_viewer_cycle"
  | "quest_daily"
  | "quest_weekly"
  | "quest_monthly";

/** Seules ces origins ont un poids non nul. Tout le reste = 0. */
const FULL_VALUE_ORIGINS = new Set<string>(["paid_topup", "event_full_value"]);

export function weightBp(origin: string): number {
  return FULL_VALUE_ORIGINS.has(String(origin)) ? 10000 : 0;
}

/** SQL CASE équivalent pour ORDER BY / sum. À garder synchro avec weightBp. */
export function sqlWeightBpExpr(alias = "wl") {
  return `CASE ${alias}.origin
    WHEN 'paid_topup'       THEN 10000
    WHEN 'event_full_value' THEN 10000
    ELSE 0 END`;
}

/** Liste des origins reconnues (pour validation côté admin/api). */
export const KNOWN_ORIGINS: ReadonlySet<string> = new Set<string>([
  "paid_topup",
  "event_full_value",
  "farm_watch",
  "wheel_daily",
  "achievement",
  "chest_auto",
  "chest_streamer",
  "event_platform",
  "legacy",
  "discord_claim",
  "discord_blackjack_natural",
  "discord_blackjack_win",
  "discord_blackjack_push",
  "discord_blackjack_pairs",
  "discord_blackjack_21p3",
  "prediction_win",
  "prediction_shield_refund",
  "daily_bonus_mon",
  "daily_bonus_tue",
  "daily_bonus_wed",
  "daily_bonus_thu",
  "daily_bonus_fri",
  "daily_bonus_sat",
  "daily_bonus_sun",
  "monthly_bonus_5",
  "monthly_bonus_10",
  "monthly_bonus_20_fallback",
  "monthly_bonus_30_fallback",
  "sub_viewer_cycle",
  "quest_daily",
  "quest_weekly",
  "quest_monthly",
]);
