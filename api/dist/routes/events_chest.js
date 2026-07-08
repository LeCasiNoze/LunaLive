import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { spendRubisTx } from "../wallet_engine.js";
import { recomputeGlobalChest } from "../events/global_chest.js";
import { EVENT_REWARD_CONFIGS } from "../events/rewards.js";
export const eventsChestRouter = Router();
function int(x, def = 0) {
    const n = Number.parseInt(String(x ?? ""), 10);
    return Number.isFinite(n) ? n : def;
}
async function getLiveChestEvent() {
    const r = await pool.query(`
    SELECT *
    FROM events
    WHERE type='global_chest'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    return r.rows?.[0] ?? null;
}
async function communityTotalFor(eventId) {
    const r = await pool.query(`SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
    return Number(r.rows?.[0]?.total ?? 0);
}
// POST /api/events/chest/deposit
// Sink : les rubis déposés sortent du wallet du joueur (spendRubisTx,
// spendKind="sink") — même mécanisme que routes/chest.ts
// (streamers/:slug/chest/deposit), appliqué ici à la cagnotte d'event.
eventsChestRouter.post("/events/chest/deposit", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const amount = int(req.body?.amount, 0);
    if (!amount || amount <= 0)
        return res.status(400).json({ ok: false, error: "bad_amount" });
    const event = await getLiveChestEvent();
    if (!event)
        return res.status(400).json({ ok: false, error: "no_active_chest_event" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await spendRubisTx(client, {
            userId,
            amount,
            spendKind: "sink",
            spendType: "event_chest_deposit",
            meta: { eventId: event.id },
        });
        await client.query(`INSERT INTO event_chest_deposits (event_id, user_id, rubis) VALUES ($1,$2,$3)`, [
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
        console.error("[events/chest/deposit] failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
    finally {
        client.release();
    }
    // Reflète le dépôt tout de suite dans la barre commune (pas d'attente du tick).
    await recomputeGlobalChest(Number(event.id));
    const communityTotal = await communityTotalFor(Number(event.id));
    res.json({ ok: true, deposited: amount, communityTotal });
}));
// GET /api/events/current/chest
// Auth optionnelle : la barre et le top sont publics, "myContribution"
// n'apparaît que si connecté. Même pattern que events_wheel_week.ts.
eventsChestRouter.get("/events/current/chest", a(async (req, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0);
    const event = await getLiveChestEvent();
    if (!event)
        return res.json({ ok: true, event: null });
    const config = EVENT_REWARD_CONFIGS.global_chest;
    const goal = config.mode === "collective" ? config.collective.goal : 0;
    const communityTotal = await communityTotalFor(Number(event.id));
    const topRes = await pool.query(`
      SELECT s.user_id, u.username, s.points
      FROM event_scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.event_id = $1
      ORDER BY s.points DESC, s.updated_at ASC
      LIMIT 10
      `, [event.id]);
    let myContribution;
    if (userId) {
        const me = await pool.query(`SELECT points FROM event_scores WHERE event_id=$1 AND user_id=$2`, [
            event.id,
            userId,
        ]);
        myContribution = Number(me.rows?.[0]?.points ?? 0);
    }
    res.json({
        ok: true,
        event,
        goal,
        communityTotal,
        reached: communityTotal >= goal,
        myContribution,
        topContributors: (topRes.rows || []).map((r) => ({
            userId: Number(r.user_id),
            username: String(r.username ?? ""),
            points: Number(r.points ?? 0),
        })),
    });
}));
