import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { spendRubisTx } from "../wallet_engine.js";
import { recomputeBurnBoss } from "../events/burn_boss.js";
import { EVENT_REWARD_CONFIGS } from "../events/rewards.js";

export const eventsBossRouter = Router();

function int(x: any, def = 0) {
  const n = Number.parseInt(String(x ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function bossHp() {
  const config = EVENT_REWARD_CONFIGS.burn_boss;
  return config?.mode === "boss" ? config.boss.hp : 0;
}

async function getLiveBossEvent() {
  const r = await pool.query(
    `
    SELECT *
    FROM events
    WHERE type='burn_boss'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `
  );
  return r.rows?.[0] ?? null;
}

async function totalDamageFor(eventId: number) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`,
    [eventId]
  );
  return Number(r.rows?.[0]?.total ?? 0);
}

// POST /api/events/boss/burn
// Sink : accélérateur de dégâts OPTIONNEL (cf docs/events-design.md #5 —
// jamais la seule source, l'activité gratuite compte aussi via
// recomputeBurnBoss). Même mécanisme que routes/events_chest.ts
// (spendRubisTx, spendKind="sink").
eventsBossRouter.post(
  "/events/boss/burn",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id || 0);
    const amount = int(req.body?.amount, 0);
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "bad_amount" });

    const event = await getLiveBossEvent();
    if (!event) return res.status(400).json({ ok: false, error: "no_active_boss_event" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await spendRubisTx(client, {
        userId,
        amount,
        spendKind: "sink",
        spendType: "event_boss_burn",
        meta: { eventId: event.id },
      });

      await client.query(`INSERT INTO event_boss_damage (event_id, user_id, rubis) VALUES ($1,$2,$3)`, [
        event.id,
        userId,
        amount,
      ]);

      await client.query("COMMIT");
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      const msg = String(e?.message || e);
      if (msg === "insufficient_rubis") return res.status(400).json({ ok: false, error: "insufficient_funds" });
      console.error("[events/boss/burn] failed", e);
      return res.status(500).json({ ok: false, error: "server_error" });
    } finally {
      client.release();
    }

    // Reflète le burn tout de suite dans la jauge (pas d'attente du tick).
    await recomputeBurnBoss(Number(event.id));
    const totalDamage = await totalDamageFor(Number(event.id));
    const hp = bossHp();

    res.json({ ok: true, burned: amount, totalDamage, hp, killed: totalDamage >= hp });
  })
);

// GET /api/events/current/boss
// Auth optionnelle : la jauge et le top sont publics, "myDamage" n'apparaît
// que si connecté. Même pattern que events_chest.ts.
eventsBossRouter.get(
  "/events/current/boss",
  a(async (req: any, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0);

    const event = await getLiveBossEvent();
    if (!event) return res.json({ ok: true, event: null });

    const hp = bossHp();
    const totalDamage = await totalDamageFor(Number(event.id));

    const topRes = await pool.query(
      `
      SELECT s.user_id, u.username, s.points
      FROM event_scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.event_id = $1
      ORDER BY s.points DESC, s.updated_at ASC
      LIMIT 10
      `,
      [event.id]
    );

    // Coup fatal : premier burn dont le cumul franchit le seuil restant une
    // fois l'activité déduite (approximation : l'activité est comptée à sa
    // valeur finale). Si l'activité seule a achevé le boss → null (la commu).
    let killedBy: string | null = null;
    let killedAt: string | null = null;
    if (totalDamage >= hp && hp > 0) {
      const burnsTotal = await pool.query(
        `SELECT COALESCE(SUM(rubis),0)::int AS total FROM event_boss_damage WHERE event_id=$1`,
        [event.id]
      );
      const threshold = hp - (totalDamage - Number(burnsTotal.rows?.[0]?.total ?? 0));
      if (threshold > 0) {
        const fin = await pool.query(
          `
          SELECT username, created_at FROM (
            SELECT u.username, d.created_at,
                   SUM(d.rubis) OVER (ORDER BY d.created_at, d.id) AS cum
            FROM event_boss_damage d
            JOIN users u ON u.id = d.user_id
            WHERE d.event_id = $1
          ) t
          WHERE cum >= $2
          ORDER BY created_at
          LIMIT 1
          `,
          [event.id, threshold]
        );
        if (fin.rows?.[0]) {
          killedBy = String(fin.rows[0].username);
          killedAt = new Date(fin.rows[0].created_at).toISOString();
        }
      }
    }

    let myDamage: number | undefined;
    let myRank: number | undefined;
    if (userId) {
      const me = await pool.query(
        `
        SELECT points, rank FROM (
          SELECT user_id, points,
                 ROW_NUMBER() OVER (ORDER BY points DESC, updated_at ASC) AS rank
          FROM event_scores WHERE event_id=$1
        ) t WHERE user_id=$2
        `,
        [event.id, userId]
      );
      myDamage = Number(me.rows?.[0]?.points ?? 0);
      myRank = me.rows?.[0]?.rank != null ? Number(me.rows[0].rank) : undefined;
    }

    res.json({
      ok: true,
      event,
      hp,
      totalDamage,
      killed: totalDamage >= hp,
      killedBy,
      killedAt,
      myDamage,
      myRank,
      topDamagers: (topRes.rows || []).map((r: any, idx: number) => ({
        rank: idx + 1,
        userId: Number(r.user_id),
        username: String(r.username ?? ""),
        damage: Number(r.points ?? 0),
      })),
    });
  })
);
