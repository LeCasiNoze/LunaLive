import type { Pool } from "pg";

// Semaine en duo (duo_week, cf docs/events-design.md #6) : duos de STREAMERS
// appariés par audience commune (cf events/duo_week.ts computeSharedAudience).
// streamer_b_id reste NULLABLE au niveau schéma pour ne pas bloquer un futur
// ajustement manuel côté admin, mais proposeDuos n'insère jamais de duo à un
// seul membre : un streamer sans commun est simplement laissé non apparié
// (loggé), jamais inséré avec streamer_b_id=NULL.
export async function mig129_event_duo(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_duos (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      streamer_a_id INT NOT NULL REFERENCES streamers(id),
      streamer_b_id INT REFERENCES streamers(id),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','refreshed','locked')),
      shared_viewers INT NOT NULL DEFAULT 0,
      refreshed_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(event_id, streamer_a_id),
      UNIQUE(event_id, streamer_b_id)
    );

    CREATE INDEX IF NOT EXISTS event_duos_event_idx
      ON event_duos(event_id);
  `);

  // Cache recomputé (pattern event_scores) : points = activité combinée des
  // deux commus du duo (cf events/duo_week.ts recomputeDuoWeek). `detail`
  // porte la répartition streamerA/streamerB pour l'affichage.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_duo_scores (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      duo_id BIGINT NOT NULL REFERENCES event_duos(id) ON DELETE CASCADE,
      points INT DEFAULT 0,
      detail JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (event_id, duo_id)
    );

    CREATE INDEX IF NOT EXISTS event_duo_scores_event_points_idx
      ON event_duo_scores(event_id, points DESC);
  `);
}
