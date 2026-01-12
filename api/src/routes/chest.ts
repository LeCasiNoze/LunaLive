// api/src/routes/chest.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { earnRubisTx } from "../wallet_engine.js";

const MAX_OUT_WEIGHT_BP = 2000; // 0.20
const HEARTBEAT_TTL_SECONDS = 45;

type AuthedReq = any;

function int(x: any, def = 0) {
  const n = Number.parseInt(String(x ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT id, slug, user_id AS "userId", is_live AS "isLive"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );

  return r.rows?.[0] || null;
}

async function getChestBalance(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT COALESCE(SUM(amount_remaining),0)::int AS balance
     FROM streamer_chest_lots
     WHERE streamer_id=$1`,
    [streamerId]
  );
  return Number(r.rows?.[0]?.balance || 0);
}

async function getChestBreakdown(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT weight_bp, COALESCE(SUM(amount_remaining),0)::int AS amount
     FROM streamer_chest_lots
     WHERE streamer_id=$1
     GROUP BY weight_bp
     ORDER BY weight_bp DESC`,
    [streamerId]
  );
  const out: Record<string, number> = {};
  for (const row of r.rows || []) out[String(row.weight_bp)] = Number(row.amount || 0);
  return out;
}

async function ensureChest(client: any, streamerId: number) {
  await client.query(
    `INSERT INTO streamer_chests (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

async function getOpenOpening(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT id, status, opens_at AS "opensAt", closes_at AS "closesAt", min_watch_minutes AS "minWatchMinutes"
     FROM streamer_chest_openings
     WHERE streamer_id=$1 AND status='open'
     ORDER BY id DESC
     LIMIT 1`,
    [streamerId]
  );
  return r.rows?.[0] || null;
}

async function getCurrentLiveSessionId(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT id
     FROM live_sessions
     WHERE streamer_id=$1 AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [streamerId]
  );
  return r.rows?.[0]?.id ? Number(r.rows[0].id) : 0;
}

async function hasRecentHeartbeat(client: any, liveSessionId: number, viewerKey: string) {
  const r = await client.query(
    `SELECT 1
     FROM viewer_sessions
     WHERE live_session_id=$1
       AND viewer_key=$2
       AND ended_at IS NULL
       AND last_heartbeat_at >= (NOW() - ($3::int * INTERVAL '1 second'))
     LIMIT 1`,
    [liveSessionId, viewerKey, HEARTBEAT_TTL_SECONDS]
  );
  return !!r.rows?.[0];
}

async function getWatchedMinutes(client: any, liveSessionId: number, viewerKey: string) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM stream_viewer_minutes
     WHERE live_session_id=$1
       AND viewer_key=$2`,
    [liveSessionId, viewerKey]
  );
  return Number(r.rows?.[0]?.n || 0);
}

/* =========================
   PAYOUT — VERSION SÉCURISÉE
   ========================= */
async function closeOpeningAndPayout(openingId: number, closedBy: "streamer" | "auto") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const o = await client.query(
      `SELECT id, streamer_id AS "streamerId", status
       FROM streamer_chest_openings
       WHERE id=$1
       FOR UPDATE`,
      [openingId]
    );
    const opening = o.rows?.[0];
    if (!opening) throw new Error("opening_not_found");

    if (opening.status !== "open") {
      await client.query("COMMIT");
      return { alreadyClosed: true, payouts: [] };
    }

    const streamerId = Number(opening.streamerId);

    const lotsRes = await client.query(
      `SELECT id, weight_bp AS "weightBp", amount_remaining AS "amountRemaining"
       FROM streamer_chest_lots
       WHERE streamer_id=$1 AND amount_remaining > 0
       ORDER BY weight_bp DESC, created_at ASC, id ASC
       FOR UPDATE`,
      [streamerId]
    );

    const lots = lotsRes.rows.map((l: any) => ({
      id: Number(l.id),
      weightBp: Number(l.weightBp),
      remaining: Number(l.amountRemaining),
    }));

    const total = lots.reduce((s, l) => s + l.remaining, 0);
    if (total <= 0) {
      await client.query(
        `UPDATE streamer_chest_openings
         SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
         WHERE id=$1`,
        [openingId, JSON.stringify({ closedBy })]
      );
      await client.query("COMMIT");
      return { alreadyClosed: false, payouts: [] };
    }

    const parts = await client.query(
      `SELECT user_id AS "userId"
       FROM streamer_chest_participants
       WHERE opening_id=$1
       ORDER BY joined_at ASC`,
      [openingId]
    );
    const users = parts.rows.map((r: any) => Number(r.userId));
    if (!users.length) {
      await client.query("COMMIT");
      return { alreadyClosed: false, payouts: [] };
    }

    const base = Math.floor(total / users.length);
    let rest = total - base * users.length;

    const shuffled = [...users].sort(() => Math.random() - 0.5);

    const payouts: any[] = [];

    for (const userId of users) {
      let gain = base;
      if (rest > 0 && shuffled.includes(userId)) {
        gain += 1;
        rest--;
      }
      if (gain <= 0) continue;

      await earnRubisTx(client, userId, "chest_streamer", gain, {
        weight_bp: MAX_OUT_WEIGHT_BP,
        streamerId,
        openingId,
        closedBy,
      });

      payouts.push({ userId, amount: gain });
    }

    await client.query(
      `DELETE FROM streamer_chest_lots WHERE streamer_id=$1`,
      [streamerId]
    );

    await client.query(
      `UPDATE streamer_chest_openings
       SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
       WHERE id=$1`,
      [openingId, JSON.stringify({ closedBy })]
    );

    await client.query("COMMIT");
    return { alreadyClosed: false, payouts };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const chestRouter = Router();
export { closeOpeningAndPayout };
