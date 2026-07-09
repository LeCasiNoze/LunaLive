import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { spendRubisTx } from "../wallet_engine.js";
import { recomputeBurnBoss } from "../events/burn_boss.js";
import { EVENT_REWARD_CONFIGS } from "../events/rewards.js";
export const eventsBossRouter = Router();
function int(x, def = 0) {
    const n = Number.parseInt(String(x ?? ""), 10);
    return Number.isFinite(n) ? n : def;
}
function bossHp() {
    const config = EVENT_REWARD_CONFIGS.burn_boss;
    return config?.mode === "boss" ? config.boss.hp : 0;
}
async function getLiveBossEvent() {
    const r = await pool.query(`
    SELECT *
    FROM events
    WHERE type='burn_boss'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    return r.rows?.[0] ?? null;
}
async function totalDamageFor(eventId) {
    const r = await pool.query(`SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
    return Number(r.rows?.[0]?.total ?? 0);
}
// POST /api/events/boss/burn
// Sink : accélérateur de dégâts OPTIONNEL (cf docs/events-design.md #5 —
// jamais la seule source, l'activité gratuite compte aussi via
// recomputeBurnBoss). Même mécanisme que routes/events_chest.ts
// (spendRubisTx, spendKind="sink").
eventsBossRouter.post("/events/boss/burn", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const amount = int(req.body?.amount, 0);
    if (!amount || amount <= 0)
        return res.status(400).json({ ok: false, error: "bad_amount" });
    const event = await getLiveBossEvent();
    if (!event)
        return res.status(400).json({ ok: false, error: "no_active_boss_event" });
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
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        const msg = String(e?.message || e);
        if (msg === "insufficient_rubis")
            return res.status(400).json({ ok: false, error: "insufficient_funds" });
        console.error("[events/boss/burn] failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
    finally {
        client.release();
    }
    // Reflète le burn tout de suite dans la jauge (pas d'attente du tick).
    await recomputeBurnBoss(Number(event.id));
    const totalDamage = await totalDamageFor(Number(event.id));
    const hp = bossHp();
    res.json({ ok: true, burned: amount, totalDamage, hp, killed: totalDamage >= hp });
}));
// GET /api/events/current/boss
// Auth optionnelle : la jauge et le top sont publics, "myDamage" n'apparaît
// que si connecté. Même pattern que events_chest.ts.
eventsBossRouter.get("/events/current/boss", a(async (req, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0);
    const event = await getLiveBossEvent();
    if (!event)
        return res.json({ ok: true, event: null });
    const hp = bossHp();
    const totalDamage = await totalDamageFor(Number(event.id));
    const topRes = await pool.query(`
      SELECT s.user_id, u.username, s.points
      FROM event_scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.event_id = $1
      ORDER BY s.points DESC, s.updated_at ASC
      LIMIT 10
      `, [event.id]);
    let myDamage;
    let myRank;
    if (userId) {
        const me = await pool.query(`
        SELECT points, rank FROM (
          SELECT user_id, points,
                 ROW_NUMBER() OVER (ORDER BY points DESC, updated_at ASC) AS rank
          FROM event_scores WHERE event_id=$1
        ) t WHERE user_id=$2
        `, [event.id, userId]);
        myDamage = Number(me.rows?.[0]?.points ?? 0);
        myRank = me.rows?.[0]?.rank != null ? Number(me.rows[0].rank) : undefined;
    }
    res.json({
        ok: true,
        event,
        hp,
        totalDamage,
        killed: totalDamage >= hp,
        myDamage,
        myRank,
        topDamagers: (topRes.rows || []).map((r, idx) => ({
            rank: idx + 1,
            userId: Number(r.user_id),
            username: String(r.username ?? ""),
            damage: Number(r.points ?? 0),
        })),
    });
}));
