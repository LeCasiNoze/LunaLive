// api/src/predictions/predictions.routes.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

import {
  getActivePrediction,
  addBet,
  resolvePrediction,
} from "./predictions.store.js";

import {
  createPredictionSafe,
  assertStreamerLive,
} from "./predictions.service.js";

import { spendRubis } from "../wallet_engine.js";

export const predictionsRouter = express.Router();

/**
 * POST /api/bot/predictions/create
 */
predictionsRouter.post(
  "/api/bot/predictions/create",
  requireAuth,
  async (req, res) => {
    try {
      const userId = Number(req.user!.id);
      const {
        streamerId,
        question,
        option1,
        option2,
        durationSec,
        fixedStake,
      } = req.body || {};

      if (!streamerId || !question || !option1 || !option2) {
        return res.status(400).json({ ok: false, reason: "invalid_params" });
      }

      const pred = await createPredictionSafe(
        pool,
        Number(streamerId),
        String(question).trim(),
        String(option1).trim(),
        String(option2).trim(),
        Math.max(30, Number(durationSec) || 180),
        Math.max(1, Number(fixedStake) || 10)
      );

      return res.json({ ok: true, prediction: pred });
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        reason: e?.message || "create_failed",
      });
    }
  }
);

/**
 * GET /api/bot/predictions/current
 */
predictionsRouter.get(
  "/api/bot/predictions/current",
  requireAuth,
  async (req, res) => {
    try {
      const streamerId = Number(req.query.streamerId);
      if (!streamerId) {
        return res.status(400).json({ ok: false, reason: "bad_streamer" });
      }

      const pred = await getActivePrediction(pool, streamerId);
      if (!pred) {
        return res.status(404).json({ ok: false, reason: "no_active_prediction" });
      }

      return res.json({ ok: true, prediction: pred });
    } catch {
      return res.status(500).json({ ok: false, reason: "current_failed" });
    }
  }
);

/**
 * POST /api/bot/predictions/bet
 * body: { streamerId, choice }
 */
predictionsRouter.post(
  "/api/bot/predictions/bet",
  requireAuth,
  async (req, res) => {
    try {
      const userId = Number(req.user!.id);
      const streamerId = Number(req.body?.streamerId);
      const choice = Number(req.body?.choice) === 2 ? 2 : 1;

      if (!streamerId) {
        return res.status(400).json({ ok: false, reason: "bad_streamer" });
      }

      // LIVE ONLY
      await assertStreamerLive(pool, streamerId);

      const pred = await getActivePrediction(pool, streamerId);
      if (!pred) {
        return res.status(404).json({ ok: false, reason: "no_active_prediction" });
      }

      if (pred.status !== "open") {
        return res.status(400).json({ ok: false, reason: "bets_closed" });
      }

      // stake = last_prediction_stake || fixed_stake
      const r = await pool.query(
        `SELECT last_prediction_stake FROM users WHERE id=$1`,
        [userId]
      );
      const stake =
        Number(r.rows?.[0]?.last_prediction_stake) || pred.fixed_stake;

      // ──────────────────────────────────────────
      // 🔒 UPGRADE: predictions.bet_cap
      // ──────────────────────────────────────────
      const up = await pool.query(
        `
        SELECT level
        FROM user_upgrades
        WHERE user_id = $1
          AND upgrade_key = 'predictions.bet_cap'
        LIMIT 1
        `,
        [userId]
      );

      const level = Number(up.rows?.[0]?.level || 0);

      let cap = 0;
      if (level === 1) cap = 30;
      else if (level === 2) cap = 50;
      else if (level >= 3) cap = 100;

      if (cap > 0 && stake > cap) {
        return res.status(400).json({
          ok: false,
          reason: "bet_cap_exceeded",
          cap,
        });
      }

      // ──────────────────────────────────────────
      // 💸 spend rubis (SINK)
      // ──────────────────────────────────────────
      await spendRubis({
        userId,
        amount: stake,
        spendKind: "sink",
        spendType: "prediction_bet",
        meta: {
          predictionId: pred.id,
          streamerId,
          choice,
        },
      });

      await addBet(pool, pred, userId, choice as 1 | 2, stake);

      await pool.query(
        `UPDATE users SET last_prediction_stake=$2 WHERE id=$1`,
        [userId, stake]
      );

      return res.json({ ok: true, stake });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "insufficient_rubis") {
        return res.status(400).json({ ok: false, reason: "not_enough_rubis" });
      }
      return res.status(400).json({ ok: false, reason: msg || "bet_failed" });
    }
  }
);

/**
 * POST /api/bot/predictions/resolve
 */
predictionsRouter.post(
  "/api/bot/predictions/resolve",
  requireAuth,
  async (req, res) => {
    try {
      const streamerId = Number(req.body?.streamerId);
      const winning = Number(req.body?.winning) === 2 ? 2 : 1;

      if (!streamerId) {
        return res.status(400).json({ ok: false, reason: "bad_streamer" });
      }

      await assertStreamerLive(pool, streamerId);

      const pred = await getActivePrediction(pool, streamerId);
      if (!pred) {
        return res.status(404).json({ ok: false, reason: "no_active_prediction" });
      }

      if (pred.status === "resolved") {
        return res.status(400).json({ ok: false, reason: "already_resolved" });
      }

      await resolvePrediction(pool, pred, winning as 1 | 2);

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        reason: e?.message || "resolve_failed",
      });
    }
  }
);
