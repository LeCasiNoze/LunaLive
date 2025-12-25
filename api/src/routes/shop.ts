// api/src/routes/shop.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG, type CosmeticItem, type CosmeticKind } from "../cosmetics/catalog.js";

export const shopRouter = Router();

type ShopItem = CosmeticItem & { owned: boolean };

// helpers DB (runtime-safe)
async function tableExists(table: string) {
  const r = await pool.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  return !!r.rows?.[0]?.reg;
}

async function getColumns(table: string): Promise<string[]> {
  const r = await pool.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

function pickCol(cols: string[], candidates: string[]) {
  const set = new Set(cols);
  for (const c of candidates) if (set.has(c)) return c;
  return null;
}

async function findLotsTable(): Promise<string | null> {
  const candidates = ["rubis_lots", "user_rubis_lots"];
  for (const t of candidates) if (await tableExists(t)) return t;
  return null;
}

async function spendRubisSink(userId: number, amount: number) {
  if (amount <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock user row
    const u = await client.query<{ rubis: number }>(
      `SELECT rubis FROM users WHERE id=$1 FOR UPDATE`,
      [userId]
    );
    const cur = Number(u.rows?.[0]?.rubis ?? 0);
    if (!Number.isFinite(cur) || cur < amount) {
      await client.query("ROLLBACK");
      throw new Error("insufficient_funds");
    }

    // ✅ always update visible balance
    await client.query(`UPDATE users SET rubis = rubis - $2 WHERE id=$1`, [userId, amount]);

    // ✅ best effort: consume lots lowest weight first (if lots table exists)
    const lotsTable = await (async () => {
      // must use same client for transaction; table existence check can be done without lock
      // but we keep it simple: detect using pool (outside tx) already ok, yet still fine here:
      const t = await (async () => {
        const candidates = ["rubis_lots", "user_rubis_lots"];
        for (const name of candidates) {
          const rr = await client.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [`public.${name}`]);
          if (rr.rows?.[0]?.reg) return name;
        }
        return null;
      })();
      return t;
    })();

    if (lotsTable) {
      const cols = await (async () => {
        const r = await client.query<{ column_name: string }>(
          `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1
          `,
          [lotsTable]
        );
        return r.rows.map((x) => x.column_name);
      })();

      const idCol = pickCol(cols, ["id", "lot_id"]);
      const userCol = pickCol(cols, ["user_id"]);
      const weightCol = pickCol(cols, ["weight_bp", "weightBp", "weight", "w_bp", "w"]);
      const balCol = pickCol(cols, ["remaining", "remaining_rubis", "amount_left", "balance", "available", "amount"]);
      const createdCol = pickCol(cols, ["created_at", "minted_at", "createdAt"]);

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
          await client.query(
            `UPDATE ${lotsTable} SET ${balCol} = (${balCol}::int - $2) WHERE ${idCol} = $1`,
            [row.id, take]
          );
          left -= take;
        }
        // si left > 0, on laisse quand même (balance user a déjà été décrémentée)
        // mais en pratique ça n'arrive que si table lots pas sync.
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

function isShopItem(it: CosmeticItem) {
  return it.active && it.unlock === "shop" && typeof it.priceRubis === "number" && it.priceRubis! >= 0;
}

// GET /shop/cosmetics
shopRouter.get(
  "/shop/cosmetics",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

    const ent = await pool.query<{ kind: string; code: string }>(
      `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
      [userId]
    );
    const ownedSet = new Set(ent.rows.map((r) => `${r.kind}:${r.code}`));

    const items: ShopItem[] = COSMETICS_CATALOG
      .filter(isShopItem)
      .map((x) => ({ ...x, owned: ownedSet.has(`${x.kind}:${x.code}`) }))
      .sort((a, b) => (a.priceRubis ?? 0) - (b.priceRubis ?? 0));

    res.json({ ok: true, items });
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
    if (!isShopItem(it)) return res.status(400).json({ ok: false, error: "not_shop_item" });

    // already owned ?
    const owned = await pool.query(
      `SELECT 1 FROM user_entitlements WHERE user_id=$1 AND kind=$2 AND code=$3 LIMIT 1`,
      [userId, kind, code]
    );
    if (owned.rows?.[0]) {
      const u = await pool.query<{ id: number; username: string; rubis: number }>(
        `SELECT id, username, rubis FROM users WHERE id=$1 LIMIT 1`,
        [userId]
      );
      return res.json({ ok: true, alreadyOwned: true, user: u.rows?.[0] ?? null });
    }

    const price = Number(it.priceRubis ?? 0);

    // ✅ spend (sink) : lots lowest weight first (best-effort)
    await spendRubisSink(userId, price);

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

    res.json({ ok: true, alreadyOwned: false, item: it, user: u.rows?.[0] ?? null });
  })
);
