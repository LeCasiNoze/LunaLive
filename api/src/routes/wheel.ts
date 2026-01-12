// api/src/routes/wheel.ts
// 🎡 Daily Wheel — version stable, auto-protégée, 100% wallet_engine

import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { earnRubisTx } from "../wallet_engine.js";

export const wheelRouter = express.Router();

// 🔐 PROTECTION GLOBALE DU ROUTER
wheelRouter.use(requireAuth);

// ─────────────────────────────────────────────
// 🎯 Configuration roue
// ─────────────────────────────────────────────

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

// ⚠️ utilisateur “god” (debug only)
function isTestGod(req: any) {
  const u = String(req.user?.username || "").trim().toLowerCase();
  return u === "lecasinoze";
}

// Date du jour Europe/Paris (YYYY-MM-DD)
async function todayParisDate(): Promise<string> {
  const r = await pool.query(
    `SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date::text AS d`
  );
  return String(r.rows?.[0]?.d || "");
}

// ─────────────────────────────────────────────
// 📥 GET /wheel/me
// ─────────────────────────────────────────────

wheelRouter.get("/wheel/me", async (req, res) => {
  const userId = Number(req.user!.id);
  const god = isTestGod(req);
  const day = await todayParisDate();

  if (god) {
    return res.json({
      ok: true,
      day,
      canSpin: true,
      usedToday: false,
      segments: SEGMENTS.map(({ label, amount }) => ({ label, amount })),
    });
  }

  const check = await pool.query(
    `SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2::date LIMIT 1`,
    [userId, day]
  );

  const usedToday = (check.rowCount ?? 0) > 0;

  return res.json({
    ok: true,
    day,
    canSpin: !usedToday,
    usedToday,
    segments: SEGMENTS.map(({ label, amount }) => ({ label, amount })),
  });
});

// ─────────────────────────────────────────────
// 🎰 POST /wheel/spin
// ─────────────────────────────────────────────

wheelRouter.post("/wheel/spin", async (req, res) => {
  const userId = Number(req.user!.id);
  const god = isTestGod(req);
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

    // 💎 gain rubis (ledger economy v1)
    await earnRubisTx(client, userId, "wheel_daily", reward, {
      weight_bp: 3000,
      segmentIndex,
      label: seg.label,
      day,
    });

    if (!god) {
      await client.query(
        `INSERT INTO daily_wheel_spins (user_id, day, segment_index, reward_rubis)
         VALUES ($1,$2::date,$3,$4)`,
        [userId, day, segmentIndex, reward]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      day,
      segmentIndex,
      reward,
      label: seg.label,
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (String(e?.code) === "23505") {
      return res.status(409).json({ ok: false, error: "already_used" });
    }

    console.error("[wheel] spin failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});
