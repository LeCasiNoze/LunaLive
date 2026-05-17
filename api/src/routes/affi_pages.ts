import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";

export const publicAffiPagesRouter = Router();
export const fsbAffiPagesRouter = Router();
fsbAffiPagesRouter.use("/fsb/affi-pages", requireAuth, requireFsbAccess);

// Hash IP avec un salt côté serveur pour dédoublonnage anonyme RGPD-friendly.
const IP_SALT = process.env.AFFI_EVENTS_IP_SALT || "lunalive-affi-events-v1";
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(IP_SALT + ip).digest("hex").slice(0, 32);
}
function clientIp(req: any): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || "unknown";
}

const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }, z.string().max(max).nullable());

// V1 = string flat config | V2 = arbre de blocs (objets imbriqués).
// On accepte les deux via z.record(any) — la validation profonde est faite
// côté front-end via les types V2*.
const configSchema = z.record(z.string(), z.any()).default({});

const pageInputSchema = z.object({
  slug: optionalTrimmedString(160).optional().default(null),
  model: z.coerce.number().int().min(1).max(20),
  variant: optionalTrimmedString(32).optional().default(null),
  brandName: z.preprocess((value) => String(value == null ? "" : value).trim(), z.string().min(1).max(160)),
  title: z.preprocess((value) => String(value == null ? "" : value).trim(), z.string().min(1).max(220)),
  config: configSchema,
  // editor_version : 1 (legacy V1) ou 2 (nouveau editor). Default 1 pour
  // rétro-compat avec les payloads V1 qui ne fournissent pas le champ.
  editorVersion: z.coerce.number().int().min(1).max(2).optional().default(1),
});

function slugifySegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSlug(value: string | null | undefined) {
  const text = slugifySegment(String(value || ""));
  return text || "landing";
}

async function resolveUniqueSlug(baseSlug: string, excludeId?: number | null) {
  let candidate = normalizeSlug(baseSlug);
  let suffix = 2;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id
         FROM affi_landing_pages
        WHERE lower(slug) = lower($1)
          AND ($2::bigint IS NULL OR id <> $2::bigint)
        LIMIT 1`,
      [candidate, excludeId ?? null]
    );

    if (!rows[0]) return candidate;
    candidate = `${normalizeSlug(baseSlug)}-${suffix}`;
    suffix += 1;
  }
}

function pageRowToJson(row: any) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    model: Number(row.model),
    variant: row.variant ? String(row.variant) : null,
    brandName: String(row.brandName || row.brand_name || ""),
    title: String(row.title || ""),
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? row.config
        : {},
    editorVersion: Number(row.editorVersion ?? row.editor_version ?? 1),
    ownerUserId: Number(row.ownerUserId || row.owner_user_id || 0),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

publicAffiPagesRouter.get(
  "/public/affi-pages/:slug",
  a(async (req, res) => {
    const slug = normalizeSlug(String(req.params.slug || ""));
    const { rows } = await pool.query(
      `SELECT
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM affi_landing_pages
       WHERE lower(slug) = lower($1)
       LIMIT 1`,
      [slug]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, page: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.get(
  "/fsb/affi-pages",
  a(async (_req: any, res) => {
    const { rows } = await pool.query(
      `SELECT
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM affi_landing_pages
       ORDER BY updated_at DESC, id DESC
       LIMIT 250`
    );

    return res.json({ ok: true, items: rows.map(pageRowToJson) });
  })
);

fsbAffiPagesRouter.post(
  "/fsb/affi-pages",
  a(async (req: any, res) => {
    const input = pageInputSchema.parse(req.body || {});
    // V2 : si l'user a fourni un slug explicite, on le respecte tel quel
    // (juste rendu unique si collision). V1 : comportement legacy de fallback.
    const baseSlug =
      input.slug ||
      (input.editorVersion === 2
        ? input.brandName  // V2 sans slug = fallback brandName
        : [input.brandName, input.model === 5 ? input.variant || "gold" : `model${input.model}`]
            .filter(Boolean)
            .join("-"));

    const slug = await resolveUniqueSlug(baseSlug);

    const { rows } = await pool.query(
      `INSERT INTO affi_landing_pages (
         owner_user_id,
         slug,
         model,
         variant,
         brand_name,
         title,
         config,
         editor_version
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        Number(req.user?.id || 0),
        slug,
        input.model,
        input.variant,
        input.brandName,
        input.title,
        JSON.stringify(input.config),
        input.editorVersion,
      ]
    );

    return res.status(201).json({ ok: true, item: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.put(
  "/fsb/affi-pages/:id",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const input = pageInputSchema.parse(req.body || {});
    // V2 : règle absolue — on ne re-génère JAMAIS le slug auto pour les pages
    // V2 (URL verrouillée). Si l'input fournit un slug, on l'applique tel quel
    // (juste rendu unique en cas de collision). Si pas de slug fourni, on
    // garde l'existant en DB.
    let slug: string;
    if (input.editorVersion === 2) {
      if (input.slug) {
        slug = await resolveUniqueSlug(input.slug, id);
      } else {
        const { rows: existing } = await pool.query(`SELECT slug FROM affi_landing_pages WHERE id=$1 LIMIT 1`, [id]);
        slug = existing[0]?.slug || (await resolveUniqueSlug(input.brandName, id));
      }
    } else {
      const baseSlug =
        input.slug ||
        [input.brandName, input.model === 5 ? input.variant || "gold" : `model${input.model}`]
          .filter(Boolean)
          .join("-");
      slug = await resolveUniqueSlug(baseSlug, id);
    }

    const { rows } = await pool.query(
      `UPDATE affi_landing_pages
          SET slug = $2,
              model = $3,
              variant = $4,
              brand_name = $5,
              title = $6,
              config = $7::jsonb,
              editor_version = $8,
              updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          slug,
          model,
          variant,
          brand_name AS "brandName",
          title,
          config,
          editor_version AS "editorVersion",
          owner_user_id AS "ownerUserId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
      [id, slug, input.model, input.variant, input.brandName, input.title, JSON.stringify(input.config), input.editorVersion]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.delete(
  "/fsb/affi-pages/:id",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const { rowCount } = await pool.query(`DELETE FROM affi_landing_pages WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  })
);

// ─── V3 Analytics : tracking events ─────────────────────────────────────────

const eventInputSchema = z.object({
  slug: z.string().min(1).max(160),
  event: z.enum(["view", "click_cta"]),
  referrer: z.string().max(2000).optional().nullable(),
  utmSource: z.string().max(160).optional().nullable(),
  utmMedium: z.string().max(160).optional().nullable(),
  utmCampaign: z.string().max(160).optional().nullable(),
});

publicAffiPagesRouter.post(
  "/public/affi-events",
  a(async (req, res) => {
    const input = eventInputSchema.safeParse(req.body || {});
    if (!input.success) return res.status(400).json({ ok: false, error: "bad_input" });

    const slug = normalizeSlug(input.data.slug);
    const ip = clientIp(req);
    const ua = String(req.headers["user-agent"] || "").slice(0, 500);

    // Résolution du page_id (best-effort, on tracke même si la page est inconnue)
    const { rows: pageRows } = await pool.query(
      `SELECT id FROM affi_landing_pages WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
    );
    const pageId = pageRows[0]?.id ?? null;

    await pool.query(
      `INSERT INTO affi_landing_events
         (page_id, slug, event, ip_hash, user_agent, referrer, utm_source, utm_medium, utm_campaign)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        pageId,
        slug,
        input.data.event,
        hashIp(ip),
        ua,
        input.data.referrer || null,
        input.data.utmSource || null,
        input.data.utmMedium || null,
        input.data.utmCampaign || null,
      ]
    );
    return res.json({ ok: true });
  })
);

// VIP lead capture (banniere "Club VIP" du popup V3)
const vipLeadSchema = z.object({
  slug: z.string().min(1).max(160),
  email: z.string().email().max(320),
  referrer: z.string().max(2000).optional().nullable(),
});

publicAffiPagesRouter.post(
  "/public/affi-vip-leads",
  a(async (req, res) => {
    const input = vipLeadSchema.safeParse(req.body || {});
    if (!input.success) return res.status(400).json({ ok: false, error: "bad_input" });

    const slug = normalizeSlug(input.data.slug);
    const ip = clientIp(req);
    const ua = String(req.headers["user-agent"] || "").slice(0, 500);

    const { rows: pageRows } = await pool.query(
      `SELECT id FROM affi_landing_pages WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
    );
    const pageId = pageRows[0]?.id ?? null;

    await pool.query(
      `INSERT INTO affi_vip_leads (page_id, slug, email, ip_hash, user_agent, referrer)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [pageId, slug, input.data.email.toLowerCase().trim(), hashIp(ip), ua, input.data.referrer || null]
    );
    return res.json({ ok: true });
  })
);

// Stats par page (FSB only)
fsbAffiPagesRouter.get(
  "/fsb/affi-pages/:id/stats",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "bad_id" });
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));

    const { rows } = await pool.query(
      `WITH ev AS (
         SELECT event, ip_hash, created_at
           FROM affi_landing_events
          WHERE page_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
       )
       SELECT
         COUNT(*) FILTER (WHERE event='view')                                AS views,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='view')                 AS unique_views,
         COUNT(*) FILTER (WHERE event='click_cta')                           AS clicks,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='click_cta')            AS unique_clicks
       FROM ev`,
      [id, String(days)]
    );

    const r: any = rows[0] || {};
    const views = Number(r.views || 0);
    const uniqueViews = Number(r.unique_views || 0);
    const clicks = Number(r.clicks || 0);
    const uniqueClicks = Number(r.unique_clicks || 0);
    const ctr = views > 0 ? clicks / views : 0;
    const uniqueCtr = uniqueViews > 0 ? uniqueClicks / uniqueViews : 0;

    return res.json({
      ok: true,
      stats: { views, uniqueViews, clicks, uniqueClicks, ctr, uniqueCtr, periodDays: days },
    });
  })
);

// Daily stats sur N jours (graphique d'evolution par page)
fsbAffiPagesRouter.get(
  "/fsb/affi-pages/:id/daily-stats",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "bad_id" });
    const days = Math.min(180, Math.max(1, Number(req.query.days || 30)));

    const { rows } = await pool.query(
      `SELECT
         (date_trunc('day', created_at) AT TIME ZONE 'UTC')::date AS d,
         COUNT(*) FILTER (WHERE event='view')      AS views,
         COUNT(*) FILTER (WHERE event='click_cta') AS clicks,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='view')      AS unique_views,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='click_cta') AS unique_clicks
       FROM affi_landing_events
       WHERE page_id = $1
         AND created_at >= (NOW() - ($2 || ' days')::interval)
       GROUP BY d
       ORDER BY d ASC`,
      [id, String(days)]
    );

    // Remplit les jours sans event avec 0
    const byDate: Record<string, any> = {};
    for (const r of rows as any[]) {
      const d = new Date(r.d);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = {
        date: key,
        views: Number(r.views || 0),
        clicks: Number(r.clicks || 0),
        uniqueViews: Number(r.unique_views || 0),
        uniqueClicks: Number(r.unique_clicks || 0),
      };
    }

    const series: Array<any> = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      series.push(byDate[key] || { date: key, views: 0, clicks: 0, uniqueViews: 0, uniqueClicks: 0 });
    }

    return res.json({ ok: true, series, periodDays: days });
  })
);

// Stats agrégées toutes les pages (pour le dashboard V3 ranking)
fsbAffiPagesRouter.get(
  "/fsb/affi-pages/stats-summary",
  a(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
    const { rows } = await pool.query(
      `SELECT
         page_id,
         COUNT(*) FILTER (WHERE event='view')                       AS views,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='view')        AS unique_views,
         COUNT(*) FILTER (WHERE event='click_cta')                  AS clicks,
         COUNT(DISTINCT ip_hash) FILTER (WHERE event='click_cta')   AS unique_clicks
       FROM affi_landing_events
       WHERE page_id IS NOT NULL
         AND created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY page_id`,
      [String(days)]
    );
    const byPage: Record<string, any> = {};
    for (const r of rows as any[]) {
      const views = Number(r.views || 0);
      const clicks = Number(r.clicks || 0);
      byPage[String(r.page_id)] = {
        views,
        uniqueViews: Number(r.unique_views || 0),
        clicks,
        uniqueClicks: Number(r.unique_clicks || 0),
        ctr: views > 0 ? clicks / views : 0,
      };
    }
    return res.json({ ok: true, byPage, periodDays: days });
  })
);

// ─── Social profile fetcher (TikTok / Instagram) ────────────────────────────
function extractHandleFromUrl(rawUrl: string): { network: "tiktok" | "instagram" | null; handle: string } {
  const url = rawUrl.trim();
  const tt = url.match(/tiktok\.com\/@([\w.\-]+)/i);
  if (tt) return { network: "tiktok", handle: tt[1] };
  const ig = url.match(/instagram\.com\/([\w.\-]+)(?:[/?#]|$)/i);
  if (ig && !["p", "reel", "explore", "accounts"].includes(ig[1])) {
    return { network: "instagram", handle: ig[1] };
  }
  const at = url.match(/^@([\w.\-]+)$/);
  if (at) return { network: null, handle: at[1] };
  return { network: null, handle: "" };
}

function parseFollowerCount(text: string): number | null {
  if (!text) return null;
  const m = text.match(/([\d,.\s]+[KMkmBb]?)\s+(?:Followers|abonn[ée]s)/i);
  if (!m) return null;
  let raw = m[1].replace(/[\s,]/g, "").toUpperCase();
  let multiplier = 1;
  if (raw.endsWith("K")) { multiplier = 1_000; raw = raw.slice(0, -1); }
  else if (raw.endsWith("M")) { multiplier = 1_000_000; raw = raw.slice(0, -1); }
  else if (raw.endsWith("B")) { multiplier = 1_000_000_000; raw = raw.slice(0, -1); }
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * multiplier);
}

function formatFollowerCount(n: number | null): string {
  if (n == null || n <= 0) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

async function fetchInstagramProfile(handle: string): Promise<{ handle: string; displayName: string | null; followers: number | null } | null> {
  const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    let followers: number | null = null;

    // (1) og:description et meta description — anciennement contenait les followers
    const metas = [
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i),
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i),
    ];
    for (const m of metas) {
      if (m && !followers) followers = parseFollowerCount(m[1]);
    }

    // (2) Schema.org ld+json (Person/Organization avec InteractionStatistic)
    if (followers == null) {
      const ldJsons = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const m of ldJsons) {
        try {
          const data = JSON.parse(m[1]);
          const items = Array.isArray(data) ? data : [data];
          for (const it of items) {
            const stats = it?.interactionStatistic || it?.["@graph"]?.flatMap?.((g: any) => g?.interactionStatistic || []) || [];
            const list = Array.isArray(stats) ? stats : [stats];
            for (const s of list) {
              const type = String(s?.interactionType?.["@type"] || s?.interactionType || "");
              if (type.toLowerCase().includes("follow")) {
                const n = Number(s?.userInteractionCount ?? s?.value);
                if (Number.isFinite(n) && n > 0) { followers = n; break; }
              }
            }
            if (followers) break;
          }
        } catch { /* noop */ }
      }
    }

    // (3) Recherche brute dans le HTML d'un pattern "edge_followed_by":{"count":N}
    if (followers == null) {
      const edge = html.match(/edge_followed_by["']?\s*:\s*\{\s*["']?count["']?\s*:\s*(\d+)/i);
      if (edge) followers = Number(edge[1]) || null;
    }
    // (4) Pattern "follower_count":N (autre variant)
    if (followers == null) {
      const fc = html.match(/follower_count["']?\s*:\s*(\d+)/i);
      if (fc) followers = Number(fc[1]) || null;
    }

    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const titleStr = ogTitle?.[1] || "";
    const displayName = titleStr.split("(")[0].trim() || null;
    return { handle, displayName, followers };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchTikTokProfileBasic(handle: string): Promise<{ handle: string; displayName: string | null; followers: number | null } | null> {
  const url = `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dataMatch = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (dataMatch) {
      try {
        const json = JSON.parse(dataMatch[1]);
        const scope = json?.__DEFAULT_SCOPE__?.["webapp.user-detail"] || json?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"];
        const u = scope?.userInfo?.user || null;
        const s = scope?.userInfo?.stats || {};
        if (u?.uniqueId) {
          return {
            handle: String(u.uniqueId),
            displayName: String(u.nickname || u.uniqueId || "") || null,
            followers: Number(s.followerCount ?? 0) || null,
          };
        }
      } catch { /* noop */ }
    }
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const followers = ogDesc ? parseFollowerCount(ogDesc[1]) : null;
    return { handle, displayName: null, followers };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const socialProfileSchema = z.object({ url: z.string().min(1).max(500) });

fsbAffiPagesRouter.post(
  "/fsb/social-profile",
  a(async (req, res) => {
    const input = socialProfileSchema.safeParse(req.body || {});
    if (!input.success) return res.status(400).json({ ok: false, error: "bad_input" });
    const { network, handle } = extractHandleFromUrl(input.data.url);
    if (!handle) return res.status(400).json({ ok: false, error: "no_handle_found" });
    let profile: { handle: string; displayName: string | null; followers: number | null } | null = null;
    let detectedNetwork: "tiktok" | "instagram" | null = network;
    if (network === "tiktok") {
      profile = await fetchTikTokProfileBasic(handle);
    } else if (network === "instagram") {
      profile = await fetchInstagramProfile(handle);
    } else {
      profile = await fetchTikTokProfileBasic(handle);
      if (profile && profile.followers != null) detectedNetwork = "tiktok";
      else {
        profile = await fetchInstagramProfile(handle);
        if (profile) detectedNetwork = "instagram";
      }
    }
    if (!profile) return res.status(502).json({ ok: false, error: "fetch_failed" });
    return res.json({
      ok: true,
      network: detectedNetwork,
      handle: profile.handle,
      displayName: profile.displayName,
      followers: profile.followers,
      followersLabel: formatFollowerCount(profile.followers),
      socialHandle: `@${profile.handle}`,
    });
  })
);
