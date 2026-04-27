// api/src/routes/admin_rumble.ts
// Admin endpoints pour le debug / re-poll Rumble
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { fetchRumbleInfoForStreamerSlug, resolveRumbleVodFromVid } from "../rumble.js";
import { getRumbleBotSession, setRumbleBotSession, hasRumbleBotSession } from "../rumble_chat_session.js";
import { sendRumbleMessage } from "../rumble_chat_bridge.js";
import { cycleFetch } from "../rumble_http.js";

export const adminRumbleRouter = Router();

function pickSlug(req: any): string {
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

    const streamerResult = await pool.query(
      `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
    );
    const streamerId = streamerResult.rows[0]?.id;
    if (!streamerId) {
      return res.status(404).json({ ok: false, error: "streamer_not_found" });
    }

    if (info.isLive) {
      await pool.query(
        `UPDATE streamer_rumble_info
         SET hls_url = $1, video_url = $2, thumbnail_url = $3,
             is_live = true, title = $4, updated_at = NOW()
         WHERE streamer_id = $5`,
        [info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.title, streamerId]
      );
    } else {
      await pool.query(
        `UPDATE streamer_rumble_info
         SET hls_url = NULL, is_live = false, updated_at = NOW()
         WHERE streamer_id = $1`,
        [streamerId]
      );
    }

    return res.json({
      ok: true,
      slug,
      isLive: info.isLive,
      hlsUrl: info.hlsUrl,
      videoId: info.videoId,
      title: info.title,
    });
  } catch (e: any) {
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
    const cached = await pool.query(
      `SELECT ri.is_live, ri.hls_url, ri.video_url, ri.title, ri.viewers_count, ri.updated_at,
              ra.username, ra.api_key IS NOT NULL AS has_api_key
       FROM streamer_rumble_info ri
       JOIN streamers s ON s.id = ri.streamer_id
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = lower($1)
       LIMIT 1`,
      [slug]
    );

    return res.json({
      ok: true,
      slug,
      cached: cached.rows[0] ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * GET /admin/rumble/send-queue?limit=10
 * Retourne les messages en attente d'envoi (pour le relay local qui les
 * exécutera via cycletls depuis l'IP résidentielle où cookies sont valides).
 */
adminRumbleRouter.get("/admin/rumble/send-queue", requireAdminKey, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number((req.query as any)?.limit) || 10));
    const r = await pool.query(
      `SELECT id, video_id_numeric, text, attempts, created_at
       FROM rumble_send_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return res.json({ ok: true, items: r.rows });
  } catch (e: any) {
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
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
    const { ok, error } = req.body ?? {};
    if (ok === true) {
      await pool.query(
        `UPDATE rumble_send_queue
         SET status = 'done', attempted_at = NOW(), completed_at = NOW(), attempts = attempts + 1
         WHERE id = $1`,
        [id]
      );
    } else {
      // Garde en pending si <3 attempts pour retry, sinon failed
      await pool.query(
        `UPDATE rumble_send_queue
         SET attempts = attempts + 1,
             attempted_at = NOW(),
             last_error = $2,
             status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END
         WHERE id = $1`,
        [id, String(error || "send_failed").slice(0, 500)]
      );
    }
    return res.json({ ok: true });
  } catch (e: any) {
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
  } catch (e: any) {
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
    if (
      (username !== undefined && typeof username !== "string") ||
      (cookie !== undefined && typeof cookie !== "string") ||
      (userAgent !== undefined && typeof userAgent !== "string")
    ) {
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
  } catch (e: any) {
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
    const r = await pool.query(
      `SELECT s.id, s.slug, s.rumble_username AS username,
              ri.live_id, ri.is_live, ri.updated_at
       FROM streamers s
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.rumble_username IS NOT NULL
         AND s.rumble_username <> ''
         AND ra.id IS NULL`
    );
    return res.json({ ok: true, streamers: r.rows });
  } catch (e: any) {
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
    const { slug, url, videoId } = req.body ?? {};
    if (!slug || typeof slug !== "string") return res.status(400).json({ ok: false, error: "slug_required" });

    // Extrait le videoId depuis url ou utilise videoId direct
    let extracted: string | null = null;
    if (typeof videoId === "string" && videoId.trim()) {
      const v = videoId.trim();
      const m = v.match(/^(v[a-z0-9]{5,})/i);
      if (m) extracted = m[1].toLowerCase();
    } else if (typeof url === "string" && url.trim()) {
      const m = url.match(/rumble\.com\/(v[a-z0-9]{5,})/i);
      if (m) extracted = m[1].toLowerCase();
    }
    if (!extracted) {
      return res.status(400).json({ ok: false, error: "could_not_parse_video_id" });
    }

    // Récupère le streamer
    const sm = await pool.query(
      `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
    );
    const streamerId = sm.rows[0]?.id;
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    // On stocke le videoId — le poller fera la résolution embedJS au prochain tick.

    // Upsert dans streamer_rumble_info — le poller verra et complétera
    await pool.query(
      `INSERT INTO streamer_rumble_info (streamer_id, is_live, live_id, updated_at)
       VALUES ($1, true, $2, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         live_id = EXCLUDED.live_id,
         updated_at = NOW()`,
      [streamerId, extracted]
    );

    return res.json({
      ok: true,
      slug,
      streamerId: Number(streamerId),
      videoId: extracted,
      message: "videoId stocké. Le poller va valider live status et récupérer HLS au prochain tick (~30s).",
    });
  } catch (e: any) {
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
    if (!slug || typeof slug !== "string") return res.status(400).json({ ok: false, error: "slug_required" });
    if (!rumbleUsername || typeof rumbleUsername !== "string") return res.status(400).json({ ok: false, error: "rumble_username_required" });
    const cleanedUsername = rumbleUsername.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanedUsername)) {
      return res.status(400).json({ ok: false, error: "invalid_username_format" });
    }

    const setPlatform = setPlatformRumble !== false; // défaut true
    const r = await pool.query(
      setPlatform
        ? `UPDATE streamers SET rumble_username=$2, platform='rumble' WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`
        : `UPDATE streamers SET rumble_username=$2 WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`,
      [slug, cleanedUsername]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    return res.json({ ok: true, streamer: r.rows[0] });
  } catch (e: any) {
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
    if (!slug || typeof slug !== "string") return res.status(400).json({ ok: false, error: "slug_required" });
    const r = await pool.query(
      revertToDlive
        ? `UPDATE streamers SET rumble_username=NULL, platform='dlive' WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`
        : `UPDATE streamers SET rumble_username=NULL WHERE lower(slug)=lower($1)
           RETURNING id, slug, platform, rumble_username`,
      [slug]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    return res.json({ ok: true, streamer: r.rows[0] });
  } catch (e: any) {
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
    const sm = await pool.query(
      `SELECT s.id, ra.username
       FROM streamers s
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = lower($1) LIMIT 1`,
      [slug]
    );
    const streamerRow = sm.rows[0];
    if (!streamerRow) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const streamerId = Number(streamerRow.id);
    const username = streamerRow.username ? String(streamerRow.username) : null;
    if (!username) return res.status(400).json({ ok: false, error: "no_rumble_username" });

    const session = await getRumbleBotSession();

    // Scrape via cycletls pour passer Cloudflare. Tente /c/{username} puis /user/{username}
    let html = "";
    let used = "";
    for (const path of [`/c/${encodeURIComponent(username)}`, `/user/${encodeURIComponent(username)}`]) {
      const r = await cycleFetch(`https://rumble.com${path}`, {
        method: "get",
        userAgent: session.userAgent || undefined,
        cookie: session.cookie || undefined,
        headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
          "accept-language": "fr-FR,fr;q=0.9",
          "referer": "https://rumble.com/",
        },
      });
      if (r.status >= 200 && r.status < 300 && r.body) {
        html = r.body;
        used = path;
        break;
      }
    }
    if (!html) return res.status(502).json({ ok: false, error: "scrape_failed" });

    // Extraire les couples (slug, vid) depuis les liens VODs publics.
    // Pattern HTML Rumble: <a class="videostream__link" href="/v76pubk-mon-titre.html">...</a>
    const slugMatches = Array.from(html.matchAll(/href=["'](\/v[a-z0-9]{5,}-[^"']+\.html)["']/gi));
    const titleMap = new Map<string, string>();
    for (const m of slugMatches) {
      const path = m[1];
      const vidMatch = path.match(/^\/v([a-z0-9]{5,})-/i);
      if (!vidMatch) continue;
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
      const exists = await pool.query(
        `SELECT 1 FROM rumble_vods WHERE streamer_id = $1 AND video_id = $2 LIMIT 1`,
        [streamerId, vid]
      );
      if (exists.rows[0]) continue;

      const { mp4Url, hlsUrl } = await resolveRumbleVodFromVid(vid).catch(() => ({ mp4Url: null, hlsUrl: null }));
      if (mp4Url) resolved++;

      await pool.query(
        `INSERT INTO rumble_vods (streamer_id, video_id, title, vod_mp4_url, vod_hls_url, vod_resolved_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, ${mp4Url ? "NOW()" : "NULL"}, NOW())
         ON CONFLICT (streamer_id, video_id) DO NOTHING`,
        [streamerId, vid, titleApprox, mp4Url, hlsUrl]
      ).catch((e) => console.warn("[backfill-vods] insert error", e?.message || e));

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
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * POST /admin/rumble/send-test
 * Body: { videoIdNumeric: string, text?: string }
 * Envoie un message de test dans un chat Rumble via le bot. Utile pour valider
 * le pipeline cycletls + cookies sans attendre qu'un live LunaLive démarre.
 */
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
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});
