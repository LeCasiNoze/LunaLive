export async function mig034_agenda_notifs(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agenda_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      rule_id INT NOT NULL REFERENCES streamer_agenda_rules(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (streamer_id, rule_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS agenda_subscriptions_streamer_idx
      ON agenda_subscriptions(streamer_id);

    CREATE INDEX IF NOT EXISTS agenda_subscriptions_user_idx
      ON agenda_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS agenda_notif_log (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL,
      rule_id INT NOT NULL,
      user_id INT NOT NULL,
      occ_start TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, rule_id, occ_start)
    );

    CREATE INDEX IF NOT EXISTS agenda_notif_log_occ_idx
      ON agenda_notif_log(occ_start);
  `);
}
