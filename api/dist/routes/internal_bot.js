// api/src/routes/internal_bot.ts
import express from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";
export const internalBotRouter = express.Router();
// --------------------
// Auto clip creation logic (reproduced from bot)
// --------------------
const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
const LATENCY_PAD_SEC = 30; // Compensation latence augmentée
const DEFAULT_PRE_SEC = 75; // 1m15 (nouvelle cible)
const DEFAULT_POST_SEC = 15; // 15s
async function dliveGql(query, variables) {
    const r = await fetch(DLIVE_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: "https://dlive.tv",
            referer: "https://dlive.tv/",
        },
        body: JSON.stringify(variables ? { query, variables } : { query }),
    });
    if (!r.ok)
        throw new Error(`dlive_gql_http_${r.status}`);
    return (await r.json());
}
async function fetchLiveStart(displayName) {
    const query = "query UserLiveStart($name:String!){ userByDisplayName(displayname:$name){ username livestream{ createdAt permlink watchingCount } } }";
    const j = await dliveGql(query, { name: displayName });
    const ls = j?.data?.userByDisplayName?.livestream;
    if (!ls?.createdAt)
        return null;
    const createdAtMs = Number(ls.createdAt);
    if (!Number.isFinite(createdAtMs))
        return null;
    return { createdAtMs, permlink: String(ls.permlink || "") };
}
async function getDliveChannelSlugForStreamer(pool, streamerId) {
    const r = await pool.query(`SELECT
       s.dlive_use_linked AS "useLinked",
       s.dlive_link_displayname AS "linkedDisplayname",
       pa.channel_slug AS "providerChannelSlug"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.provider='dlive'
      AND pa.assigned_to_streamer_id = s.id
     WHERE s.id=$1
     LIMIT 1`, [streamerId]);
    const row = r.rows?.[0] || null;
    if (!row)
        return null;
    const useLinked = !!row.useLinked;
    const linked = row.linkedDisplayname ? String(row.linkedDisplayname) : "";
    const provider = row.providerChannelSlug ? String(row.providerChannelSlug) : "";
    const channelSlug = useLinked && linked ? linked : provider;
    return channelSlug.trim() ? channelSlug.trim() : null;
}
async function addClipPg(p) {
    const { pool, streamerId } = p;
    const nowMs = Date.now();
    const at = Math.max(0, Math.floor(p.atSec));
    const pre = Math.max(0, Math.floor(p.preSec));
    const post = Math.max(0, Math.floor(p.postSec));
    // Check unlimited clips (simplified)
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Deduplication check
        const dup = await client.query(`SELECT id FROM bot_clips
       WHERE streamer_id=$1 AND ABS(at_sec - $2) <= 20 AND created_ts >= $3
       LIMIT 1`, [streamerId, at, nowMs - 6 * 3600 * 1000]);
        if (dup.rows?.[0]?.id) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "duplicate" };
        }
        // Insert clip
        const ins = await client.query(`INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts, live_start_ts, live_permlink)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`, [streamerId, p.title, p.author, at, pre, post, nowMs, p.liveStartTs, p.livePermlink]);
        const newId = Number(ins.rows?.[0]?.id || 0);
        await client.query("COMMIT");
        return { ok: true, id: newId };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
async function createAutoClipForStreamer(p) {
    const { pool, streamerId, title, author, preSec, postSec } = p;
    try {
        const channelSlug = await getDliveChannelSlugForStreamer(pool, streamerId);
        if (!channelSlug) {
            return { ok: false, reason: "streamer_dlive_not_found" };
        }
        const live = await fetchLiveStart(channelSlug).catch(() => null);
        if (!live) {
            return { ok: false, reason: "live_not_active" };
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = Math.floor(live.createdAtMs / 1000);
        const offset = Math.max(0, nowSec - startSec + LATENCY_PAD_SEC);
        const finalPreSec = preSec != null ? Math.max(0, Math.floor(preSec)) : DEFAULT_PRE_SEC;
        const finalPostSec = postSec != null ? Math.max(0, Math.floor(postSec)) : DEFAULT_POST_SEC;
        const res = await addClipPg({
            pool,
            streamerId,
            title: title || null,
            author: author || null,
            atSec: offset,
            preSec: finalPreSec,
            postSec: finalPostSec,
            liveStartTs: live.createdAtMs,
            livePermlink: live.permlink, // ✅ ajouté
        });
        if (!res.ok && res.reason === "duplicate") {
            return { ok: false, reason: "duplicate" };
        }
        return res;
    }
    catch (e) {
        return { ok: false, reason: e?.message || "unknown_error" };
    }
}
function requireBotKey(req, res) {
    const expected = String(process.env.BOT_INTERNAL_KEY || "");
    const got = String(req.header("x-bot-key") || "");
    if (!expected || got !== expected) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return false;
    }
    return true;
}
function emitChatAll(io, slug, event, payload) {
    const s = String(slug).trim();
    if (!s)
        return;
    io.to(`chat:${s}:public`).emit(event, payload);
    io.to(`chat:${s}:popup`).emit(event, payload);
}
function parseBoolish(v) {
    if (v === undefined || v === null)
        return null;
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s))
        return true;
    if (["false", "0", "no", "n", "off"].includes(s))
        return false;
    return null;
}
// --------------------
// 1) Envoi chat bot -> persist + broadcast
// --------------------
internalBotRouter.post("/internal/bot/chat/send", express.json(), async (req, res) => {
    if (!requireBotKey(req, res))
        return;
    const streamerId = Number(req.body?.streamerId || 0);
    const bodyRaw = String(req.body?.body || "").replace(/\r/g, "").trim();
    const body = bodyRaw.length > 200 ? bodyRaw.slice(0, 200) : bodyRaw;
    if (!streamerId || !body) {
        return res.status(400).json({ ok: false, error: "bad_request" });
    }
    // streamer meta (slug + appearance)
    const s = await pool.query(`SELECT slug, appearance
       FROM streamers
       WHERE id=$1
       LIMIT 1`, [streamerId]);
    const meta = s.rows?.[0];
    if (!meta)
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const slug = String(meta.slug);
    const appearance = normalizeAppearance(meta.appearance || {});
    // bot identity
    const botUserId = Number(process.env.BOT_USER_ID || 0);
    const botUsername = String(process.env.BOT_USERNAME || "LunaBot");
    if (!botUserId) {
        return res.status(500).json({ ok: false, error: "BOT_USER_ID_missing" });
    }
    // INSERT message (DB)
    const ins = await pool.query(`INSERT INTO chat_messages (streamer_id, user_id, username, body)
       VALUES ($1,$2,$3,$4)
       RETURNING id, created_at AS "createdAt"`, [streamerId, botUserId, botUsername, body]);
    const row = ins.rows?.[0];
    // cosmetics (optionnel, mais utile)
    const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
    const cosmetics = cosmeticsByUser.get(botUserId) ?? null;
    const msg = {
        id: Number(row.id),
        userId: botUserId,
        username: botUsername,
        body,
        createdAt: new Date(row.createdAt).toISOString(),
        cosmetics,
        style: {
            nameColor: appearance.chat.usernameColor,
            msgColor: appearance.chat.messageColor,
        },
    };
    const io = req.app.locals.io;
    if (io)
        emitChatAll(io, slug, "chat:message", msg);
    return res.json({ ok: true, id: msg.id });
});
// --------------------
// 2) ✅ MVP: Upsert settings bot par streamer (enabled/prefix/liveOnly)
// --------------------
internalBotRouter.post("/internal/bot/streamer/settings", express.json(), async (req, res) => {
    if (!requireBotKey(req, res))
        return;
    const body = req.body || {};
    // accepte streamerId OU slug
    let streamerId = Number(body.streamerId || 0);
    const slug = String(body.slug || "").trim();
    if (!streamerId && slug) {
        const r = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
        streamerId = Number(r.rows?.[0]?.id || 0);
    }
    if (!streamerId) {
        return res.status(400).json({ ok: false, error: "streamer_required" });
    }
    const enabledMaybe = parseBoolish(body.enabled);
    const liveOnlyMaybe = parseBoolish(body.liveOnly);
    const prefixRawProvided = Object.prototype.hasOwnProperty.call(body, "prefix");
    const prefixRaw = prefixRawProvided ? String(body.prefix || "").trim() : null;
    // au moins 1 champ
    if (enabledMaybe === null && liveOnlyMaybe === null && !prefixRawProvided) {
        return res.status(400).json({ ok: false, error: "no_fields" });
    }
    // streamer exists ?
    const s = await pool.query(`SELECT id, slug FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
    const streamer = s.rows?.[0];
    if (!streamer)
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
    // fetch current (si existe)
    let cur = null;
    try {
        const r = await pool.query(`SELECT enabled, prefix, live_only
         FROM bot_streamer_settings
         WHERE streamer_id=$1
         LIMIT 1`, [streamerId]);
        if (r.rows?.[0]) {
            cur = {
                enabled: Boolean(r.rows[0].enabled),
                prefix: String(r.rows[0].prefix || "!"),
                live_only: Boolean(r.rows[0].live_only),
            };
        }
    }
    catch (e) {
        const code = String(e?.code || "");
        if (code === "42P01") {
            return res.status(500).json({ ok: false, error: "bot_streamer_settings_missing" });
        }
        return res.status(500).json({ ok: false, error: "db_error", detail: e?.message || String(e) });
    }
    const nextEnabled = enabledMaybe === null ? (cur?.enabled ?? false) : enabledMaybe;
    const nextLiveOnly = liveOnlyMaybe === null ? (cur?.live_only ?? true) : liveOnlyMaybe;
    let nextPrefix = cur?.prefix ?? "!";
    if (prefixRawProvided) {
        // si fourni mais vide => "!"
        const p = String(prefixRaw || "!").trim();
        nextPrefix = p.length ? p : "!";
        // garde ça simple: on limite à 5 chars pour éviter n'importe quoi
        if (nextPrefix.length > 5)
            nextPrefix = nextPrefix.slice(0, 5);
    }
    // upsert
    try {
        await pool.query(`
        INSERT INTO bot_streamer_settings (streamer_id, enabled, prefix, live_only)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (streamer_id)
        DO UPDATE SET
          enabled=EXCLUDED.enabled,
          prefix=EXCLUDED.prefix,
          live_only=EXCLUDED.live_only,
          updated_at=now()
      `, [streamerId, nextEnabled, nextPrefix, nextLiveOnly]);
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: "db_error", detail: e?.message || String(e) });
    }
    return res.json({
        ok: true,
        streamerId,
        slug: String(streamer.slug),
        settings: {
            enabled: nextEnabled,
            prefix: nextPrefix,
            liveOnly: nextLiveOnly,
        },
    });
});
// --------------------
// Auto clip creation for external detector
// --------------------
internalBotRouter.post("/internal/clips/auto", express.json(), async (req, res) => {
    console.log("[DEBUG] /internal/clips/auto TOUCHÉ - body:", req.body);
    console.log("[DEBUG] headers:", req.headers);
    if (!requireBotKey(req, res))
        return;
    const streamerId = Number(req.body?.streamerId || 0);
    const streamerSlug = req.body?.streamerSlug ?? null;
    const title = req.body?.title ?? null;
    const author = req.body?.author ?? null;
    const preSec = req.body?.preSec ?? undefined;
    const postSec = req.body?.postSec ?? undefined;
    let resolvedStreamerId = streamerId;
    // Si streamerId n'est pas valide, essayer avec streamerSlug
    if (!Number.isFinite(resolvedStreamerId) || resolvedStreamerId <= 0) {
        if (!streamerSlug || typeof streamerSlug !== "string" || !streamerSlug.trim()) {
            return res.status(400).json({ ok: false, reason: "invalid_streamer_identifier" });
        }
        try {
            const slugResult = await pool.query(`SELECT id FROM streamers WHERE slug=$1 LIMIT 1`, [streamerSlug.trim()]);
            if (!slugResult.rows?.[0]?.id) {
                return res.status(404).json({ ok: false, reason: "streamer_not_found" });
            }
            resolvedStreamerId = Number(slugResult.rows[0].id);
        }
        catch (e) {
            console.error("[internal/clips/auto] slug resolution error:", e);
            return res.status(500).json({ ok: false, reason: "db_error" });
        }
    }
    try {
        const result = await createAutoClipForStreamer({
            pool,
            streamerId: resolvedStreamerId,
            title: typeof title === "string" ? title.trim() || null : null,
            author: typeof author === "string" ? author.trim() || null : null,
            preSec,
            postSec,
        });
        if (result.ok) {
            return res.json({ ok: true, id: result.id });
        }
        else {
            return res.json({ ok: false, reason: result.reason });
        }
    }
    catch (e) {
        console.error("[internal/clips/auto] error:", e);
        return res.status(500).json({ ok: false, reason: "server_error" });
    }
});
