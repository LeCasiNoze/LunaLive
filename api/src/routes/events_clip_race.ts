import type { Request } from "express";
import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { CLIP_RACE_VOTE_BUDGET, countUserVotes, getRankedClips, getRankedStreamers, recomputeClipRace } from "../events/clip_race.js";

export const eventsClipRaceRouter = Router();

/**
 * POST /api/events/clip-race/vote { clipId }
 * "Coup de cœur" = vote limité (CLIP_RACE_VOTE_BUDGET par compte pour tout
 * l'event), distinct du like normal (clip_likes). Idempotent : revoter pour
 * un clip déjà voté ne consomme pas de budget supplémentaire.
 */
eventsClipRaceRouter.post(
  "/events/clip-race/vote",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id || 0);
    const clipId = Number(req.body?.clipId || 0);
    if (!Number.isFinite(clipId) || clipId <= 0) {
      return res.status(400).json({ ok: false, error: "clip_id_required" });
    }

    const client = await pool.connect();
    // Rempli seulement si la transaction commit avec succès — le recompute et
    // la réponse finale se font APRÈS release() (cf events_chest.ts deposit) :
    // sinon un recompute en échec après un COMMIT réussi ferait répondre
    // server_error pour un vote pourtant bien enregistré.
    let committed: { eventId: number; votesLeft: number } | null = null;

    try {
      await client.query("BEGIN");

      const ev = await client.query(
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
      const event = ev.rows?.[0];
      if (!event) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "no_active_event" });
      }
      const eventId = Number(event.id);

      // Sérialise les votes concurrents sur le même event (même pattern que closeAndDistribute).
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [eventId]);

      const startMs = new Date(event.start_at).getTime();
      const endMs = new Date(event.end_at).getTime();

      const clipRes = await client.query(
        `
        SELECT id FROM bot_clips
        WHERE id = $1
          AND deleted_ts IS NULL
          AND hidden_by_streamer = false
          AND created_ts >= $2::bigint
          AND created_ts <  $3::bigint
        LIMIT 1
        `,
        [clipId, startMs, endMs]
      );
      if (!clipRes.rows?.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "clip_not_eligible" });
      }

      const usedCount = await countUserVotes(client, eventId, userId);

      const already = await client.query(
        `SELECT 1 FROM event_clip_votes WHERE event_id=$1 AND user_id=$2 AND clip_id=$3 LIMIT 1`,
        [eventId, userId, clipId]
      );
      const alreadyVoted = !!already.rows?.length;

      if (!alreadyVoted) {
        if (usedCount >= CLIP_RACE_VOTE_BUDGET) {
          await client.query("ROLLBACK");
          return res.status(400).json({ ok: false, error: "budget_exceeded", votesLeft: 0 });
        }

        await client.query(`INSERT INTO event_clip_votes (event_id, user_id, clip_id) VALUES ($1,$2,$3)`, [
          eventId,
          userId,
          clipId,
        ]);
      }

      await client.query("COMMIT");

      const newCount = alreadyVoted ? usedCount : usedCount + 1;
      committed = { eventId, votesLeft: Math.max(0, CLIP_RACE_VOTE_BUDGET - newCount) };
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("[events/clip-race/vote] failed", e);
      return res.status(500).json({ ok: false, error: "server_error" });
    } finally {
      client.release();
    }

    if (!committed) {
      // Ne devrait jamais arriver (chaque chemin d'erreur ci-dessus a déjà répondu) — filet de sécurité.
      return res.status(500).json({ ok: false, error: "server_error" });
    }

    // Reflète le vote tout de suite dans le classement (pas d'attente du tick).
    await recomputeClipRace(committed.eventId);

    return res.json({ ok: true, votesLeft: committed.votesLeft });
  })
);

/**
 * GET /api/events/current/clip-race
 * Auth optionnelle : les deux classements sont publics, "myVotesLeft"
 * n'apparaît que si connecté. Même pattern que events_wheel_week.ts.
 */
eventsClipRaceRouter.get(
  "/events/current/clip-race",
  a(async (req: Request, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0);

    const ev = await pool.query(
      `
      SELECT *
      FROM events
      WHERE type = 'clip_race'
        AND start_at <= NOW() AND NOW() < end_at
      ORDER BY start_at DESC
      LIMIT 1
      `
    );
    const event = ev.rows?.[0] ?? null;
    if (!event) return res.json({ ok: true, event: null });

    const [topClips, topStreamers] = await Promise.all([
      getRankedClips(pool, Number(event.id), 10),
      getRankedStreamers(pool, Number(event.id), 10),
    ]);

    let myVotesLeft: number | undefined;
    if (userId) {
      const used = await countUserVotes(pool, Number(event.id), userId);
      myVotesLeft = Math.max(0, CLIP_RACE_VOTE_BUDGET - used);
    }

    res.json({ ok: true, event, topClips, topStreamers, myVotesLeft });
  })
);
