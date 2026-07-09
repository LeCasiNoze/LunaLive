import type { Pool, PoolClient } from "pg";
import { pool } from "../db.js";
import { buildPublicUrl } from "../clips/r2.js";

type Db = Pool | PoolClient;

// "Coups de cœur" : 1 PAR JOUR (Paris) par compte (validé Lucas). Rare exprès
// pour tuer les likes de solidarité. Un coup de cœur vaut aussi un LIKE du clip
// (cf events_clip_race.ts) → un seul bouton, et le clip remonte dans les clips
// du mois. Revoter le MÊME clip est idempotent (ne reconsomme pas).
export const CLIP_RACE_VOTES_PER_DAY = 1;

const NOT_BANNED_VOTER_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM site_user_bans b
    WHERE b.user_id = v.user_id
      AND b.revoked_at IS NULL
      AND (b.until IS NULL OR b.until > NOW())
  )
`;

export type RankedClip = {
  rank: number;
  clipId: number;
  streamerId: number;
  streamerSlug: string;
  streamerDisplayName: string;
  votes: number;
  title: string | null;
  author: string | null;
  mp4Url: string | null;
};

export type RankedStreamer = {
  rank: number;
  streamerId: number;
  slug: string;
  displayName: string;
  userId: number | null;
  votes: number;
};

/**
 * Classement CLIP (meilleur clip individuel) : lecture directe du cache
 * event_clip_scores (recomputé par recomputeClipRace). `db` accepte pool OU
 * client de transaction — utilisé à la fois par la route publique et par
 * distributeClipRace dans rewards.ts.
 */
export async function getRankedClips(db: Db, eventId: number, limit = 10): Promise<RankedClip[]> {
  const r = await db.query(
    `
    SELECT
      ecs.clip_id, ecs.streamer_id, ecs.votes,
      bc.title, bc.author, bc.mp4_key,
      s.slug AS streamer_slug, s.display_name AS streamer_display_name
    FROM event_clip_scores ecs
    JOIN bot_clips bc ON bc.id = ecs.clip_id
    JOIN streamers s ON s.id = ecs.streamer_id
    WHERE ecs.event_id = $1
    ORDER BY ecs.votes DESC, ecs.updated_at ASC, ecs.clip_id ASC
    LIMIT $2
    `,
    [eventId, limit]
  );

  return (r.rows || []).map((row: any, idx: number) => ({
    rank: idx + 1,
    clipId: Number(row.clip_id),
    streamerId: Number(row.streamer_id),
    streamerSlug: String(row.streamer_slug || ""),
    streamerDisplayName: String(row.streamer_display_name || ""),
    votes: Number(row.votes || 0),
    title: row.title ?? null,
    author: row.author ?? null,
    mp4Url: row.mp4_key ? buildPublicUrl(String(row.mp4_key)) : null,
  }));
}

/**
 * Classement STREAMER (cumul) : SUM(votes) GROUP BY streamer_id sur le même
 * cache event_clip_scores — pas de table dédiée (cf mig127_clip_race.ts :
 * une seule source de vérité écrite par recomputeClipRace, agrégée ici en
 * lecture pour les deux classements).
 */
export async function getRankedStreamers(db: Db, eventId: number, limit = 10): Promise<RankedStreamer[]> {
  const r = await db.query(
    `
    SELECT
      ecs.streamer_id, s.slug, s.display_name, s.user_id,
      SUM(ecs.votes)::int AS votes,
      MIN(ecs.updated_at) AS first_scored_at
    FROM event_clip_scores ecs
    JOIN streamers s ON s.id = ecs.streamer_id
    WHERE ecs.event_id = $1
    GROUP BY ecs.streamer_id, s.slug, s.display_name, s.user_id
    ORDER BY votes DESC, first_scored_at ASC, ecs.streamer_id ASC
    LIMIT $2
    `,
    [eventId, limit]
  );

  return (r.rows || []).map((row: any, idx: number) => ({
    rank: idx + 1,
    streamerId: Number(row.streamer_id),
    slug: String(row.slug || ""),
    displayName: String(row.display_name || ""),
    userId: row.user_id != null ? Number(row.user_id) : null,
    votes: Number(row.votes || 0),
  }));
}

/**
 * Résolution best-effort du créateur d'un clip (le viewer qui a tapé !clip).
 * ⚠️ bot_clips.author est le pseudo de chat BRUT (cf bot/src/modules/clips/
 * clip.ts: author=msg.username) — PAS une FK vers users.id. On matche par
 * username insensible à la casse ; si personne ne correspond (chatteur
 * jamais inscrit sur le site, ou clip auto-généré "lunaclip"), on renvoie
 * null et l'appelant doit sauter la récompense wallet pour ce clip (le clip
 * reste visible dans le classement public, juste sans destinataire de gains).
 */
export async function resolveClipCreatorUserId(db: Db, author: string | null): Promise<number | null> {
  const name = String(author || "").trim();
  if (!name || name.toLowerCase() === "lunaclip") return null;

  const r = await db.query(`SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`, [name]);
  const id = Number(r.rows?.[0]?.id || 0);
  return id > 0 ? id : null;
}

// Votes utilisés AUJOURD'HUI (jour Paris) — le budget est journalier (1/jour).
export async function countUserVotesToday(db: Db, eventId: number, userId: number): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM event_clip_votes
     WHERE event_id=$1 AND user_id=$2
       AND (created_at AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date`,
    [eventId, userId]
  );
  return Number(r.rows?.[0]?.n || 0);
}

/**
 * Recompute (pattern wheel_week.ts / global_chest.ts) : DELETE+INSERT du
 * cache event_clip_scores depuis event_clip_votes. Éligibilité clip = créé
 * dans la fenêtre de l'event (bot_clips.created_ts, ms epoch) + toujours
 * public (non supprimé, non caché) au moment du recompute. Les votes des
 * comptes bannis ne comptent pas (anti-abus) ; un ban APRÈS un vote légitime
 * ne retire que ce vote-là de l'agrégat, pas les votes des autres.
 */
export async function recomputeClipRace(eventId: number) {
  const ev = await pool.query(
    `
    SELECT *
    FROM events
    WHERE type='clip_race'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `
  );
  const e = ev.rows?.[0];
  if (!e) return { ok: false as const, error: "missing" as const };
  if (String(e.type) !== "clip_race") return { ok: false as const, error: "wrong_type" as const };
  if (String(e.state) !== "live") return { ok: true as const, skipped: "not_live" as const };

  const startMs = new Date(e.start_at).getTime();
  const endMs = new Date(e.end_at).getTime();

  await pool.query(`DELETE FROM event_clip_scores WHERE event_id=$1`, [eventId]);

  await pool.query(
    `
    INSERT INTO event_clip_scores (event_id, clip_id, streamer_id, votes, updated_at)
    SELECT $1::bigint, bc.id, bc.streamer_id::int, COUNT(*)::int, NOW()
    FROM event_clip_votes v
    JOIN bot_clips bc ON bc.id = v.clip_id
    WHERE v.event_id = $1
      AND bc.deleted_ts IS NULL
      AND bc.hidden_by_streamer = false
      AND bc.created_ts >= $2::bigint
      AND bc.created_ts <  $3::bigint
      AND ${NOT_BANNED_VOTER_SQL}
    GROUP BY bc.id, bc.streamer_id
    `,
    [eventId, startMs, endMs]
  );

  return { ok: true as const };
}
