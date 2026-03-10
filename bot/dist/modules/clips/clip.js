const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
const LATENCY_PAD_SEC = 30; // Compensation latence augmentée
const DEFAULT_PRE_SEC = 75; // 1m15 (nouvelle cible)
const DEFAULT_POST_SEC = 15; // 15s
function normTitle(s) {
    return String(s || "").trim().slice(0, 140);
}
function hhmmss(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return ((h > 0 ? String(h).padStart(2, "0") + ":" : "") +
        String(m).padStart(2, "0") +
        ":" +
        String(sec).padStart(2, "0"));
}
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
/* ------------------ PG store ------------------ */
let ensured = false;
const TS_MS_THRESHOLD = 100000000000; // 1e11
async function ensureBotClipsTable(pool) {
    if (ensured)
        return;
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_clips (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      title TEXT,
      author TEXT,
      at_sec INTEGER NOT NULL,
      pre_sec INTEGER NOT NULL DEFAULT 105,
      post_sec INTEGER NOT NULL DEFAULT 15,
      created_ts BIGINT NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT
    );
  `);
    await pool.query(`ALTER TABLE bot_clips ALTER COLUMN created_ts TYPE BIGINT USING created_ts::bigint;`).catch(() => { });
    await pool.query(`ALTER TABLE bot_clips ALTER COLUMN vod_created_ts TYPE BIGINT USING vod_created_ts::bigint;`).catch(() => { });
    // ✅ Nouvelle colonne : timestamp exact du début du live courant au moment du clip
    // Permet au vod_linker de trouver la VOD exacte sans estimation approximative
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_start_ts BIGINT;`);
    // ✅ Nouvelle colonne : permlink du live pour matching exact VOD
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_permlink TEXT;`);
    // Index pour recherche rapide par permlink
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_live_permlink ON bot_clips(live_permlink) WHERE live_permlink IS NOT NULL;`);
    await pool.query(`UPDATE bot_clips SET created_ts = created_ts * 1000 WHERE created_ts < $1`, [TS_MS_THRESHOLD]).catch(() => { });
    await pool.query(`UPDATE bot_clips SET vod_created_ts = vod_created_ts * 1000 WHERE vod_created_ts IS NOT NULL AND vod_created_ts < $1`, [TS_MS_THRESHOLD]).catch(() => { });
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_created
      ON bot_clips(streamer_id, created_ts DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_vod_pending
      ON bot_clips(streamer_id)
      WHERE vod_url IS NULL;
  `);
    ensured = true;
}
const CLIPS_LIMIT_NO_SUB = 10;
async function getStreamerOwnerUserId(pool, streamerId) {
    const r = await pool.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
    const id = Number(r.rows?.[0]?.user_id || 0);
    return id > 0 ? id : null;
}
async function hasActiveStreamerSub(pool, userId) {
    const uid = Number(userId || 0);
    if (!uid)
        return false;
    try {
        const r = await pool.query(`SELECT 1 FROM user_subscriptions us
       WHERE us.user_id=$1 AND us.plan_code='streamer'
         AND us.status IN ('active','trialing')
         AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
       LIMIT 1`, [uid]);
        return !!r.rows?.[0];
    }
    catch {
        return false;
    }
}
async function streamerHasUnlimitedClips(pool, streamerId) {
    const ownerId = await getStreamerOwnerUserId(pool, streamerId);
    if (!ownerId)
        return false;
    return hasActiveStreamerSub(pool, ownerId);
}
async function addClipPg(p) {
    const { pool, streamerId } = p;
    await ensureBotClipsTable(pool);
    const nowMs = Date.now();
    const at = Math.max(0, Math.floor(p.atSec));
    const pre = Math.max(0, Math.floor(p.preSec));
    const post = Math.max(0, Math.floor(p.postSec));
    const unlimited = await streamerHasUnlimitedClips(pool, streamerId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const dup = await client.query(`SELECT id FROM bot_clips
       WHERE streamer_id=$1 AND ABS(at_sec - $2) <= 20 AND created_ts >= $3
       LIMIT 1`, [streamerId, at, nowMs - 6 * 3600 * 1000]);
        if (dup.rows?.[0]?.id) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "duplicate" };
        }
        // ✅ on stocke live_start_ts et live_permlink pour que le vod_linker trouve la bonne VOD
        const ins = await client.query(`INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts, live_start_ts, live_permlink)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`, [streamerId, p.title, p.author, at, pre, post, nowMs, p.liveStartTs, p.livePermlink]);
        const newId = Number(ins.rows?.[0]?.id || 0);
        if (!unlimited) {
            await client.query(`WITH to_del AS (
           SELECT id FROM bot_clips WHERE streamer_id=$1
           ORDER BY created_ts DESC OFFSET $2
         )
         DELETE FROM bot_clips WHERE id IN (SELECT id FROM to_del)`, [streamerId, CLIPS_LIMIT_NO_SUB]);
        }
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
/* ------------------ public auto-clip API ------------------ */
export async function createAutoClipForStreamer(p) {
    const { pool, streamerId, title, author, preSec, postSec } = p;
    try {
        // Réutiliser la logique exacte de !clip
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
        // Utiliser les valeurs par défaut si non fournies
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
/* ------------------ public handler ------------------ */
export async function tryHandleClipCommand(p) {
    const { msg, prefix } = p;
    const body = String(msg.body || "").trim();
    if (!body.startsWith(prefix))
        return false;
    const raw = body.slice(prefix.length).trimStart();
    if (!/^clip(\s|$)/i.test(raw))
        return false;
    const allowEveryone = p.allowEveryone ?? true;
    if (!allowEveryone)
        return false;
    const title = normTitle(raw.replace(/^clip\s*/i, ""));
    try {
        const channelSlug = await getDliveChannelSlugForStreamer(p.pool, p.streamer.id);
        if (!channelSlug)
            return true;
        const live = await fetchLiveStart(channelSlug).catch(() => null);
        if (!live) {
            await p.send("— ⏹️ Clip: pas de live détecté (aucun timecode).");
            return true;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = Math.floor(live.createdAtMs / 1000);
        const offset = Math.max(0, nowSec - startSec + LATENCY_PAD_SEC);
        const res = await addClipPg({
            pool: p.pool,
            streamerId: p.streamer.id,
            title: title || null,
            author: msg.username || null,
            atSec: offset,
            preSec: DEFAULT_PRE_SEC,
            postSec: DEFAULT_POST_SEC,
            liveStartTs: live.createdAtMs, // ✅ ancre exacte pour le linker
            livePermlink: live.permlink, // ✅ ajouté
        });
        if (!res.ok && res.reason === "duplicate") {
            await p.send("— 🎬 Clip déjà noté (fenêtre proche).");
            return true;
        }
        await p.send(`— 🎬 Clip enregistré${title ? ` : "${title}"` : ""} • ${hhmmss(offset)}`);
        return true;
    }
    catch {
        return true;
    }
}
