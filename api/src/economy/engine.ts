// api/src/economy/engine.ts
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { ORIGIN_WEIGHT_BP, type RubisOrigin, type SpendKind } from "./config.js";

type LotRow = { id: number; origin: string; weightBp: number; remaining: number };
type Allocate = { lotId: number; amount: number; weightBp: number; origin: string };

function floorInt(n: number) {
  return Math.floor(n);
}

function valueCentsFrom(amountRubis: number, weightBp: number) {
  // 1 rubis @ 1.00 = 1 centime
  // donc valeur_cents = rubis * weight
  return floorInt((amountRubis * weightBp) / 10000);
}

async function lockUser(client: PoolClient, userId: number) {
  const u = await client.query(`SELECT id, rubis FROM users WHERE id=$1 FOR UPDATE`, [userId]);
  if (!u.rows[0]) throw new Error("user_not_found");
  return { rubis: Number(u.rows[0].rubis || 0) };
}

async function selectLots(client: PoolClient, userId: number, kind: SpendKind): Promise<LotRow[]> {
  const order = kind === "support" ? "weight_bp DESC, id ASC" : "weight_bp ASC, id ASC";
  const { rows } = await client.query(
    `SELECT id, origin, weight_bp, amount_remaining
     FROM rubis_lots
     WHERE user_id=$1 AND amount_remaining > 0
     ORDER BY ${order}
     FOR UPDATE`,
    [userId]
  );

  return rows.map((r: any) => ({
    id: Number(r.id),
    origin: String(r.origin),
    weightBp: Number(r.weight_bp),
    remaining: Number(r.amount_remaining),
  }));
}

function allocateFromLots(lots: LotRow[], amount: number): Allocate[] {
  const out: Allocate[] = [];
  let left = amount;

  for (const lot of lots) {
    if (left <= 0) break;
    const use = Math.min(lot.remaining, left);
    if (use > 0) {
      out.push({ lotId: lot.id, amount: use, weightBp: lot.weightBp, origin: lot.origin });
      left -= use;
    }
  }
  if (left > 0) throw new Error("insufficient_lots");
  return out;
}

async function applyAllocations(client: PoolClient, alloc: Allocate[]) {
  for (const a of alloc) {
    await client.query(
      `UPDATE rubis_lots
       SET amount_remaining = amount_remaining - $2
       WHERE id=$1`,
      [a.lotId, a.amount]
    );
  }
}

async function createLot(client: PoolClient, userId: number, origin: RubisOrigin, amount: number, meta: any = {}) {
  const wbp = (ORIGIN_WEIGHT_BP as any)[origin] ?? 0;
  await client.query(
    `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
     VALUES ($1,$2,$3,$4,$4,$5::jsonb)`,
    [userId, origin, wbp, amount, JSON.stringify(meta)]
  );
}

/** Helper: écrit un breakdown lots */
async function insertTxLots(client: PoolClient, txId: number, alloc: Allocate[]) {
  for (const a of alloc) {
    await client.query(
      `INSERT INTO rubis_tx_lots (tx_id, lot_id, origin, weight_bp, amount_used)
       VALUES ($1,$2,$3,$4,$5)`,
      [txId, a.lotId, a.origin, a.weightBp, a.amount]
    );
  }
}

/** Helper: entries comptables (optionnel mais utile) */
async function insertEntry(client: PoolClient, txId: number, entity: string, userId: number | null, delta: number) {
  await client.query(
    `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
     VALUES ($1,$2,$3,$4)`,
    [txId, entity, userId, delta]
  );
}

export async function mintRubis(params: { userId: number; amount: number; origin: RubisOrigin; meta?: any }) {
  const { userId, amount, origin, meta } = params;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await lockUser(client, userId);

    await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [userId, amount]);
    await createLot(client, userId, origin, amount, meta || {});

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount, meta)
       VALUES ('mint',$2,'succeeded',NULL,$1,$3,$4::jsonb)
       RETURNING id`,
      [userId, origin, amount, JSON.stringify(meta || {})]
    );

    const txId = Number(tx.rows[0].id);
    await insertEntry(client, txId, "user", userId, +amount);

    await client.query("COMMIT");
    return { ok: true, txId: String(txId) };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function spendSink(params: { userId: number; amount: number; purpose: string; meta?: any }) {
  const { userId, amount, purpose, meta } = params;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const u = await lockUser(client, userId);
    if (u.rubis < amount) throw new Error("insufficient_balance");

    const lots = await selectLots(client, userId, "sink");
    const alloc = allocateFromLots(lots, amount);

    await applyAllocations(client, alloc);
    await client.query(`UPDATE users SET rubis = rubis - $2 WHERE id=$1`, [userId, amount]);

    const burnAmount = amount;

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
       VALUES ('sink',$2,'succeeded',$1,NULL,$3,0,0,0,$4,$5::jsonb)
       RETURNING id`,
      [userId, purpose, amount, burnAmount, JSON.stringify(meta || {})]
    );
    const txId = Number(tx.rows[0].id);

    await insertTxLots(client, txId, alloc);

    await insertEntry(client, txId, "user", userId, -amount);
    await insertEntry(client, txId, "platform_burn", null, +burnAmount);

    await client.query("COMMIT");
    return { ok: true, txId: String(txId), amount, burnAmount, alloc };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * SUPPORT:
 * - on consomme lots du viewer (poids DESC)
 * - support_value_cents = Σ floor(used * weight_bp / 10000)  (en "centimes-éco")
 * - streamer/platform/mods reçoivent en RUBIS visibles égaux à support_value (dans ton modèle actuel)
 *   => on garde ton principe "burn = spent - paidOut"
 *
 * IMPORTANT: ici paidOut est un nombre de RUBIS visibles (int),
 * et support_value est aussi stocké dans rubis_tx.support_value (int).
 * On interprète support_value comme "rubis-éco" (centimes) au moment du cashout.
 */
export async function spendSupport(params: {
  userId: number;
  streamerId: number;
  streamerOwnerUserId: number;
  amount: number;
  purpose: string; // "sub" / "tip" / ...
  meta?: any;
}) {
  const { userId, streamerId, streamerOwnerUserId, amount, purpose, meta } = params;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const u = await lockUser(client, userId);
    if (u.rubis < amount) throw new Error("insufficient_balance");

    await lockUser(client, streamerOwnerUserId);

    // (option futur) mods_percent_bp dans streamers
    const s = await client.query(
      `SELECT COALESCE(mods_percent_bp,0)::int AS mods_percent_bp
       FROM streamers
       WHERE id=$1
       LIMIT 1`,
      [streamerId]
    );
    const modsPercentBp = Number(s.rows?.[0]?.mods_percent_bp ?? 0); // 0..10000

    const lots = await selectLots(client, userId, "support");
    const alloc = allocateFromLots(lots, amount);

    // valeur économique en "rubis-éco" (centimes)
    const supportValue = alloc.reduce((sum, a) => sum + valueCentsFrom(a.amount, a.weightBp), 0);

    // split plateforme 10% / reste "gagnants"
    const platformAmount = floorInt(supportValue * 0.10);
    const winners = supportValue - platformAmount;

    // split mods vs streamer (modsPercentBp sur winners)
    const modsTotal = floorInt((winners * modsPercentBp) / 10000);
    const streamerAmount = winners - modsTotal;

    const paidOut = streamerAmount + modsTotal + platformAmount;
    const burnAmount = amount - paidOut; // rubis visibles qui "disparaissent" (sécurité modèle B)

    await applyAllocations(client, alloc);
    await client.query(`UPDATE users SET rubis = rubis - $2 WHERE id=$1`, [userId, amount]);

    // credit streamer owner
    if (streamerAmount > 0) {
      await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [streamerOwnerUserId, streamerAmount]);
      await createLot(client, streamerOwnerUserId, "earn_support", streamerAmount, { fromTx: true, streamerId, purpose });
    }

    // credit mods (equal split)
    let modsPaid: { userId: number; amount: number }[] = [];
    if (modsTotal > 0) {
      const mods = await client.query(
        `SELECT user_id
         FROM streamer_mods
         WHERE streamer_id=$1 AND removed_at IS NULL
         ORDER BY user_id ASC`,
        [streamerId]
      );
      const ids = mods.rows.map((r: any) => Number(r.user_id)).filter(Boolean);

      if (ids.length > 0) {
        const per = floorInt(modsTotal / ids.length);
        let left = modsTotal;

        for (let i = 0; i < ids.length; i++) {
          const give = i === ids.length - 1 ? left : per; // dernier prend le reste
          left -= give;
          if (give <= 0) continue;

          await lockUser(client, ids[i]);
          await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [ids[i], give]);
          await createLot(client, ids[i], "earn_support", give, { fromTx: true, streamerId, purpose, as: "mod" });
          modsPaid.push({ userId: ids[i], amount: give });
        }
      } else {
        // aucun modo actif -> tout va au streamer
        await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [streamerOwnerUserId, modsTotal]);
        await createLot(client, streamerOwnerUserId, "earn_support", modsTotal, { fromTx: true, streamerId, purpose, note: "modsTotal redirected (no mods)" });
        modsPaid = [];
      }
    }

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount,
                            support_value, streamer_amount, platform_amount, burn_amount, meta)
       VALUES ('support',$4,'succeeded',$1,$2,$3,$5,$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [
        userId,
        streamerOwnerUserId,
        amount,
        purpose,
        supportValue,
        streamerAmount + modsTotal, // ce qui part vers "gagnants"
        platformAmount,
        burnAmount,
        JSON.stringify({ ...(meta || {}), streamerId, modsPercentBp, modsPaid }),
      ]
    );
    const txId = Number(tx.rows[0].id);

    await insertTxLots(client, txId, alloc);

    await insertEntry(client, txId, "user", userId, -amount);
    if (platformAmount > 0) await insertEntry(client, txId, "platform_fee", null, +platformAmount);
    if (burnAmount > 0) await insertEntry(client, txId, "platform_burn", null, +burnAmount);
    if (streamerAmount > 0) await insertEntry(client, txId, "user", streamerOwnerUserId, +streamerAmount);
    for (const m of modsPaid) {
      if (m.amount > 0) await insertEntry(client, txId, "user", m.userId, +m.amount);
    }

    await client.query("COMMIT");
    return {
      ok: true,
      txId: String(txId),
      amount,
      supportValue,
      streamerAmount,
      modsTotal,
      platformAmount,
      burnAmount,
      alloc,
      modsPaid,
    };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * CASHOUT (préparation) :
 * on retire une VALEUR en centimes en consommant les lots "les + forts d'abord"
 * => kind = 'cashout' dans rubis_tx
 */
export async function cashoutRequest(params: {
  streamerOwnerUserId: number;
  streamerId: number;
  eurosCents: number; // ex 4500 pour 45€
  meta?: any;
}) {
  const { streamerOwnerUserId, streamerId, eurosCents, meta } = params;
  if (!Number.isFinite(eurosCents) || eurosCents <= 0) throw new Error("bad_amount");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock streamer owner
    const u = await lockUser(client, streamerOwnerUserId);
    if (u.rubis <= 0) throw new Error("insufficient_balance");

    // lots ordre DESC (poids les + forts d'abord)
    const lots = await selectLots(client, streamerOwnerUserId, "support");

    const alloc: Allocate[] = [];
    let leftCents = Math.floor(eurosCents);

    // on consomme rubis visibles jusqu'à atteindre leftCents en "valeur"
    for (const lot of lots) {
      if (leftCents <= 0) break;

      // combien de rubis max on peut prendre dans ce lot pour couvrir leftCents ?
      // valeur par rubis = weight_bp/10000 cent
      // rubis_needed = ceil(leftCents * 10000 / weight_bp)
      const rubisNeeded = Math.ceil((leftCents * 10000) / Math.max(1, lot.weightBp));
      const use = Math.min(lot.remaining, rubisNeeded);

      if (use > 0) {
        alloc.push({ lotId: lot.id, amount: use, weightBp: lot.weightBp, origin: lot.origin });
        leftCents -= valueCentsFrom(use, lot.weightBp);
      }
    }

    if (leftCents > 0) throw new Error("insufficient_value");

    const rubisToDebit = alloc.reduce((s, a) => s + a.amount, 0);

    await applyAllocations(client, alloc);
    await client.query(`UPDATE users SET rubis = rubis - $2 WHERE id=$1`, [streamerOwnerUserId, rubisToDebit]);

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount,
                            support_value, streamer_amount, platform_amount, burn_amount, meta)
       VALUES ('cashout','cashout_request','succeeded',$1,NULL,$2,$3,0,0,0,$4::jsonb)
       RETURNING id`,
      [streamerOwnerUserId, rubisToDebit, eurosCents, JSON.stringify({ ...(meta || {}), streamerId })]
    );
    const txId = Number(tx.rows[0].id);

    await insertTxLots(client, txId, alloc);
    await insertEntry(client, txId, "user", streamerOwnerUserId, -rubisToDebit);

    // on garde ton cashout_requests (déjà dans DB)
    await client.query(
      `INSERT INTO cashout_requests (streamer_id, amount_rubis, status, tx_id, note)
       VALUES ($1,$2,'pending',$3,$4)`,
      [streamerId, rubisToDebit, txId, (meta?.note ? String(meta.note) : null)]
    );

    await client.query("COMMIT");
    return { ok: true, txId: String(txId), eurosCents, rubisDebited: rubisToDebit, alloc };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
