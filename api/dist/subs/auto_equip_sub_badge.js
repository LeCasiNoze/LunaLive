import { pool } from "../db.js";
function normSlug(slug) {
    return String(slug || "").trim().toLowerCase();
}
export async function autoEquipSubBadgeIfEmpty(userId, streamerSlug, db = pool) {
    const slug = normSlug(streamerSlug);
    if (!slug)
        return { ok: false, applied: false };
    const badgeCode = `badge_sub_${slug}`;
    // s'assure que la ligne existe
    await db.query(`INSERT INTO user_equipped_cosmetics (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`, [userId]);
    // ✅ n’écrase pas un badge déjà équipé
    const upd = await db.query(`UPDATE user_equipped_cosmetics
     SET badge_code = $2, updated_at = NOW()
     WHERE user_id = $1
       AND (badge_code IS NULL OR badge_code = 'none')
     RETURNING badge_code`, [userId, badgeCode]);
    return { ok: true, applied: !!upd.rows?.[0], badgeCode };
}
