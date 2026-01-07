const DEFAULTS = {
    allowLinks: true,
    followOnly: false,
    subOnly: false,
};
function toBool(v) {
    if (typeof v === "boolean")
        return v;
    return null;
}
export async function getChatSettings(pool, streamerId) {
    const r = await pool.query(`SELECT allow_links, follow_only, sub_only
     FROM streamer_chat_settings
     WHERE streamer_id=$1
     LIMIT 1`, [streamerId]);
    if (!r.rows?.[0]) {
        await pool.query(`INSERT INTO streamer_chat_settings (streamer_id)
       VALUES ($1)
       ON CONFLICT (streamer_id) DO NOTHING`, [streamerId]);
        return { ...DEFAULTS };
    }
    const row = r.rows[0];
    return {
        allowLinks: !!row.allow_links,
        followOnly: !!row.follow_only,
        subOnly: !!row.sub_only,
    };
}
export async function patchChatSettings(pool, streamerId, patch, actorUserId) {
    const allowLinks = patch.allowLinks != null ? toBool(patch.allowLinks) : null;
    const followOnly = patch.followOnly != null ? toBool(patch.followOnly) : null;
    const subOnly = patch.subOnly != null ? toBool(patch.subOnly) : null;
    if (allowLinks == null && followOnly == null && subOnly == null) {
        return await getChatSettings(pool, streamerId);
    }
    await pool.query(`INSERT INTO streamer_chat_settings (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`, [streamerId]);
    const r = await pool.query(`UPDATE streamer_chat_settings
     SET
       allow_links = COALESCE($2, allow_links),
       follow_only = COALESCE($3, follow_only),
       sub_only    = COALESCE($4, sub_only),
       updated_at = now(),
       updated_by_user_id = $5
     WHERE streamer_id=$1
     RETURNING allow_links, follow_only, sub_only`, [streamerId, allowLinks, followOnly, subOnly, actorUserId]);
    const row = r.rows?.[0];
    return {
        allowLinks: !!row.allow_links,
        followOnly: !!row.follow_only,
        subOnly: !!row.sub_only,
    };
}
export function roleLabelFr(role) {
    if (role === "admin")
        return "admin";
    if (role === "streamer")
        return "propriétaire";
    if (role === "mod")
        return "modérateur";
    return "viewer";
}
export function formatSettingsChangeMessage(opts) {
    const who = opts.actorUsername || "Quelqu’un";
    const role = roleLabelFr(opts.actorRole);
    const parts = [];
    if (opts.changed.allowLinks != null) {
        parts.push(opts.changed.allowLinks ? "a activé les liens" : "a désactivé les liens");
    }
    if (opts.changed.followOnly != null) {
        parts.push(opts.changed.followOnly ? "a activé le mode follow-only" : "a désactivé le mode follow-only");
    }
    if (opts.changed.subOnly != null) {
        parts.push(opts.changed.subOnly ? "a activé le mode sub-only" : "a désactivé le mode sub-only");
    }
    const action = parts.length ? parts.join(" • ") : "a modifié les options du chat";
    return `⚙️ ${who} (${role}) ${action}.`;
}
// détection lien simple MVP
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+|(?:\b(?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s]*)?/i;
export function containsLink(text) {
    return URL_RE.test(String(text || ""));
}
