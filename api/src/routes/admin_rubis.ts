// api/src/routes/admin_rubis.ts
import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";

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

function pickOriginFromBody(body: any): string {
  // ✅ voie normale (WalletEngine-friendly)
  const o = String(body?.origin ?? "").trim();
  if (o) return o;

  // ⚠️ compat rétro : ancien front envoyait weightBp
  // WalletEngine ne fonctionne PAS avec weightBp arbitraire côté API,
  // donc on mappe vers des origins connus.
  const weightBp = clampInt(body?.weightBp, 0, 10000);
  switch (weightBp) {
    case 10000:
      return "paid_topup";
    case 3500:
      return "farm_watch";
    case 3000:
      // wheel_daily / achievement ont le même w, on choisit wheel_daily par défaut
      return "wheel_daily";
    case 2500:
      return "chest_auto";
    case 2000:
      return "chest_streamer";
    case 1000:
      return "event_platform";
    default:
      return "event_platform";
  }
}

// ✅ recherche users (lecture only, OK)
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

// ✅ mint rubis (CONFORME : earnRubisTx)
adminRubisRouter.post("/admin/rubis/mint", requireAdminKey, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = clampInt(req.body?.userId, 1, 1_000_000_000);
    const amount = clampInt(req.body?.amount, 1, 2_000_000_000);

    if (!userId) return res.status(400).json({ ok: false, error: "bad_userId" });
    if (!amount) return res.status(400).json({ ok: false, error: "bad_amount" });

    const origin = pickOriginFromBody(req.body);
    const note = req.body?.note ?? null;

    // identifiant unique pour retrouver tx/lot créés par earnRubisTx
    const adminGrantId = crypto.randomUUID();

    await client.query("BEGIN");

    // ✅ crédit via WalletEngine (LE SEUL TRUC AUTORISÉ)
    await earnRubisTx(client, userId, origin, amount, {
      by: "admin",
      note,
      adminGrantId,
    });

    // lecture post-credit (dans la même tx)
    const u = await client.query(`SELECT id, username, rubis FROM users WHERE id=$1 LIMIT 1`, [userId]);
    if (!u.rows?.[0]) throw new Error("user_not_found");

    // récupérer les ids (best effort) via adminGrantId stocké en meta
    const lot = await client.query<{ id: number }>(
      `SELECT id
       FROM wallet_lots
       WHERE user_id=$1 AND (meta->>'adminGrantId')=$2
       ORDER BY id DESC
       LIMIT 1`,
      [userId, adminGrantId]
    );

    const tx = await client.query<{ id: number }>(
      `SELECT id
       FROM wallet_tx
       WHERE user_id=$1 AND kind='earn' AND origin=$2 AND (meta->>'adminGrantId')=$3
       ORDER BY id DESC
       LIMIT 1`,
      [userId, origin, adminGrantId]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      txId: tx.rows?.[0]?.id != null ? String(tx.rows[0].id) : null,
      lotId: lot.rows?.[0]?.id != null ? String(lot.rows[0].id) : null,
      user: {
        id: Number(u.rows[0].id),
        username: String(u.rows[0].username),
        rubis: Number(u.rows[0].rubis || 0),
      },
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
