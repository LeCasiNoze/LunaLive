// api/src/db/migrations/mig098_quests.ts
import type { Pool } from "pg";

/**
 * Système de quêtes daily / weekly / monthly.
 *
 * - `quests` = catalogue (toutes les quêtes possibles, activables/désactivables)
 * - `quest_seeds` = lesquelles sont actives sur quelle période (rotation)
 * - `quest_progress` = état par user × quête × période (claim une fois par période)
 *
 * Le compteur de progression est CALCULÉ à la volée depuis les tables existantes
 * (chat_messages, wheel_spins, wallet_tx, etc.) — pas de duplication d'état.
 * Seuls le claim et le seed de période sont matérialisés.
 */
export async function mig098_quests(pool: Pool) {
  // Catalogue
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quests (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('daily','weekly','monthly')),
      title TEXT NOT NULL,
      description TEXT NULL,
      metric TEXT NOT NULL,
      target INT NOT NULL CHECK (target > 0),
      reward_rubis INT NOT NULL DEFAULT 0 CHECK (reward_rubis >= 0),
      reward_origin TEXT NOT NULL DEFAULT 'quest_daily',
      reward_meta JSONB NULL,
      sort_order INT NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seeds de période (lesquelles quêtes sont actives sur quelle période)
  // period_key format:
  //   daily   → 'YYYY-MM-DD'  (ex '2026-04-29')
  //   weekly  → 'YYYY-Www'    (ex '2026-W17')
  //   monthly → 'YYYY-MM'     (ex '2026-04')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_seeds (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('daily','weekly','monthly')),
      period_key TEXT NOT NULL,
      quest_code TEXT NOT NULL REFERENCES quests(code) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (period_key, quest_code)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quest_seeds_period
      ON quest_seeds (type, period_key);
  `);

  // Progression par user × quête × période
  // progress_value = compteur actuel
  // claimed_at = timestamp du claim (NULL si pas claim)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_progress (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_code TEXT NOT NULL REFERENCES quests(code) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      progress_value INT NOT NULL DEFAULT 0,
      claimed_at TIMESTAMPTZ NULL,
      reward_tx_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, quest_code, period_key)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quest_progress_user_period
      ON quest_progress (user_id, period_key);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quest_progress_unclaimed
      ON quest_progress (user_id) WHERE claimed_at IS NULL;
  `);

  // Seed initial du catalogue de quêtes
  await pool.query(
    `
    INSERT INTO quests (code, type, title, description, metric, target, reward_rubis, reward_origin, sort_order)
    VALUES
      -- Daily (pool de 9, rotation 3-4 actives par jour)
      ('daily_login',           'daily',  'Bonjour !',                  'Connecte-toi à LunaLive',                'login',           1,  2, 'quest_daily', 1),
      ('daily_chat_5',          'daily',  'Bavard du jour',             'Envoie 5 messages dans le chat',         'chat_msg',        5,  2, 'quest_daily', 2),
      ('daily_watch_30',        'daily',  'Présent',                    'Regarde 30 minutes de live',             'watch_min',      30,  4, 'quest_daily', 3),
      ('daily_call_1',          'daily',  'Appel à l''action',          'Envoie 1 call sur un live',              'call',            1,  4, 'quest_daily', 4),
      ('daily_call_3',          'daily',  'Caller actif',               'Envoie 3 calls dans la journée',         'call',            3,  8, 'quest_daily', 5),
      ('daily_visit_2',         'daily',  'Découverte',                 'Visite 2 streamers différents',          'streamer_visit',  2,  3, 'quest_daily', 6),
      ('daily_discord_claim',   'daily',  'Récompense Discord',         'Utilise /claim sur le Discord LunaLive', 'discord_claim',   1,  2, 'quest_daily', 7),
      ('daily_blackjack_1',     'daily',  'Joue ta main',               'Joue 1 partie de blackjack sur Discord', 'discord_blackjack', 1, 3, 'quest_daily', 8),
      ('daily_rain_catch',      'daily',  'Sous la pluie',              'Participe à 1 rain dans un live',        'rain_catch',      1,  2, 'quest_daily', 9),

      -- Weekly (pool de 8, rotation 2-3 actives par semaine)
      ('weekly_chat_50',        'weekly', 'Voix de la commu',           'Envoie 50 messages dans la semaine',     'chat_msg',       50, 30, 'quest_weekly', 10),
      ('weekly_calls_8',        'weekly', 'Caller régulier',            'Envoie 8 calls cette semaine',           'call',            8, 50, 'quest_weekly', 11),
      ('weekly_calls_15',       'weekly', 'Caller assidu',              'Envoie 15 calls cette semaine',          'call',           15, 80, 'quest_weekly', 12),
      ('weekly_watch_180',      'weekly', '3h sur LunaLive',            'Regarde 3 heures de live cette semaine', 'watch_min',     180, 40, 'quest_weekly', 13),
      ('weekly_chest_3',        'weekly', 'Chasseur de coffres',        'Ouvre 3 coffres cette semaine',          'chest_open',      3, 30, 'quest_weekly', 14),
      ('weekly_predictions_3',  'weekly', 'Pronostiqueur',              'Place 3 bets sur des predictions',       'prediction_bet',  3, 30, 'quest_weekly', 15),
      ('weekly_blackjack_5',    'weekly', 'Habitué du tapis',           'Joue 5 parties de blackjack',            'discord_blackjack', 5, 25, 'quest_weekly', 16),
      ('weekly_3_streamers',    'weekly', 'Curieux',                    'Visite 3 streamers différents',          'streamer_visit',  3, 25, 'quest_weekly', 17),

      -- Monthly (pool de 6, rotation 1-2 actives par mois)
      ('monthly_calls_30',      'monthly','Pilier des calls',           'Envoie 30 calls dans le mois',           'call',           30, 250, 'quest_monthly', 20),
      ('monthly_marathon',      'monthly','Marathonien',                'Regarde 20 heures de live dans le mois', 'watch_min',    1200, 200, 'quest_monthly', 21),
      ('monthly_loyal',         'monthly','Fidèle',                     'Réclame 25 daily bonus dans le mois',    'daily_claim',    25, 200, 'quest_monthly', 22),
      ('monthly_chest_5',       'monthly','Coffre-fort',                'Ouvre 5 coffres dans le mois',           'chest_open',      5, 150, 'quest_monthly', 23),
      ('monthly_supporter',     'monthly','Mécène',                     'Souscris à 1 sub à un streamer',         'sub_send',        1, 0,  'quest_monthly', 24),
      ('monthly_blackjack_20',  'monthly','Croupier de salon',          'Joue 20 parties de blackjack',           'discord_blackjack', 20, 200, 'quest_monthly', 25)
    ON CONFLICT (code) DO UPDATE SET
      type = EXCLUDED.type,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      metric = EXCLUDED.metric,
      target = EXCLUDED.target,
      reward_rubis = EXCLUDED.reward_rubis,
      reward_origin = EXCLUDED.reward_origin,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();
    `
  );

  // Reward meta pour monthly_supporter (titre exclusif au lieu de rubis)
  await pool.query(`
    UPDATE quests
       SET reward_meta = '{"title_code":"mecene"}'::jsonb
     WHERE code = 'monthly_supporter';
  `);
}
