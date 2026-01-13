// api/src/routes/wheel.ts
// 🎡 Daily Wheel — version stable, auto-protégée, 100% wallet_engine
// + Talent bonus (lvl 1/2/3): petits gains +1/+2/+3 ; gains >=10 => +10%/+25%/+50% (arrondi au dessus)
// + /wheel/me renvoie les segments "boostés" (affichage cohérent)
// + 500 doit être 2x plus rare que 250

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
  // ✅ 500 = 2x plus rare que 250 => weight = 0.005 / 2 = 0.0025
  { label: "+500", amount: 500, weight: 0.0025 },
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
  const r = await pool.query(`SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date::text AS d`);
  return String(r.rows?.[0]?.d || "");
}

// ─────────────────────────────────────────────
// 🎁 Talent bonus wheel
// ─────────────────────────────────────────────

const WHEEL_TALENT_CODE = "talent_wheel_bonus" as const;

function clampLevel(v: any) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.floor(n)));
}

// petits gains (<=5) => +1/+2/+3 selon lvl
function flatSmallBonus(level: number) {
  const lv = clampLevel(level);
  if (lv <= 0) return 0;
  return lv; // lvl1=1, lvl2=2, lvl3=3
}

// gains >=10 => +10%/+25%/+50% selon lvl, arrondi au dessus
function percentForLevel(level: number) {
  const lv = clampLevel(level);
  if (lv === 1) return 0.10;
  if (lv === 2) return 0.25;
  if (lv === 3) return 0.50;
  return 0;
}

async function getUserTalentLevel(userId: number): Promise<number> {
  try {
    const r = await pool.query<{ level: number }>(
      `SELECT level FROM user_talents WHERE user_id=$1 AND talent_code=$2 LIMIT 1`,
      [userId, WHEEL_TALENT_CODE]
    );
    return clampLevel(r.rows?.[0]?.level || 0);
  } catch {
    // table pas dispo / pas migrée => pas de bonus
    return 0;
  }
}

function computeWheelBonus(baseReward: number, level: number) {
  const base = Math.max(0, Math.floor(Number(baseReward || 0)));

  if (base <= 0) return { bonus: 0, final: 0, kind: "none" as const, pct: 0 };

  // petits gains: <=5
  if (base <= 5) {
    const b = flatSmallBonus(level);
    return {
      bonus: b,
      final: base + b,
      kind: b > 0 ? ("flat_small" as const) : ("none" as const),
      pct: 0,
    };
  }

  // % à partir de 10 inclus
  if (base >= 10) {
    const pct = percentForLevel(level);
    if (!(pct > 0)) {
      return { bonus: 0, final: base, kind: "none" as const, pct: 0 };
    }

    // ✅ arrondi au-dessus si décimal
    const b = Math.max(0, Math.ceil(base * pct));
    return { bonus: b, final: base + b, kind: "percent_big" as const, pct };
  }

  // cas théorique 6..9 (pas dans tes segments) : pas de bonus
  return { bonus: 0, final: base, kind: "none" as const, pct: 0 };
}

function formatLabel(amount: number) {
  const a = Math.max(0, Math.floor(Number(amount || 0)));
  return `+${a}`;
}

// ─────────────────────────────────────────────
// 📥 GET /wheel/me
// ─────────────────────────────────────────────

wheelRouter.get("/wheel/me", async (req, res) => {
  const userId = Number(req.user!.id);
  const god = isTestGod(req);
  const day = await todayParisDate();

  // ✅ on calcule le talent pour afficher les vrais gains
  const talentLevel = await getUserTalentLevel(userId);

  const displaySegments = SEGMENTS.map(({ amount }) => {
    const base = Math.max(0, Math.floor(Number(amount || 0)));
    const calc = computeWheelBonus(base, talentLevel);
    return { label: formatLabel(calc.final), amount: calc.final };
  });

  if (god) {
    return res.json({
      ok: true,
      day,
      canSpin: true,
      usedToday: false,
      segments: displaySegments,
      talentLevel,
    });
  }

  const check = await pool.query(`SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2::date LIMIT 1`, [
    userId,
    day,
  ]);

  const usedToday = (check.rowCount ?? 0) > 0;

  return res.json({
    ok: true,
    day,
    canSpin: !usedToday,
    usedToday,
    segments: displaySegments,
    talentLevel,
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

  const baseReward = Math.max(0, Math.floor(Number(seg.amount || 0)));

  // talent level
  const talentLevel = await getUserTalentLevel(userId);

  const bonusCalc = computeWheelBonus(baseReward, talentLevel);
  const bonusReward = bonusCalc.bonus;
  const finalReward = bonusCalc.final;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!god) {
      const exists = await client.query(`SELECT 1 FROM daily_wheel_spins WHERE user_id=$1 AND day=$2::date LIMIT 1`, [
        userId,
        day,
      ]);

      if ((exists.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "already_used" });
      }
    }

    // 💎 gain rubis (ledger economy v1)
    await earnRubisTx(client, userId, "wheel_daily", finalReward, {
      weight_bp: 3000,
      segmentIndex,
      // ✅ on garde aussi l'info de base
      baseLabel: seg.label,
      baseReward,

      // debug/analytics
      bonusReward,
      finalReward,
      day,
      talent: { code: WHEEL_TALENT_CODE, level: talentLevel, kind: bonusCalc.kind, pct: bonusCalc.pct },
    });

    if (!god) {
      await client.query(
        `INSERT INTO daily_wheel_spins (user_id, day, segment_index, reward_rubis)
         VALUES ($1,$2::date,$3,$4)`,
        [userId, day, segmentIndex, finalReward]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      day,
      segmentIndex,
      reward: finalReward,
      // ✅ label cohérente avec /wheel/me (donc le front verra +2 si bonus)
      label: formatLabel(finalReward),

      baseReward,
      bonusReward,
      talentLevel,
      bonusKind: bonusCalc.kind,
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
