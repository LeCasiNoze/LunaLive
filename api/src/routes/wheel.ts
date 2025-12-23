// api/src/routes/wheel.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { BUSINESS_TZ, CAP_DAILY_FREE, CAP_DAILY_FREE_LOW, WEIGHT_BP } from "../economy/rewards_config.js";

export const wheelRouter = express.Router();

function pickReward(): number {
  // Distribution simple + safe
  const r = Math.random();
  if (r < 0.40) return 10;
  if (r < 0.65) return 25;
  if (r < 0.80) return 50;
  if (r < 0.90) return 80;
  if (r < 0.96) return 120;
  if (r < 0.99) return 200;
  return 500;
}

async function getBusinessDay(client: any): Promise<string> {
  const q = await client.query(`SELECT (NOW() AT TIME ZONE $1)::date::text AS d`, [BUSINESS_TZ]);
  return String(q.rows?.[0]?.d);
}

type CapRow = { free_awarded: number; free_low_awarded: number };

function allocateWithCaps(amount: number, cap: CapRow) {
  const freeAwarded = Number(cap.free_awarded || 0);
  const freeLowAwarded = Number(cap.free_low_awarded || 0);

  const normalLeft = Math.max(0, CAP_DAILY_FREE - freeAwarded);
  const lowLeft = Math.max(0, CAP_DAILY_FREE_LOW - freeLowAwarded);

  const normal = Math.max(0, Math.min(amount, normalLeft));
  const rest = amount - normal;

  const low = Math.max(0, Math.min(rest, lowLeft));
  const dropped = Math.max(0, rest - low);

  return { normal, low, dropped };
}

wheelRouter.get("/wheel/me", requireAuth, async (req, res) => {
  const userId = Number(req.user!.id);

  const client = await pool.connect();
  try {
    const day = await getBusinessDay(client);

    const spin = await client.query(
      `SELECT day::text AS day, spun_at, raw_reward, minted_total, minted_normal, minted_low, dropped
       FROM wheel_spins
       WHERE user_id=$1 AND day=$2
       LIMIT 1`,
      [userId, day]
    );

    const cap = await client.query(
      `SELECT free_awarded, free_low_awarded
       FROM user_daily_caps
       WHERE user_id=$1 AND day=$2
       LIMIT 1`,
      [userId, day]
    );

    const capRow = cap.rows?.[0] ?? { free_awarded: 0, free_low_awarded: 0 };

    res.json({
      ok: true,
      day,
      canSpin: !spin.rows?.[0],
      lastSpin: spin.rows?.[0] ?? null,
      cap: {
        freeAwarded: Number(capRow.free_awarded || 0),
        freeLowAwarded: Number(capRow.free_low_awarded || 0),
        capNormal: CAP_DAILY_FREE,
        capLow: CAP_DAILY_FREE_LOW,
      },
    });
  } catch (e: any) {
    console.error("[wheel/me]", e);
    res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});

wheelRouter.post("/wheel/me/spin", requireAuth, async (req, res) => {
  const userId = Number(req.user!.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const day = await getBusinessDay(client);

    // lock cap row
    const capQ = await client.query(
      `SELECT free_awarded, free_low_awarded
       FROM user_daily_caps
       WHERE user_id=$1 AND day=$2
       FOR UPDATE`,
      [userId, day]
    );
    const capRow: CapRow = capQ.rows?.[0] ?? { free_awarded: 0, free_low_awarded: 0 };

    // already spun ?
    const spinQ = await client.query(
      `SELECT 1
       FROM wheel_spins
       WHERE user_id=$1 AND day=$2
       FOR UPDATE`,
      [userId, day]
    );
    if (spinQ.rows?.[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "already_spun" });
    }

    const raw = pickReward();
    const alloc = allocateWithCaps(raw, capRow);

    const mintedTotal = alloc.normal + alloc.low;

    // si tout est droppé (hard stop), on enregistre quand même le spin
    // (sinon l'user spam le spin pour "tomber" sur un gros gain)
    // => mintedTotal peut être 0
    // lock user row
    await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);

    // ledger: tx
    const txIns = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
       VALUES ('mint', 'wheel_daily', 'succeeded', NULL, $1, $2, 0, 0, 0, 0, $3::jsonb)
       RETURNING id`,
      [
        userId,
        mintedTotal,
        JSON.stringify({
          day,
          rawReward: raw,
          mintedNormal: alloc.normal,
          mintedLow: alloc.low,
          dropped: alloc.dropped,
          note: "daily wheel",
        }),
      ]
    );
    const txId = Number(txIns.rows[0].id);

    // credit user
    if (mintedTotal > 0) {
      await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [userId, mintedTotal]);

      await client.query(
        `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
         VALUES ($1,'user',$2,$3)`,
        [txId, userId, mintedTotal]
      );
    }

    // create lots (normal + low)
    if (alloc.normal > 0) {
      const lot = await client.query(
        `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
         VALUES ($1,$2,$3,$4,$4,$5::jsonb)
         RETURNING id`,
        [
          userId,
          "wheel_daily",
          WEIGHT_BP.wheel_daily,
          alloc.normal,
          JSON.stringify({ txId, day, rawReward: raw }),
        ]
      );
      const lotId = Number(lot.rows[0].id);

      await client.query(
        `INSERT INTO rubis_tx_lots (tx_id, lot_id, origin, weight_bp, amount_used)
         VALUES ($1,$2,$3,$4,$5)`,
        [txId, lotId, "wheel_daily", WEIGHT_BP.wheel_daily, alloc.normal]
      );
    }

    if (alloc.low > 0) {
      const lot = await client.query(
        `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
         VALUES ($1,$2,$3,$4,$4,$5::jsonb)
         RETURNING id`,
        [
          userId,
          "event_platform",
          WEIGHT_BP.event_platform,
          alloc.low,
          JSON.stringify({ txId, day, downgradedFrom: "wheel_daily", rawReward: raw }),
        ]
      );
      const lotId = Number(lot.rows[0].id);

      await client.query(
        `INSERT INTO rubis_tx_lots (tx_id, lot_id, origin, weight_bp, amount_used)
         VALUES ($1,$2,$3,$4,$5)`,
        [txId, lotId, "event_platform", WEIGHT_BP.event_platform, alloc.low]
      );
    }

    // upsert caps
    await client.query(
      `INSERT INTO user_daily_caps (user_id, day, free_awarded, free_low_awarded)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, day)
       DO UPDATE SET
         free_awarded = user_daily_caps.free_awarded + EXCLUDED.free_awarded,
         free_low_awarded = user_daily_caps.free_low_awarded + EXCLUDED.free_low_awarded,
         updated_at = NOW()`,
      [userId, day, alloc.normal, alloc.low]
    );

    // record spin
    await client.query(
      `INSERT INTO wheel_spins (user_id, day, raw_reward, minted_total, minted_normal, minted_low, dropped, tx_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, day, raw, mintedTotal, alloc.normal, alloc.low, alloc.dropped, txId]
    );

    // return balance
    const u = await client.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [userId]);

    await client.query("COMMIT");

    res.json({
      ok: true,
      day,
      txId: String(txId),
      reward: {
        raw,
        mintedTotal,
        mintedNormal: alloc.normal,
        mintedLow: alloc.low,
        dropped: alloc.dropped,
      },
      user: { id: userId, rubis: Number(u.rows?.[0]?.rubis ?? 0) },
      cap: { capNormal: CAP_DAILY_FREE, capLow: CAP_DAILY_FREE_LOW },
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("[wheel/spin]", e);
    res.status(500).json({ ok: false, error: String(e?.message || "server_error") });
  } finally {
    client.release();
  }
});
