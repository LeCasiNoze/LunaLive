// api/src/rumble_chat_session.ts
// Gère la session du compte LunaLive_Bot Rumble (cookies + UA).
// Lecture: appelée par le bridge chat. Écriture: via une route admin.
import { pool } from "./db.js";
const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
let cache = null;
const CACHE_TTL_MS = 30_000;
export async function getRumbleBotSession(force = false) {
    if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS)
        return cache.value;
    const r = await pool.query(`SELECT username, cookie, user_agent FROM rumble_bot_session WHERE id = 1`);
    const row = r.rows[0] ?? {};
    const value = {
        username: row.username ?? null,
        cookie: row.cookie ?? null,
        userAgent: row.user_agent || DEFAULT_UA,
    };
    cache = { value, at: Date.now() };
    return value;
}
export async function setRumbleBotSession(input) {
    await pool.query(`UPDATE rumble_bot_session
     SET username   = COALESCE($1, username),
         cookie     = COALESCE($2, cookie),
         user_agent = COALESCE($3, user_agent),
         updated_at = NOW()
     WHERE id = 1`, [input.username ?? null, input.cookie ?? null, input.userAgent ?? null]);
    cache = null;
}
export function hasRumbleBotSession(s) {
    return !!(s.cookie && s.cookie.length > 20);
}
