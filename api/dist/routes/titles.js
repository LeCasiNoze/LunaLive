// api/src/routes/titles.ts
//
// Système de titres unifié (Sprint 3.5b):
// 2 slots seulement — succès et niveau (le shop a été retiré).
//   - achievement_code  : titre obtenu via succès (Vrai Viewer, Ratus, LunaKing, etc.)
//   - level_show        : afficher (oui/non) le titre auto-évolutif du palier
//
// Affichage chat compact:
//   [badge] Username
//           [🏆 Vrai Viewer]  —  [⭐ Apprenti Spinner II]
//           message
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { getLevelInfo } from "../economy/xp.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";
export const titlesRouter = Router();
titlesRouter.use("/me/titles", requireAuth);
function rarityFromCatalog(code) {
    const item = COSMETICS_CATALOG.find((x) => x.kind === "title" && x.code === code);
    if (!item)
        return "common";
    return item.rarity || "common";
}
function labelFromCatalog(code) {
    const item = COSMETICS_CATALOG.find((x) => x.kind === "title" && x.code === code);
    return item?.name || code.replace(/^title_/, "").replace(/_/g, " ");
}
function levelTierToRarity(tier) {
    if (tier >= 9)
        return "mythic";
    if (tier >= 8)
        return "legendary";
    if (tier >= 6)
        return "epic";
    if (tier >= 4)
        return "rare";
    if (tier >= 2)
        return "uncommon";
    return "common";
}
/** GET /me/titles — tous les titres possibles + équipement actuel des 2 slots */
titlesRouter.get("/me/titles", a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const u = await pool.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
    const xp = Number(u.rows[0]?.xp || 0);
    const info = getLevelInfo(xp);
    const ownedTitles = await pool.query(`SELECT code FROM user_entitlements WHERE user_id = $1 AND kind = 'title'`, [userId]);
    const ownedCodes = new Set(ownedTitles.rows.map((r) => String(r.code)));
    const eq = await pool.query(`SELECT title_achievement_code, title_level_show
         FROM user_equipped_cosmetics WHERE user_id = $1 LIMIT 1`, [userId]);
    const row = eq.rows[0] || {};
    const equipped = {
        achievement: row.title_achievement_code || null,
        level: !!row.title_level_show,
    };
    const titles = [];
    // 1) Titre niveau auto (toujours possédé)
    titles.push({
        code: "level_auto",
        source: "level",
        label: info.fullTitle,
        description: `Suit ton palier (${info.tier + 1} / 10)`,
        rarity: levelTierToRarity(info.tier),
        owned: true,
    });
    // 2) Tous les titres du catalogue (tous achievement désormais)
    for (const item of COSMETICS_CATALOG) {
        if (item.kind !== "title" || !item.active)
            continue;
        const code = String(item.code);
        titles.push({
            code,
            source: "achievement",
            label: labelFromCatalog(code),
            description: item.description || undefined,
            rarity: rarityFromCatalog(code),
            owned: ownedCodes.has(code),
        });
    }
    // 3) Titres legacy hors catalogue
    for (const code of ownedCodes) {
        if (titles.some((t) => t.code === code))
            continue;
        titles.push({
            code,
            source: "achievement",
            label: code.replace(/^title_/, "").replace(/_/g, " "),
            rarity: "common",
            owned: true,
        });
    }
    return res.json({
        ok: true,
        equipped,
        currentLevel: info.level,
        currentLevelTitle: info.fullTitle,
        currentLevelTier: info.tier,
        titles,
    });
}));
/**
 * POST /me/titles/equip { slot: "achievement"|"level", code: string|null }
 * Pour 'level', code = "level_auto" pour activer, null pour désactiver.
 */
titlesRouter.post("/me/titles/equip", a(async (req, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const slot = String(req.body?.slot || "").toLowerCase();
    const codeRaw = req.body?.code;
    const code = codeRaw === null ? null : String(codeRaw || "").trim() || null;
    if (!["achievement", "level"].includes(slot)) {
        return res.status(400).json({ ok: false, error: "invalid_slot" });
    }
    if (slot === "level") {
        const show = code === "level_auto";
        await pool.query(`INSERT INTO user_equipped_cosmetics (user_id, title_level_show, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET title_level_show = $2, updated_at = NOW()`, [userId, show]);
    }
    else {
        if (code) {
            const r = await pool.query(`SELECT 1 FROM user_entitlements WHERE user_id = $1 AND kind = 'title' AND code = $2 LIMIT 1`, [userId, code]);
            if (!r.rows[0]) {
                return res.status(403).json({ ok: false, error: "not_owned" });
            }
        }
        await pool.query(`INSERT INTO user_equipped_cosmetics (user_id, title_achievement_code, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET title_achievement_code = $2, updated_at = NOW()`, [userId, code]);
    }
    const eq = await pool.query(`SELECT title_achievement_code, title_level_show
         FROM user_equipped_cosmetics WHERE user_id = $1 LIMIT 1`, [userId]);
    const row = eq.rows[0] || {};
    return res.json({
        ok: true,
        equipped: {
            achievement: row.title_achievement_code || null,
            level: !!row.title_level_show,
        },
    });
}));
