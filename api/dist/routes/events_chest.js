import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { spendRubisTx } from "../wallet_engine.js";
import { recomputeGlobalChest, CHEST_PALIERS, CHEST_MIN_CONTRIBUTION, getChestPaliersState, claimChestPalier, } from "../events/global_chest.js";
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
    // La barre principale vise le DERNIER palier (objectif final) ; les paliers
    // intermédiaires sont des jalons collectifs réclamables en direct.
    const goal = CHEST_PALIERS.length ? CHEST_PALIERS[CHEST_PALIERS.length - 1].threshold : 0;
    const firstThreshold = CHEST_PALIERS.length ? CHEST_PALIERS[0].threshold : goal;
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
    let myRank;
    let myPaliers = null;
    if (userId) {
        myPaliers = await getChestPaliersState(Number(event.id), userId);
        myContribution = myPaliers.myContribution;
        const rk = await pool.query(`
        SELECT rank FROM (
          SELECT user_id, ROW_NUMBER() OVER (ORDER BY points DESC, updated_at ASC) AS rank
          FROM event_scores WHERE event_id=$1
        ) t WHERE user_id=$2
        `, [event.id, userId]);
        myRank = rk.rows?.[0]?.rank != null ? Number(rk.rows[0].rank) : undefined;
    }
    res.json({
        ok: true,
        event,
        goal,
        communityTotal,
        reached: communityTotal >= firstThreshold,
        myContribution,
        myRank,
        minContribution: CHEST_MIN_CONTRIBUTION,
        paliers: CHEST_PALIERS,
        myPaliers,
        topContributors: (topRes.rows || []).map((r) => ({
            userId: Number(r.user_id),
            username: String(r.username ?? ""),
            points: Number(r.points ?? 0),
        })),
    });
}));
// POST /api/events/chest/palier/claim — réclame les paliers collectifs franchis.
eventsChestRouter.post("/events/chest/palier/claim", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const event = await getLiveChestEvent();
    if (!event)
        return res.status(400).json({ ok: false, error: "no_active_chest_event" });
    const claimed = await claimChestPalier(Number(event.id), userId);
    res.json({ ok: true, claimed, count: claimed.length });
}));
