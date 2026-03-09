import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
export const callsPcallRouter = Router();
// ajoute en haut (helper premium viewer)
async function hasActivePremiumViewer(userId) {
    const r = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM user_subscriptions
      WHERE user_id = $1
        AND plan_code = 'viewer'
        AND status IN ('active','trialing')
        AND (current_period_end IS NULL OR current_period_end > NOW())
    ) AS ok;
    `, [userId]);
    return Boolean(r.rows?.[0]?.ok);
}
// option future : sub à la chaîne (placeholder simple pour l’instant)
async function hasChannelSub(userId, streamerId) {
    // TODO: quand tu auras la table channel_subscriptions (ou équivalent), tu branches ici.
    return false;
}
async function ensurePcallSchema() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_pcall_cooldowns (
      streamer_id INT NOT NULL,
      user_id INT NOT NULL,
      next_at_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);
}
async function getStreamerIdBySlug(slug) {
    const s = String(slug || "").trim();
    if (!s)
        return null;
    const r = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [s]);
    const id = r.rows?.[0]?.id;
    return id != null ? Number(id) : null;
}
async function getTalentLevel(userId, code) {
    try {
        const r = await pool.query(`SELECT level FROM user_talents WHERE user_id=$1 AND talent_code=$2 LIMIT 1`, [userId, code]);
        return Math.max(0, Number(r.rows?.[0]?.level || 0));
    }
    catch {
        return 0;
    }
}
async function getNextAtMs(streamerId, userId) {
    await ensurePcallSchema();
    const r = await pool.query(`SELECT next_at_ms FROM calls_pcall_cooldowns WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`, [streamerId, userId]);
    return Number(r.rows?.[0]?.next_at_ms || 0);
}
callsPcallRouter.get("/:slug/pcall/status", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
    if (!userId)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const slug = String(req.params?.slug || "").trim();
    const streamerId = await getStreamerIdBySlug(slug);
    if (!streamerId)
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const level = await getTalentLevel(userId, "talent_calls_limit");
    // ✅ source de vérité premium viewer = user_subscriptions
    const premiumViewer = await hasActivePremiumViewer(userId);
    // ✅ sub à la chaîne (plus tard)
    const channelSub = await hasChannelSub(userId, streamerId);
    // ✅ unlocked si un des 3 (talent3 / sub chaîne / premium viewer)
    const unlocked = premiumViewer || channelSub || level >= 3;
    const unlockedReason = premiumViewer
        ? "premium_viewer"
        : channelSub
            ? "channel_sub"
            : level >= 3
                ? "talent_lvl3"
                : "none";
    // ✅ cooldown policy (prêt pour ton futur “6h partagé”)
    const cooldownMs = channelSub ? 6 * 60 * 60 * 1000 : 90 * 60 * 1000;
    // Si sub à la chaîne => cooldown partagé (streamer_id=0), sinon par chaîne
    const scopeStreamerId = channelSub ? 0 : streamerId;
    const nextAtMs = await getNextAtMs(scopeStreamerId, userId);
    return res.json({
        ok: true,
        unlocked,
        unlockedReason,
        premiumViewer,
        channelSub,
        level,
        nextAtMs,
        cooldownMs,
        cooldownScope: channelSub ? "subbed_pool" : "per_channel",
        serverNowMs: Date.now(),
    });
}));
