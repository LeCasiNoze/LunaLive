// api/src/routes/public_calls.ts
// Endpoint PUBLIC (no auth) pour la zone "Call" de l'overlay.
// Monté tout en haut de la stack express, avant tout middleware d'auth.

import { Router } from "express";
import { pool } from "../db.js";

export const publicCallsRouter = Router();

publicCallsRouter.get("/api/public/calls/:slug/queue", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const stR = await pool.query<{ id: number }>(
      `SELECT id FROM streamers WHERE slug=$1 LIMIT 1`,
      [slug]
    );
    const streamer = stR.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    // Items pas encore payés (= calls en cours), triés par pos — head + next
    const r = await pool.query(
      `SELECT
         q.id::text   AS id,
         q.slot_name  AS "slotName",
         q.slot_key   AS "slotKey",
         q.provider   AS provider,
         q.username   AS username,
         q.pos        AS pos,
         sc.image_url AS "imageUrl"
       FROM calls_queue q
       LEFT JOIN slots_catalog sc ON sc.name_key = q.slot_key
       WHERE q.streamer_id=$1
         AND q.pay IS NULL
       ORDER BY q.pos ASC
       LIMIT 2`,
      [streamer.id]
    );

    const head = r.rows?.[0] ?? null;
    const next = r.rows?.[1] ?? null;

    const cR = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM calls_queue
        WHERE streamer_id=$1
          AND pay IS NULL`,
      [streamer.id]
    );
    const count = Number(cR.rows?.[0]?.count || 0);

    return res.json({ ok: true, head, next, count });
  } catch (e) {
    console.error("[api/public/calls/queue]", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
