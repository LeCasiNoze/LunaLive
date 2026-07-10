import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { acceptDuoForStreamer, DUO_PALIERS, getRankedDuos, recomputeDuoWeek, refreshDuoForStreamer } from "../events/duo_week.js";
export const eventsDuoRouter = Router();
async function getLiveDuoEvent() {
    const r = await pool.query(`
    SELECT *
    FROM events
    WHERE type='duo_week'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    return r.rows?.[0] ?? null;
}
async function getOwnStreamerId(userId) {
    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    return Number(s.rows?.[0]?.id || 0);
}
function mapDuo(d) {
    return {
        duoId: d.duoId,
        // userId : permet au front d'afficher l'avatar du streamer (/avatars/u/{userId})
        streamerA: { id: d.streamerAId, slug: d.streamerASlug, displayName: d.streamerADisplayName, userId: d.streamerAUserId },
        streamerB: d.streamerBId
            ? { id: d.streamerBId, slug: d.streamerBSlug, displayName: d.streamerBDisplayName, userId: d.streamerBUserId }
            : null,
        status: d.status,
        shared: d.sharedViewers,
        refreshedCount: d.refreshedCount,
        points: d.points,
        rank: d.rank,
        paliersDone: d.paliersDone,
        paliers: d.paliers,
    };
}
// GET /api/events/current/duo
// Auth optionnelle : le classement des duos est public, "myDuo" n'apparaît
// que si le compte connecté est un streamer apparié pour l'event courant.
eventsDuoRouter.get("/events/current/duo", a(async (req, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0);
    const event = await getLiveDuoEvent();
    if (!event)
        return res.json({ ok: true, event: null, duos: [] });
    await recomputeDuoWeek(Number(event.id));
    const ranked = await getRankedDuos(pool, Number(event.id), 50);
    const duos = ranked.map(mapDuo);
    let myDuo = null;
    if (userId) {
        const streamerId = await getOwnStreamerId(userId);
        if (streamerId) {
            myDuo = duos.find((d) => d.streamerA.id === streamerId || d.streamerB?.id === streamerId) ?? null;
        }
    }
    res.json({ ok: true, event, duos, myDuo, palierDefs: DUO_PALIERS });
}));
// POST /api/events/duo/accept
// Auth = streamer (compte lié à streamers.user_id) : accepte le duo dans
// lequel il est apparié pour l'event duo_week courant.
eventsDuoRouter.post("/events/duo/accept", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const streamerId = await getOwnStreamerId(userId);
    if (!streamerId)
        return res.status(403).json({ ok: false, error: "not_a_streamer" });
    const event = await getLiveDuoEvent();
    if (!event)
        return res.status(400).json({ ok: false, error: "no_active_event" });
    const duo = await acceptDuoForStreamer(Number(event.id), streamerId);
    if (!duo)
        return res.status(404).json({ ok: false, error: "no_duo" });
    res.json({ ok: true, duo });
}));
// POST /api/events/duo/refresh
// Auth = streamer. 1 seul refresh autorisé par streamer et par event (cf
// refreshDuoForStreamer) — re-apparie au 2e streamer le plus commun dispo.
eventsDuoRouter.post("/events/duo/refresh", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const streamerId = await getOwnStreamerId(userId);
    if (!streamerId)
        return res.status(403).json({ ok: false, error: "not_a_streamer" });
    const event = await getLiveDuoEvent();
    if (!event)
        return res.status(400).json({ ok: false, error: "no_active_event" });
    const result = await refreshDuoForStreamer(Number(event.id), streamerId);
    if (!result.ok)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, duo: result.duo });
}));
