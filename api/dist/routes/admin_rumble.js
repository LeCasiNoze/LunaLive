// api/src/routes/admin_rumble.ts
// Admin endpoints pour le debug / re-poll Rumble
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { fetchRumbleInfoForStreamerSlug, resolveRumbleVodFromVid } from "../rumble.js";
import { getRumbleBotSession, setRumbleBotSession, hasRumbleBotSession } from "../rumble_chat_session.js";
import { sendRumbleMessage } from "../rumble_chat_bridge.js";
export const adminRumbleRouter = Router();
function pickSlug(req) {
    const raw = (req.query?.slug ?? req.body?.slug ?? "").toString().trim();
    return raw || "lecasinoze";
}
/**
 * POST /admin/rumble/repoll?slug=xxx
 * Force un re-poll immédiat de l'état Rumble d'un streamer et met à jour la DB.
 */
adminRumbleRouter.post("/admin/rumble/repoll", requireAdminKey, async (req, res) => {
    try {
        const slug = pickSlug(req);
        const info = await fetchRumbleInfoForStreamerSlug(slug);
        const streamerResult = await pool.query(`SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`, [slug]);
        const streamerId = streamerResult.rows[0]?.id;
        if (!streamerId) {
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        }
        if (info.isLive) {
            await pool.query(`UPDATE streamer_rumble_info
         SET hls_url = $1, video_url = $2, thumbnail_url = $3,
             is_live = true, title = $4, updated_at = NOW()
         WHERE streamer_id = $5`, [info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.title, streamerId]);
        }
        else {
            await pool.query(`UPDATE streamer_rumble_info
         SET hls_url = NULL, is_live = false, updated_at = NOW()
         WHERE streamer_id = $1`, [streamerId]);
        }
        return res.json({
            ok: true,
            slug,
            isLive: info.isLive,
            hlsUrl: info.hlsUrl,
            videoId: info.videoId,
            title: info.title,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/status?slug=xxx
 * Retourne le dernier état Rumble en DB pour un streamer.
 */
adminRumbleRouter.get("/admin/rumble/status", requireAdminKey, async (req, res) => {
    try {
        const slug = pickSlug(req);
        const cached = await pool.query(`SELECT ri.is_live, ri.hls_url, ri.video_url, ri.title, ri.viewers_count, ri.updated_at,
              ra.username, ra.api_key IS NOT NULL AS has_api_key
       FROM streamer_rumble_info ri
       JOIN streamers s ON s.id = ri.streamer_id
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = lower($1)
       LIMIT 1`, [slug]);
        return res.json({
            ok: true,
            slug,
            cached: cached.rows[0] ?? null,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/send-queue?limit=10
 * Retourne les messages en attente d'envoi (pour le relay local qui les
 * exécutera depuis l'IP résidentielle où cookies sont valides).
 */
adminRumbleRouter.get("/admin/rumble/send-queue", requireAdminKey, async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(50, Number(req.query?.limit) || 10));
        const r = await pool.query(`SELECT id, video_id_numeric, text, attempts, created_at
       FROM rumble_send_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`, [limit]);
        return res.json({ ok: true, items: r.rows });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/send-queue/:id/result
 * Body: { ok: boolean, error?: string }
 * Marque un message comme done ou failed.
 */
adminRumbleRouter.post("/admin/rumble/send-queue/:id/result", requireAdminKey, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "bad_id" });
        const { ok, error } = req.body ?? {};
        if (ok === true) {
            await pool.query(`UPDATE rumble_send_queue
         SET status = 'done', attempted_at = NOW(), completed_at = NOW(), attempts = attempts + 1
         WHERE id = $1`, [id]);
        }
        else {
            // Garde en pending si <3 attempts pour retry, sinon failed
            await pool.query(`UPDATE rumble_send_queue
         SET attempts = attempts + 1,
             attempted_at = NOW(),
             last_error = $2,
             status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END
         WHERE id = $1`, [id, String(error || "send_failed").slice(0, 500)]);
        }
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/bot
 * Inspecte la session bot Rumble (sans révéler le cookie).
 */
adminRumbleRouter.get("/admin/rumble/bot", requireAdminKey, async (_req, res) => {
    try {
        const s = await getRumbleBotSession(true);
        return res.json({
            ok: true,
            username: s.username,
            hasCookie: hasRumbleBotSession(s),
            cookieLength: s.cookie?.length ?? 0,
            userAgent: s.userAgent,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/bot
 * Body: { username?, cookie?, userAgent? }
 * Met à jour la session du bot Rumble (singleton). Le cookie est l'entête `Cookie`
 * complet capturé depuis les DevTools (Network → request headers d'une requête
 * authentifiée sur rumble.com après login).
 */
adminRumbleRouter.post("/admin/rumble/bot", requireAdminKey, async (req, res) => {
    try {
        const { username, cookie, userAgent } = req.body ?? {};
        if ((username !== undefined && typeof username !== "string") ||
            (cookie !== undefined && typeof cookie !== "string") ||
            (userAgent !== undefined && typeof userAgent !== "string")) {
            return res.status(400).json({ ok: false, error: "bad_payload" });
        }
        await setRumbleBotSession({
            username: username ?? null,
            cookie: cookie ?? null,
            userAgent: userAgent ?? null,
        });
        const s = await getRumbleBotSession(true);
        return res.json({
            ok: true,
            username: s.username,
            hasCookie: hasRumbleBotSession(s),
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/list-pseudo-only
 * Liste les streamers qui ont un rumble_username (sans api_key) pour
 * que le relay local sache lesquels scraper.
 */
adminRumbleRouter.get("/admin/rumble/list-pseudo-only", requireAdminKey, async (_req, res) => {
    try {
        const r = await pool.query(`SELECT s.id, s.slug, s.rumble_username AS username,
              ri.live_id, ri.is_live, ri.updated_at
       FROM streamers s
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.rumble_username IS NOT NULL
         AND s.rumble_username <> ''
         AND ra.id IS NULL`);
        return res.json({ ok: true, streamers: r.rows });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/list-all
 * Liste TOUS les streamers Rumble (pseudo-only + api_key), utilisé par le
 * relay pour les tâches qui doivent tourner sur tout le monde (VOD discovery,
 * follower count). Le username vient de rumble_username sinon rumble_accounts.username.
 */
adminRumbleRouter.get("/admin/rumble/list-all", requireAdminKey, async (_req, res) => {
    try {
        const r = await pool.query(`SELECT s.id, s.slug,
              COALESCE(s.rumble_username, ra.username) AS username,
              CASE WHEN ra.id IS NOT NULL THEN 'api_key' ELSE 'pseudo' END AS source
       FROM streamers s
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE (s.rumble_username IS NOT NULL AND s.rumble_username <> '')
          OR ra.id IS NOT NULL`);
        return res.json({ ok: true, streamers: r.rows });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/set-live
 * Body: { slug: string, url?: string, videoId?: string }
 * Configure manuellement le videoId courant d'un streamer Rumble (pour les
 * streamers en pseudo-only, quand le scrape auto échoue à cause de CF).
 *
 * Accepte:
 *   - une URL complète https://rumble.com/v7923dm-titre.html
 *   - juste le slug court v7923dm
 *
 * Le poller utilisera ce videoId à son prochain tick et appellera embedJS
 * pour récupérer HLS, titre, viewers, etc. Quand embedJS retournera live=0
 * (ou si tu paste un URL d'un live fini), le streamer passera en offline.
 */
adminRumbleRouter.post("/admin/rumble/set-live", requireAdminKey, async (req, res) => {
    try {
        const { slug, url, videoId, viewers } = req.body ?? {};
        if (!slug || typeof slug !== "string")
            return res.status(400).json({ ok: false, error: "slug_required" });
        // Extrait le videoId depuis url ou utilise videoId direct
        let extracted = null;
        if (typeof videoId === "string" && videoId.trim()) {
            const v = videoId.trim();
            const m = v.match(/^(v[a-z0-9]{5,})/i);
            if (m)
                extracted = m[1].toLowerCase();
        }
        else if (typeof url === "string" && url.trim()) {
            const m = url.match(/rumble\.com\/(v[a-z0-9]{5,})/i);
            if (m)
                extracted = m[1].toLowerCase();
        }
        if (!extracted) {
            return res.status(400).json({ ok: false, error: "could_not_parse_video_id" });
        }
        // Récupère le streamer
        const sm = await pool.query(`SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`, [slug]);
        const streamerId = sm.rows[0]?.id;
        if (!streamerId)
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        // On stocke le videoId — le poller fera la résolution embedJS au prochain tick.
        // Upsert dans streamer_rumble_info — le poller verra et complétera
        const viewersNum = (typeof viewers === "number" && Number.isFinite(viewers) && viewers >= 0) ? Math.floor(viewers) : null;
        await pool.query(`INSERT INTO streamer_rumble_info (streamer_id, is_live, live_id, viewers_count, updated_at)
       VALUES ($1, true, $2, $3, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         live_id = EXCLUDED.live_id,
         viewers_count = COALESCE(EXCLUDED.viewers_count, streamer_rumble_info.viewers_count),
         updated_at = NOW()`, [streamerId, extracted, viewersNum]);
        if (viewersNum != null) {
            // Aussi mettre à jour streamers.viewers (utilisé par /lives)
            await pool.query(`UPDATE streamers SET viewers = $1, updated_at = NOW() WHERE id = $2`, [viewersNum, streamerId]).catch(() => { });
        }
        return res.json({
            ok: true,
            slug,
            streamerId: Number(streamerId),
            videoId: extracted,
            message: "videoId stocké. Le poller va valider live status et récupérer HLS au prochain tick (~30s).",
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/link
 * Body: { slug: string, rumbleUsername: string, setPlatformRumble?: boolean }
 * Lie un streamer Luna à un pseudo Rumble (sans api_key). Le poller
 * commencera à scraper sa page pour détecter ses lives.
 */
adminRumbleRouter.post("/admin/rumble/link", requireAdminKey, async (req, res) => {
    try {
        const { slug, rumbleUsername, setPlatformRumble } = req.body ?? {};
        if (!slug || typeof slug !== "string")
            return res.status(400).json({ ok: false, error: "slug_required" });
        if (!rumbleUsername || typeof rumbleUsername !== "string")
            return res.status(400).json({ ok: false, error: "rumble_username_required" });
        const cleanedUsername = rumbleUsername.trim();
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanedUsername)) {
            return res.status(400).json({ ok: false, error: "invalid_username_format" });
        }
        const setPlatform = setPlatformRumble !== false; // défaut true
        const r = await pool.query(setPlatform
            ? `UPDATE streamers SET rumble_username=$2, platform='rumble' WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`
            : `UPDATE streamers SET rumble_username=$2 WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`, [slug, cleanedUsername]);
        if (!r.rows[0])
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        return res.json({ ok: true, streamer: r.rows[0] });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/unlink
 * Body: { slug: string, revertToDlive?: boolean }
 * Retire le rumble_username d'un streamer.
 */
adminRumbleRouter.post("/admin/rumble/unlink", requireAdminKey, async (req, res) => {
    try {
        const { slug, revertToDlive } = req.body ?? {};
        if (!slug || typeof slug !== "string")
            return res.status(400).json({ ok: false, error: "slug_required" });
        const r = await pool.query(revertToDlive
            ? `UPDATE streamers SET rumble_username=NULL, platform='dlive' WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`
            : `UPDATE streamers SET rumble_username=NULL WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`, [slug]);
        if (!r.rows[0])
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        return res.json({ ok: true, streamer: r.rows[0] });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/backfill-vods?slug=lecasinoze
 * Scrape la page Rumble du compte assigné au streamer et insère les VODs
 * trouvés dans rumble_vods. Résout l'URL MP4 permanente via embedJS pour chacun.
 * Idempotent (UNIQUE INDEX (streamer_id, video_id) → ON CONFLICT DO NOTHING).
 */
adminRumbleRouter.post("/admin/rumble/backfill-vods", requireAdminKey, async (req, res) => {
    try {
        const slug = pickSlug(req);
        const sm = await pool.query(`SELECT s.id, ra.username
       FROM streamers s
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = lower($1) LIMIT 1`, [slug]);
        const streamerRow = sm.rows[0];
        if (!streamerRow)
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        const streamerId = Number(streamerRow.id);
        const username = streamerRow.username ? String(streamerRow.username) : null;
        if (!username)
            return res.status(400).json({ ok: false, error: "no_rumble_username" });
        const session = await getRumbleBotSession();
        // Scrape direct (Cloudflare bloque souvent les IP Render).
        let html = "";
        let used = "";
        const headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
            "accept-language": "fr-FR,fr;q=0.9",
            "referer": "https://rumble.com/",
            "user-agent": session.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        };
        if (session.cookie)
            headers["cookie"] = session.cookie;
        for (const path of [`/c/${encodeURIComponent(username)}`, `/user/${encodeURIComponent(username)}`]) {
            try {
                const r = await fetch(`https://rumble.com${path}`, { method: "GET", headers });
                if (r.status >= 200 && r.status < 300) {
                    html = await r.text();
                    used = path;
                    break;
                }
            }
            catch { }
        }
        if (!html)
            return res.status(502).json({ ok: false, error: "scrape_failed" });
        // Extraire les couples (slug, vid) depuis les liens VODs publics.
        // Pattern HTML Rumble: <a class="videostream__link" href="/v76pubk-mon-titre.html">...</a>
        const slugMatches = Array.from(html.matchAll(/href=["'](\/v[a-z0-9]{5,}-[^"']+\.html)["']/gi));
        const titleMap = new Map();
        for (const m of slugMatches) {
            const path = m[1];
            const vidMatch = path.match(/^\/v([a-z0-9]{5,})-/i);
            if (!vidMatch)
                continue;
            const vid = `v${vidMatch[1].toLowerCase()}`;
            if (!titleMap.has(vid)) {
                // Décoder le titre approximatif depuis le slug
                const titleSlug = path.replace(/^\/v[a-z0-9]+-/i, "").replace(/\.html$/i, "").replace(/-/g, " ");
                titleMap.set(vid, titleSlug);
            }
        }
        const found = Array.from(titleMap.entries());
        let inserted = 0;
        let resolved = 0;
        // On limite à 30 pour pas exploser embedJS
        const subset = found.slice(0, 30);
        for (const [vid, titleApprox] of subset) {
            // Vérifie si déjà en DB
            const exists = await pool.query(`SELECT 1 FROM rumble_vods WHERE streamer_id = $1 AND video_id = $2 LIMIT 1`, [streamerId, vid]);
            if (exists.rows[0])
                continue;
            const { mp4Url, hlsUrl } = await resolveRumbleVodFromVid(vid).catch(() => ({ mp4Url: null, hlsUrl: null }));
            if (mp4Url)
                resolved++;
            await pool.query(`INSERT INTO rumble_vods (streamer_id, video_id, title, vod_mp4_url, vod_hls_url, vod_resolved_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, ${mp4Url ? "NOW()" : "NULL"}, NOW())
         ON CONFLICT (streamer_id, video_id) DO NOTHING`, [streamerId, vid, titleApprox, mp4Url, hlsUrl]).catch((e) => console.warn("[backfill-vods] insert error", e?.message || e));
            inserted++;
            // petit délai pour pas spammer Rumble
            await new Promise(r => setTimeout(r, 300));
        }
        return res.json({
            ok: true,
            slug,
            sourcePath: used,
            foundOnPage: found.length,
            processed: subset.length,
            inserted,
            resolvedMp4: resolved,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/send-test
 * Body: { videoIdNumeric: string, text?: string }
 * Envoie un message de test dans un chat Rumble via le bot. Utile pour valider
 * le pipeline cookies sans attendre qu'un live LunaLive démarre.
 */
/**
 * POST /admin/rumble/ingest-vods
 * Body: { slug: string, items: RelayVodItem[] }
 * Le relay scrape /user/{name} et envoie la liste des cartes VODs publiques.
 * On insère dans rumble_vods (ON CONFLICT DO NOTHING) et on lance la résolution
 * MP4 en background (one-shot) pour les nouvelles entrées.
 */
adminRumbleRouter.post("/admin/rumble/ingest-vods", requireAdminKey, async (req, res) => {
    try {
        const slug = String(req.body?.slug || "").trim().toLowerCase();
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!slug)
            return res.status(400).json({ ok: false, error: "slug_required" });
        const sm = await pool.query(`SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`, [slug]);
        const streamerId = Number(sm.rows[0]?.id || 0);
        if (!streamerId)
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        let inserted = 0;
        let resolveScheduled = 0;
        for (const it of items.slice(0, 60)) {
            const vid = String(it.videoId || "").trim().toLowerCase();
            if (!/^v[a-z0-9]{5,}$/.test(vid))
                continue;
            const vidNumeric = it.videoIdNumeric ? String(it.videoIdNumeric) : null;
            const title = it.title ? String(it.title).slice(0, 500) : null;
            const thumb = it.thumbnailUrl ? String(it.thumbnailUrl).slice(0, 1000) : null;
            const startedAt = it.startedAt ? String(it.startedAt) : null;
            const durationSec = (typeof it.durationSec === "number" && Number.isFinite(it.durationSec) && it.durationSec >= 0)
                ? Math.floor(it.durationSec) : null;
            // Insert idempotent. Si nouveau, on récupère l'id pour scheduler la résolution.
            const ins = await pool.query(`INSERT INTO rumble_vods (streamer_id, video_id, video_id_numeric, title, thumbnail_url, started_at, ended_at, duration_sec)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($6, NOW()), $7)
         ON CONFLICT (streamer_id, video_id) DO UPDATE
           SET title = COALESCE(rumble_vods.title, EXCLUDED.title),
               thumbnail_url = COALESCE(rumble_vods.thumbnail_url, EXCLUDED.thumbnail_url),
               video_id_numeric = COALESCE(rumble_vods.video_id_numeric, EXCLUDED.video_id_numeric),
               duration_sec = COALESCE(rumble_vods.duration_sec, EXCLUDED.duration_sec)
         RETURNING (xmax = 0) AS is_new, vod_mp4_url`, [streamerId, vid, vidNumeric, title, thumb, startedAt, durationSec]).catch((e) => {
                console.warn("[ingest-vods] insert error", e?.message || e);
                return { rows: [] };
            });
            const isNew = !!ins.rows[0]?.is_new;
            const alreadyResolved = !!ins.rows[0]?.vod_mp4_url;
            if (isNew)
                inserted++;
            // Si pas encore résolu, tente une résolution one-shot en background
            if (!alreadyResolved) {
                resolveScheduled++;
                (async () => {
                    try {
                        const { mp4Url, hlsUrl } = await resolveRumbleVodFromVid(vid);
                        if (mp4Url) {
                            await pool.query(`UPDATE rumble_vods SET vod_mp4_url=$3, vod_hls_url=$4, vod_resolved_at=NOW()
                 WHERE streamer_id=$1 AND video_id=$2`, [streamerId, vid, mp4Url, hlsUrl]);
                            console.log(`[ingest-vods] resolved ${slug}/${vid} → mp4`);
                        }
                    }
                    catch (e) {
                        // VOD pas encore prête (live qui vient juste de se terminer) — sera retry au prochain ingest
                    }
                })();
            }
        }
        return res.json({ ok: true, slug, streamerId, totalReceived: items.length, inserted, resolveScheduled });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * POST /admin/rumble/announce-follows
 * Body: { slug: string, followers: number }
 * Le relay scrape la page Rumble du streamer et envoie son nombre de followers.
 * On compare au stocké, calcule le delta, et si delta > 0 et stream live :
 *  - envoie un message bot dans le chat Rumble ("+N follow GG !")
 *  - injecte le même message dans le chat Luna (broadcast socket)
 * Met à jour le compteur en DB pour le tick suivant.
 */
adminRumbleRouter.post("/admin/rumble/announce-follows", requireAdminKey, async (req, res) => {
    try {
        const slug = String(req.body?.slug || "").trim().toLowerCase();
        const followers = Number(req.body?.followers);
        if (!slug || !Number.isFinite(followers) || followers < 0) {
            return res.status(400).json({ ok: false, error: "slug_and_followers_required" });
        }
        const sm = await pool.query(`SELECT s.id AS streamer_id, s.slug, ri.followers_count, ri.is_live, ri.live_video_id_numeric
       FROM streamers s
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE lower(s.slug) = lower($1) LIMIT 1`, [slug]);
        const row = sm.rows[0];
        if (!row)
            return res.status(404).json({ ok: false, error: "streamer_not_found" });
        const streamerId = Number(row.streamer_id);
        const previous = row.followers_count != null ? Number(row.followers_count) : null;
        const delta = previous != null ? followers - previous : 0;
        const isLive = !!row.is_live;
        const vid = row.live_video_id_numeric ? String(row.live_video_id_numeric) : null;
        // Persiste le nouveau count
        await pool.query(`UPDATE streamer_rumble_info
       SET followers_count = $1, followers_updated_at = NOW(), updated_at = NOW()
       WHERE streamer_id = $2`, [Math.floor(followers), streamerId]);
        // Annonce uniquement si delta > 0 et stream live (sinon spam offline)
        let announced = false;
        if (previous != null && delta > 0 && isLive) {
            const text = delta === 1
                ? `💚 +1 follow GG !`
                : `💚 +${delta} follows GG !`;
            // Envoi sur Rumble
            if (vid) {
                sendRumbleMessage(vid, text).catch((e) => console.warn("[announce-follows] sendRumble error", e?.message || e));
            }
            // Injection dans Luna chat (en tant que LunaBot)
            try {
                const botUsername = String(process.env.BOT_USERNAME || "LunaBot").trim();
                const botUserRes = await pool.query(`SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`, [botUsername]);
                const botUserId = Number(botUserRes.rows?.[0]?.id || 0);
                if (botUserId) {
                    const ins = await pool.query(`INSERT INTO chat_messages (streamer_id, user_id, username, body, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id, created_at AS "createdAt"`, [streamerId, botUserId, botUsername, text]);
                    const msgRow = ins.rows?.[0];
                    const io = req.app.locals.io;
                    if (io && msgRow) {
                        const payload = {
                            id: Number(msgRow.id),
                            userId: botUserId,
                            username: botUsername,
                            body: text,
                            createdAt: new Date(msgRow.createdAt).toISOString(),
                            cosmetics: null,
                            isBot: true,
                        };
                        io.to(`chat:${row.slug}:public`).emit("chat:message", payload);
                        io.to(`chat:${row.slug}:popup`).emit("chat:message", payload);
                    }
                }
            }
            catch (e) {
                console.warn("[announce-follows] inject Luna error", e?.message || e);
            }
            announced = true;
        }
        return res.json({
            ok: true,
            slug,
            streamerId,
            previous,
            current: Math.floor(followers),
            delta,
            isLive,
            announced,
        });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
/**
 * GET /admin/rumble/probe?vid=XXX&user=YYY
 * Sonde exhaustive depuis Render des endpoints Rumble pour découvrir
 * ce qui est accessible (slug discovery, viewer info, chat init...).
 * Tente d'abord avec session bot, puis en anonyme.
 */
adminRumbleRouter.get("/admin/rumble/probe", requireAdminKey, async (req, res) => {
    const VID = String(req.query.vid || "434889858");
    const USER = String(req.query.user || "fabiozsis");
    const session = await getRumbleBotSession();
    const cookie = (() => {
        if (!hasRumbleBotSession(session))
            return "";
        return String(session.cookie || "")
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s && !/^cf_clearance=/i.test(s) && !/^__cf_bm=/i.test(s))
            .join("; ");
    })();
    const ua = session?.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const results = [];
    async function probe(label, url, opts = {}) {
        const headers = {
            "user-agent": ua,
            accept: opts.accept || "*/*",
            "accept-language": "en-US,en;q=0.9",
            referer: opts.referer || "https://rumble.com/",
            ...(opts.headers || {}),
        };
        if (opts.auth !== false && cookie)
            headers.cookie = cookie;
        let status = -1, server = "", cf = "", bodyLen = 0, snippet = "", err = "";
        try {
            const r = await fetch(url, { method: opts.method || "GET", headers, body: opts.body, redirect: "manual" });
            status = r.status;
            server = r.headers.get("server") || "";
            cf = r.headers.get("cf-ray") || r.headers.get("cf-mitigated") || "";
            const text = await r.text();
            bodyLen = text.length;
            snippet = text.slice(0, 400).replace(/\s+/g, " ").replace(/cf_clearance=[^;\s]+/g, "[cf]").replace(/u_s=[^;\s]+/g, "[us]");
        }
        catch (e) {
            err = e?.message || String(e);
        }
        results.push({ label, url, status, server, cf, bodyLen, snippet, err });
    }
    // A. Slug / live discovery alternatives
    await probe("page:user/{name}/live", `https://rumble.com/user/${USER}/live`);
    await probe("page:c/{name}/livestreams", `https://rumble.com/c/${USER}/livestreams`);
    await probe("page:user/{name}", `https://rumble.com/user/${USER}`);
    await probe("page:home", `https://rumble.com/`);
    await probe("page:browse/live", `https://rumble.com/browse/live`);
    await probe("page:search", `https://rumble.com/search/all?q=${USER}`);
    // B. JSON / RPC
    await probe("svc:user.is_live", `https://rumble.com/service.php?name=user.is_live&user=${USER}`, { headers: { accept: "application/json" } });
    await probe("svc:user.subscribed", `https://rumble.com/service.php?name=user.subscribed`, { headers: { accept: "application/json" } });
    await probe("embedJS:u3", `https://rumble.com/embedJS/u3/?v=${VID}`, { headers: { accept: "application/json" } });
    // C. Chat init / viewer info
    await probe("chat:init", `https://web7.rumble.com/chat/api/chat/${VID}/init`, { headers: { accept: "application/json" } });
    await probe("chat:info", `https://web7.rumble.com/chat/api/chat/${VID}/info`, { headers: { accept: "application/json" } });
    await probe("chat:users", `https://web7.rumble.com/chat/api/chat/${VID}/users`, { headers: { accept: "application/json" } });
    await probe("chat:viewers", `https://web7.rumble.com/chat/api/chat/${VID}/viewers`, { headers: { accept: "application/json" } });
    // D. Live state / viewer count
    await probe("page:v{vid}.html", `https://rumble.com/v${VID}.html`);
    await probe("api:Live.Watching", `https://rumble.com/api/Live.Watching?video_id=${VID}`, { headers: { accept: "application/json" } });
    await probe("api:Live.Watching alt", `https://rumble.com/-/api/Live.Watching?video_id=${VID}`, { headers: { accept: "application/json" } });
    // E. Account
    await probe("page:account", `https://rumble.com/account`);
    await probe("api:User.GetMe", `https://rumble.com/api/User.GetMe`, { headers: { accept: "application/json" } });
    await probe("api:user/get-me", `https://rumble.com/account/api/user`, { headers: { accept: "application/json" } });
    // F. Anonymous baselines
    await probe("ANON:user/{name}/live", `https://rumble.com/user/${USER}/live`, { auth: false });
    await probe("ANON:embedJS", `https://rumble.com/embedJS/u3/?v=${VID}`, { auth: false, headers: { accept: "application/json" } });
    await probe("ANON:chat/init", `https://web7.rumble.com/chat/api/chat/${VID}/init`, { auth: false, headers: { accept: "application/json" } });
    // G. Viewer count / live stats hunt
    await probe("ws-init via web7", `https://web7.rumble.com/chat/api/chat/${VID}/livestreams`, { headers: { accept: "application/json" } });
    await probe("ws-init via rumble", `https://rumble.com/-/livestream/${VID}/data`, { headers: { accept: "application/json" } });
    await probe("api:livestream-status", `https://rumble.com/api/v0/livestream/${VID}`, { headers: { accept: "application/json" } });
    await probe("api:Streamlist.Get", `https://rumble.com/-/api/Streamlist.Get?vid=${VID}`, { headers: { accept: "application/json" } });
    await probe("embedJS:api", `https://rumble.com/embedJS/u3/api/?v=${VID}`, { headers: { accept: "application/json" } });
    await probe("api:live.popout", `https://rumble.com/-/api/live/popout?id=${VID}`, { headers: { accept: "application/json" } });
    await probe("watch.json", `https://rumble.com/watch/${VID}.json`, { headers: { accept: "application/json" } });
    await probe("v{vid}.json", `https://rumble.com/v${VID}.json`, { headers: { accept: "application/json" } });
    await probe("media-views", `https://rumble.com/-/api/media-views?id=${VID}`, { headers: { accept: "application/json" } });
    // H. Mod actions enumeration (only HEAD/OPTIONS to avoid side-effects)
    await probe("mod:delete OPTIONS", `https://web7.rumble.com/chat/api/chat/${VID}/delete`, { method: "OPTIONS" });
    await probe("mod:moderate OPTIONS", `https://web7.rumble.com/chat/api/chat/${VID}/moderate`, { method: "OPTIONS" });
    await probe("mod:mute OPTIONS", `https://web7.rumble.com/chat/api/chat/${VID}/mute`, { method: "OPTIONS" });
    await probe("mod:ban OPTIONS", `https://web7.rumble.com/chat/api/chat/${VID}/ban`, { method: "OPTIONS" });
    return res.json({ vid: VID, user: USER, hasCookie: !!cookie, cookieLen: cookie.length, results });
});
/**
 * GET /admin/rumble/probe-sse?vid=XXX
 * Capture le premier event "init" du SSE chat et retourne sa structure (clés top-level
 * + tailles + échantillons) sans cookies. Permet de voir ce que Rumble expose
 * (users, messages, config, viewers...) au moment de la connexion chat.
 */
adminRumbleRouter.get("/admin/rumble/probe-sse", requireAdminKey, async (req, res) => {
    const VID = String(req.query.vid || "434889858");
    const session = await getRumbleBotSession();
    if (!hasRumbleBotSession(session)) {
        return res.status(503).json({ ok: false, error: "no_bot_session" });
    }
    const cookie = String(session.cookie || "")
        .split(";").map((s) => s.trim())
        .filter((s) => s && !/^cf_clearance=/i.test(s) && !/^__cf_bm=/i.test(s))
        .join("; ");
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);
    try {
        const r = await fetch(`https://web7.rumble.com/chat/api/chat/${encodeURIComponent(VID)}/stream`, {
            method: "GET",
            signal: ac.signal,
            headers: {
                "user-agent": session.userAgent || "Mozilla/5.0",
                "cookie": cookie,
                "accept": "text/event-stream",
                "accept-language": "en-US,en;q=0.9",
                "referer": `https://rumble.com/v${VID}.html`,
            },
        });
        if (!r.ok || !r.body) {
            clearTimeout(timeout);
            return res.json({ ok: false, status: r.status, server: r.headers.get("server") });
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let initEvent = null;
        const allEventTypes = [];
        const startedAt = Date.now();
        while (Date.now() - startedAt < 7000) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buf += dec.decode(value, { stream: true });
            // Parse SSE: events séparés par \n\n
            let idx;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
                const block = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
                if (!dataLine)
                    continue;
                try {
                    const env = JSON.parse(dataLine.slice(5).trim());
                    if (env?.type)
                        allEventTypes.push(env.type);
                    if (env?.type === "init" && !initEvent) {
                        initEvent = env;
                    }
                }
                catch { }
            }
            if (initEvent)
                break;
        }
        ac.abort();
        clearTimeout(timeout);
        if (!initEvent) {
            return res.json({ ok: false, error: "no_init_event", eventTypes: allEventTypes });
        }
        // Décrire la structure de data sans dump complet
        function describe(obj, depth = 0) {
            if (obj === null || typeof obj !== "object")
                return typeof obj;
            if (Array.isArray(obj)) {
                return {
                    _array: true,
                    length: obj.length,
                    sample: obj.length > 0 ? describe(obj[0], depth + 1) : null,
                };
            }
            if (depth > 3)
                return "(deep)";
            const out = {};
            for (const k of Object.keys(obj)) {
                out[k] = describe(obj[k], depth + 1);
            }
            return out;
        }
        const data = initEvent.data || {};
        return res.json({
            ok: true,
            requestId: initEvent.request_id || null,
            topKeys: Object.keys(initEvent),
            dataKeys: Object.keys(data),
            structure: describe(data),
            counts: {
                users: Array.isArray(data.users) ? data.users.length : null,
                messages: Array.isArray(data.messages) ? data.messages.length : null,
                rants: Array.isArray(data.rants) ? data.rants.length : null,
                channels: Array.isArray(data.channels) ? data.channels.length : null,
            },
            configSample: data.config ? Object.keys(data.config) : null,
            sampleUser: Array.isArray(data.users) && data.users[0] ? Object.keys(data.users[0]) : null,
            sampleMessage: Array.isArray(data.messages) && data.messages[0] ? Object.keys(data.messages[0]) : null,
            eventTypesObserved: allEventTypes,
        });
    }
    catch (e) {
        clearTimeout(timeout);
        return res.json({ ok: false, error: e?.message || String(e) });
    }
});
adminRumbleRouter.post("/admin/rumble/send-test", requireAdminKey, async (req, res) => {
    try {
        const { videoIdNumeric, text } = req.body ?? {};
        if (!videoIdNumeric || typeof videoIdNumeric !== "string") {
            return res.status(400).json({ ok: false, error: "videoIdNumeric_required" });
        }
        const body = (typeof text === "string" && text.trim()) ? text : "test LunaLive_Bot";
        const result = await sendRumbleMessage(String(videoIdNumeric), body);
        if (!result) {
            return res.status(502).json({ ok: false, error: "send_failed" });
        }
        return res.json({ ok: true, sentId: result.id, userId: result.userId });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
