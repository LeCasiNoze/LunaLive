import { Router } from "express";
import { pool } from "../db.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";
export const adminWalletRouter = Router();
/* =========================
   ADMIN AUTH (IDENTIQUE AUX AUTRES)
========================= */
function getAdminKeyFromReq(req) {
    const h = String(req.headers["x-admin-key"] || "");
    if (h)
        return h;
    const auth = String(req.headers.authorization || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m)
        return m[1];
    return "";
}
function requireAdminKey(req, res, next) {
    const provided = getAdminKeyFromReq(req);
    const expected = process.env.ADMIN_KEY ||
        process.env.ADMIN_PASSWORD ||
        process.env.ADMIN_SECRET ||
        process.env.ADMIN_PASS ||
        process.env.ADMIN ||
        "";
    if (!expected)
        return res.status(500).json({ ok: false, error: "ADMIN_KEY not configured" });
    if (!provided || provided !== expected)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    return next();
}
adminWalletRouter.use(requireAdminKey);
/* =========================
   HELPERS
========================= */
function clampInt(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v))
        return null;
    const i = Math.floor(v);
    if (i < min)
        return min;
    if (i > max)
        return max;
    return i;
}
/* =========================
   SEARCH USERS
   GET /admin/wallet/users?q=
========================= */
adminWalletRouter.get("/admin/wallet/users", async (req, res) => {
    const q = String(req.query.q || "").trim();
    const like = q ? `%${q}%` : null;
    const { rows } = await pool.query(`
    SELECT id, username, role, rubis
    FROM users
    WHERE ($1::text IS NULL OR username ILIKE $1)
    ORDER BY id DESC
    LIMIT 20
  `, [like]);
    res.json({ ok: true, users: rows });
});
/* =========================
   GET WALLET DETAIL
   GET /admin/wallet/:userId
========================= */
adminWalletRouter.get("/admin/wallet/:userId", async (req, res) => {
    const userId = clampInt(req.params.userId, 1, 1e9);
    if (!userId)
        return res.status(400).json({ ok: false, error: "bad_userId" });
    const u = await pool.query(`SELECT id, username, rubis FROM users WHERE id=$1`, [userId]);
    if (!u.rows[0])
        return res.status(404).json({ ok: false, error: "user_not_found" });
    const lots = await pool.query(`
    SELECT
      id,
      origin,
      weight_bp,
      amount_total,
      amount_remaining,
      created_at
    FROM rubis_lots
    WHERE user_id=$1
    ORDER BY created_at ASC
  `, [userId]);
    res.json({
        ok: true,
        user: u.rows[0],
        lots: lots.rows,
    });
});
/* =========================
   ADD RUBIS (ADMIN MINT)
   POST /admin/wallet/add
========================= */
adminWalletRouter.post("/admin/wallet/add", async (req, res) => {
    const userId = clampInt(req.body?.userId, 1, 1e9);
    const amount = clampInt(req.body?.amount, 1, 2e9);
    const weightBp = clampInt(req.body?.weightBp, 0, 10000);
    if (!userId || !amount)
        return res.status(400).json({ ok: false, error: "bad_params" });
    // ✅ compat: map weightBp -> origin (même logique que admin_rubis.ts)
    const origin = weightBp === 10000 ? "paid_topup" :
        weightBp === 3500 ? "farm_watch" :
            weightBp === 3000 ? "wheel_daily" :
                weightBp === 2500 ? "chest_auto" :
                    weightBp === 2000 ? "chest_streamer" :
                        weightBp === 1000 ? "event_platform" :
                            "event_platform";
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const u = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
        if (!u.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "user_not_found" });
        }
        await earnRubisTx(client, userId, origin, amount, { by: "admin_wallet", weightBp, note: "admin/wallet/add" });
        await client.query("COMMIT");
        res.json({ ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK");
        res.status(500).json({ ok: false, error: e?.message || "mint_failed" });
    }
    finally {
        client.release();
    }
});
/* =========================
   REMOVE RUBIS (SINK)
   POST /admin/wallet/remove
========================= */
adminWalletRouter.post("/admin/wallet/remove", async (req, res) => {
    const userId = clampInt(req.body?.userId, 1, 1e9);
    const amount = clampInt(req.body?.amount, 1, 2e9);
    if (!userId || !amount) {
        return res.status(400).json({ ok: false, error: "bad_params" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await spendRubisTx(client, {
            userId,
            amount,
            spendKind: "sink",
            spendType: "admin_remove",
            meta: { by: "admin" },
        });
        await client.query("COMMIT");
        res.json({ ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK");
        res.status(400).json({ ok: false, error: e?.message || "remove_failed" });
    }
    finally {
        client.release();
    }
});
/* =========================
   RESET ONE USER
   POST /admin/wallet/reset-user
========================= */
adminWalletRouter.post("/admin/wallet/reset-user", async (req, res) => {
    const userId = clampInt(req.body?.userId, 1, 1e9);
    if (!userId)
        return res.status(400).json({ ok: false, error: "bad_userId" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const u = await client.query(`SELECT id, rubis FROM users WHERE id=$1 FOR UPDATE`, [userId]);
        if (!u.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "user_not_found" });
        }
        const cur = Number(u.rows[0].rubis || 0);
        if (cur > 0) {
            await spendRubisTx(client, {
                userId,
                amount: cur,
                spendKind: "sink",
                spendType: "admin_reset_user",
                meta: { by: "admin_wallet" },
            });
        }
        await client.query("COMMIT");
        res.json({ ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK");
        res.status(500).json({ ok: false, error: e?.message || "reset_failed" });
    }
    finally {
        client.release();
    }
});
/* =========================
   RESET ALL USERS
   POST /admin/wallet/reset-all
========================= */
adminWalletRouter.post("/admin/wallet/reset-all", async (_req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const users = await client.query(`SELECT id, rubis FROM users WHERE rubis > 0 ORDER BY id ASC`);
        for (const row of users.rows) {
            const userId = Number(row.id);
            const cur = Number(row.rubis || 0);
            if (cur > 0) {
                await spendRubisTx(client, {
                    userId,
                    amount: cur,
                    spendKind: "sink",
                    spendType: "admin_reset_all",
                    meta: { by: "admin_wallet" },
                });
            }
        }
        await client.query("COMMIT");
        res.json({ ok: true, resetUsers: users.rows.length });
    }
    catch (e) {
        await client.query("ROLLBACK");
        res.status(500).json({ ok: false, error: e?.message || "reset_all_failed" });
    }
    finally {
        client.release();
    }
});
