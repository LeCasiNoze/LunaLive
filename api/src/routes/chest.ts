import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

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

/**
 * Deposit: consomme rubis_lots du streamer (sink order: weight ASC)
 * et crée des lots dans le coffre (weight = min(in, 2000) => jamais d'upgrade)
 */
async function depositToChest(streamerId: number, fromUserId: number, amount: number, note?: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureChest(client, streamerId);

    // lock user
    const u = await client.query(`SELECT rubis FROM users WHERE id=$1 FOR UPDATE`, [fromUserId]);
    const curRubis = Number(u.rows?.[0]?.rubis || 0);
    if (amount <= 0) throw new Error("bad_amount");
    if (curRubis < amount) throw new Error("insufficient_funds");

    let remaining = amount;
    const used: Array<{ lotId: number; origin: string; weightBp: number; used: number }> = [];

    while (remaining > 0) {
      const r = await client.query(
        `SELECT id, origin, weight_bp AS "weightBp", amount_remaining AS "amountRemaining"
         FROM rubis_lots
         WHERE user_id=$1 AND amount_remaining > 0
         ORDER BY weight_bp ASC, created_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`,
        [fromUserId]
      );

      const lot = r.rows?.[0];
      if (!lot) throw new Error("lots_missing");

      const take = Math.min(remaining, Number(lot.amountRemaining));
      await client.query(`UPDATE rubis_lots SET amount_remaining=amount_remaining-$2 WHERE id=$1`, [lot.id, take]);

      used.push({
        lotId: Number(lot.id),
        origin: String(lot.origin),
        weightBp: Number(lot.weightBp),
        used: take,
      });

      remaining -= take;
    }

    // debit user cached balance
    await client.query(`UPDATE users SET rubis=rubis-$2 WHERE id=$1`, [fromUserId, amount]);

    // ledger tx
    const txIns = await client.query(
      `INSERT INTO rubis_tx
       (kind, purpose, status, from_user_id, to_user_id, streamer_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
       VALUES
       ('transfer', 'chest_deposit', 'succeeded', $1, NULL, $2, $3, 0, 0, 0, 0, $4::jsonb)
       RETURNING id`,
      [
        fromUserId,
        streamerId,
        amount,
        JSON.stringify({
          note: note ?? null,
        }),
      ]
    );
    const txId = Number(txIns.rows[0].id);

    // entries
    await client.query(
      `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
       VALUES
       ($1, 'user',  $2, $3),
       ($1, 'chest', NULL, $4)`,
      [txId, fromUserId, -amount, amount]
    );

    // map used lots in ledger
    for (const u of used) {
      await client.query(
        `INSERT INTO rubis_tx_lots (tx_id, lot_id, origin, weight_bp, amount_used)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [txId, u.lotId, u.origin, u.weightBp, u.used]
      );

      const outWeight = Math.min(u.weightBp, MAX_OUT_WEIGHT_BP); // cap, never upgrade
      await client.query(
        `INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
         VALUES ($1, 'chest_deposit', $2, $3, $4::jsonb)`,
        [
          streamerId,
          outWeight,
          u.used,
          JSON.stringify({
            fromLotId: u.lotId,
            fromWeightBp: u.weightBp,
            txId,
          }),
        ]
      );
    }

    await client.query(`UPDATE streamer_chests SET updated_at=NOW() WHERE streamer_id=$1`, [streamerId]);

    await client.query("COMMIT");
    return { txId };
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function openChest(streamerId: number, byUserId: number, durationSec: number, minWatchMinutes: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureChest(client, streamerId);

    const existing = await getOpenOpening(client, streamerId);
    if (existing) throw new Error("already_open");

    const closesAt = new Date(Date.now() + Math.max(5, durationSec) * 1000);

    const ins = await client.query(
      `INSERT INTO streamer_chest_openings
       (streamer_id, created_by_user_id, status, opens_at, closes_at, min_watch_minutes, meta)
       VALUES ($1,$2,'open',NOW(),$3,$4,$5::jsonb)
       RETURNING id, opens_at AS "opensAt", closes_at AS "closesAt", min_watch_minutes AS "minWatchMinutes"`,
      [
        streamerId,
        byUserId,
        closesAt.toISOString(),
        Math.max(1, minWatchMinutes),
        JSON.stringify({}),
      ]
    );

    await client.query("COMMIT");
    return ins.rows[0];
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function closeOpeningAndPayout(openingId: number, closedBy: "streamer" | "auto") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock opening
    const o = await client.query(
      `SELECT id, streamer_id AS "streamerId", status, closes_at AS "closesAt", min_watch_minutes AS "minWatchMinutes"
       FROM streamer_chest_openings
       WHERE id=$1
       FOR UPDATE`,
      [openingId]
    );
    const opening = o.rows?.[0];
    if (!opening) throw new Error("opening_not_found");

    if (String(opening.status) !== "open") {
      // idempotent: return existing payouts
      const p = await client.query(
        `SELECT user_id AS "userId", amount, breakdown, tx_id AS "txId"
         FROM streamer_chest_payouts
         WHERE opening_id=$1
         ORDER BY id ASC`,
        [openingId]
      );
      await client.query("COMMIT");
      return { alreadyClosed: true, payouts: p.rows || [] };
    }

    const streamerId = Number(opening.streamerId);

    // lock chest lots (best value first)
    const lotsRes = await client.query(
      `SELECT id, weight_bp AS "weightBp", amount_remaining AS "amountRemaining"
       FROM streamer_chest_lots
       WHERE streamer_id=$1 AND amount_remaining > 0
       ORDER BY weight_bp DESC, created_at ASC, id ASC
       FOR UPDATE`,
      [streamerId]
    );
    const lots = (lotsRes.rows || []).map((x: any) => ({
      id: Number(x.id),
      weightBp: Number(x.weightBp),
      amountRemaining: Number(x.amountRemaining),
    }));

    const total = lots.reduce((a, b) => a + b.amountRemaining, 0);

    // participants
    const partRes = await client.query(
      `SELECT user_id AS "userId"
       FROM streamer_chest_participants
       WHERE opening_id=$1
       ORDER BY joined_at ASC`,
      [openingId]
    );
    const participants = (partRes.rows || []).map((x: any) => Number(x.userId));

    if (participants.length === 0 || total <= 0) {
      await client.query(
        `UPDATE streamer_chest_openings
         SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
         WHERE id=$1`,
        [openingId, JSON.stringify({ closedBy })]
      );
      await client.query("COMMIT");
      return { alreadyClosed: false, payouts: [] };
    }

    // distribute ALL (floor + remainder)
    const n = participants.length;
    const base = Math.floor(total / n);
    const rem = total - base * n;

    // randomize remainder receivers (fair)
    const idx = participants.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const bonusSet = new Set<number>(idx.slice(0, rem));

    // allocate from chest lots
    let lotPtr = 0;
    const payouts: Array<{ userId: number; amount: number; breakdown: Record<string, number>; txId: number }> = [];

    const takeFromLots = (need: number) => {
      const breakdown: Record<string, number> = {};
      while (need > 0) {
        if (lotPtr >= lots.length) throw new Error("chest_empty_race");
        const lot = lots[lotPtr];
        const take = Math.min(need, lot.amountRemaining);
        if (take > 0) {
          breakdown[String(lot.weightBp)] = (breakdown[String(lot.weightBp)] || 0) + take;
          lot.amountRemaining -= take;
          need -= take;
        }
        if (lot.amountRemaining <= 0) lotPtr++;
      }
      return breakdown;
    };

    for (let i = 0; i < participants.length; i++) {
      const userId = participants[i];
      const amount = base + (bonusSet.has(i) ? 1 : 0);
      if (amount <= 0) continue;

      const breakdown = takeFromLots(amount);

      // credit user cached balance + create lots (weight already <= 2000)
      await client.query(`UPDATE users SET rubis=rubis+$2 WHERE id=$1`, [userId, amount]);

      for (const [w, a] of Object.entries(breakdown)) {
        const wbp = Math.min(int(w), MAX_OUT_WEIGHT_BP);
        await client.query(
          `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
           VALUES ($1, 'chest_streamer', $2, $3, $3, $4::jsonb)`,
          [
            userId,
            wbp,
            a,
            JSON.stringify({
              streamerId,
              openingId,
            }),
          ]
        );
      }

      // ledger tx per winner
      const txIns = await client.query(
        `INSERT INTO rubis_tx
         (kind, purpose, status, from_user_id, to_user_id, streamer_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
         VALUES
         ('transfer', 'chest_payout', 'succeeded', NULL, $1, $2, $3, 0, 0, 0, 0, $4::jsonb)
         RETURNING id`,
        [
          userId,
          streamerId,
          amount,
          JSON.stringify({ openingId, closedBy }),
        ]
      );
      const txId = Number(txIns.rows[0].id);

      await client.query(
        `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
         VALUES
         ($1, 'chest', NULL, $2),
         ($1, 'user',  $3, $4)`,
        [txId, -amount, userId, amount]
      );

      // payout record
      await client.query(
        `INSERT INTO streamer_chest_payouts (opening_id, user_id, amount, breakdown, tx_id)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (opening_id, user_id) DO NOTHING`,
        [openingId, userId, amount, JSON.stringify(breakdown), txId]
      );

      payouts.push({ userId, amount, breakdown, txId });
    }

    // persist chest lots updates
    for (const lot of lots) {
      if (lot.amountRemaining <= 0) {
        await client.query(`DELETE FROM streamer_chest_lots WHERE id=$1`, [lot.id]);
      } else {
        await client.query(`UPDATE streamer_chest_lots SET amount_remaining=$2 WHERE id=$1`, [
          lot.id,
          lot.amountRemaining,
        ]);
      }
    }

    await client.query(
      `UPDATE streamer_chest_openings
       SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
       WHERE id=$1`,
      [openingId, JSON.stringify({ closedBy })]
    );

    await client.query("COMMIT");
    return { alreadyClosed: false, payouts };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const chestRouter = Router();

/**
 * GET /streamers/:slug/chest
 * - public: balance + opening state
 * - if auth: returns also joined=true/false for current opening
 */
chestRouter.get("/streamers/:slug/chest", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  const s = await getStreamerBySlug(slug);
  if (!s) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const client = await pool.connect();
  try {
    const streamerId = Number(s.id);

    await ensureChest(client, streamerId);

    const balance = await getChestBalance(client, streamerId);
    const breakdown = await getChestBreakdown(client, streamerId);

    const opening = await getOpenOpening(client, streamerId);

    let participantsCount = 0;
    let joined = false;

    if (opening) {
      const pc = await client.query(
        `SELECT COUNT(*)::int AS n FROM streamer_chest_participants WHERE opening_id=$1`,
        [opening.id]
      );
      participantsCount = Number(pc.rows?.[0]?.n || 0);
    }

    // optional joined flag (if Authorization present, we can’t verify JWT here without duplicating auth,
    // so front will call /join and handle disabled state; or you can pass token and use requireAuth route /me/chest status)
    // => Keep it simple now.

    return res.json({
      ok: true,
      streamerId,
      balance,
      breakdown,
      capOutWeightBp: MAX_OUT_WEIGHT_BP,
      opening: opening
        ? {
            id: String(opening.id),
            status: String(opening.status),
            opensAt: new Date(opening.opensAt).toISOString(),
            closesAt: new Date(opening.closesAt).toISOString(),
            minWatchMinutes: Number(opening.minWatchMinutes || 5),
            participantsCount,
            joined,
          }
        : null,
    });
  } finally {
    client.release();
  }
});

/**
 * POST /streamers/:slug/chest/deposit
 * body: { amount, note? }
 * streamer only (owner)
 */
chestRouter.post("/streamers/:slug/chest/deposit", requireAuth, async (req: AuthedReq, res) => {
  const slug = String(req.params.slug || "").trim();
  const s = await getStreamerBySlug(slug);
  if (!s) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(s.id);
  const ownerUserId = s.userId ? Number(s.userId) : 0;

  const meId = Number(req.user!.id);
  const meRole = String(req.user!.role || "");

  if (meRole !== "admin" && meId !== ownerUserId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const amount = int(req.body?.amount, 0);
  const note = req.body?.note ?? null;

  try {
    const { txId } = await depositToChest(streamerId, meId, amount, note);
    const client = await pool.connect();
    try {
      const balance = await getChestBalance(client, streamerId);
      return res.json({ ok: true, txId: String(txId), balance });
    } finally {
      client.release();
    }
  } catch (e: any) {
    const msg = String(e?.message || "error");
    const map: any = {
      bad_amount: [400, "bad_amount"],
      insufficient_funds: [409, "insufficient_funds"],
      lots_missing: [409, "lots_missing"],
    };
    const [code, err] = map[msg] || [500, "server_error"];
    return res.status(code).json({ ok: false, error: err });
  }
});

/**
 * POST /streamers/:slug/chest/open
 * body: { durationSec?, minWatchMinutes? }
 * streamer owner only
 */
chestRouter.post("/streamers/:slug/chest/open", requireAuth, async (req: AuthedReq, res) => {
  const slug = String(req.params.slug || "").trim();
  const s = await getStreamerBySlug(slug);
  if (!s) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(s.id);
  const ownerUserId = s.userId ? Number(s.userId) : 0;

  const meId = Number(req.user!.id);
  const meRole = String(req.user!.role || "");
  if (meRole !== "admin" && meId !== ownerUserId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const durationSec = int(req.body?.durationSec, 30);
  const minWatchMinutes = int(req.body?.minWatchMinutes, 5);

  try {
    const opening = await openChest(streamerId, meId, durationSec, minWatchMinutes);

    // Socket event (global) - front filtre par slug
    const io = (req.app as any).locals.io;
    io?.emit?.("chest:open", {
      slug,
      streamerId,
      openingId: String(opening.id),
      opensAt: new Date(opening.opensAt).toISOString(),
      closesAt: new Date(opening.closesAt).toISOString(),
      minWatchMinutes: Number(opening.minWatchMinutes || 5),
    });

    return res.json({
      ok: true,
      opening: {
        id: String(opening.id),
        opensAt: new Date(opening.opensAt).toISOString(),
        closesAt: new Date(opening.closesAt).toISOString(),
        minWatchMinutes: Number(opening.minWatchMinutes || 5),
      },
    });
  } catch (e: any) {
    if (String(e?.message) === "already_open") {
      return res.status(409).json({ ok: false, error: "already_open" });
    }
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /streamers/:slug/chest/join
 * Viewer joins current opening
 * - must be watching (heartbeat recent)
 * - must have >= minWatchMinutes in this live_session
 * - streamer owner forbidden
 */
chestRouter.post("/streamers/:slug/chest/join", requireAuth, async (req: AuthedReq, res) => {
  const slug = String(req.params.slug || "").trim();
  const s = await getStreamerBySlug(slug);
  if (!s) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(s.id);
  const ownerUserId = s.userId ? Number(s.userId) : 0;

  const meId = Number(req.user!.id);

  if (meId === ownerUserId) {
    return res.status(403).json({ ok: false, error: "owner_forbidden" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const opening = await getOpenOpening(client, streamerId);
    if (!opening) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "no_opening" });
    }

    const closesAt = new Date(opening.closesAt);
    if (Date.now() >= closesAt.getTime()) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "opening_closed" });
    }

    const liveSessionId = await getCurrentLiveSessionId(client, streamerId);
    if (!liveSessionId) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "stream_offline" });
    }

    const viewerKey = `u:${meId}`;

    const hbOk = await hasRecentHeartbeat(client, liveSessionId, viewerKey);
    if (!hbOk) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "not_watching" });
    }

    const watched = await getWatchedMinutes(client, liveSessionId, viewerKey);
    const minWatch = Number(opening.minWatchMinutes || 5);
    if (watched < minWatch) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "need_watchtime",
        watchedMinutes: watched,
        minWatchMinutes: minWatch,
      });
    }

    await client.query(
      `INSERT INTO streamer_chest_participants (opening_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (opening_id, user_id) DO NOTHING`,
      [opening.id, meId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, openingId: String(opening.id) });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});

/**
 * POST /streamers/:slug/chest/close
 * streamer owner only
 * -> payout now (idempotent)
 */
chestRouter.post("/streamers/:slug/chest/close", requireAuth, async (req: AuthedReq, res) => {
  const slug = String(req.params.slug || "").trim();
  const s = await getStreamerBySlug(slug);
  if (!s) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(s.id);
  const ownerUserId = s.userId ? Number(s.userId) : 0;

  const meId = Number(req.user!.id);
  const meRole = String(req.user!.role || "");
  if (meRole !== "admin" && meId !== ownerUserId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const client = await pool.connect();
  try {
    const opening = await getOpenOpening(client, streamerId);
    if (!opening) return res.status(409).json({ ok: false, error: "no_opening" });
    const openingId = Number(opening.id);

    const result = await closeOpeningAndPayout(openingId, "streamer");

    const io = (req.app as any).locals.io;
    io?.emit?.("chest:close", {
      slug,
      streamerId,
      openingId: String(openingId),
      payoutsCount: (result.payouts || []).length,
    });

    return res.json({ ok: true, openingId: String(openingId), ...result });
  } finally {
    client.release();
  }
});
export { closeOpeningAndPayout };
