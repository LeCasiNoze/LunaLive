// api/src/routes/shop.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";
import { shopTalentsRouter } from "./shop_talents.js";
import { spendRubisTx } from "../wallet_engine.js";
export const shopRouter = Router();
shopRouter.use("/shop/talents", shopTalentsRouter);
const PRESTIGE_TOKEN = "prestige_token";
// ──────────────────────────────────────────
// helpers DB
// ──────────────────────────────────────────
async function tableExists(table) {
    const r = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
    return !!r.rows?.[0]?.reg;
}
async function ensureTokenRow(userId, token) {
    if (!(await tableExists("user_tokens")))
        return;
    await pool.query(`
    INSERT INTO user_tokens (user_id, token, amount)
    VALUES ($1,$2,0)
    ON CONFLICT (user_id, token) DO NOTHING
    `, [userId, token]);
}
async function getTokenAmount(userId, token) {
    if (!(await tableExists("user_tokens")))
        return 0;
    await ensureTokenRow(userId, token);
    const r = await pool.query(`SELECT amount::int AS amount FROM user_tokens WHERE user_id=$1 AND token=$2 LIMIT 1`, [userId, token]);
    return Number(r.rows?.[0]?.amount ?? 0);
}
async function spendToken(userId, token, amount) {
    if (amount <= 0)
        throw new Error("bad_amount");
    if (!(await tableExists("user_tokens")))
        throw new Error("tokens_unavailable");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await ensureTokenRow(userId, token);
        const r = await client.query(`
      SELECT amount::int AS amount
      FROM user_tokens
      WHERE user_id=$1 AND token=$2
      FOR UPDATE
      `, [userId, token]);
        const cur = Number(r.rows?.[0]?.amount ?? 0);
        if (cur < amount)
            throw new Error("insufficient_tokens");
        await client.query(`
      UPDATE user_tokens
      SET amount = amount - $3,
          updated_at = NOW()
      WHERE user_id=$1 AND token=$2
      `, [userId, token, amount]);
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}
// ──────────────────────────────────────────
// utils
// ──────────────────────────────────────────
function isBuyableShopItem(it) {
    const rub = typeof it.priceRubis === "number" && it.priceRubis > 0;
    const pre = typeof it.pricePrestige === "number" &&
        it.pricePrestige > 0;
    return it.active && it.unlock === "shop" && (rub || pre);
}
function buildOwnedMap(rows) {
    const owned = {};
    for (const r of rows) {
        if (!owned[r.kind])
            owned[r.kind] = [];
        owned[r.kind].push(r.code);
    }
    return owned;
}
// ──────────────────────────────────────────
// GET /shop/cosmetics
// ──────────────────────────────────────────
shopRouter.get("/shop/cosmetics", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!userId)
        return res.status(401).json({ ok: false });
    // ⚠️ AFFICHAGE = cache users.rubis (mais NON utilisé pour dépenser)
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const availableRubis = Number(u.rows?.[0]?.rubis ?? 0);
    const availablePrestige = await getTokenAmount(userId, PRESTIGE_TOKEN);
    const ent = await pool.query(`SELECT kind, code FROM user_entitlements WHERE user_id=$1`, [userId]);
    res.json({
        ok: true,
        availableRubis,
        availablePrestige,
        owned: buildOwnedMap(ent.rows),
        items: COSMETICS_CATALOG.filter(isBuyableShopItem),
    });
}));
// ──────────────────────────────────────────
// POST /shop/cosmetics/buy
// ──────────────────────────────────────────
shopRouter.post("/shop/cosmetics/buy", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!userId)
        return res.status(401).json({ ok: false });
    const kind = String(req.body?.kind || "");
    const code = String(req.body?.code || "").trim();
    const it = COSMETICS_CATALOG.find((x) => x.active && x.kind === kind && x.code === code);
    if (!it || !isBuyableShopItem(it)) {
        return res.status(400).json({ ok: false, error: "invalid_item" });
    }
    const priceRubis = typeof it.priceRubis === "number" ? it.priceRubis : null;
    const pricePrestige = typeof it.pricePrestige === "number"
        ? it.pricePrestige
        : null;
    try {
        if (pricePrestige && pricePrestige > 0) {
            await spendToken(userId, PRESTIGE_TOKEN, pricePrestige);
        }
        else if (priceRubis && priceRubis > 0) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                await spendRubisTx(client, {
                    userId,
                    amount: priceRubis,
                    spendKind: "sink",
                    spendType: "cosmetic",
                });
                await client.query("COMMIT");
            }
            catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
            finally {
                client.release();
            }
        }
        else {
            return res.status(400).json({ ok: false, error: "bad_price" });
        }
    }
    catch (e) {
        if (String(e?.message) === "insufficient_rubis") {
            return res.status(400).json({ ok: false, error: "insufficient_funds" });
        }
        throw e;
    }
    await pool.query(`
      INSERT INTO user_entitlements (user_id, kind, code)
      VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING
      `, [userId, kind, code]);
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [userId]);
    res.json({
        ok: true,
        availableRubis: Number(u.rows?.[0]?.rubis ?? 0),
    });
}));
