import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const wheelRouter = express.Router();

const SEGMENTS = [
  { label: "+5", amount: 5 },
  { label: "+10", amount: 10 },
  { label: "+15", amount: 15 },
  { label: "+20", amount: 20 },
  { label: "+25", amount: 25 },
  { label: "+30", amount: 30 },
  { label: "+40", amount: 40 },
  { label: "+50", amount: 50 },
  { label: "+75", amount: 75 },
  { label: "+100", amount: 100 },
  { label: "+150", amount: 150 },
  { label: "+250", amount: 250 },
];

function isTestGod(req: any) {
  const u = String(req.user?.username || "").trim().toLowerCase();
  return u === "lecasinoze"; // ✅ always allowed for you
}

async function todayParisDate(): Promise<string> {
  const r = await pool.query(`SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date AS d;`);
  return String(r.rows?.[0]?.d);
}

wheelRouter.get("/wheel/me", requireAuth, async (req, res) => {
  const god = isTestGod(req);
  const day = await todayParisDate();

  if (god) {
    return res.json({ ok: true, canSpin: true, usedToday: false, day, segments: SEGMENTS });
  }

  const check = await pool.query(
    `SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2 LIMIT 1`,
    [req.user!.id, day]
  );

  const usedToday = check.rows.length > 0; // ✅ no TS warning
  res.json({ ok: true, canSpin: !usedToday, usedToday, day, segments: SEGMENTS });
});

wheelRouter.post("/wheel/spin", requireAuth, async (req, res) => {
  const god = isTestGod(req);
  const userId = Number(req.user!.id);
  const day = await todayParisDate();

  const segmentIndex = Math.floor(Math.random() * SEGMENTS.length);
  const seg = SEGMENTS[segmentIndex];
  const reward = Number(seg.amount);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!god) {
      const exists = await client.query(
        `SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2 LIMIT 1`,
        [userId, day]
      );

      if (exists.rows.length > 0) { // ✅ no TS warning
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "already_used" });
      }
    }

    const weightBp = 3000;

    const tx = await client.query(
      `INSERT INTO rubis_tx (kind, purpose, status, to_user_id, amount, meta)
       VALUES ('mint','wheel_daily','succeeded',$1,$2,jsonb_build_object('segmentIndex',$3,'label',$4))
       RETURNING id`,
      [userId, reward, segmentIndex, seg.label]
    );
    const txId = Number(tx.rows[0].id);

    await client.query(
      `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
       VALUES ($1,'user',$2,$3)`,
      [txId, userId, reward]
    );

    await client.query(
      `INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
       VALUES ($1,'wheel_daily',$2,$3,$3,jsonb_build_object('txId',$4,'segmentIndex',$5))`,
      [userId, weightBp, reward, txId, segmentIndex]
    );

    const u = await client.query(
      `UPDATE users SET rubis = rubis + $1 WHERE id=$2 RETURNING id, username, rubis`,
      [reward, userId]
    );

    if (!god) {
      await client.query(
        `INSERT INTO daily_wheel_spins (user_id, day, segment_index, reward_rubis, tx_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, day, segmentIndex, reward, txId]
      );
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      day,
      segmentIndex,
      reward,
      label: seg.label,
      txId: String(txId),
      user: {
        id: String(u.rows[0].id),
        username: String(u.rows[0].username),
        rubis: Number(u.rows[0].rubis),
      },
    });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}

    if (String(e?.code) === "23505") {
      return res.status(409).json({ ok: false, error: "already_used" });
    }

    console.error("[wheel] spin failed", e);
    res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});
