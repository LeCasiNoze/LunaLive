import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
export const eventsRouter = Router();
// GET /api/events/current
eventsRouter.get("/events/current", a(async (_req, res) => {
    const r = await pool.query(`
      SELECT *
      FROM events
      WHERE start_at <= NOW() AND NOW() < end_at
      ORDER BY start_at DESC
      LIMIT 1
      `);
    if (r.rows?.[0])
        return res.json({ ok: true, event: r.rows[0] });
    // fallback: next scheduled
    const r2 = await pool.query(`
      SELECT *
      FROM events
      WHERE start_at > NOW()
      ORDER BY start_at ASC
      LIMIT 1
      `);
    return res.json({ ok: true, event: r2.rows?.[0] ?? null });
}));
