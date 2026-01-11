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

export const predictionsRouter = express.Router();

/**
 * POST /api/bot/predictions/create
 * body: { streamerId, question, option1, option2, durationSec, fixedStake }
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
 * GET /api/bot/predictions/current?streamerId=123
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
    } catch (e: any) {
      return res.status(500).json({ ok: false, reason: "current_failed" });
    }
  }
);

/**
 * POST /api/bot/predictions/bet
 * body: { streamerId, choice }
 * → stake = last_prediction_stake || fixedStake
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

      await addBet(pool, pred, userId, choice as 1 | 2, stake);

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
 * body: { streamerId, winning }
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

      // LIVE ONLY
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
