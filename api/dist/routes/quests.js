// api/src/routes/quests.ts
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { getActiveQuestsForUser, claimQuest, seedAllPeriodsIfNeeded, } from "../services/quests.js";
export const questsRouter = Router();
questsRouter.use("/me/quests", requireAuth);
/**
 * GET /me/quests
 * Liste les quêtes actives (daily/weekly/monthly) avec la progression
 * du user et l'état de claim. Les quêtes du jour sont seedées au besoin.
 */
questsRouter.get("/me/quests", a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    // Seed des périodes courantes si pas encore fait (idempotent)
    try {
        await seedAllPeriodsIfNeeded();
    }
    catch {
        // si seed fail on continue avec ce qu'il y a
    }
    const quests = await getActiveQuestsForUser(userId);
    return res.json({
        ok: true,
        quests,
        claimableCount: quests.filter((q) => q.claimable).length,
    });
}));
/**
 * POST /me/quests/:code/claim
 * Réclame la récompense d'une quête complétée.
 */
questsRouter.post("/me/quests/:code/claim", a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const code = String(req.params.code || "").trim();
    if (!code)
        return res.status(400).json({ ok: false, error: "invalid_code" });
    const result = await claimQuest(userId, code);
    if (!result.ok) {
        const status = result.error === "already_claimed"
            ? 409
            : result.error === "not_completed"
                ? 400
                : 404;
        return res.status(status).json({ ok: false, error: result.error });
    }
    return res.json(result);
}));
