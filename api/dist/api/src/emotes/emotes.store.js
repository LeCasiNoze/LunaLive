export async function getStreamerIdBySlug(pool, slug) {
    // ⚠️ adapte ici si ta table streamers n’est pas id BIGINT / slug TEXT
    const r = await pool.query(`SELECT id FROM streamers WHERE slug=$1 LIMIT 1`, [slug]);
    return r.rows?.[0]?.id ? Number(r.rows[0].id) : null;
}
export async function listActiveEmotesForChat(pool, streamerId) {
    const r = await pool.query(`
    SELECT id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status
    FROM emotes
    WHERE status='active'
      AND (
        scope IN ('native','global')
        OR (scope='channel' AND streamer_id=$1)
      )
    ORDER BY scope ASC, kind ASC, name ASC
    `, [streamerId]);
    return r.rows;
}
export async function listFavorites(pool, userId) {
    const r = await pool.query(`
    SELECT e.id, e.kind, e.scope, e.streamer_id, e.name, e.label, e.url, e.mime, e.size_bytes, e.status
    FROM emote_favorites f
    JOIN emotes e ON e.id = f.emote_id
    WHERE f.user_id=$1 AND e.status='active'
    ORDER BY f.created_at DESC
    `, [userId]);
    return r.rows;
}
export async function addFavorite(pool, userId, emoteId) {
    // favori UNIQUEMENT native/global
    const chk = await pool.query(`SELECT scope FROM emotes WHERE id=$1 AND status='active' LIMIT 1`, [emoteId]);
    const scope = chk.rows?.[0]?.scope;
    if (scope !== "native" && scope !== "global")
        throw new Error("favorites_only_native_or_global");
    await pool.query(`INSERT INTO emote_favorites(user_id, emote_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [userId, emoteId]);
}
export async function removeFavorite(pool, userId, emoteId) {
    await pool.query(`DELETE FROM emote_favorites WHERE user_id=$1 AND emote_id=$2`, [userId, emoteId]);
}
