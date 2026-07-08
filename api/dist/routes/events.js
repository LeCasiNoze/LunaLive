import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth } from "../auth.js";
import { getEventAccessSteps, hasEventAccess } from "../events/eligibility.js";
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
// GET /api/events/access-status
eventsRouter.get("/events/access-status", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const [eligible, steps] = await Promise.all([
        hasEventAccess(pool, userId),
        getEventAccessSteps(pool, userId),
    ]);
    return res.json({ ok: true, eligible, steps });
}));
// POST /api/events/insta-declared
eventsRouter.post("/events/insta-declared", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    await pool.query(`
      INSERT INTO event_access_flags (user_id, insta_declared_at, updated_at)
      VALUES ($1, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET insta_declared_at = NOW(), updated_at = NOW()
      `, [userId]);
    const [eligible, steps] = await Promise.all([
        hasEventAccess(pool, userId),
        getEventAccessSteps(pool, userId),
    ]);
    return res.json({ ok: true, eligible, steps });
}));
