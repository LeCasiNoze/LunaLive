import express from "express";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { spendSupport } from "../economy/engine.js";
import { SUB_PRICE_RUBIS } from "../economy/config.js";

export const subscriptionsRouter = express.Router();

subscriptionsRouter.post("/streamers/:slug/subscribe", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const viewerUserId = Number(req.user!.id);

  const s = await pool.query(
    `SELECT id, user_id
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );
  const row = s.rows?.[0];
  if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(row.id);
  const streamerOwnerUserId = Number(row.user_id);

  // (optionnel) empêche self-sub; si tu veux l’autoriser avec règle spéciale, on le fera après
  if (streamerOwnerUserId && streamerOwnerUserId === viewerUserId) {
    return res.status(400).json({ ok: false, error: "cannot_sub_to_self" });
  }

  try {
    await spendSupport({
      userId: viewerUserId,
      streamerId,
      streamerOwnerUserId,
      amount: SUB_PRICE_RUBIS,
      purpose: "sub",
      meta: { slug },
    });

    // renvoie le solde actuel du viewer (pratique pour update front)
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [viewerUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    return res.json({ ok: true, newBalance });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  }
});
