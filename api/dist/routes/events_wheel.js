// api/src/routes/events_wheel.ts
// Semaine de la roue — REDESIGN v2 (cf docs/events-design.md #2). Endpoints
// pour le nouveau système paliers + boutique + tickets + quêtes, distinct de
// l'ancien /api/events/current/wheel-week (cf events_wheel_week.ts, laissé
// tel quel — toujours lu depuis event_scores, ne casse rien).
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { buyShopItem, claimQuest, getLiveWheelEvent, getWheelState, spinWheel } from "../events/wheel_event.js";
export const eventsWheelRouter = Router();
// GET /api/events/current/wheel
eventsWheelRouter.get("/events/current/wheel", a(async (req, res) => {
    const user = tryGetAuthUser(req);
    const userId = Number(user?.id || 0) || undefined;
    const event = await getLiveWheelEvent(pool);
    if (!event)
        return res.json({ ok: true, event: null });
    const state = await getWheelState(pool, Number(event.id), userId);
    res.json({ ok: true, ...state });
}));
// POST /api/events/wheel/spin
eventsWheelRouter.post("/events/wheel/spin", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const result = await spinWheel(userId);
    if (!result.ok)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ...result, ok: true });
}));
// POST /api/events/wheel/shop/buy  { code }
eventsWheelRouter.post("/events/wheel/shop/buy", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const code = String(req.body?.code || "").trim();
    const event = await getLiveWheelEvent(pool);
    if (!event)
        return res.status(400).json({ ok: false, error: "no_event" });
    const result = await buyShopItem(Number(event.id), userId, code);
    if (!result.ok)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ...result, ok: true });
}));
// POST /api/events/wheel/quest/claim  { key }
eventsWheelRouter.post("/events/wheel/quest/claim", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    const key = String(req.body?.key || "").trim();
    const event = await getLiveWheelEvent(pool);
    if (!event)
        return res.status(400).json({ ok: false, error: "no_event" });
    const result = await claimQuest(Number(event.id), userId, key);
    if (!result.ok)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ...result, ok: true });
}));
