// api/src/routes/admin_rubis.ts
import express from "express";
import { pool } from "../db.js";

export const adminRubisRouter = express.Router();

function requireAdminKey(req: any, res: any, next: any) {
  const got = String(req.headers["x-admin-key"] || "");
  const expected = String(process.env.ADMIN_KEY || "");
  if (!expected || got !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

function clampInt(n: any, min: number, max: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.floor(v);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

// ✅ recherche users
adminRubisRouter.get("/admin/users/search", requireAdminKey, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = clampInt(req.query.limit, 1, 20) ?? 8;

    if (!q) return res.json({ ok: true, users: [] });

    const { rows } = await pool.query(
      `SELECT id, username, role, rubis
       FROM users
       WHERE lower(username) LIKE lower($1)
       ORDER BY id DESC
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    res.json({
      ok: true,
      users: rows.map((r: any) => ({
        id: Number(r.id),
        username: String(r.username),
        role: String(r.role),
        rubis: Number(r.rubis || 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ✅ mint rubis avec poids choisi
adminRubisRouter.post("/admin/rubis/mint", requireAdminKey, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = clampInt(req.body?.userId, 1, 1_000_000_000);
    const amount = clampInt(req.body?.amount, 1, 2_000_000_000);
    const weightBp = clampInt(req.body?.weightBp, 0, 10000);

    if (!userId) return res.status(400).json({ ok: false, error: "bad_userId" });
    if (!amount) return res.status(400).json({ ok: false, error: "bad_amount" });
    if (weightBp === null) return res.status(400).json({ ok: false, error: "bad_weightBp" });

    const origin = "admin_grant";

    await client.query("BEGIN");

    // lock user
    const u = await client.query(`SELECT id, username, rubis FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!u.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }

    // credit visible balance
    await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [userId, amount]);

    // create lot
    const lot = await client.query(
      `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
       VALUES ($1,$2,$3,$4,$4,$5::jsonb)
       RETURNING id`,
      [userId, origin, weightBp, amount, JSON.stringify({ by: "admin", note: req.body?.note ?? null })]
    );

    // tx ledger
    const tx = await client.query(
      `INSERT INTO rubis_tx (
         kind, purpose, status,
         from_user_id, to_user_id, streamer_id,
         amount, support_value, streamer_amount, platform_amount, burn_amount,
         meta
       )
       VALUES (
         'mint','admin_grant','succeeded',
         NULL,$1,NULL,
         $2,0,0,0,0,
         $3::jsonb
       )
       RETURNING id`,
      [
        userId,
        amount,
        JSON.stringify({
          origin,
          weightBp,
          lotId: Number(lot.rows[0].id),
          note: req.body?.note ?? null,
        }),
      ]
    );

    // entries (audit)
    await client.query(
      `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
       VALUES ($1, 'user', $2, $3)`,
      [Number(tx.rows[0].id), userId, amount]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      txId: String(tx.rows[0].id),
      lotId: String(lot.rows[0].id),
      user: { id: userId, username: String(u.rows[0].username), rubis: Number(u.rows[0].rubis) + amount },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    next(err);
  } finally {
    client.release();
  }
});
