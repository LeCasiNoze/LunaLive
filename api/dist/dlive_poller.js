import { pool } from "./db.js";
import { fetchDliveLiveInfo } from "./dlive.js";
import { notifyFollowersGoLive } from "./notify_go_live.js";
const INTERVAL_MS = Number(process.env.DLIVE_POLL_INTERVAL_MS || 30_000);
const CONCURRENCY = Math.max(1, Number(process.env.DLIVE_POLL_CONCURRENCY || 5));
// ✅ AJOUTE ÇA en haut du fichier (après les const INTERVAL_MS / CONCURRENCY)
const LUNA24_TARGET_SLUG = "lunalive"; // le streamer virtuel que tu vas créer
const LUNA24_SOURCES_DISPLAYNAMES = [
    "CA-ME-A-SI-NO",
    "VitaPvPey",
    "Willwin",
    "iBenoo",
    "ekanos",
    "Kawa",
    "Bichou",
    "MagouilleTv",
    "Put4click_live",
];
// état mémoire: on garde le current tant qu'il est live
let luna24Current = null;
async function getStreamerIdBySlug(slug) {
    const r = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
    const id = r.rows?.[0]?.id;
    return id != null ? Number(id) : null;
}
async function setLuna24DisplayName(sourceDisplayname) {
    const dn = sourceDisplayname ? `LunaLive • ${sourceDisplayname}` : "LunaLive";
    await pool.query(`UPDATE streamers
     SET display_name = $2,
         updated_at = NOW()
     WHERE lower(slug)=lower($1)`, [LUNA24_TARGET_SLUG, dn]);
}
async function setLuna24LinkedTarget(displayname, username) {
    // on force lunalive à "linked dlive"
    await pool.query(`UPDATE streamers
     SET dlive_use_linked = TRUE,
         dlive_link_displayname = $2,
         dlive_link_username = $3,
         updated_at = NOW()
     WHERE lower(slug)=lower($1)`, [LUNA24_TARGET_SLUG, displayname, username]);
}
async function pickLuna24TargetKeepingCurrent() {
    // 1) si on a un current → check s'il est encore live
    if (luna24Current?.displayname) {
        try {
            const info = await fetchDliveLiveInfo(luna24Current.displayname);
            const isLive = !!info.isLive;
            if (isLive) {
                const viewers = Number(info.watchingCount ?? 0) || 0;
                const username = info.username ? String(info.username) : luna24Current.username;
                luna24Current = { displayname: luna24Current.displayname, username };
                return {
                    displayname: luna24Current.displayname,
                    username,
                    isLive: true,
                    viewers,
                };
            }
        }
        catch {
            // si ça fail, on tombera sur fallback ci-dessous
        }
    }
    // 2) sinon: premier live dans la liste (ordre strict)
    for (const dn of LUNA24_SOURCES_DISPLAYNAMES) {
        try {
            const info = await fetchDliveLiveInfo(dn);
            const isLive = !!info.isLive;
            if (!isLive)
                continue;
            const viewers = Number(info.watchingCount ?? 0) || 0;
            const username = info.username ? String(info.username) : null;
            luna24Current = { displayname: dn, username };
            return { displayname: dn, username, isLive: true, viewers };
        }
        catch {
            // ignore et continue
        }
    }
    // 3) personne live
    luna24Current = null;
    return { displayname: null, username: null, isLive: false, viewers: 0 };
}
async function runWithConcurrency(items, worker, concurrency) {
    const q = items.slice();
    const n = Math.min(concurrency, q.length);
    const workers = Array.from({ length: n }, async () => {
        while (q.length) {
            const item = q.shift();
            await worker(item);
        }
    });
    await Promise.all(workers);
}
async function applyLiveState(streamerId, slug, isLiveNow, viewersNow, io) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const prev = await client.query(`SELECT is_live AS "isLive", viewers
       FROM streamers
       WHERE id=$1
       FOR UPDATE`, [streamerId]);
        const wasLive = !!prev.rows?.[0]?.isLive;
        const prevViewers = Number(prev.rows?.[0]?.viewers ?? 0);
        const desiredIsLive = !!isLiveNow;
        const desiredViewers = desiredIsLive ? Number(viewersNow || 0) : 0;
        // ✅ économe: rien n'a changé => pas d'UPDATE, pas d'emit
        if (desiredIsLive === wasLive && desiredViewers === prevViewers) {
            await client.query("COMMIT");
            return;
        }
        const room = `stream:${String(slug).toLowerCase()}`;
        // OFF -> ON
        if (desiredIsLive && !wasLive) {
            await client.query(`UPDATE streamers
         SET is_live=TRUE,
             viewers=$2,
             live_started_at=NOW(),
             updated_at=NOW()
         WHERE id=$1`, [streamerId, desiredViewers]);
            // 1 live ouvert max / streamer
            await client.query(`INSERT INTO live_sessions (streamer_id, started_at)
         VALUES ($1, NOW())
         ON CONFLICT (streamer_id) WHERE ended_at IS NULL
         DO NOTHING`, [streamerId]);
            await client.query("COMMIT");
            io?.to(room).emit("stream:viewers", {
                slug: String(slug),
                isLive: true,
                viewers: desiredViewers,
            });
            // notif followers (socket + push)
            notifyFollowersGoLive(io, streamerId).catch(() => { });
            return;
        }
        // ON -> OFF
        if (!desiredIsLive && wasLive) {
            await client.query(`UPDATE streamers
         SET is_live=FALSE,
             viewers=0,
             live_started_at=NULL,
             updated_at=NOW()
         WHERE id=$1`, [streamerId]);
            await client.query(`UPDATE live_sessions
         SET ended_at=NOW()
         WHERE streamer_id=$1
           AND ended_at IS NULL`, [streamerId]);
            // ferme toutes les viewer sessions encore ouvertes
            await client.query(`UPDATE viewer_sessions
         SET ended_at = COALESCE(last_heartbeat_at, NOW())
         WHERE streamer_id=$1
           AND ended_at IS NULL`, [streamerId]);
            await client.query("COMMIT");
            io?.to(room).emit("stream:viewers", {
                slug: String(slug),
                isLive: false,
                viewers: 0,
            });
            return;
        }
        // Pas de transition (juste update)
        if (desiredIsLive) {
            await client.query(`UPDATE streamers
         SET viewers=$2, updated_at=NOW()
         WHERE id=$1`, [streamerId, desiredViewers]);
        }
        else {
            await client.query(`UPDATE streamers
         SET is_live=FALSE,
             viewers=0,
             live_started_at=NULL,
             updated_at=NOW()
         WHERE id=$1`, [streamerId]);
        }
        await client.query("COMMIT");
        io?.to(room).emit("stream:viewers", {
            slug: String(slug),
            isLive: desiredIsLive,
            viewers: desiredViewers,
        });
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
export function startDlivePoller(io) {
    if (process.env.DLIVE_POLL_DISABLED === "1") {
        console.log("[dlive] poller disabled");
        return;
    }
    let running = false;
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            // ✅ on choisit la chaîne à poll par streamer
            const { rows } = await pool.query(`SELECT
           s.id AS "streamerId",
           s.slug AS "slug",
           s.dlive_use_linked AS "useLinked",
           s.dlive_link_displayname AS "linkedDisplayname",
           s.dlive_link_username AS "linkedUsername",
           pa.id AS "providerAccountId",
           pa.channel_slug AS "providerChannelSlug"
         FROM streamers s
         LEFT JOIN provider_accounts pa
           ON pa.provider='dlive'
          AND pa.assigned_to_streamer_id = s.id
         WHERE
           (s.dlive_use_linked = TRUE AND s.dlive_link_displayname IS NOT NULL)
           OR (pa.id IS NOT NULL)`);
            await runWithConcurrency(rows, async (r) => {
                const channelSlug = (r.useLinked && r.linkedDisplayname)
                    ? r.linkedDisplayname
                    : (r.providerChannelSlug || "");
                if (!channelSlug)
                    return;
                try {
                    const info = await fetchDliveLiveInfo(channelSlug);
                    // si on poll le provider assigné → garde channel_username à jour
                    if (!r.useLinked && r.providerAccountId && info.username) {
                        await pool.query(`UPDATE provider_accounts
                 SET channel_username=$1
                 WHERE id=$2`, [info.username, r.providerAccountId]);
                    }
                    // si on poll la linked → optionnel: remettre à jour dlive_link_username si jamais null
                    if (r.useLinked && info.username && !r.linkedUsername) {
                        await pool.query(`UPDATE streamers
                 SET dlive_link_username=$2
                 WHERE id=$1`, [r.streamerId, info.username]);
                    }
                    const isLive = !!info.isLive;
                    const viewers = isLive ? Number(info.watchingCount ?? 0) : 0;
                    await applyLiveState(r.streamerId, r.slug, isLive, viewers, io);
                }
                catch (e) {
                    console.warn("[dlive] poll failed", channelSlug, e);
                }
            }, CONCURRENCY);
            console.log(`[dlive] poll tick ok (${rows.length} streamers)`);
        }
        finally {
            running = false;
        }
        // ✅ LUNA24 / LunaLive streamer virtuel (V1)
        try {
            const lunaId = await getStreamerIdBySlug(LUNA24_TARGET_SLUG);
            if (lunaId) {
                const pick = await pickLuna24TargetKeepingCurrent();
                await setLuna24LinkedTarget(pick.displayname, pick.username);
                // ✅ rename displayName selon la source
                await setLuna24DisplayName(pick.displayname);
                await applyLiveState(lunaId, LUNA24_TARGET_SLUG, pick.isLive, pick.viewers, io);
            }
            else {
                // pas encore créé
                console.warn(`[dlive] LunaLive streamer '${LUNA24_TARGET_SLUG}' introuvable (crée le compte)`);
            }
        }
        catch (e) {
            console.warn("[dlive] luna24 tick failed", e);
        }
    };
    tick().catch((e) => console.warn("[dlive] first tick failed", e));
    const id = setInterval(() => tick().catch((e) => console.warn("[dlive] tick failed", e)), INTERVAL_MS);
    id.unref?.();
}
