import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
const ALLOWED = new Set([
    "clip_race",
    "viewer_week",
    "wheel_week",
    "global_chest",
    "burn_boss",
    "duo_week",
]);
function normType(x) {
    const t = String(x || "").trim();
    return ALLOWED.has(t) ? t : null;
}
export const adminEventsRouter = Router();
/**
 * GET /admin/events/current
 */
adminEventsRouter.get("/current", a(async (_req, res) => {
    const r = await pool.query(`
      SELECT *
      FROM events
      WHERE start_at <= NOW() AND NOW() < end_at
      ORDER BY start_at DESC
      LIMIT 1
      `);
    res.json({ ok: true, event: r.rows?.[0] ?? null });
}));
/**
 * POST /admin/events/force
 * body: { type: "viewer_week", durationMin?: number, config?: any }
 * -> crée un event "debug" qui prend priorité sur l'event hebdo (car start_at=NOW()).
 */
adminEventsRouter.post("/force", a(async (req, res) => {
    const type = normType(req.body?.type);
    if (!type)
        return res.status(400).json({ ok: false, error: "bad_type" });
    const durationMin = Math.max(1, Math.min(7 * 24 * 60, Number(req.body?.durationMin ?? 15)));
    const config = req.body?.config ?? {};
    const r = await pool.query(`
      INSERT INTO events(type, cycle_index, start_at, end_at, state, config)
      VALUES ($1, 0, NOW(), NOW() + ($2::int * INTERVAL '1 minute'), 'live', $3::jsonb)
      RETURNING *
      `, [type, durationMin, JSON.stringify(config)]);
    res.json({ ok: true, event: r.rows[0] });
}));
/**
 * POST /admin/events/close-current
 * -> termine immédiatement l'event actif (debug)
 */
adminEventsRouter.post("/close-current", a(async (_req, res) => {
    const r = await pool.query(`
      UPDATE events
      SET state='closed', end_at=LEAST(end_at, NOW()), updated_at=NOW()
      WHERE id = (
        SELECT id FROM events
        WHERE start_at <= NOW() AND NOW() < end_at
        ORDER BY start_at DESC
        LIMIT 1
      )
      RETURNING *
      `);
    res.json({ ok: true, closed: r.rows?.[0] ?? null });
}));
/**
 * POST /admin/events/advance
 * body: { nextType?: string, durationMin?: number, config?: any }
 * -> close current + force next (utile pour enchaîner les tests)
 */
adminEventsRouter.post("/advance", a(async (req, res) => {
    const nextTypeRaw = req.body?.nextType;
    const nextType = nextTypeRaw ? normType(nextTypeRaw) : null;
    const durationMin = Math.max(1, Math.min(7 * 24 * 60, Number(req.body?.durationMin ?? 15)));
    const config = req.body?.config ?? {};
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const closed = await client.query(`
        UPDATE events
        SET state='closed', end_at=LEAST(end_at, NOW()), updated_at=NOW()
        WHERE id = (
          SELECT id FROM events
          WHERE start_at <= NOW() AND NOW() < end_at
          ORDER BY start_at DESC
          LIMIT 1
        )
        RETURNING *
        `);
        const typeToStart = nextType ?? "viewer_week";
        const started = await client.query(`
        INSERT INTO events(type, cycle_index, start_at, end_at, state, config)
        VALUES ($1, 0, NOW(), NOW() + ($2::int * INTERVAL '1 minute'), 'live', $3::jsonb)
        RETURNING *
        `, [typeToStart, durationMin, JSON.stringify(config)]);
        await client.query("COMMIT");
        res.json({ ok: true, closed: closed.rows?.[0] ?? null, started: started.rows[0] });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        res.status(500).json({ ok: false, error: "server_error", message: e?.message || String(e) });
    }
    finally {
        client.release();
    }
}));
