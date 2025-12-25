// api/src/routes/shop.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG, type CosmeticItem, type CosmeticKind } from "../cosmetics/catalog.js";

export const shopRouter = Router();

const PRESTIGE_TOKEN = "prestige_token";

// helpers DB (runtime-safe)
async function tableExists(table: string) {
  const r = await pool.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  return !!r.rows?.[0]?.reg;
}

async function spendRubisSink(userId: number, amount: number) {
  if (amount <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock user row
    const u = await client.query<{ rubis: number }>(`SELECT rubis FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    const cur = Number(u.rows?.[0]?.rubis ?? 0);
    if (!Number.isFinite(cur) || cur < amount) {
      throw new Error("insufficient_funds");
    }

    // ✅ always update visible balance
    await client.query(`UPDATE users SET rubis = rubis - $2 WHERE id=$1`, [userId, amount]);

    // ✅ best effort: consume lots lowest weight first (if lots table exists)
    const lotsTable = await (async () => {
      const candidates = ["rubis_lots", "user_rubis_lots"];
      for (const name of candidates) {
        const rr = await client.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [`public.${name}`]);
        if (rr.rows?.[0]?.reg) return name;
      }
      return null;
    })();

    if (lotsTable) {
      const colsRes = await client.query<{ column_name: string }>(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        `,
        [lotsTable]
      );
      const cols = colsRes.rows.map((x) => x.column_name);
      const set = new Set(cols);

      const pickCol = (candidates: string[]) => {
        for (const c of candidates) if (set.has(c)) return c;
        return null;
      };

      const idCol = pickCol(["id", "lot_id"]);
      const userCol = pickCol(["user_id"]);
      const weightCol = pickCol(["weight_bp", "weightBp", "weight", "w_bp", "w"]);
      const balCol = pickCol(["remaining", "remaining_rubis", "amount_left", "balance", "available", "amount"]);
      const createdCol = pickCol(["created_at", "minted_at", "createdAt"]);

      // si on n'arrive pas à détecter les colonnes, on skip sans casser l'achat
      if (idCol && userCol && weightCol && balCol) {
        const orderCreated = createdCol ? `${createdCol} ASC,` : "";
        const lots = await client.query(
          `
          SELECT ${idCol} AS id,
                 ${weightCol}::int AS weight_bp,
                 ${balCol}::int AS bal
          FROM ${lotsTable}
          WHERE ${userCol} = $1
            AND ${balCol}::int > 0
          ORDER BY ${weightCol}::int ASC, ${orderCreated} ${idCol} ASC
          FOR UPDATE
          `,
          [userId]
        );

        let left = amount;
        for (const row of lots.rows as any[]) {
          if (left <= 0) break;
          const bal = Number(row.bal ?? 0);
          if (!bal) continue;

          const take = Math.min(bal, left);
          await client.query(`UPDATE ${lotsTable} SET ${balCol} = (${balCol}::int - $2) WHERE ${idCol} = $1`, [
            row.id,
            take,
          ]);
          left -= take;
        }
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function ensureTokenRow(userId: number, token: string) {
  if (!(await tableExists("user_tokens"))) return;

  await pool.query(
    `
    INSERT INTO user_tokens (user_id, token, amount)
    VALUES ($1,$2,0)
    ON CONFLICT (user_id, token) DO NOTHING
  `,
    [userId, token]
  );
}

async function getTokenAmount(userId: number, token: string) {
  if (!(await tableExists("user_tokens"))) return 0;

  await ensureTokenRow(userId, token);

  const r = await pool.query<{ amount: number }>(
    `SELECT amount::int AS amount FROM user_tokens WHERE user_id=$1 AND token=$2 LIMIT 1`,
    [userId, token]
  );
  const v = Number(r.rows?.[0]?.amount ?? 0);
  return Number.isFinite(v) ? v : 0;
}

async function spendToken(userId: number, token: string, amount: number) {
  if (amount <= 0) throw new Error("bad_amount");
  if (!(await tableExists("user_tokens"))) throw new Error("tokens_unavailable");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO user_tokens (user_id, token, amount)
      VALUES ($1,$2,0)
      ON CONFLICT (user_id, token) DO NOTHING
    `,
      [userId, token]
    );

    const r = await client.query<{ amount: number }>(
      `
      SELECT amount::int AS amount
      FROM user_tokens
      WHERE user_id=$1 AND token=$2
      FOR UPDATE
    `,
      [userId, token]
    );

    const cur = Number(r.rows?.[0]?.amount ?? 0);
    if (!Number.isFinite(cur) || cur < amount) throw new Error("insufficient_tokens");

    await client.query(
      `
      UPDATE user_tokens
      SET amount = amount - $3,
          updated_at = NOW()
      WHERE user_id=$1 AND token=$2
    `,
      [userId, token, amount]
    );

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

function isVisibleItem(it: CosmeticItem) {
  return !!it && it.active === true;
}

function isBuyableShopItem(it: CosmeticItem) {
  const rub = typeof it.priceRubis === "number" && Number.isFinite(it.priceRubis) && it.priceRubis > 0;
  const pre =
    typeof (it as any).pricePrestige === "number" &&
    Number.isFinite((it as any).pricePrestige) &&
    (it as any).pricePrestige > 0;

  return it.active && it.unlock === "shop" && (rub || pre);
}

function buildOwnedMap(rows: Array<{ kind: string; code: string }>) {
  const owned: Record<string, string[]> = {};
  for (const r of rows) {
    if (!owned[r.kind]) owned[r.kind] = [];
    owned[r.kind].push(r.code);
  }
  return owned;
}

function shopSort(a: CosmeticItem, b: CosmeticItem) {
  const ar = typeof a.priceRubis === "number" ? Number(a.priceRubis) : Number.POSITIVE_INFINITY;
  const br = typeof b.priceRubis === "number" ? Number(b.priceRubis) : Number.POSITIVE_INFINITY;

  const ap = typeof (a as any).pricePrestige === "number" ? Number((a as any).pricePrestige) : Number.POSITIVE_INFINITY;
  const bp = typeof (b as any).pricePrestige === "number" ? Number((b as any).pricePrestige) : Number.POSITIVE_INFINITY;

  const aGroup = Number.isFinite(ar) && ar !== Number.POSITIVE_INFINITY ? 0 : Number.isFinite(ap) && ap !== Number.POSITIVE_INFINITY ? 1 : 2;
  const bGroup = Number.isFinite(br) && br !== Number.POSITIVE_INFINITY ? 0 : Number.isFinite(bp) && bp !== Number.POSITIVE_INFINITY ? 1 : 2;

  if (aGroup !== bGroup) return aGroup - bGroup;

  const aPrice = aGroup === 0 ? ar : aGroup === 1 ? ap : Number.POSITIVE_INFINITY;
  const bPrice = bGroup === 0 ? br : bGroup === 1 ? bp : Number.POSITIVE_INFINITY;

  if (aPrice !== bPrice) return aPrice - bPrice;

  return a.name.localeCompare(b.name);
}

// GET /shop/cosmetics
shopRouter.get(
  "/shop/cosmetics",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

    // ✅ always read balance from DB (not from token)
    const u = await pool.query<{ rubis: number }>(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const availableRubis = Number(u.rows?.[0]?.rubis ?? 0);

    // ✅ prestige (user_tokens)
    const availablePrestige = await getTokenAmount(userId, PRESTIGE_TOKEN);

    // owned cosmetics
    const ent = await pool.query<{ kind: string; code: string }>(
      `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
      [userId]
    );
    const owned = buildOwnedMap(ent.rows);

    // equipped cosmetics (best effort)
    let equipped = { username: null, badge: null, title: null, frame: null, hat: null } as {
      username: string | null;
      badge: string | null;
      title: string | null;
      frame: string | null;
      hat: string | null;
    };

    if (await tableExists("user_equipped_cosmetics")) {
      const eq = await pool.query<{
        username_code: string | null;
        badge_code: string | null;
        title_code: string | null;
        frame_code: string | null;
        hat_code: string | null;
      }>(
        `SELECT username_code, badge_code, title_code, frame_code, hat_code
         FROM user_equipped_cosmetics
         WHERE user_id=$1
         LIMIT 1`,
        [userId]
      );

      if (eq.rows?.[0]) {
        equipped = {
          username: eq.rows[0].username_code,
          badge: eq.rows[0].badge_code,
          title: eq.rows[0].title_code,
          frame: eq.rows[0].frame_code,
          hat: eq.rows[0].hat_code,
        };
      }
    }

    const items = COSMETICS_CATALOG.filter(isVisibleItem).slice().sort(shopSort);
    res.json({ ok: true, debug: "shopRouter_v2_titles", availableRubis, availablePrestige, owned, equipped, items });

    res.json({ ok: true, availableRubis, availablePrestige, owned, equipped, items });
  })
);

// POST /shop/cosmetics/buy
shopRouter.post(
  "/shop/cosmetics/buy",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

    const kind = String(req.body?.kind || "") as CosmeticKind;
    const code = String(req.body?.code || "").trim();
    if (!kind || !code) return res.status(400).json({ ok: false, error: "bad_payload" });

    const it = COSMETICS_CATALOG.find((x) => x.active && x.kind === kind && x.code === code);
    if (!it) return res.status(400).json({ ok: false, error: "unknown_item" });
    if (!isBuyableShopItem(it)) return res.status(400).json({ ok: false, error: "not_shop_item" });

    // already owned ?
    const ownedQ = await pool.query(`SELECT 1 FROM user_entitlements WHERE user_id=$1 AND kind=$2 AND code=$3 LIMIT 1`, [
      userId,
      kind,
      code,
    ]);
    if (ownedQ.rows?.[0]) {
      const u = await pool.query<{ id: number; username: string; rubis: number }>(
        `SELECT id, username, rubis FROM users WHERE id=$1 LIMIT 1`,
        [userId]
      );
      const ent = await pool.query<{ kind: string; code: string }>(
        `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
        [userId]
      );

      const availablePrestige = await getTokenAmount(userId, PRESTIGE_TOKEN);

      return res.json({
        ok: true,
        alreadyOwned: true,
        user: u.rows?.[0] ?? null,
        availableRubis: Number(u.rows?.[0]?.rubis ?? 0),
        availablePrestige,
        owned: buildOwnedMap(ent.rows),
      });
    }

    const priceRubis = typeof it.priceRubis === "number" ? Number(it.priceRubis) : null;
    const pricePrestige = typeof (it as any).pricePrestige === "number" ? Number((it as any).pricePrestige) : null;

    const isRubis = priceRubis != null && Number.isFinite(priceRubis) && priceRubis > 0;
    const isPrestige = pricePrestige != null && Number.isFinite(pricePrestige) && pricePrestige > 0;

    if (!isRubis && !isPrestige) return res.status(400).json({ ok: false, error: "bad_price" });

    // spend
    try {
      if (isPrestige) {
        await spendToken(userId, PRESTIGE_TOKEN, pricePrestige!);
      } else {
        await spendRubisSink(userId, priceRubis!);
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "insufficient_funds") return res.status(400).json({ ok: false, error: "insufficient_funds" });
      if (msg === "insufficient_tokens") return res.status(400).json({ ok: false, error: "insufficient_prestige" });
      if (msg === "bad_amount") return res.status(400).json({ ok: false, error: "bad_amount" });
      if (msg === "tokens_unavailable") return res.status(500).json({ ok: false, error: "tokens_unavailable" });
      return res.status(500).json({ ok: false, error: "buy_failed" });
    }

    // grant entitlement
    await pool.query(
      `INSERT INTO user_entitlements (user_id, kind, code)
       VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [userId, kind, code]
    );

    const u = await pool.query<{ id: number; username: string; rubis: number }>(
      `SELECT id, username, rubis FROM users WHERE id=$1 LIMIT 1`,
      [userId]
    );
    const ent = await pool.query<{ kind: string; code: string }>(
      `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
      [userId]
    );

    const availablePrestige = await getTokenAmount(userId, PRESTIGE_TOKEN);

    res.json({
      ok: true,
      alreadyOwned: false,
      item: it,
      user: u.rows?.[0] ?? null,
      availableRubis: Number(u.rows?.[0]?.rubis ?? 0),
      availablePrestige,
      owned: buildOwnedMap(ent.rows),
    });
  })
);
