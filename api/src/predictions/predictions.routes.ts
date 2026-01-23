import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

import { getActivePrediction, addBet, resolvePrediction } from "./predictions.store.js";
import { createPredictionSafe, assertStreamerLive } from "./predictions.service.js";

import { spendRubis } from "../wallet_engine.js";

export const predictionsRouter = express.Router();

const BET_UPGRADE_KEY = "predictions.bet_cap" as const; // (ton upgrade existant)
function allowedStakesFromLevel(level: number): number[] {
  const lv = Math.max(0, Math.min(3, Number(level || 0)));
  if (lv <= 0) return [10];
  if (lv === 1) return [10, 25];
  if (lv === 2) return [10, 25, 50];
  return [10, 25, 50, 100];
}

async function getBetLevel(userId: number): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT level FROM user_upgrades WHERE user_id=$1 AND upgrade_key=$2 LIMIT 1`,
      [userId, BET_UPGRADE_KEY]
    );
    return Math.max(0, Number(r.rows?.[0]?.level || 0));
  } catch {
    return 0;
  }
}

async function getLastStake(userId: number): Promise<number> {
  try {
    const r = await pool.query(`SELECT last_prediction_stake FROM users WHERE id=$1`, [userId]);
    return Number(r.rows?.[0]?.last_prediction_stake || 0);
  } catch {
    return 0;
  }
}

async function setLastStake(userId: number, stake: number): Promise<void> {
  await pool.query(`UPDATE users SET last_prediction_stake=$2 WHERE id=$1`, [userId, stake]);
}

function isAllowedStake(stake: number, allowed: number[]) {
  const s = Number(stake);
  return Number.isFinite(s) && allowed.includes(s);
}

async function resolveStreamerIdFromSlug(slug: string): Promise<number | null> {
  const s = String(slug || "").trim();
  if (!s) return null;
  const r = await pool.query(`SELECT id FROM streamers WHERE slug=$1 LIMIT 1`, [s]);
  const id = Number(r.rows?.[0]?.id || 0);
  return id > 0 ? id : null;
}

async function getStreamerIdFromReq(req: any): Promise<number | null> {
  const bodyId = Number(req.body?.streamerId);
  const queryId = Number(req.query?.streamerId);
  if (bodyId > 0) return bodyId;
  if (queryId > 0) return queryId;

  const slug = req.body?.streamerSlug ?? req.query?.streamerSlug ?? req.body?.slug ?? req.query?.slug;
  if (slug) return await resolveStreamerIdFromSlug(String(slug));

  return null;
}

/* ─────────────────────────────────────────────────────────────
   ✅ Permissions: mod/admin/owner pour create/resolve
   - admin : ok
   - owner : streamers.user_id === req.user.id
   - mod : best-effort via tables streamer_mods / streamer_moderators (si existent)
   ───────────────────────────────────────────────────────────── */

async function isOwnerOrAdmin(poolAny: any, streamerId: number, user: any): Promise<boolean> {
  const role = String(user?.role || "viewer");
  if (role === "admin") return true;

  const uid = Number(user?.id || 0);
  if (uid <= 0) return false;

  const r = await poolAny.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
  const ownerUserId = Number(r.rows?.[0]?.user_id || 0);
  return ownerUserId > 0 && ownerUserId === uid;
}

async function isModerator(poolAny: any, streamerId: number, userId: number): Promise<boolean> {
  // essaie streamer_mods(streamer_id,user_id)
  try {
    const r = await poolAny.query(
      `SELECT 1 FROM streamer_mods WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
      [streamerId, userId]
    );
    if (r.rows?.[0]) return true;
  } catch {}

  // fallback streamer_moderators(streamer_id,user_id)
  try {
    const r = await poolAny.query(
      `SELECT 1 FROM streamer_moderators WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
      [streamerId, userId]
    );
    if (r.rows?.[0]) return true;
  } catch {}

  return false;
}

async function assertCanManagePrediction(poolAny: any, streamerId: number, user: any) {
  const uid = Number(user?.id || 0);
  if (uid <= 0) throw new Error("forbidden");

  if (await isOwnerOrAdmin(poolAny, streamerId, user)) return;

  if (await isModerator(poolAny, streamerId, uid)) return;

  throw new Error("forbidden");
}

/**
 * GET /api/bot/predictions/stake
 */
predictionsRouter.get("/api/bot/predictions/stake", requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const level = await getBetLevel(userId);
    const allowed = allowedStakesFromLevel(level);

    let selected = await getLastStake(userId);
    if (!isAllowedStake(selected, allowed)) selected = allowed[0];

    // auto-fix en DB si hors allowed
    const raw = await getLastStake(userId);
    if (!isAllowedStake(raw, allowed)) {
      try {
        await setLastStake(userId, selected);
      } catch {}
    }

    return res.json({ ok: true, level, allowed, selected });
  } catch {
    return res.status(500).json({ ok: false, reason: "stake_status_failed" });
  }
});

/**
 * POST /api/bot/predictions/stake
 * body: { stake }
 */
predictionsRouter.post("/api/bot/predictions/stake", requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const wanted = Number(req.body?.stake);

    const level = await getBetLevel(userId);
    const allowed = allowedStakesFromLevel(level);

    if (!isAllowedStake(wanted, allowed)) {
      return res.status(400).json({ ok: false, reason: "stake_not_allowed", allowed });
    }

    await setLastStake(userId, wanted);
    return res.json({ ok: true, selected: wanted, allowed, level });
  } catch (e: any) {
    return res.status(400).json({ ok: false, reason: e?.message || "stake_set_failed" });
  }
});

/**
 * POST /api/bot/predictions/create
 */
predictionsRouter.post("/api/bot/predictions/create", requireAuth, async (req, res) => {
  try {
    const { streamerId, question, option1, option2, durationSec, fixedStake } = req.body || {};

    if (!streamerId || !question || !option1 || !option2) {
      return res.status(400).json({ ok: false, reason: "invalid_params" });
    }

    // ✅ droits: mod/admin/owner
    await assertCanManagePrediction(pool, Number(streamerId), req.user);

    const pred = await createPredictionSafe(
      pool,
      Number(streamerId),
      String(question).trim(),
      String(option1).trim(),
      String(option2).trim(),
      Math.max(30, Number(durationSec) || 180),
      Math.max(10, Number(fixedStake) || 10)
    );

    return res.json({ ok: true, prediction: pred });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "forbidden") return res.status(403).json({ ok: false, reason: "forbidden" });
    return res.status(400).json({ ok: false, reason: e?.message || "create_failed" });
  }
});

/**
 * GET /api/bot/predictions/current
 * accepte streamerId OU streamerSlug
 */
predictionsRouter.get("/api/bot/predictions/current", requireAuth, async (req, res) => {
  try {
    const streamerId = await getStreamerIdFromReq(req);
    if (!streamerId) return res.status(400).json({ ok: false, reason: "bad_streamer" });

    const pred = await getActivePrediction(pool, streamerId);
    if (!pred) return res.status(404).json({ ok: false, reason: "no_active_prediction" });

    return res.json({ ok: true, prediction: pred });
  } catch {
    return res.status(500).json({ ok: false, reason: "current_failed" });
  }
});

/**
 * GET /api/bot/predictions/summary?predictionId=...&limit=200
 * retourne counts + totals + liste bets (username, choice, amount)
 */
predictionsRouter.get("/api/bot/predictions/summary", requireAuth, async (req, res) => {
  try {
    const predictionId = Number(req.query?.predictionId);
    if (!(predictionId > 0)) return res.status(400).json({ ok: false, reason: "bad_prediction" });

    const limit = Math.max(10, Math.min(500, Number(req.query?.limit || 200)));

    const a = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN choice=1 THEN 1 ELSE 0 END),0)::int AS count1,
        COALESCE(SUM(CASE WHEN choice=2 THEN 1 ELSE 0 END),0)::int AS count2,
        COALESCE(SUM(CASE WHEN choice=1 THEN amount ELSE 0 END),0)::int AS total1,
        COALESCE(SUM(CASE WHEN choice=2 THEN amount ELSE 0 END),0)::int AS total2
      FROM prediction_bets
      WHERE prediction_id=$1
      `,
      [predictionId]
    );

    const b = await pool.query(
      `
      SELECT
        pb.user_id AS "userId",
        u.username AS "username",
        pb.choice AS "choice",
        pb.amount AS "amount",
        pb.created_at AS "createdAt"
      FROM prediction_bets pb
      JOIN users u ON u.id = pb.user_id
      WHERE pb.prediction_id=$1
      ORDER BY pb.created_at DESC
      LIMIT $2
      `,
      [predictionId, limit]
    );

    return res.json({
      ok: true,
      predictionId,
      count1: Number(a.rows?.[0]?.count1 || 0),
      count2: Number(a.rows?.[0]?.count2 || 0),
      total1: Number(a.rows?.[0]?.total1 || 0),
      total2: Number(a.rows?.[0]?.total2 || 0),
      bets: (b.rows || []).map((x: any) => ({
        userId: Number(x.userId),
        username: String(x.username || ""),
        choice: Number(x.choice) === 2 ? 2 : 1,
        amount: Number(x.amount || 0),
        createdAt: x.createdAt ? String(x.createdAt) : new Date().toISOString(),
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: e?.message || "summary_failed" });
  }
});

/**
 * POST /api/bot/predictions/bet
 * body: { streamerId|streamerSlug, choice, stake? }
 */
predictionsRouter.post("/api/bot/predictions/bet", requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const streamerId = await getStreamerIdFromReq(req);
    const choice = Number(req.body?.choice) === 2 ? 2 : 1;

    if (!streamerId) return res.status(400).json({ ok: false, reason: "bad_streamer" });

    // LIVE ONLY
    await assertStreamerLive(pool, streamerId);

    const pred = await getActivePrediction(pool, streamerId);
    if (!pred) return res.status(404).json({ ok: false, reason: "no_active_prediction" });

    if (pred.status !== "open") return res.status(400).json({ ok: false, reason: "bets_closed" });

    // ✅ stakes autorisés
    const level = await getBetLevel(userId);
    const allowed = allowedStakesFromLevel(level);

    const bodyStake = req.body?.stake != null ? Number(req.body?.stake) : null;
    const last = await getLastStake(userId);
    let stake = bodyStake != null ? bodyStake : Number(last) || allowed[0];

    if (!isAllowedStake(stake, allowed)) {
      if (bodyStake != null) return res.status(400).json({ ok: false, reason: "stake_not_allowed", allowed });
      stake = allowed[0];
    }

    // 💸 spend rubis (SINK)
    await spendRubis({
      userId,
      amount: stake,
      spendKind: "sink",
      spendType: "prediction_bet",
      streamerId,
      meta: { predictionId: pred.id, choice, stake },
    });

    // ✅ addBet n'effectue PAS de spend (sinon double)
    await addBet(pool, pred, userId, choice as 1 | 2, stake);

    await setLastStake(userId, stake);

    return res.json({ ok: true, stake, allowed, level });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "insufficient_rubis") return res.status(400).json({ ok: false, reason: "not_enough_rubis" });
    if (msg === "stream_not_live") return res.status(400).json({ ok: false, reason: "stream_not_live" });
    return res.status(400).json({ ok: false, reason: msg || "bet_failed" });
  }
});

/**
 * POST /api/bot/predictions/resolve
 * body: { streamerId|streamerSlug, winning }
 */
predictionsRouter.post("/api/bot/predictions/resolve", requireAuth, async (req, res) => {
  try {
    const streamerId = await getStreamerIdFromReq(req);
    const winning = Number(req.body?.winning) === 2 ? 2 : 1;

    if (!streamerId) return res.status(400).json({ ok: false, reason: "bad_streamer" });

    // ✅ droits: mod/admin/owner
    await assertCanManagePrediction(pool, streamerId, req.user);

    await assertStreamerLive(pool, streamerId);

    const pred = await getActivePrediction(pool, streamerId);
    if (!pred) return res.status(404).json({ ok: false, reason: "no_active_prediction" });
    if (pred.status === "resolved") return res.status(400).json({ ok: false, reason: "already_resolved" });

    await resolvePrediction(pool, pred, winning as 1 | 2);

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "forbidden") return res.status(403).json({ ok: false, reason: "forbidden" });
    return res.status(400).json({ ok: false, reason: msg || "resolve_failed" });
  }
});
