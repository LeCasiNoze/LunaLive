// api/src/routes/wheel.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const wheelRouter = express.Router();

const SEGMENTS = [
  { label: "+1", amount: 1, weight: 0.315 },
  { label: "+3", amount: 3, weight: 0.24 },
  { label: "+5", amount: 5, weight: 0.18 },
  { label: "+10", amount: 10, weight: 0.14 },
  { label: "+25", amount: 25, weight: 0.07 },
  { label: "+50", amount: 50, weight: 0.025 },
  { label: "+100", amount: 100, weight: 0.015 },
  { label: "+250", amount: 250, weight: 0.005 },
  { label: "+500", amount: 500, weight: 0.01 },
];

function pickWeightedIndex() {
  const total = SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return SEGMENTS.length - 1;
}

function isTestGod(req: any) {
  const u = String(req.user?.username || "").trim().toLowerCase();
  return u === "lecasinoze";
}

async function todayParisDate(): Promise<string> {
  const r = await pool.query(`SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date::text AS d;`);
  return String(r.rows?.[0]?.d || "");
}

wheelRouter.get("/wheel/me", requireAuth, async (req, res) => {
  const god = isTestGod(req);
  const day = await todayParisDate();

  if (god) {
    return res.json({ ok: true, canSpin: true, usedToday: false, day, segments: SEGMENTS });
  }

  const check = await pool.query(
    `SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2::date LIMIT 1`,
    [Number(req.user!.id), day]
  );

  const usedToday = ((check.rowCount ?? 0) > 0);
  return res.json({ ok: true, canSpin: true, usedToday: false, day, segments: SEGMENTS.map(({label,amount})=>({label,amount})) });
});

wheelRouter.post("/wheel/spin", requireAuth, async (req, res) => {
  const god = isTestGod(req);
  const userId = Number(req.user!.id);
  const day = await todayParisDate();

  const segmentIndex = pickWeightedIndex();
  const seg = SEGMENTS[segmentIndex];
  const reward = Number(seg.amount);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!god) {
      const exists = await client.query(
        `SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2::date LIMIT 1`,
        [userId, day]
      );
      if ((exists.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "already_used" });
      }
    }

    // ✅ mint rubis: origin wheel_daily, weight 0.30
    const weightBp = 3000;

    // IMPORTANT: jsonb param typé => plus de 42P18
    const txMeta = { segmentIndex, label: seg.label, day };

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, to_user_id, amount, meta)
       VALUES ('mint','wheel_daily','succeeded',$1,$2,$3::jsonb)
       RETURNING id`,
      [userId, reward, JSON.stringify(txMeta)]
    );

    const txId = Number(tx.rows[0].id);

    await client.query(
      `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
       VALUES ($1,'user',$2,$3)`,
      [txId, userId, reward]
    );

    const lotMeta = { txId, segmentIndex, label: seg.label, day };

    await client.query(
      `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
       VALUES ($1,'wheel_daily',$2,$3,$3,$4::jsonb)`,
      [userId, weightBp, reward, JSON.stringify(lotMeta)]
    );

    const u = await client.query(
      `UPDATE users SET rubis = rubis + $1 WHERE id=$2 RETURNING id, username, rubis`,
      [reward, userId]
    );

    if (!god) {
      await client.query(
        `INSERT INTO daily_wheel_spins (user_id, day, segment_index, reward_rubis, tx_id)
         VALUES ($1,$2::date,$3,$4,$5)`,
        [userId, day, segmentIndex, reward, txId]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      day,
      segmentIndex,
      reward,
      label: seg.label,
      txId: String(txId),
      user: { id: Number(u.rows[0].id), username: String(u.rows[0].username), rubis: Number(u.rows[0].rubis) },
    });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}

    if (String(e?.code) === "23505") {
      return res.status(409).json({ ok: false, error: "already_used" });
    }

    console.error("[wheel] spin failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});
