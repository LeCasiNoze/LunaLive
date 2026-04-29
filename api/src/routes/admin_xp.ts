// api/src/routes/admin_xp.ts
import express from "express";
import { pool } from "../db.js";
import { awardXpTx, levelFromXp, getLevelInfo, MAX_LEVEL } from "../economy/xp.js";

export const adminXpRouter = express.Router();

function requireAdminKey(req: any, res: any, next: any) {
  const got = String(req.headers["x-admin-key"] || "");
  const expected = String(process.env.ADMIN_KEY || "");
  if (!expected || got !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

/** GET /admin/xp/leaderboard — top users par XP avec level */
adminXpRouter.get("/admin/xp/leaderboard", requireAdminKey, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit) || 50));
    const r = await pool.query(
      `SELECT id, username, role, xp::bigint AS xp, last_login_at
         FROM users
        WHERE role IN ('viewer','streamer')
        ORDER BY xp DESC
        LIMIT $1`,
      [limit]
    );
    return res.json({
      ok: true,
      maxLevel: MAX_LEVEL,
      leaderboard: r.rows.map((u: any) => {
        const xp = Number(u.xp || 0);
        const info = getLevelInfo(xp);
        return {
          id: Number(u.id),
          username: String(u.username),
          role: String(u.role),
          xp,
          level: info.level,
          title: info.fullTitle,
          lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
        };
      }),
    });
  } catch (e) { next(e); }
});

/** POST /admin/xp/add { userId, delta, reason? } — crédit/débit XP */
adminXpRouter.post("/admin/xp/add", requireAdminKey, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = Number(req.body?.userId);
    const delta = Math.floor(Number(req.body?.delta || 0));
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 200) : null;
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ ok: false, error: "invalid_user" });
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ ok: false, error: "invalid_delta" });

    await client.query("BEGIN");

    if (delta > 0) {
      // Award XP via service (uncapped car admin)
      const r = await awardXpTx(client, userId, delta, "admin_grant", reason || "admin_add", { by: "admin" });
      await client.query("COMMIT");
      return res.json({ ok: true, ...r });
    } else {
      // Décrément direct (jamais capé, log dans xp_events avec delta négatif)
      const before = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id=$1 FOR UPDATE`, [userId]);
      if (!before.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "user_not_found" });
      }
      const oldXp = Number(before.rows[0].xp || 0);
      const newXp = Math.max(0, oldXp + delta);
      await client.query(`UPDATE users SET xp = $2 WHERE id = $1`, [userId, newXp]);
      await client.query(
        `INSERT INTO xp_events (user_id, delta, source, reason, meta)
         VALUES ($1, $2, 'admin_grant', $3, $4::jsonb)`,
        [userId, newXp - oldXp, reason || "admin_remove", JSON.stringify({ by: "admin" })]
      );
      await client.query("COMMIT");
      return res.json({
        ok: true,
        delta: newXp - oldXp,
        newXp,
        oldLevel: levelFromXp(oldXp),
        newLevel: levelFromXp(newXp),
      });
    }
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
});

/** POST /admin/xp/set { userId, value, reason? } — fixe XP à une valeur */
adminXpRouter.post("/admin/xp/set", requireAdminKey, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = Number(req.body?.userId);
    const value = Math.max(0, Math.floor(Number(req.body?.value || 0)));
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 200) : null;
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ ok: false, error: "invalid_user" });

    await client.query("BEGIN");
    const before = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }
    const oldXp = Number(before.rows[0].xp || 0);
    await client.query(`UPDATE users SET xp = $2 WHERE id = $1`, [userId, value]);
    await client.query(
      `INSERT INTO xp_events (user_id, delta, source, reason, meta)
       VALUES ($1, $2, 'admin_grant', $3, $4::jsonb)`,
      [userId, value - oldXp, reason || "admin_set", JSON.stringify({ by: "admin", target: value, oldXp })]
    );
    await client.query("COMMIT");
    return res.json({
      ok: true,
      delta: value - oldXp,
      newXp: value,
      oldLevel: levelFromXp(oldXp),
      newLevel: levelFromXp(value),
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally {
    client.release();
  }
});

/** GET /admin/xp/events?userId=X — derniers events XP pour audit */
adminXpRouter.get("/admin/xp/events", requireAdminKey, async (req, res, next) => {
  try {
    const userId = Number(req.query?.userId);
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 100));
    const params: any[] = [limit];
    let where = "";
    if (Number.isFinite(userId) && userId > 0) {
      params.unshift(userId);
      where = "WHERE user_id = $1";
      params[1] = limit;
    }
    const r = await pool.query(
      `SELECT e.id, e.user_id, u.username, e.delta, e.source, e.reason, e.meta, e.created_at
         FROM xp_events e
         LEFT JOIN users u ON u.id = e.user_id
         ${where}
         ORDER BY e.id DESC
         LIMIT $${where ? 2 : 1}`,
      params
    );
    return res.json({
      ok: true,
      events: r.rows.map((row: any) => ({
        id: String(row.id),
        userId: Number(row.user_id),
        username: row.username || null,
        delta: Number(row.delta),
        source: String(row.source),
        reason: row.reason || null,
        meta: row.meta || null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
    });
  } catch (e) { next(e); }
});

/** GET /admin/xp/balance — total XP distribué + stats */
adminXpRouter.get("/admin/xp/balance", requireAdminKey, async (_req, res, next) => {
  try {
    const totals = await pool.query(`
      SELECT
        COALESCE(SUM(xp), 0)::bigint AS total_xp,
        COUNT(*) FILTER (WHERE xp > 0) AS users_with_xp,
        COUNT(*) AS users_total
      FROM users
    `);
    const bySource = await pool.query(`
      SELECT source,
             COUNT(*)::int AS events,
             COALESCE(SUM(delta), 0)::bigint AS total_delta
        FROM xp_events
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY source
       ORDER BY total_delta DESC
    `);
    const t = totals.rows[0] || {};
    return res.json({
      ok: true,
      totalXp: Number(t.total_xp || 0),
      usersWithXp: Number(t.users_with_xp || 0),
      usersTotal: Number(t.users_total || 0),
      bySource30d: bySource.rows.map((r: any) => ({
        source: String(r.source),
        events: Number(r.events),
        totalDelta: Number(r.total_delta),
      })),
    });
  } catch (e) { next(e); }
});
