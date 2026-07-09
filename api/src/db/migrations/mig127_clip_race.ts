import type { Pool } from "pg";

// Course aux clips (clip_race, cf docs/events-design.md #3) : double
// classement CLIP (event_clip_scores, cache recomputé à chaque tick depuis
// event_clip_votes) + STREAMER (agrégat SUM(votes) GROUP BY streamer_id sur
// event_clip_scores — pas de table dédiée, cf events/clip_race.ts). Un "coup
// de cœur" = un vote limité par compte (budget CLIP_RACE_VOTE_BUDGET),
// distinct du like normal (clip_likes) pour tuer les likes de solidarité.
export async function mig127_clip_race(pool: Pool) {
  // bot_clips n'est PAS créée par migrateAll (elle est ensured paresseusement
  // au premier !clip / requête clips, cf bot_clips/store.ts ensureBotClips) :
  // on garantit ici sa forme minimale avant les FK event_clip_votes/
  // event_clip_scores → bot_clips(id), sinon CREATE TABLE plante sur une base
  // neuve où aucun clip n'a encore jamais été créé. IF NOT EXISTS + colonnes
  // identiques à ensureBotClips() : idempotent et sans conflit avec elle
  // (import direct évité pour ne pas créer de cycle db.ts → migrations → …).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_clips (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      title TEXT,
      author TEXT,
      at_sec INTEGER NOT NULL,
      pre_sec INTEGER NOT NULL DEFAULT 105,
      post_sec INTEGER NOT NULL DEFAULT 15,
      created_ts BIGINT NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT,
      hidden_by_streamer BOOLEAN NOT NULL DEFAULT false,
      deleted_ts BIGINT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_clip_votes (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clip_id BIGINT NOT NULL REFERENCES bot_clips(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id, clip_id)
    );

    CREATE INDEX IF NOT EXISTS event_clip_votes_event_clip_idx
      ON event_clip_votes(event_id, clip_id);
  `);

  // Cache recomputé (pattern event_scores / event_scores_viewer_week) : score
  // par clip = COUNT(event_clip_votes) pour les clips créés dans la fenêtre
  // de l'event. Le classement STREAMER n'a pas besoin de sa propre table : il
  // se calcule par SUM(votes) GROUP BY streamer_id sur cette même table
  // (source de vérité unique, pas de double écriture à garder synchro).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_clip_scores (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      clip_id BIGINT NOT NULL REFERENCES bot_clips(id) ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      votes INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, clip_id)
    );

    CREATE INDEX IF NOT EXISTS event_clip_scores_event_votes_idx
      ON event_clip_scores(event_id, votes DESC);

    CREATE INDEX IF NOT EXISTS event_clip_scores_event_streamer_idx
      ON event_clip_scores(event_id, streamer_id);
  `);

  // Featured temporaire (récompense streamer gagnant) : featured=true posé à
  // la distribution, expiration lue par le tick events-engine (cf engine.ts).
  await pool.query(`
    ALTER TABLE streamers ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ NULL;
  `);
}
