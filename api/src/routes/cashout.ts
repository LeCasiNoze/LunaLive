// api/src/routes/cashout.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { cashoutRequest } from "../economy/engine.js";

export const cashoutRouter = express.Router();

cashoutRouter.post("/streamer/me/cashout/request", requireAuth, async (req, res) => {
  if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const euros = Number(req.body?.euros ?? 0);
  const eurosCents = Math.floor(euros * 100);
  const note = req.body?.note ? String(req.body.note) : null;

  if (!Number.isFinite(euros) || euros <= 0) return res.status(400).json({ ok: false, error: "bad_amount" });

  const s = await pool.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
  const streamer = s.rows?.[0];
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  try {
    const out = await cashoutRequest({
      streamerOwnerUserId: Number(req.user!.id),
      streamerId: Number(streamer.id),
      eurosCents,
      meta: { note },
    });

    res.json({ ok: true, request: out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === "insufficient_value") return res.status(400).json({ ok: false, error: "insufficient_value" });
    if (msg === "insufficient_balance") return res.status(400).json({ ok: false, error: "insufficient_balance" });
    if (msg === "bad_amount") return res.status(400).json({ ok: false, error: "bad_amount" });
    console.error("[cashout/request] failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
