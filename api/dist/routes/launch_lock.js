// Routes publiques du cadenas de lancement des events.
// GET  /api/public/launch-lock        → état (jauge X/30 + prérequis du user si Bearer)
// POST /api/public/launch-lock/click  → clic (auth), déclenche l'event 1 à 30
import { Router } from "express";
import { a } from "../utils/async.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { clickLock, countLockClicks, getLaunchFlag, hasClicked, LAUNCH_LOCK_TARGET, userPrereqs, } from "../events/launch_lock.js";
export const launchLockRouter = Router();
launchLockRouter.get("/public/launch-lock", a(async (req, res) => {
    const flag = await getLaunchFlag();
    const count = await countLockClicks();
    // auth OPTIONNELLE : on renvoie l'état perso si un Bearer valide est fourni
    let me = null;
    try {
        const u = tryGetAuthUser(req);
        const userId = Number(u?.id || 0);
        if (userId > 0) {
            const requirements = await userPrereqs(userId);
            me = {
                clicked: await hasClicked(userId),
                eligible: requirements.every((r) => r.done),
                requirements,
            };
        }
    }
    catch {
        me = null;
    }
    res.json({ ok: true, unlocked: !!flag.unlocked, count, target: LAUNCH_LOCK_TARGET, me });
}));
launchLockRouter.post("/public/launch-lock/click", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    if (!userId)
        return res.status(401).json({ ok: false, error: "auth_required" });
    const r = await clickLock(userId);
    if (!r.ok)
        return res.status(400).json(r);
    res.json(r);
}));
