import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";
import { isMailReady, sendMail } from "../utils/mailer.js";

export const tiktokOutreachRouter = Router();
tiktokOutreachRouter.use("/fsb/tiktok", requireAuth, requireFsbAccess);

const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

function normalizeHandle(input: string): string | null {
  let s = String(input || "").trim();
  if (!s) return null;
  // Try URL form
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    const seg = url.pathname.split("/").filter(Boolean).find((p) => p.startsWith("@")) || "";
    if (seg) s = seg;
  } catch {
    // not a url
  }
  if (s.startsWith("@")) s = s.slice(1);
  s = s.split("?")[0].split("/")[0];
  if (!HANDLE_RE.test(s)) return null;
  return s.toLowerCase();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function extractEmailFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+(at|AT|\[at\]|\(at\))\s+/g, "@").replace(/\s+(dot|DOT|\[dot\]|\(dot\))\s+/g, ".");
  const m = cleaned.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

type ScrapedProfile = {
  handle: string;
  displayName: string | null;
  bio: string | null;
  email: string | null;
  followerCount: number | null;
  followingCount: number | null;
  heartCount: number | null;
  videoCount: number | null;
  verified: boolean;
  country: string | null;
  avatarUrl: string | null;
  raw: any;
};

async function scrapeProfileViaWorker(handle: string): Promise<ScrapedProfile | null> {
  const worker = getDiscoveryWorker();
  if (!worker) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(`${worker.url}/profile`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-tiktok-discovery-token": worker.token,
      },
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const u = data?.profile?.user;
    if (!u || !u.uniqueId) return null;
    const s = data?.profile?.stats || {};
    const bio = String(u.signature || "");
    const bioEmail = extractEmailFromText(bio);
    const directEmail = String(u.bioEmail || "").trim().toLowerCase();
    return {
      handle,
      displayName: String(u.nickname || u.uniqueId || "") || null,
      bio: bio || null,
      email: bioEmail || directEmail || null,
      followerCount: Number(s.followerCount ?? 0) || null,
      followingCount: Number(s.followingCount ?? 0) || null,
      heartCount: Number(s.heartCount ?? 0) || null,
      videoCount: Number(s.videoCount ?? 0) || null,
      verified: Boolean(u.verified),
      country: String(u.region || "") || null,
      avatarUrl: String(u.avatarLarger || "") || null,
      raw: { source: "worker", user: u, stats: s },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function scrapeTikTokProfile(handle: string): Promise<ScrapedProfile | null> {
  const url = `https://www.tiktok.com/@${handle}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    let userInfo: any = null;
    const dataMatch = html.match(
      /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (dataMatch) {
      try {
        const json = JSON.parse(dataMatch[1]);
        const scope =
          json?.__DEFAULT_SCOPE__?.["webapp.user-detail"] ||
          json?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"];
        userInfo = scope?.userInfo || null;
      } catch {
        userInfo = null;
      }
    }
    if (!userInfo) {
      const sigi = html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
      if (sigi) {
        try {
          const json = JSON.parse(sigi[1]);
          const userModule = json?.UserModule?.users || {};
          const stats = json?.UserModule?.stats || {};
          const username = Object.keys(userModule)[0];
          if (username) {
            userInfo = {
              user: userModule[username],
              stats: stats[username] || {},
            };
          }
        } catch {}
      }
    }

    if (!userInfo?.user) {
      // Fallback 1: try CF Worker (Browser Rendering) if configured
      const viaWorker = await scrapeProfileViaWorker(handle);
      if (viaWorker) return viaWorker;
      // Fallback 2: regex an email anywhere in HTML (signature often appears)
      const fallbackEmail = extractEmailFromText(html);
      if (!fallbackEmail) return null;
      return {
        handle,
        displayName: null,
        bio: null,
        email: fallbackEmail,
        followerCount: null,
        followingCount: null,
        heartCount: null,
        videoCount: null,
        verified: false,
        country: null,
        avatarUrl: null,
        raw: { fallback: true },
      };
    }

    const u = userInfo.user || {};
    const s = userInfo.stats || {};
    const bio = String(u.signature || "");
    const bioEmail = extractEmailFromText(bio);
    const directEmail =
      String(u.bioEmail || "").trim().toLowerCase() ||
      String(u.email || "").trim().toLowerCase() ||
      "";

    return {
      handle,
      displayName: String(u.nickname || u.uniqueId || "") || null,
      bio: bio || null,
      email: bioEmail || directEmail || null,
      followerCount: Number(s.followerCount ?? 0) || null,
      followingCount: Number(s.followingCount ?? 0) || null,
      heartCount: Number(s.heartCount ?? s.heart ?? 0) || null,
      videoCount: Number(s.videoCount ?? 0) || null,
      verified: Boolean(u.verified),
      country: String(u.region || "") || null,
      avatarUrl: String(u.avatarLarger || u.avatarMedium || u.avatarThumb || "") || null,
      raw: { user: u, stats: s },
    };
  } catch {
    return await scrapeProfileViaWorker(handle);
  } finally {
    clearTimeout(t);
  }
}

function mapInfluencer(row: any) {
  return {
    id: String(row.id),
    handle: String(row.handle || ""),
    profileUrl: String(row.profile_url || ""),
    displayName: row.display_name || null,
    bio: row.bio || null,
    email: row.email || null,
    followerCount: row.follower_count == null ? null : Number(row.follower_count),
    followingCount: row.following_count == null ? null : Number(row.following_count),
    heartCount: row.heart_count == null ? null : Number(row.heart_count),
    videoCount: row.video_count == null ? null : Number(row.video_count),
    verified: Boolean(row.verified),
    country: row.country || null,
    avatarUrl: row.avatar_url || null,
    status: String(row.status || "new"),
    notes: row.notes || null,
    lastEmailSentAt: row.last_email_sent_at ? new Date(row.last_email_sent_at).toISOString() : null,
    replyReceivedAt: row.reply_received_at ? new Date(row.reply_received_at).toISOString() : null,
    replyExcerpt: row.reply_excerpt || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

const scanSchema = z.object({
  input: z.string().trim().min(1).max(300),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/scan",
  a(async (req, res) => {
    const parsed = scanSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    const handle = normalizeHandle(parsed.data.input);
    if (!handle) {
      return res.status(400).json({ ok: false, error: "invalid_handle" });
    }

    const profile = await scrapeTikTokProfile(handle);
    if (!profile) {
      return res
        .status(404)
        .json({ ok: false, error: "profile_unreachable", handle });
    }

    const status = profile.email ? "new" : "no_email";
    const profileUrl = `https://www.tiktok.com/@${handle}`;

    const upsert = await pool.query(
      `
      INSERT INTO tiktok_influencers
        (handle, profile_url, display_name, bio, email, follower_count, following_count, heart_count, video_count, verified, country, avatar_url, status, raw)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (handle) DO UPDATE SET
        profile_url = EXCLUDED.profile_url,
        display_name = COALESCE(EXCLUDED.display_name, tiktok_influencers.display_name),
        bio = COALESCE(EXCLUDED.bio, tiktok_influencers.bio),
        email = COALESCE(EXCLUDED.email, tiktok_influencers.email),
        follower_count = COALESCE(EXCLUDED.follower_count, tiktok_influencers.follower_count),
        following_count = COALESCE(EXCLUDED.following_count, tiktok_influencers.following_count),
        heart_count = COALESCE(EXCLUDED.heart_count, tiktok_influencers.heart_count),
        video_count = COALESCE(EXCLUDED.video_count, tiktok_influencers.video_count),
        verified = EXCLUDED.verified,
        country = COALESCE(EXCLUDED.country, tiktok_influencers.country),
        avatar_url = COALESCE(EXCLUDED.avatar_url, tiktok_influencers.avatar_url),
        status = CASE
          WHEN tiktok_influencers.status IN ('contacted','replied','interested','declined','blacklisted')
            THEN tiktok_influencers.status
          WHEN EXCLUDED.email IS NOT NULL AND tiktok_influencers.email IS NULL
            THEN 'new'
          ELSE tiktok_influencers.status
        END,
        raw = EXCLUDED.raw,
        updated_at = NOW()
      RETURNING *
      `,
      [
        handle,
        profileUrl,
        profile.displayName,
        profile.bio,
        profile.email,
        profile.followerCount,
        profile.followingCount,
        profile.heartCount,
        profile.videoCount,
        profile.verified,
        profile.country,
        profile.avatarUrl,
        status,
        profile.raw,
      ]
    );

    return res.json({ ok: true, influencer: mapInfluencer(upsert.rows[0]) });
  })
);

tiktokOutreachRouter.get(
  "/fsb/tiktok/list",
  a(async (req, res) => {
    const status = String(req.query?.status || "").trim();
    const params: any[] = [];
    let where = "";
    if (status && status !== "all") {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT * FROM tiktok_influencers ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE email IS NOT NULL) AS with_email,
        COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
        COUNT(*) FILTER (WHERE status = 'replied') AS replied,
        COUNT(*) FILTER (WHERE status = 'interested') AS interested,
        COUNT(*) FILTER (WHERE status = 'declined') AS declined,
        COUNT(*) FILTER (WHERE status = 'no_email') AS no_email,
        COUNT(*) FILTER (WHERE status = 'new') AS pending
      FROM tiktok_influencers
    `);
    const s = stats.rows[0] || {};

    return res.json({
      ok: true,
      mailReady: isMailReady(),
      stats: {
        total: Number(s.total || 0),
        withEmail: Number(s.with_email || 0),
        contacted: Number(s.contacted || 0),
        replied: Number(s.replied || 0),
        interested: Number(s.interested || 0),
        declined: Number(s.declined || 0),
        noEmail: Number(s.no_email || 0),
        pending: Number(s.pending || 0),
      },
      influencers: result.rows.map(mapInfluencer),
    });
  })
);

const contactSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(8000).optional(),
});

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

async function loadTemplate(): Promise<{ subject: string; body: string; replyDomain: string }> {
  const r = await pool.query(
    `SELECT email_subject, email_body, reply_domain FROM tiktok_outreach_config WHERE id = 1`
  );
  const row = r.rows[0] || {};
  return {
    subject: String(row.email_subject || "Collab LunaLive"),
    body: String(row.email_body || ""),
    replyDomain: String(row.reply_domain || "lunalive.win"),
  };
}

tiktokOutreachRouter.get(
  "/fsb/tiktok/template",
  a(async (_req, res) => {
    const tpl = await loadTemplate();
    return res.json({ ok: true, template: tpl });
  })
);

const templateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  replyDomain: z.string().trim().min(3).max(100).regex(/^[a-z0-9.-]+$/i).optional(),
});

tiktokOutreachRouter.put(
  "/fsb/tiktok/template",
  a(async (req, res) => {
    const parsed = templateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    await pool.query(
      `UPDATE tiktok_outreach_config
         SET email_subject = $1,
             email_body = $2,
             reply_domain = COALESCE($3, reply_domain),
             updated_at = NOW()
       WHERE id = 1`,
      [parsed.data.subject, parsed.data.body, parsed.data.replyDomain ?? null]
    );
    const tpl = await loadTemplate();
    return res.json({ ok: true, template: tpl });
  })
);

tiktokOutreachRouter.post(
  "/fsb/tiktok/:id/contact",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const parsed = contactSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }

    const found = await pool.query(`SELECT * FROM tiktok_influencers WHERE id = $1`, [id]);
    const row = found.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    if (!row.email) return res.status(400).json({ ok: false, error: "no_email" });

    if (!isMailReady()) {
      return res.status(503).json({ ok: false, error: "mail_not_configured" });
    }

    const tpl = await loadTemplate();
    const vars = {
      name: row.display_name || `@${row.handle}`,
      handle: row.handle,
    };
    const subject = renderTemplate(parsed.data.subject || tpl.subject, vars);
    const body = renderTemplate(parsed.data.body || tpl.body, vars);
    const html = `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6;color:#0d1b2e">${body
      .split("\n")
      .map((line) => (line.trim() ? `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br/>"))
      .join("")}</div>`;

    // Reply-To with embedded influencer ID for inbound matching
    const replyTo = `replies+tk${id}@${tpl.replyDomain}`;

    try {
      await sendMail(row.email, subject, body, html, { replyTo });
    } catch (err: any) {
      await pool.query(
        `INSERT INTO tiktok_outreach_messages (influencer_id, direction, subject, body, success, error_message)
         VALUES ($1, 'out', $2, $3, FALSE, $4)`,
        [id, subject, body, String(err?.message || err).slice(0, 500)]
      );
      return res.status(502).json({ ok: false, error: "send_failed", detail: String(err?.message || err) });
    }

    await pool.query(
      `INSERT INTO tiktok_outreach_messages (influencer_id, direction, subject, body, success)
       VALUES ($1, 'out', $2, $3, TRUE)`,
      [id, subject, body]
    );
    const updated = await pool.query(
      `UPDATE tiktok_influencers
         SET status = CASE WHEN status IN ('replied','interested','declined') THEN status ELSE 'contacted' END,
             last_email_sent_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({ ok: true, influencer: mapInfluencer(updated.rows[0]) });
  })
);

const statusSchema = z.object({
  status: z.enum(["new", "no_email", "queued", "contacted", "replied", "interested", "declined", "blacklisted"]),
  notes: z.string().trim().max(2000).optional(),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/:id/status",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    const updated = await pool.query(
      `UPDATE tiktok_influencers
         SET status = $2,
             notes = COALESCE($3, notes),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, parsed.data.status, parsed.data.notes ?? null]
    );
    if (!updated.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, influencer: mapInfluencer(updated.rows[0]) });
  })
);

const replySchema = z.object({
  excerpt: z.string().trim().min(1).max(2000),
  interested: z.boolean().optional(),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/:id/reply",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const parsed = replySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    await pool.query(
      `INSERT INTO tiktok_outreach_messages (influencer_id, direction, body, success)
       VALUES ($1, 'in', $2, TRUE)`,
      [id, parsed.data.excerpt]
    );
    const nextStatus = parsed.data.interested ? "interested" : "replied";
    const updated = await pool.query(
      `UPDATE tiktok_influencers
         SET status = $2,
             reply_received_at = NOW(),
             reply_excerpt = $3,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nextStatus, parsed.data.excerpt]
    );
    if (!updated.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, influencer: mapInfluencer(updated.rows[0]) });
  })
);

tiktokOutreachRouter.delete(
  "/fsb/tiktok/:id",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    await pool.query(`DELETE FROM tiktok_influencers WHERE id = $1`, [id]);
    return res.json({ ok: true, id: String(id) });
  })
);

// ─── Discovery ─────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ScrapeDiag = {
  source: string;
  status: number;
  htmlLength: number;
  hasUniversalData: boolean;
  hasSigi: boolean;
  scopeKeys: string[];
  itemListCount: number;
  authorsFound: number;
  fallbackUsed: boolean;
  blocked: boolean;
};

function getDiscoveryWorker(): { url: string; token: string } | null {
  const url = String(process.env.TIKTOK_DISCOVERY_WORKER_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.TIKTOK_DISCOVERY_WORKER_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

async function callDiscoveryWorker(
  path: "/hashtag" | "/search",
  body: Record<string, unknown>
): Promise<{ authors: string[]; diag: any }> {
  const worker = getDiscoveryWorker();
  if (!worker) return { authors: [], diag: { error: "worker_not_configured" } };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${worker.url}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-tiktok-discovery-token": worker.token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { authors: [], diag: { error: `worker_${res.status}`, detail: text.slice(0, 200) } };
    }
    const data: any = await res.json().catch(() => null);
    if (!data || data.ok !== true) {
      return { authors: [], diag: { error: "worker_invalid_response" } };
    }
    return {
      authors: Array.isArray(data.authors) ? data.authors : [],
      diag: data.diag || {},
    };
  } catch (err: any) {
    return { authors: [], diag: { error: String(err?.message || err) } };
  } finally {
    clearTimeout(t);
  }
}

async function fetchTikTokPage(url: string): Promise<{ status: number; html: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    const html = await res.text().catch(() => "");
    return { status: res.status, html };
  } catch {
    return { status: 0, html: "" };
  } finally {
    clearTimeout(t);
  }
}

function extractAuthorsFromHtml(html: string, limit: number, diag: ScrapeDiag) {
  const authors = new Set<string>();

  // Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__
  const universal = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  diag.hasUniversalData = !!universal;
  if (universal) {
    try {
      const json = JSON.parse(universal[1]);
      const scope = json?.__DEFAULT_SCOPE__ || {};
      diag.scopeKeys = Object.keys(scope).slice(0, 12);
      const detail = scope?.["webapp.challenge-detail"] || scope?.["webapp.video-detail"] || {};
      const candidates: any[] = [];
      const list1 = detail?.itemList;
      const list2 = detail?.itemList?.list;
      const list3 = scope?.["webapp.video-detail"]?.itemList;
      if (Array.isArray(list1)) candidates.push(...list1);
      if (Array.isArray(list2)) candidates.push(...list2);
      if (Array.isArray(list3)) candidates.push(...list3);
      diag.itemListCount = candidates.length;
      for (const item of candidates) {
        const uid = item?.author?.uniqueId || item?.author?.unique_id || null;
        if (uid && /^[A-Za-z0-9._]{1,30}$/.test(String(uid))) {
          authors.add(String(uid).toLowerCase());
          if (authors.size >= limit) break;
        }
      }
    } catch {}
  }

  // Strategy 2: SIGI_STATE (older format)
  if (authors.size === 0) {
    const sigi = html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    diag.hasSigi = !!sigi;
    if (sigi) {
      try {
        const json = JSON.parse(sigi[1]);
        const items = json?.ItemModule || {};
        for (const key of Object.keys(items)) {
          const uid = items[key]?.author;
          if (typeof uid === "string" && /^[A-Za-z0-9._]{1,30}$/.test(uid)) {
            authors.add(uid.toLowerCase());
            if (authors.size >= limit) break;
          }
        }
      } catch {}
    }
  }

  // Strategy 3: regex fallback over full HTML
  if (authors.size === 0) {
    diag.fallbackUsed = true;
    const re = /"uniqueId"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && authors.size < limit) {
      authors.add(m[1].toLowerCase());
    }
    if (authors.size === 0) {
      const re2 = /"unique_id"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
      while ((m = re2.exec(html)) && authors.size < limit) {
        authors.add(m[1].toLowerCase());
      }
    }
  }

  diag.authorsFound = authors.size;

  // Detect blocks
  const lower = html.slice(0, 4000).toLowerCase();
  diag.blocked =
    lower.includes("captcha") ||
    lower.includes("verify to continue") ||
    lower.includes("cf-mitigated") ||
    lower.includes("attention required") ||
    (diag.htmlLength > 0 && diag.htmlLength < 3000 && authors.size === 0);

  return Array.from(authors);
}

async function scrapeHashtagAuthors(
  tag: string,
  limit = 60
): Promise<{ authors: string[]; diag: ScrapeDiag }> {
  const cleaned = String(tag || "").trim().replace(/^#+/, "").toLowerCase();
  const diag: ScrapeDiag = {
    source: `tag:${cleaned}`,
    status: 0,
    htmlLength: 0,
    hasUniversalData: false,
    hasSigi: false,
    scopeKeys: [],
    itemListCount: 0,
    authorsFound: 0,
    fallbackUsed: false,
    blocked: false,
  };
  if (!cleaned || !/^[a-z0-9_]{1,40}$/i.test(cleaned)) return { authors: [], diag };
  const url = `https://www.tiktok.com/tag/${encodeURIComponent(cleaned)}`;
  const fetched = await fetchTikTokPage(url);
  diag.status = fetched.status;
  diag.htmlLength = fetched.html.length;
  if (fetched.status !== 200 || !fetched.html) return { authors: [], diag };
  const authors = extractAuthorsFromHtml(fetched.html, limit, diag);
  return { authors, diag };
}

async function scrapeUserSearchAuthors(
  query: string,
  limit = 30
): Promise<{ authors: string[]; diag: ScrapeDiag }> {
  const diag: ScrapeDiag = {
    source: `search:${query}`,
    status: 0,
    htmlLength: 0,
    hasUniversalData: false,
    hasSigi: false,
    scopeKeys: [],
    itemListCount: 0,
    authorsFound: 0,
    fallbackUsed: false,
    blocked: false,
  };
  const q = String(query || "").trim();
  if (!q) return { authors: [], diag };
  const url = `https://www.tiktok.com/search/user?q=${encodeURIComponent(q)}`;
  const fetched = await fetchTikTokPage(url);
  diag.status = fetched.status;
  diag.htmlLength = fetched.html.length;
  if (fetched.status !== 200 || !fetched.html) return { authors: [], diag };
  const authors = extractAuthorsFromHtml(fetched.html, limit, diag);
  return { authors, diag };
}

const discoverSchema = z.object({
  hashtags: z.array(z.string().trim().min(1).max(40)).min(1).max(15),
  searchQueries: z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
  minFollowers: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  maxFollowers: z.coerce.number().int().min(0).max(50_000_000).optional().default(0),
  countries: z.array(z.string().trim().min(2).max(4)).max(10).optional().default([]),
  requireEmail: z.boolean().optional().default(true),
  maxProfiles: z.coerce.number().int().min(1).max(60).optional().default(30),
});

type DiscoverCriteria = z.infer<typeof discoverSchema>;

async function upsertScrapedProfile(profile: ScrapedProfile): Promise<{ id: number; alreadyContacted: boolean }> {
  const status = profile.email ? "new" : "no_email";
  const profileUrl = `https://www.tiktok.com/@${profile.handle}`;
  const result = await pool.query(
    `
    INSERT INTO tiktok_influencers
      (handle, profile_url, display_name, bio, email, follower_count, following_count, heart_count, video_count, verified, country, avatar_url, status, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (handle) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, tiktok_influencers.display_name),
      bio = COALESCE(EXCLUDED.bio, tiktok_influencers.bio),
      email = COALESCE(EXCLUDED.email, tiktok_influencers.email),
      follower_count = COALESCE(EXCLUDED.follower_count, tiktok_influencers.follower_count),
      following_count = COALESCE(EXCLUDED.following_count, tiktok_influencers.following_count),
      heart_count = COALESCE(EXCLUDED.heart_count, tiktok_influencers.heart_count),
      video_count = COALESCE(EXCLUDED.video_count, tiktok_influencers.video_count),
      verified = EXCLUDED.verified,
      country = COALESCE(EXCLUDED.country, tiktok_influencers.country),
      avatar_url = COALESCE(EXCLUDED.avatar_url, tiktok_influencers.avatar_url),
      raw = EXCLUDED.raw,
      updated_at = NOW()
    RETURNING id, status
    `,
    [
      profile.handle,
      profileUrl,
      profile.displayName,
      profile.bio,
      profile.email,
      profile.followerCount,
      profile.followingCount,
      profile.heartCount,
      profile.videoCount,
      profile.verified,
      profile.country,
      profile.avatarUrl,
      status,
      profile.raw,
    ]
  );
  const row = result.rows[0];
  return {
    id: Number(row.id),
    alreadyContacted: ["contacted", "replied", "interested", "declined", "blacklisted"].includes(
      String(row.status)
    ),
  };
}

async function executeDiscoveryRun(runId: number, criteria: DiscoverCriteria): Promise<void> {
  const log: Array<{ handle?: string; tag?: string; query?: string; reason: string; followers?: number | null; country?: string | null }> = [];
  const candidates = new Set<string>();
  let kept = 0;
  let dropped = 0;
  let scanned = 0;

  const worker = getDiscoveryWorker();
  if (worker) {
    log.push({ reason: `using_browser_worker:${worker.url}` });
  } else {
    log.push({ reason: "worker_not_configured_using_html_fallback" });
  }

  async function collectFromHashtag(tag: string) {
    if (worker) {
      const r = await callDiscoveryWorker("/hashtag", { hashtag: tag, limit: 50 });
      const d = r.diag || {};
      return {
        authors: r.authors,
        summary: `worker status=${d.status ?? "?"} selector=${d.selectorFound ? 1 : 0} found=${d.handlesFound ?? 0}${d.error ? ` err=${d.error}` : ""}`,
      };
    }
    const r = await scrapeHashtagAuthors(tag, 60);
    const diag = r.diag;
    return {
      authors: r.authors,
      summary: `html status=${diag.status} html=${diag.htmlLength} udata=${diag.hasUniversalData ? 1 : 0} items=${diag.itemListCount} fallback=${diag.fallbackUsed ? 1 : 0} blocked=${diag.blocked ? 1 : 0}`,
    };
  }

  async function collectFromSearch(query: string) {
    if (worker) {
      const r = await callDiscoveryWorker("/search", { query, limit: 30 });
      const d = r.diag || {};
      return {
        authors: r.authors,
        summary: `worker status=${d.status ?? "?"} found=${d.handlesFound ?? 0}${d.error ? ` err=${d.error}` : ""}`,
      };
    }
    const r = await scrapeUserSearchAuthors(query, 30);
    const diag = r.diag;
    return {
      authors: r.authors,
      summary: `html status=${diag.status} html=${diag.htmlLength} blocked=${diag.blocked ? 1 : 0}`,
    };
  }

  // 1) Collect candidates from hashtags
  for (const tag of criteria.hashtags) {
    const { authors, summary } = await collectFromHashtag(tag);
    log.push({
      tag,
      reason: authors.length === 0 ? `hashtag_empty (${summary})` : `hashtag_found_${authors.length} (${summary})`,
    });
    authors.forEach((h) => candidates.add(h));
    await pool.query(
      `UPDATE tiktok_outreach_runs SET candidates_count = $2, log = $3::jsonb, message = $4 WHERE id = $1`,
      [runId, candidates.size, JSON.stringify(log), `Collecte: hashtag #${tag}`]
    );
    if (candidates.size >= criteria.maxProfiles * 4) break;
    await sleep(700);
  }

  for (const query of criteria.searchQueries || []) {
    const { authors, summary } = await collectFromSearch(query);
    log.push({ query, reason: `search_found_${authors.length} (${summary})` });
    authors.forEach((h) => candidates.add(h));
    await pool.query(
      `UPDATE tiktok_outreach_runs SET candidates_count = $2, log = $3::jsonb, message = $4 WHERE id = $1`,
      [runId, candidates.size, JSON.stringify(log), `Collecte: recherche "${query}"`]
    );
    await sleep(700);
  }

  // 1b) Auto-fallback: if no candidates, try user search with each hashtag as query
  if (candidates.size === 0 && criteria.hashtags.length > 0) {
    log.push({ reason: "auto_fallback_to_user_search" });
    for (const tag of criteria.hashtags) {
      const { authors, summary } = await collectFromSearch(tag);
      log.push({ query: tag, reason: `fallback_search_${authors.length} (${summary})` });
      authors.forEach((h) => candidates.add(h));
      await pool.query(
        `UPDATE tiktok_outreach_runs SET candidates_count = $2, log = $3::jsonb, message = $4 WHERE id = $1`,
        [runId, candidates.size, JSON.stringify(log), `Fallback search: ${tag}`]
      );
      await sleep(700);
    }
  }

  // 2) Filter out already-known handles to avoid wasted scrapes
  const known = await pool.query(
    `SELECT handle FROM tiktok_influencers WHERE handle = ANY($1::text[])`,
    [Array.from(candidates)]
  );
  const knownSet = new Set(known.rows.map((r: any) => String(r.handle)));
  const fresh = Array.from(candidates).filter((h) => !knownSet.has(h));

  log.push({ reason: `candidates_total_${candidates.size}_fresh_${fresh.length}_known_${knownSet.size}` });

  // 3) Scrape each candidate's profile, apply filters, upsert
  const slice = fresh.slice(0, criteria.maxProfiles);
  for (const handle of slice) {
    scanned += 1;
    const profile = await scrapeTikTokProfile(handle);
    if (!profile) {
      dropped += 1;
      log.push({ handle, reason: "unreachable" });
    } else {
      const followers = profile.followerCount || 0;
      const country = profile.country || "";
      const passEmail = !criteria.requireEmail || !!profile.email;
      const passMin = !criteria.minFollowers || followers >= criteria.minFollowers;
      const passMax = !criteria.maxFollowers || followers <= criteria.maxFollowers;
      const passCountry =
        !criteria.countries.length ||
        criteria.countries.map((c) => c.toUpperCase()).includes(country.toUpperCase());

      if (!passEmail || !passMin || !passMax || !passCountry) {
        dropped += 1;
        const reasons: string[] = [];
        if (!passEmail) reasons.push("no_email");
        if (!passMin) reasons.push(`under_min_${followers}`);
        if (!passMax) reasons.push(`over_max_${followers}`);
        if (!passCountry) reasons.push(`country_${country || "?"}`);
        log.push({ handle, reason: reasons.join(","), followers, country });
        // Still upsert so we have a trace (status=no_email if applicable)
        if (!criteria.requireEmail) {
          await upsertScrapedProfile(profile);
        }
      } else {
        await upsertScrapedProfile(profile);
        kept += 1;
        log.push({ handle, reason: "kept", followers, country });
      }
    }
    await pool.query(
      `UPDATE tiktok_outreach_runs
         SET scanned_count = $2,
             kept_count = $3,
             dropped_count = $4,
             log = $5::jsonb,
             message = $6
       WHERE id = $1`,
      [runId, scanned, kept, dropped, JSON.stringify(log), `Scan ${scanned}/${slice.length}`]
    );
    await sleep(700);
  }

  await pool.query(
    `UPDATE tiktok_outreach_runs
       SET status = 'done',
           finished_at = NOW(),
           message = $2
     WHERE id = $1 AND status = 'running'`,
    [runId, `Terminé: ${kept} gardé(s), ${dropped} rejeté(s) sur ${scanned} scanné(s)`]
  );
}

tiktokOutreachRouter.post(
  "/fsb/tiktok/discover",
  a(async (req, res) => {
    const parsed = discoverSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input", detail: parsed.error.flatten() });
    }

    // Reject if a run is already in progress
    const active = await pool.query(
      `SELECT id FROM tiktok_outreach_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
    );
    if (active.rows[0]) {
      return res.status(409).json({ ok: false, error: "run_already_active", runId: String(active.rows[0].id) });
    }

    const inserted = await pool.query(
      `INSERT INTO tiktok_outreach_runs (criteria, status) VALUES ($1::jsonb, 'running') RETURNING id`,
      [JSON.stringify(parsed.data)]
    );
    const runId = Number(inserted.rows[0].id);

    // Fire & forget
    (async () => {
      try {
        await executeDiscoveryRun(runId, parsed.data);
      } catch (err: any) {
        await pool
          .query(
            `UPDATE tiktok_outreach_runs SET status = 'error', finished_at = NOW(), message = $2 WHERE id = $1`,
            [runId, String(err?.message || err).slice(0, 500)]
          )
          .catch(() => {});
      }
    })();

    return res.json({ ok: true, runId: String(runId) });
  })
);

function mapRun(row: any) {
  return {
    id: String(row.id),
    criteria: row.criteria || {},
    status: String(row.status || "running"),
    candidatesCount: Number(row.candidates_count || 0),
    scannedCount: Number(row.scanned_count || 0),
    keptCount: Number(row.kept_count || 0),
    droppedCount: Number(row.dropped_count || 0),
    message: row.message || null,
    log: Array.isArray(row.log) ? row.log : [],
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };
}

tiktokOutreachRouter.get(
  "/fsb/tiktok/runs",
  a(async (_req, res) => {
    const result = await pool.query(
      `SELECT * FROM tiktok_outreach_runs ORDER BY started_at DESC LIMIT 30`
    );
    return res.json({ ok: true, runs: result.rows.map(mapRun) });
  })
);

tiktokOutreachRouter.get(
  "/fsb/tiktok/runs/active",
  a(async (_req, res) => {
    const result = await pool.query(
      `SELECT * FROM tiktok_outreach_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
    );
    return res.json({ ok: true, run: result.rows[0] ? mapRun(result.rows[0]) : null });
  })
);

tiktokOutreachRouter.get(
  "/fsb/tiktok/runs/:id",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const result = await pool.query(`SELECT * FROM tiktok_outreach_runs WHERE id = $1`, [id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, run: mapRun(result.rows[0]) });
  })
);

// ─── Inbound reply webhook (Brevo Inbound Email Parsing) ─────────────────
// This route is OUTSIDE the requireAuth/requireFsbAccess scope.
// It needs to be mounted directly on the app, not on the router.
// Exported as a separate handler.

export async function handleInboundReply(req: any, res: any) {
  const expectedSecret = String(process.env.INBOUND_WEBHOOK_SECRET || "").trim();
  if (!expectedSecret) {
    return res.status(503).json({ ok: false, error: "inbound_not_configured" });
  }
  const presentedSecret =
    String(req.query?.secret || "").trim() ||
    String(req.headers?.["x-inbound-secret"] || "").trim();
  if (presentedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const body = req.body || {};
  // Brevo "items" array format (transactional inbound), or single email format.
  const items: any[] = Array.isArray(body?.items) ? body.items : [body];

  const processed: Array<{ ok: boolean; influencerId?: number; reason?: string }> = [];

  for (const item of items) {
    // Extract recipient address (replies+tk{id}@domain)
    const toCandidates: string[] = [];
    const addCand = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(addCand);
      else if (typeof v === "string") toCandidates.push(v);
      else if (typeof v === "object" && v?.Address) toCandidates.push(String(v.Address));
      else if (typeof v === "object" && v?.address) toCandidates.push(String(v.address));
      else if (typeof v === "object" && v?.email) toCandidates.push(String(v.email));
    };
    addCand(item?.To);
    addCand(item?.to);
    addCand(item?.Cc);
    addCand(item?.cc);
    addCand(item?.recipient);
    addCand(item?.recipients);
    addCand(item?.envelope?.to);

    let influencerId: number | null = null;
    for (const addr of toCandidates) {
      const m = String(addr).match(/replies\+tk(\d+)@/i);
      if (m) {
        influencerId = Number(m[1]);
        break;
      }
    }

    if (!influencerId) {
      processed.push({ ok: false, reason: "no_id_in_recipient" });
      continue;
    }

    const fromAddr =
      (typeof item?.From === "string" ? item.From : item?.From?.Address || item?.From?.email) ||
      (typeof item?.from === "string" ? item.from : item?.from?.Address || item?.from?.email) ||
      null;
    const subject = String(item?.Subject || item?.subject || "").slice(0, 500);
    const text = String(
      item?.["RawTextBody"] ||
        item?.["Text"] ||
        item?.text ||
        item?.["TextBody"] ||
        item?.["plain"] ||
        ""
    ).slice(0, 8000);
    const excerpt = (subject ? `[${subject}] ` : "") + text;

    const found = await pool.query(`SELECT * FROM tiktok_influencers WHERE id = $1`, [influencerId]);
    if (!found.rows[0]) {
      processed.push({ ok: false, influencerId, reason: "influencer_not_found" });
      continue;
    }

    await pool.query(
      `INSERT INTO tiktok_outreach_messages (influencer_id, direction, subject, body, success)
       VALUES ($1, 'in', $2, $3, TRUE)`,
      [influencerId, subject || null, excerpt || `(reply from ${fromAddr || "unknown"})`]
    );

    // Promote status to 'replied' unless already in a stronger state
    await pool.query(
      `UPDATE tiktok_influencers
         SET status = CASE
               WHEN status IN ('interested','declined','blacklisted') THEN status
               ELSE 'replied'
             END,
             reply_received_at = NOW(),
             reply_excerpt = LEFT($2, 2000),
             updated_at = NOW()
       WHERE id = $1`,
      [influencerId, excerpt]
    );

    processed.push({ ok: true, influencerId });
  }

  return res.json({ ok: true, processed });
}

// ─── Preflight: split fresh vs already-known handles ─────────────────────

const preflightSchema = z.object({
  handles: z.array(z.string().trim().min(1).max(40)).min(1).max(500),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/preflight",
  a(async (req, res) => {
    const parsed = preflightSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input" });
    const cleaned = Array.from(
      new Set(
        parsed.data.handles
          .map((h) => normalizeHandle(h))
          .filter((h): h is string => !!h)
      )
    );
    if (cleaned.length === 0) return res.json({ ok: true, fresh: [], known: [] });
    const known = await pool.query(
      `SELECT handle FROM tiktok_influencers WHERE handle = ANY($1::text[])`,
      [cleaned]
    );
    const knownSet = new Set(known.rows.map((r: any) => String(r.handle)));
    return res.json({
      ok: true,
      fresh: cleaned.filter((h) => !knownSet.has(h)),
      known: Array.from(knownSet),
    });
  })
);

// ─── Bulk import (used by browser bookmarklet) ────────────────────────────

const importBulkProfileSchema = z.object({
  handle: z.string().trim().min(1).max(40),
  displayName: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  bioEmail: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  region: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  followerCount: z.number().nullable().optional(),
  followingCount: z.number().nullable().optional(),
  heartCount: z.number().nullable().optional(),
  videoCount: z.number().nullable().optional(),
});

const importBulkSchema = z.object({
  handles: z.array(z.string().trim().min(1).max(40)).max(200).optional().default([]),
  profiles: z.array(importBulkProfileSchema).max(200).optional().default([]),
  source: z.string().trim().max(300).optional(),
  requireEmail: z.boolean().optional().default(false),
  minFollowers: z.coerce.number().int().min(0).max(100_000_000).optional().default(0),
  maxFollowers: z.coerce.number().int().min(0).max(100_000_000).optional().default(0),
  countries: z.array(z.string().trim().min(2).max(4)).max(10).optional().default([]),
});

function profileFromExtensionPayload(p: z.infer<typeof importBulkProfileSchema>): ScrapedProfile {
  const handle = String(p.handle || "").trim().toLowerCase();
  const bio = String(p.bio || "");
  const bioEmail = (p.bioEmail || "").trim().toLowerCase() || extractEmailFromText(bio);
  return {
    handle,
    displayName: p.displayName || null,
    bio: bio || null,
    email: bioEmail || null,
    followerCount: typeof p.followerCount === "number" ? p.followerCount : null,
    followingCount: typeof p.followingCount === "number" ? p.followingCount : null,
    heartCount: typeof p.heartCount === "number" ? p.heartCount : null,
    videoCount: typeof p.videoCount === "number" ? p.videoCount : null,
    verified: !!p.verified,
    country: p.region || null,
    avatarUrl: p.avatarUrl || null,
    raw: { source: "extension", payload: p },
  };
}

tiktokOutreachRouter.post(
  "/fsb/tiktok/import-bulk",
  a(async (req, res) => {
    const parsed = importBulkSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }

    // If profiles provided (extension scraping), convert. Otherwise use handles for server-side scrape.
    const hasProfiles = (parsed.data.profiles || []).length > 0;
    const cleanedHandles = Array.from(
      new Set(
        (parsed.data.handles || [])
          .map((h) => normalizeHandle(h))
          .filter((h): h is string => !!h)
      )
    );
    const cleanedProfiles = (parsed.data.profiles || []).map(profileFromExtensionPayload);
    const allHandles = hasProfiles
      ? cleanedProfiles.map((p) => p.handle)
      : cleanedHandles;
    if (allHandles.length === 0) {
      return res.status(400).json({ ok: false, error: "no_valid_handles" });
    }

    const known = await pool.query(
      `SELECT handle FROM tiktok_influencers WHERE handle = ANY($1::text[])`,
      [allHandles]
    );
    const knownSet = new Set(known.rows.map((r: any) => String(r.handle)));
    const freshHandles = allHandles.filter((h) => !knownSet.has(h));

    let scanned = 0;
    let withEmail = 0;
    let failed = 0;
    let kept = 0;
    let droppedNoEmail = 0;
    let droppedFollowers = 0;
    let droppedCountry = 0;
    const results: Array<{ handle: string; status: string; email: string | null }> = [];

    const countriesUpper = (parsed.data.countries || []).map((c) => c.toUpperCase());

    // Build the iterable: either profiles (already scraped) or handles to scrape
    const profileByHandle = new Map(cleanedProfiles.map((p) => [p.handle, p]));

    for (const handle of freshHandles) {
      let profile: ScrapedProfile | null;
      if (hasProfiles) {
        profile = profileByHandle.get(handle) || null;
      } else {
        profile = await scrapeTikTokProfile(handle);
      }
      scanned += 1;
      if (!profile) {
        failed += 1;
        results.push({ handle, status: "unreachable", email: null });
        continue;
      }

      // Apply server-side filters before upsert
      const followers = profile.followerCount || 0;
      const country = (profile.country || "").toUpperCase();
      if (parsed.data.requireEmail && !profile.email) {
        droppedNoEmail += 1;
        results.push({ handle, status: "dropped_no_email", email: null });
        await sleep(400);
        continue;
      }
      if (parsed.data.minFollowers && followers < parsed.data.minFollowers) {
        droppedFollowers += 1;
        results.push({ handle, status: "dropped_min_followers", email: profile.email });
        await sleep(400);
        continue;
      }
      if (parsed.data.maxFollowers && followers > parsed.data.maxFollowers) {
        droppedFollowers += 1;
        results.push({ handle, status: "dropped_max_followers", email: profile.email });
        await sleep(400);
        continue;
      }
      if (countriesUpper.length && !countriesUpper.includes(country)) {
        droppedCountry += 1;
        results.push({ handle, status: "dropped_country", email: profile.email });
        await sleep(400);
        continue;
      }

      await upsertScrapedProfile(profile);
      kept += 1;
      if (profile.email) withEmail += 1;
      results.push({
        handle,
        status: profile.email ? "new" : "no_email",
        email: profile.email,
      });
      // Throttle only if we actually called TikTok (server-side scrape)
      if (!hasProfiles) await sleep(500);
    }

    return res.json({
      ok: true,
      received: allHandles.length,
      alreadyKnown: knownSet.size,
      scanned,
      withEmail,
      kept,
      droppedNoEmail,
      droppedFollowers,
      droppedCountry,
      failed,
      results,
    });
  })
);

tiktokOutreachRouter.delete(
  "/fsb/tiktok/runs/:id",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    await pool.query(`DELETE FROM tiktok_outreach_runs WHERE id = $1 AND status != 'running'`, [id]);
    return res.json({ ok: true, id: String(id) });
  })
);

tiktokOutreachRouter.post(
  "/fsb/tiktok/runs/clear",
  a(async (_req, res) => {
    const result = await pool.query(`DELETE FROM tiktok_outreach_runs WHERE status != 'running'`);
    return res.json({ ok: true, deleted: result.rowCount || 0 });
  })
);

tiktokOutreachRouter.post(
  "/fsb/tiktok/runs/:id/cancel",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    await pool.query(
      `UPDATE tiktok_outreach_runs SET status = 'canceled', finished_at = NOW() WHERE id = $1 AND status = 'running'`,
      [id]
    );
    return res.json({ ok: true });
  })
);

tiktokOutreachRouter.get(
  "/fsb/tiktok/:id/messages",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const result = await pool.query(
      `SELECT id, direction, subject, body, sent_at, success, error_message
         FROM tiktok_outreach_messages
        WHERE influencer_id = $1
        ORDER BY sent_at DESC
        LIMIT 100`,
      [id]
    );
    return res.json({
      ok: true,
      messages: result.rows.map((row) => ({
        id: String(row.id),
        direction: row.direction,
        subject: row.subject,
        body: row.body,
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        success: Boolean(row.success),
        errorMessage: row.error_message || null,
      })),
    });
  })
);

// ============================================================================
// Réseau d'influenceurs : "seeds" (comptes de référence) + candidats détectés
// ============================================================================

type SeedNetworkSignal = { handle: string; type: "comment" | "mention" | "duet" };

async function callSeedNetworkWorker(
  handle: string,
  videoLimit = 6,
  commentsPerVideo = 30
): Promise<{ signals: SeedNetworkSignal[]; diag: any }> {
  const worker = getDiscoveryWorker();
  if (!worker) return { signals: [], diag: { error: "worker_not_configured" } };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${worker.url}/seed-network`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-tiktok-discovery-token": worker.token,
      },
      body: JSON.stringify({ handle, videoLimit, commentsPerVideo }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { signals: [], diag: { error: `worker_${res.status}`, detail: text.slice(0, 200) } };
    }
    const data: any = await res.json().catch(() => null);
    if (!data || data.ok !== true) {
      return { signals: [], diag: { error: "worker_invalid_response" } };
    }
    return {
      signals: Array.isArray(data.signals) ? data.signals : [],
      diag: data.diag || {},
    };
  } catch (err: any) {
    return { signals: [], diag: { error: String(err?.message || err) } };
  } finally {
    clearTimeout(t);
  }
}

function mapSeed(row: any) {
  return {
    id: String(row.id),
    handle: row.handle,
    displayName: row.display_name || null,
    avatarUrl: row.avatar_url || null,
    notes: row.notes || null,
    isActive: Boolean(row.is_active),
    lastNetworkFetchAt: row.last_network_fetch_at
      ? new Date(row.last_network_fetch_at).toISOString()
      : null,
    lastNetworkStatus: row.last_network_status || null,
    lastNetworkError: row.last_network_error || null,
    linksCount: Number(row.links_count ?? 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

// LIST seeds
tiktokOutreachRouter.get(
  "/fsb/tiktok/seeds",
  a(async (_req, res) => {
    const result = await pool.query(
      `SELECT s.*, COALESCE(l.cnt, 0) AS links_count
         FROM tiktok_seed_accounts s
         LEFT JOIN (
           SELECT seed_id, COUNT(*)::int AS cnt
             FROM tiktok_network_links
            GROUP BY seed_id
         ) l ON l.seed_id = s.id
        ORDER BY s.created_at DESC`
    );
    return res.json({ ok: true, seeds: result.rows.map(mapSeed) });
  })
);

// CREATE seed
const seedCreateSchema = z.object({
  handle: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/seeds",
  a(async (req, res) => {
    const parsed = seedCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    const handle = normalizeHandle(parsed.data.handle);
    if (!handle) return res.status(400).json({ ok: false, error: "invalid_handle" });

    // Best-effort scrape of profile metadata
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    const scraped =
      (await scrapeProfileViaWorker(handle).catch(() => null)) ||
      (await scrapeTikTokProfile(handle).catch(() => null));
    if (scraped) {
      displayName = scraped.displayName;
      avatarUrl = scraped.avatarUrl;
    }

    const result = await pool.query(
      `INSERT INTO tiktok_seed_accounts (handle, display_name, avatar_url, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (handle) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, tiktok_seed_accounts.display_name),
         avatar_url   = COALESCE(EXCLUDED.avatar_url, tiktok_seed_accounts.avatar_url),
         notes        = COALESCE(EXCLUDED.notes, tiktok_seed_accounts.notes),
         is_active    = TRUE,
         updated_at   = NOW()
       RETURNING *`,
      [handle, displayName, avatarUrl, parsed.data.notes ?? null]
    );
    const row = result.rows[0];
    return res.json({ ok: true, seed: mapSeed({ ...row, links_count: 0 }) });
  })
);

// DELETE seed
tiktokOutreachRouter.delete(
  "/fsb/tiktok/seeds/:id",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    await pool.query(`DELETE FROM tiktok_seed_accounts WHERE id = $1`, [id]);
    return res.json({ ok: true });
  })
);

// REFRESH seed network — calls worker, persists signals
tiktokOutreachRouter.post(
  "/fsb/tiktok/seeds/:id/refresh",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const seedRes = await pool.query(
      `SELECT id, handle FROM tiktok_seed_accounts WHERE id = $1`,
      [id]
    );
    if (!seedRes.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const seed = seedRes.rows[0];

    const { signals, diag } = await callSeedNetworkWorker(String(seed.handle));

    if (!signals.length) {
      await pool.query(
        `UPDATE tiktok_seed_accounts
            SET last_network_fetch_at = NOW(),
                last_network_status   = 'empty',
                last_network_error    = $2,
                updated_at            = NOW()
          WHERE id = $1`,
        [id, JSON.stringify(diag).slice(0, 1000)]
      );
      return res.json({ ok: true, added: 0, total: 0, diag });
    }

    let upserts = 0;
    for (const sig of signals) {
      const h = String(sig.handle || "").toLowerCase();
      if (!HANDLE_RE.test(h)) continue;
      if (!["comment", "mention", "duet"].includes(sig.type)) continue;
      await pool.query(
        `INSERT INTO tiktok_network_links (seed_id, candidate_handle, signal_type, count, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, 1, NOW(), NOW())
         ON CONFLICT (seed_id, candidate_handle, signal_type) DO UPDATE SET
           count = tiktok_network_links.count + 1,
           last_seen_at = NOW()`,
        [id, h, sig.type]
      );
      upserts++;
    }

    await pool.query(
      `UPDATE tiktok_seed_accounts
          SET last_network_fetch_at = NOW(),
              last_network_status   = 'ok',
              last_network_error    = NULL,
              updated_at            = NOW()
        WHERE id = $1`,
      [id]
    );

    return res.json({ ok: true, added: upserts, signals: signals.length, diag });
  })
);

// CANDIDATES — agrégation, score, trié
//
// Score (calculé côté Postgres pour pouvoir trier) :
//   seedTier      = 1 seed=10, 2=25, 3=50, 4+=100  (cross-seed exponentiel)
//   weights       = following=15, affil_mention=20, affil_comment=10,
//                   mention=3, duet=2, comment=1
//   weighted      = SUM(count * weight)
//   decay         = GREATEST(0.3, 1 - daysSinceLastSeen / 60)   (linéaire 60j)
//   antiFanFactor = si seed_count==1 ET signal_sum>3 ET pas d'affil/following → 0.4
//   bonusAffil    = +50 si has_affil
//   bonusFollowing= +30 si has_following
//   score         = round((seedTier + min(signal_sum,50) + weighted + bonusAffil + bonusFollowing) * decay * antiFanFactor)
//
// Exclusions automatiques :
//   - candidats déjà déclinés / blacklistés en DSB sont retirés systématiquement
//   - excludeImported (option) retire tous ceux déjà importés
//   - affilOnly (option) ne garde que ceux avec au moins 1 signal affil_*
tiktokOutreachRouter.get(
  "/fsb/tiktok/network/candidates",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const excludeImported = String(req.query.excludeImported ?? "0") === "1";
    const affilOnly = String(req.query.affilOnly ?? "0") === "1";

    const rows = await pool.query(
      `
      WITH agg AS (
        SELECT
          l.candidate_handle,
          COUNT(DISTINCT l.seed_id)::int AS seed_count,
          SUM(l.count)::int              AS signal_sum,
          SUM(CASE l.signal_type
                WHEN 'following'     THEN l.count * 15
                WHEN 'affil_mention' THEN l.count * 20
                WHEN 'affil_comment' THEN l.count * 10
                WHEN 'mention'       THEN l.count * 3
                WHEN 'duet'          THEN l.count * 2
                ELSE l.count
              END)::int                  AS weighted_signal,
          BOOL_OR(l.signal_type IN ('affil_comment','affil_mention')) AS has_affil,
          BOOL_OR(l.signal_type = 'following')                         AS has_following,
          ARRAY_AGG(DISTINCT l.signal_type) AS types,
          ARRAY_AGG(DISTINCT s.handle)      AS seed_handles,
          MAX(l.last_seen_at)             AS last_seen_at,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT l.source_video_url), NULL) AS source_videos
        FROM tiktok_network_links l
        JOIN tiktok_seed_accounts s ON s.id = l.seed_id
        GROUP BY l.candidate_handle
      ),
      overlap_agg AS (
        SELECT candidate_handle, COUNT(DISTINCT seed_id)::int AS follow_overlap
        FROM tiktok_seed_follows
        GROUP BY candidate_handle
      ),
      mutual_agg AS (
        SELECT
          cf.candidate_handle,
          COUNT(*) FILTER (
            WHERE LOWER(s.handle) = LOWER(cf.follows_handle)
          )::int AS mutual_count
        FROM tiktok_candidate_follows cf
        LEFT JOIN tiktok_seed_accounts s ON LOWER(s.handle) = LOWER(cf.follows_handle)
        GROUP BY cf.candidate_handle
      ),
      scored AS (
        SELECT
          agg.*,
          COALESCE(o.follow_overlap, 0) AS follow_overlap,
          COALESCE(m.mutual_count, 0)   AS mutual_count,
          GREATEST(
            0.3,
            1 - EXTRACT(EPOCH FROM (NOW() - agg.last_seen_at)) / (60 * 86400.0)
          )::numeric(6,3) AS decay
        FROM agg
        LEFT JOIN overlap_agg o ON o.candidate_handle = agg.candidate_handle
        LEFT JOIN mutual_agg  m ON m.candidate_handle = agg.candidate_handle
      )
      SELECT
        s2.*,
        -- Peer score: combine follow_overlap (vrai signal créateur) + mutuel
        -- (anti-célébrité) + bonus niche bio + pénalité célébrité.
        ROUND(
          (
            -- 1) Coeur du score : follow_overlap (signal le + propre)
            (s2.follow_overlap * 60)
            -- 2) Mutualité (anti-célébrité)
            + CASE
                WHEN s2.mutual_count >= 3 THEN 120
                WHEN s2.mutual_count = 2  THEN 80
                WHEN s2.mutual_count = 1  THEN 50
                ELSE 0
              END
            -- 3) Bonus niche bio (whitelist mots-clés)
            --    Inclut prank/facecam/irl en plus du casino/streaming
            + CASE
                WHEN cp.bio IS NULL THEN 0
                WHEN LOWER(cp.bio) ~ '(casino|slot|bonus|hunt|gambling|streamer|twitch|kick|jeu |jeux |pari|stake|roobet|winamax|betclic|unibet|pmu|freespin|bonanza|rtp|blackjack|roulette|poker|crash|plinko|prank|prankster|face cam|facecam|irl|live |stream|gamer|gaming|content creator|créateur de contenu|youtubeur|youtuber|cam ?girl|cam ?boy)'
                  THEN 80
                ELSE 0
              END
            -- 4) Affil signals (vrais créateurs qui mentionnent partenaires)
            + CASE WHEN s2.has_affil THEN 50 ELSE 0 END
            -- 5) Tier d'engagement par seed_count (ancien)
            + CASE
                WHEN s2.seed_count >= 4 THEN 50
                WHEN s2.seed_count = 3  THEN 25
                WHEN s2.seed_count = 2  THEN 10
                ELSE 0
              END
            -- 6) Bonus follower-tier (peer = 5K-500K, idéal).
            --    PÉNALITÉ DURE pour <1K (vrais kids/fans) et non-enrichis
            --    (sinon ils dominent le top avec leur follow_overlap brut).
            + CASE
                WHEN cp.follower_count IS NULL THEN -150
                WHEN cp.follower_count < 500   THEN -250
                WHEN cp.follower_count < 1000  THEN -150
                WHEN cp.follower_count < 5000  THEN -50
                WHEN cp.follower_count BETWEEN 5000 AND 10000   THEN 30
                WHEN cp.follower_count BETWEEN 10000 AND 200000 THEN 60
                WHEN cp.follower_count BETWEEN 200000 AND 500000 THEN 30
                ELSE 0
              END
            -- 7) Pénalité célébrité DURE : >=2M + zéro mutuel = vraie célébrité
            --    (Popcorn 8M, Booba 4M, Carrefour officiel 2M+).
            --    Pas de palier intermédiaire pour éviter faux positifs.
            + CASE
                WHEN cp.follower_count IS NOT NULL
                     AND cp.follower_count >= 2000000
                     AND COALESCE(s2.mutual_count, 0) = 0
                  THEN -300
                ELSE 0
              END
            -- 8) Pénalité bio hors-niche LIGHT : musique / humour seul = -50.
            --    Pas -200 (trop fort, virait des peers qui font aussi pranks).
            --    Mutual ≥ 1 protège toujours (annule la pénalité).
            + CASE
                WHEN cp.bio IS NULL THEN 0
                WHEN COALESCE(s2.mutual_count, 0) >= 1 THEN 0
                WHEN LOWER(cp.bio) ~ '(rappeur|chanteur|musicien|beatmaker|\bdj\b|humoriste|comédien|comedien|sketch|chef cuisinier|recette)'
                     AND LOWER(cp.bio) !~ '(casino|slot|bonus|hunt|streamer|prank|facecam|face cam|irl|jeu |jeux |pari|twitch|kick)'
                  THEN -50
                ELSE 0
              END
            -- 9) Pénalité bio hors-niche DURE : que les cas évidents
            --    (magasin officiel, presse, politique). -200, mais mutual protège.
            + CASE
                WHEN cp.bio IS NULL THEN 0
                WHEN COALESCE(s2.mutual_count, 0) >= 1 THEN 0
                WHEN LOWER(cp.bio) ~ '(magasin|supermarch|carrefour|leclerc|auchan|monoprix|député|depute|ministre|sénateur|senateur|journaliste|presse|compte officiel|marque officielle)'
                  THEN -200
                ELSE 0
              END
            -- 9) Pénalité micro-fan (followers connu et < 1000, sans mutuel)
            + CASE
                WHEN cp.follower_count IS NOT NULL
                     AND cp.follower_count < 1000
                     AND COALESCE(s2.mutual_count, 0) = 0
                  THEN -100
                ELSE 0
              END
            -- 10) Bonus région FR/BE/CH/etc. quand région connue
            + CASE
                WHEN cp.region IN ('FR','BE','CH','LU','MC','MA','TN','DZ') THEN 15
                ELSE 0
              END
          ) * s2.decay
        )::int AS score,
        i.id            AS influencer_id,
        i.status        AS influencer_status,
        i.email         AS influencer_email,
        i.follower_count AS influencer_follower_count,
        i.display_name  AS influencer_display_name,
        i.avatar_url    AS influencer_avatar_url,
        cp.follower_count AS cand_follower_count,
        cp.video_count    AS cand_video_count,
        cp.heart_count    AS cand_heart_count,
        cp.bio            AS cand_bio,
        cp.bio_email      AS cand_bio_email,
        cp.verified       AS cand_verified,
        cp.region         AS cand_region,
        cp.avatar_url     AS cand_avatar_url,
        cp.display_name   AS cand_display_name,
        cp.last_enriched_at AS cand_enriched_at,
        -- Verdict niche pour l'UI. Mutual ≥ 1 prime tout (peer confirmé).
        CASE
          WHEN s2.mutual_count >= 1 THEN 'peer_confirmed'
          WHEN cp.follower_count IS NOT NULL
               AND cp.follower_count >= 2000000
               AND COALESCE(s2.mutual_count, 0) = 0
            THEN 'celebrity'
          WHEN cp.bio IS NOT NULL
               AND LOWER(cp.bio) ~ '(magasin|supermarch|député|depute|ministre|presse|compte officiel|marque officielle)'
            THEN 'off_niche'
          WHEN cp.bio IS NOT NULL
               AND LOWER(cp.bio) ~ '(casino|slot|bonus|hunt|gambling|streamer|twitch|kick|prank|facecam|face cam|irl|gaming|youtubeur|youtuber)'
            THEN 'peer_likely'
          WHEN cp.follower_count IS NOT NULL
               AND cp.follower_count < 1000
               AND COALESCE(s2.mutual_count, 0) = 0
            THEN 'fan'
          ELSE 'unknown'
        END AS niche_verdict
      FROM scored s2
      LEFT JOIN tiktok_influencers i ON LOWER(i.handle) = s2.candidate_handle
      LEFT JOIN tiktok_candidate_profiles cp ON cp.handle = s2.candidate_handle
      LEFT JOIN tiktok_dismissed_candidates dc ON dc.handle = s2.candidate_handle
      WHERE COALESCE(i.status, '') NOT IN ('declined','blacklisted')
        AND dc.handle IS NULL
        ${excludeImported ? "AND i.id IS NULL" : ""}
        ${affilOnly ? "AND s2.has_affil = TRUE" : ""}
      ORDER BY score DESC, s2.last_seen_at DESC
      LIMIT $1
      `,
      [limit]
    );

    const candidates = rows.rows.map((r) => {
      const seedCount = Number(r.seed_count || 0);
      const signalSum = Number(r.signal_sum || 0);
      const weighted = Number(r.weighted_signal || 0);
      const hasAffil = Boolean(r.has_affil);
      const hasFollowing = Boolean(r.has_following);
      const score = Number(r.score || 0);
      const decay = r.decay != null ? Number(r.decay) : 1;
      const antiFanFactor = r.anti_fan_factor != null ? Number(r.anti_fan_factor) : 1;
      const followOverlap = Number(r.follow_overlap || 0);
      const mutualCount = Number(r.mutual_count || 0);
      const nicheVerdict = String(r.niche_verdict || "unknown");

      // Profile (cache enrichi en priorité, sinon données du DSB si déjà importé)
      const enrichedAvatar = r.cand_avatar_url || r.influencer_avatar_url || null;
      const enrichedFollowers =
        r.cand_follower_count != null
          ? Number(r.cand_follower_count)
          : r.influencer_follower_count != null
          ? Number(r.influencer_follower_count)
          : null;

      return {
        handle: r.candidate_handle,
        seedCount,
        signalSum,
        weightedSignal: weighted,
        hasAffil,
        hasFollowing,
        followOverlap,
        mutualCount,
        nicheVerdict,
        decay,
        antiFanFactor,
        score,
        signalTypes: Array.isArray(r.types) ? r.types : [],
        seedHandles: Array.isArray(r.seed_handles) ? r.seed_handles : [],
        sourceVideos: Array.isArray(r.source_videos) ? r.source_videos : [],
        lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
        profile: {
          displayName: r.cand_display_name || r.influencer_display_name || null,
          avatarUrl: enrichedAvatar,
          followerCount: enrichedFollowers,
          videoCount: r.cand_video_count != null ? Number(r.cand_video_count) : null,
          heartCount: r.cand_heart_count != null ? Number(r.cand_heart_count) : null,
          verified: Boolean(r.cand_verified),
          region: r.cand_region || null,
          bio: r.cand_bio || null,
          bioEmail: r.cand_bio_email || null,
          enrichedAt: r.cand_enriched_at ? new Date(r.cand_enriched_at).toISOString() : null,
        },
        influencer: r.influencer_id
          ? {
              id: String(r.influencer_id),
              status: r.influencer_status,
              email: r.influencer_email || null,
              followerCount:
                r.influencer_follower_count != null
                  ? Number(r.influencer_follower_count)
                  : null,
              displayName: r.influencer_display_name || null,
              avatarUrl: r.influencer_avatar_url || null,
            }
          : null,
      };
    });

    return res.json({ ok: true, candidates });
  })
);

// Patterns d'affil libres (taap.it/..., lunalive.win/r/..., autres)
// L'extension matche ces patterns en substring case-insensitive dans les
// descriptions TikTok pour tagger les vidéos comme "affil".
function mapAffilPattern(row: any) {
  return {
    id: String(row.id),
    pattern: row.pattern,
    label: row.label || null,
    landingId: row.landing_id ? String(row.landing_id) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

tiktokOutreachRouter.get(
  "/fsb/tiktok/affil-patterns",
  a(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, pattern, label, landing_id, created_at
         FROM tiktok_affil_patterns
        ORDER BY created_at DESC`
    );
    return res.json({
      ok: true,
      patterns: result.rows.map(mapAffilPattern),
    });
  })
);

const affilPatternCreateSchema = z.object({
  pattern: z.string().min(2).max(300),
  label: z.string().max(200).optional(),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/affil-patterns",
  a(async (req, res) => {
    const parsed = affilPatternCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }
    let pattern = String(parsed.data.pattern || "").trim();
    if (!pattern) return res.status(400).json({ ok: false, error: "empty_pattern" });
    // Normalise : strip protocol pour matcher plus large (ex: "https://taap.it/abc" -> "taap.it/abc")
    pattern = pattern.replace(/^https?:\/\//i, "").replace(/^\/+/, "");
    const result = await pool.query(
      `INSERT INTO tiktok_affil_patterns (pattern, label)
       VALUES ($1, $2)
       ON CONFLICT (LOWER(pattern)) DO UPDATE SET
         label = COALESCE(EXCLUDED.label, tiktok_affil_patterns.label)
       RETURNING id, pattern, label, landing_id, created_at`,
      [pattern, parsed.data.label || null]
    );
    return res.json({ ok: true, pattern: mapAffilPattern(result.rows[0]) });
  })
);

tiktokOutreachRouter.delete(
  "/fsb/tiktok/affil-patterns/:id",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    await pool.query(`DELETE FROM tiktok_affil_patterns WHERE id = $1`, [id]);
    return res.json({ ok: true });
  })
);

// IMPORT signals from extension (logged TikTok session bypasses anti-bot)
const SIGNAL_TYPES = [
  "comment",
  "mention",
  "duet",
  "affil_comment",
  "affil_mention",
  "following",
] as const;

const importSignalsSchema = z.object({
  signals: z.array(
    z.object({
      handle: z.string().min(1),
      type: z.enum(SIGNAL_TYPES),
      sourceVideoUrl: z.string().url().optional().nullable(),
    })
  ),
  // URLs des vidéos qui ont été scrapées avec succès lors de ce scan
  // (ce qu'il faut skipper aux prochains scans).
  scannedVideoUrls: z.array(z.string().url()).optional(),
});

// Liste des URLs vidéos déjà scrapées pour un seed → l'extension les skip.
tiktokOutreachRouter.get(
  "/fsb/tiktok/seeds/:id/scanned-videos",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const result = await pool.query(
      `SELECT video_url, scraped_at FROM tiktok_seed_scanned_videos
        WHERE seed_id = $1 ORDER BY scraped_at DESC`,
      [id]
    );
    return res.json({
      ok: true,
      videos: result.rows.map((r) => ({
        url: r.video_url,
        scrapedAt: r.scraped_at ? new Date(r.scraped_at).toISOString() : null,
      })),
    });
  })
);

tiktokOutreachRouter.post(
  "/fsb/tiktok/seeds/:id/import-signals",
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const seedRes = await pool.query(
      `SELECT id, handle FROM tiktok_seed_accounts WHERE id = $1`,
      [id]
    );
    if (!seedRes.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const seedHandle = String(seedRes.rows[0].handle).toLowerCase();

    const parsed = importSignalsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_input" });
    }

    let upserts = 0;
    const seen = new Set<string>();
    for (const sig of parsed.data.signals) {
      const h = String(sig.handle || "").toLowerCase();
      if (!HANDLE_RE.test(h)) continue;
      if (h === seedHandle) continue;
      if (!(SIGNAL_TYPES as readonly string[]).includes(sig.type)) continue;
      const k = `${sig.type}:${h}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const srcUrl =
        typeof sig.sourceVideoUrl === "string" && sig.sourceVideoUrl.length > 0
          ? sig.sourceVideoUrl
          : null;
      await pool.query(
        `INSERT INTO tiktok_network_links
           (seed_id, candidate_handle, signal_type, count, first_seen_at, last_seen_at, source_video_url)
         VALUES ($1, $2, $3, 1, NOW(), NOW(), $4)
         ON CONFLICT (seed_id, candidate_handle, signal_type) DO UPDATE SET
           count = tiktok_network_links.count + 1,
           last_seen_at = NOW(),
           source_video_url = COALESCE(EXCLUDED.source_video_url, tiktok_network_links.source_video_url)`,
        [id, h, sig.type, srcUrl]
      );
      upserts++;
    }

    // Enregistre les vidéos qu'on vient de scraper avec succès → on skip au scan suivant
    const scannedUrls = Array.isArray(parsed.data.scannedVideoUrls)
      ? parsed.data.scannedVideoUrls
      : [];
    let scannedRecorded = 0;
    for (const u of scannedUrls) {
      const url = String(u || "").trim();
      if (!url) continue;
      try {
        await pool.query(
          `INSERT INTO tiktok_seed_scanned_videos (seed_id, video_url, signals_found)
           VALUES ($1, $2, 0)
           ON CONFLICT (seed_id, video_url) DO UPDATE SET scraped_at = NOW()`,
          [id, url]
        );
        scannedRecorded++;
      } catch {}
    }

    await pool.query(
      `UPDATE tiktok_seed_accounts
          SET last_network_fetch_at = NOW(),
              last_network_status   = $2,
              last_network_error    = NULL,
              updated_at            = NOW()
        WHERE id = $1`,
      [id, upserts > 0 ? "ok" : "empty"]
    );

    return res.json({
      ok: true,
      added: upserts,
      received: parsed.data.signals.length,
      scannedRecorded,
    });
  })
);

// ENRICH — scrape les profils des top N candidats non encore enrichis et stocke
// dans tiktok_candidate_profiles (cache, n'ajoute PAS au DSB).
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/enrich",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || 10));
    const force = String(req.body?.force ?? "0") === "1" || req.body?.force === true;

    // Récupère le top N par score sur la même formule que l'endpoint candidates.
    const topRes = await pool.query(
      `
      WITH agg AS (
        SELECT
          l.candidate_handle,
          COUNT(DISTINCT l.seed_id)::int AS seed_count,
          SUM(l.count)::int AS signal_sum,
          SUM(CASE l.signal_type
                WHEN 'following'     THEN l.count * 15
                WHEN 'affil_mention' THEN l.count * 20
                WHEN 'affil_comment' THEN l.count * 10
                WHEN 'mention'       THEN l.count * 3
                WHEN 'duet'          THEN l.count * 2
                ELSE l.count
              END)::int AS weighted_signal,
          BOOL_OR(l.signal_type IN ('affil_comment','affil_mention')) AS has_affil,
          BOOL_OR(l.signal_type = 'following')                         AS has_following,
          MAX(l.last_seen_at) AS last_seen_at
        FROM tiktok_network_links l
        GROUP BY l.candidate_handle
      )
      SELECT a.candidate_handle
      FROM agg a
      LEFT JOIN tiktok_candidate_profiles cp ON cp.handle = a.candidate_handle
      LEFT JOIN tiktok_influencers i ON LOWER(i.handle) = a.candidate_handle
      LEFT JOIN tiktok_dismissed_candidates dc ON dc.handle = a.candidate_handle
      WHERE COALESCE(i.status, '') NOT IN ('declined','blacklisted')
        AND dc.handle IS NULL
        ${force ? "" : "AND cp.handle IS NULL"}
      ORDER BY (
        CASE
          WHEN a.seed_count >= 4 THEN 100
          WHEN a.seed_count = 3  THEN 50
          WHEN a.seed_count = 2  THEN 25
          ELSE 10
        END
        + LEAST(a.signal_sum, 50)
        + a.weighted_signal
        + CASE WHEN a.has_affil THEN 50 ELSE 0 END
        + CASE WHEN a.has_following THEN 30 ELSE 0 END
      ) DESC
      LIMIT $1
      `,
      [limit]
    );

    const handles = topRes.rows.map((r) => String(r.candidate_handle));
    let enriched = 0;
    let failed = 0;
    for (const h of handles) {
      const profile =
        (await scrapeProfileViaWorker(h).catch(() => null)) ||
        (await scrapeTikTokProfile(h).catch(() => null));
      if (!profile) {
        failed++;
        continue;
      }
      await pool.query(
        `INSERT INTO tiktok_candidate_profiles
           (handle, display_name, bio, bio_email, avatar_url, follower_count, following_count,
            heart_count, video_count, verified, region, raw, last_enriched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
         ON CONFLICT (handle) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           bio_email = EXCLUDED.bio_email,
           avatar_url = EXCLUDED.avatar_url,
           follower_count = EXCLUDED.follower_count,
           following_count = EXCLUDED.following_count,
           heart_count = EXCLUDED.heart_count,
           video_count = EXCLUDED.video_count,
           verified = EXCLUDED.verified,
           region = EXCLUDED.region,
           raw = EXCLUDED.raw,
           last_enriched_at = NOW()`,
        [
          profile.handle,
          profile.displayName,
          profile.bio,
          profile.email,
          profile.avatarUrl,
          profile.followerCount,
          profile.followingCount,
          profile.heartCount,
          profile.videoCount,
          profile.verified,
          profile.country,
          profile.raw,
        ]
      );
      enriched++;
    }
    return res.json({ ok: true, enriched, failed, total: handles.length });
  })
);

// ENRICH candidate profiles from pre-scraped data (sent by the browser extension).
// Upsert in tiktok_candidate_profiles ONLY (does NOT add to DSB).
const enrichBulkSchema = z.object({
  profiles: z.array(importBulkProfileSchema).min(1).max(200),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/network/enrich-bulk",
  a(async (req, res) => {
    const parsed = enrichBulkSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    let upserted = 0;
    for (const raw of parsed.data.profiles) {
      const profile = profileFromExtensionPayload(raw);
      if (!profile.handle) continue;
      await pool.query(
        `INSERT INTO tiktok_candidate_profiles
           (handle, display_name, bio, bio_email, avatar_url, follower_count, following_count,
            heart_count, video_count, verified, region, raw, last_enriched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
         ON CONFLICT (handle) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           bio_email = EXCLUDED.bio_email,
           avatar_url = EXCLUDED.avatar_url,
           follower_count = EXCLUDED.follower_count,
           following_count = EXCLUDED.following_count,
           heart_count = EXCLUDED.heart_count,
           video_count = EXCLUDED.video_count,
           verified = EXCLUDED.verified,
           region = EXCLUDED.region,
           raw = EXCLUDED.raw,
           last_enriched_at = NOW()`,
        [
          profile.handle,
          profile.displayName,
          profile.bio,
          profile.email,
          profile.avatarUrl,
          profile.followerCount,
          profile.followingCount,
          profile.heartCount,
          profile.videoCount,
          profile.verified,
          profile.country,
          profile.raw,
        ]
      );
      upserted++;
    }
    return res.json({ ok: true, upserted, total: parsed.data.profiles.length });
  })
);

// ─── FOLLOW-GRAPH (peer discovery) ───────────────────────────────────────

// L'extension dump la /following d'un seed → on remplace l'ensemble.
const seedFollowsSchema = z.object({
  seedHandle: z.string().trim().min(1).max(40),
  follows: z.array(z.string().trim().min(1).max(40)).max(20000),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/network/seed-follows",
  a(async (req, res) => {
    const parsed = seedFollowsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    const seedHandle = normalizeHandle(parsed.data.seedHandle);
    const follows = parsed.data.follows
      .map((h) => normalizeHandle(h))
      .filter((h) => h && h !== seedHandle);

    const seedRow = await pool.query(
      `SELECT id FROM tiktok_seed_accounts WHERE handle = $1`,
      [seedHandle]
    );
    if (!seedRow.rows.length) {
      return res.status(404).json({ ok: false, error: "seed_not_found" });
    }
    const seedId = seedRow.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Reset complet pour ce seed (la liste est l'autorité)
      await client.query(
        `DELETE FROM tiktok_seed_follows WHERE seed_id = $1`,
        [seedId]
      );
      if (follows.length) {
        const values: string[] = [];
        const params: any[] = [seedId];
        let i = 2;
        for (const h of follows) {
          values.push(`($1, $${i++})`);
          params.push(h);
        }
        await client.query(
          `INSERT INTO tiktok_seed_follows (seed_id, candidate_handle)
           VALUES ${values.join(",")}
           ON CONFLICT DO NOTHING`,
          params
        );
      }
      // Aussi refléter dans tiktok_network_links comme signal 'following' pour
      // garder la rétrocompat avec l'ancien pipeline.
      for (const h of follows) {
        await client.query(
          `INSERT INTO tiktok_network_links
             (seed_id, candidate_handle, signal_type, count, last_seen_at)
           VALUES ($1, $2, 'following', 1, NOW())
           ON CONFLICT (seed_id, candidate_handle, signal_type)
           DO UPDATE SET last_seen_at = NOW()`,
          [seedId, h]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return res.json({ ok: true, seedHandle, count: follows.length });
  })
);

// FULL RESET du réseau de découverte. Conserve UNIQUEMENT :
//   - tiktok_seed_accounts (les seeds = partenaires actuels)
//   - tiktok_influencers (la DSB existante)
//   - tiktok_affil_patterns (config affil)
// Vide tout le reste pour partir sur une base propre.
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/full-reset",
  a(async (_req, res) => {
    const r1 = await pool.query(`DELETE FROM tiktok_network_links`);
    const r2 = await pool.query(`DELETE FROM tiktok_seed_follows`);
    const r3 = await pool.query(`DELETE FROM tiktok_candidate_follows`);
    const r4 = await pool.query(`DELETE FROM tiktok_candidate_profiles`);
    const r5 = await pool.query(`DELETE FROM tiktok_dismissed_candidates`);
    const r6 = await pool.query(`DELETE FROM tiktok_seed_scanned_videos`);
    return res.json({
      ok: true,
      cleared: {
        network_links: r1.rowCount || 0,
        seed_follows: r2.rowCount || 0,
        candidate_follows: r3.rowCount || 0,
        candidate_profiles: r4.rowCount || 0,
        dismissed: r5.rowCount || 0,
        scanned_videos: r6.rowCount || 0,
      },
    });
  })
);

// Purge complète du graphe de follows (utilisé après détection de scrape
// corrompu, ex: capture des recommandations TikTok au lieu des /following).
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/follow-graph/purge",
  a(async (_req, res) => {
    const a1 = await pool.query(`DELETE FROM tiktok_seed_follows`);
    const a2 = await pool.query(`DELETE FROM tiktok_candidate_follows`);
    // Aussi nettoyer les signaux 'following' dans tiktok_network_links car
    // c'est ce qui a été inséré en miroir lors du dump.
    const a3 = await pool.query(
      `DELETE FROM tiktok_network_links WHERE signal_type = 'following'`
    );
    return res.json({
      ok: true,
      deletedSeedFollows: a1.rowCount || 0,
      deletedCandidateFollows: a2.rowCount || 0,
      deletedFollowingLinks: a3.rowCount || 0,
    });
  })
);

// L'extension dump la /following d'un candidat → on stocke pour mutualité.
const candidateFollowsSchema = z.object({
  candidateHandle: z.string().trim().min(1).max(40),
  follows: z.array(z.string().trim().min(1).max(40)).max(20000),
});

tiktokOutreachRouter.post(
  "/fsb/tiktok/network/candidate-follows",
  a(async (req, res) => {
    const parsed = candidateFollowsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    const candidate = normalizeHandle(parsed.data.candidateHandle);
    const follows = parsed.data.follows
      .map((h) => normalizeHandle(h))
      .filter((h) => h && h !== candidate);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM tiktok_candidate_follows WHERE candidate_handle = $1`,
        [candidate]
      );
      if (follows.length) {
        const values: string[] = [];
        const params: any[] = [candidate];
        let i = 2;
        for (const h of follows) {
          values.push(`($1, $${i++})`);
          params.push(h);
        }
        await client.query(
          `INSERT INTO tiktok_candidate_follows (candidate_handle, follows_handle)
           VALUES ${values.join(",")}
           ON CONFLICT DO NOTHING`,
          params
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return res.json({ ok: true, candidateHandle: candidate, count: follows.length });
  })
);

// Auto-dismiss heuristique: tout candidat enrichi qui matche le profil
// "célébrité hors-niche" est marqué dismissed en lot. Ne touche pas aux
// candidats avec mutual >= 1 ou bio niche-friendly.
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/auto-dismiss",
  a(async (req, res) => {
    const dryRun =
      String(req.body?.dryRun ?? "0") === "1" || req.body?.dryRun === true;

    // BLACKLIST DURE — uniquement les comptes qui ne PEUVENT PAS être des
    // peers du milieu casino/streaming/prank. Pas de musique/humour ici car
    // beaucoup de créateurs touchent à plusieurs registres.
    const NICHE_BLACKLIST = [
      "magasin", "supermarché", "supermarche", "carrefour", "leclerc",
      "auchan", "monoprix", "intermarché", "intermarche",
      "député", "depute", "ministre", "sénateur", "senateur",
      "journaliste", "presse", "compte officiel", "marque officielle",
    ];
    // WHITELIST — protège de l'auto-dismiss + boost dans le score
    const NICHE_WHITELIST = [
      "casino", "slot", "bonus", "hunt", "gambling", "streamer",
      "twitch", "kick", "jeu", "jeux d", "pari", "stake", "roobet",
      "winamax", "betclic", "unibet", "pmu", "freespin", "bonanza",
      "rtp", "blackjack", "roulette", "poker", "crash", "plinko",
      "prank", "prankster", "face cam", "facecam", "irl", "live",
      "gaming", "gamer", "content creator", "youtuber", "youtubeur",
    ];

    // 1) Trouver les candidats avec follower_count >= 500_000 ET aucun mutuel
    //    OU bio contenant un mot blacklist (et aucun mot whitelist)
    const rows = await pool.query(
      `
      WITH agg AS (
        SELECT l.candidate_handle, BOOL_OR(l.signal_type = 'following') AS has_follow
        FROM tiktok_network_links l
        GROUP BY l.candidate_handle
      ),
      mutual AS (
        SELECT cf.candidate_handle, COUNT(*) FILTER (
          WHERE LOWER(s.handle) = LOWER(cf.follows_handle)
        ) AS mutual_count
        FROM tiktok_candidate_follows cf
        LEFT JOIN tiktok_seed_accounts s ON LOWER(s.handle) = LOWER(cf.follows_handle)
        GROUP BY cf.candidate_handle
      )
      SELECT
        a.candidate_handle,
        cp.bio,
        cp.follower_count,
        COALESCE(m.mutual_count, 0) AS mutual_count
      FROM agg a
      LEFT JOIN tiktok_candidate_profiles cp ON cp.handle = a.candidate_handle
      LEFT JOIN tiktok_dismissed_candidates dc ON dc.handle = a.candidate_handle
      LEFT JOIN tiktok_influencers i ON LOWER(i.handle) = a.candidate_handle
      LEFT JOIN mutual m ON m.candidate_handle = a.candidate_handle
      WHERE dc.handle IS NULL
        AND i.id IS NULL
      `
    );

    const toDismiss: Array<{ handle: string; reason: string }> = [];
    for (const r of rows.rows) {
      const handle = String(r.candidate_handle);
      const bio = String(r.bio || "").toLowerCase();
      const followers = r.follower_count != null ? Number(r.follower_count) : null;
      const mutual = Number(r.mutual_count || 0);

      // Mutuel ≥ 1 → JAMAIS dismiss (signal le plus fort, prime tout)
      if (mutual >= 1) continue;

      // Whitelist niche → on protège
      const hasWhitelist = NICHE_WHITELIST.some((kw) => bio.includes(kw));
      if (hasWhitelist) continue;

      // Cas 1 : célébrité dure = ≥ 2M followers + pas mutuel
      // (Popcorn 8M, Booba 4M, Carrefour officiel 2M+)
      if (followers !== null && followers >= 2_000_000) {
        toDismiss.push({ handle, reason: `celebrity_${followers}` });
        continue;
      }
      // Cas 2 : bio explicitement hors-niche (blacklist DURE seulement)
      const blacklistHit = NICHE_BLACKLIST.find((kw) => bio.includes(kw));
      if (blacklistHit) {
        toDismiss.push({ handle, reason: `niche_blacklist_${blacklistHit.trim()}` });
        continue;
      }
      // Cas 3 : micro-fan certain (followers connu et < 100, pas mutuel,
      // bio vide ou non-niche)
      if (followers !== null && followers < 100) {
        toDismiss.push({ handle, reason: `micro_fan_${followers}` });
        continue;
      }
    }

    if (!dryRun && toDismiss.length) {
      const values: string[] = [];
      const params: any[] = [];
      let i = 1;
      for (const d of toDismiss) {
        values.push(`($${i++}, $${i++})`);
        params.push(d.handle, d.reason);
      }
      await pool.query(
        `INSERT INTO tiktok_dismissed_candidates (handle, reason)
         VALUES ${values.join(",")}
         ON CONFLICT (handle) DO UPDATE SET dismissed_at = NOW(), reason = EXCLUDED.reason`,
        params
      );
    }

    return res.json({
      ok: true,
      dryRun,
      candidatesAnalyzed: rows.rows.length,
      dismissed: toDismiss.length,
      preview: toDismiss.slice(0, 30),
    });
  })
);

// DISMISS a candidate permanently (won't appear in candidates list anymore)
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/dismiss",
  a(async (req, res) => {
    const handleInput = String(req.body?.handle || "").trim();
    const handle = normalizeHandle(handleInput);
    if (!handle) return res.status(400).json({ ok: false, error: "invalid_handle" });
    const reason = String(req.body?.reason || "").slice(0, 200) || null;
    await pool.query(
      `INSERT INTO tiktok_dismissed_candidates (handle, reason)
       VALUES ($1, $2)
       ON CONFLICT (handle) DO UPDATE SET dismissed_at = NOW(), reason = EXCLUDED.reason`,
      [handle, reason]
    );
    return res.json({ ok: true });
  })
);

// UNDISMISS — au cas où on veut le réintégrer
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/undismiss",
  a(async (req, res) => {
    const handleInput = String(req.body?.handle || "").trim();
    const handle = normalizeHandle(handleInput);
    if (!handle) return res.status(400).json({ ok: false, error: "invalid_handle" });
    await pool.query(
      `DELETE FROM tiktok_dismissed_candidates WHERE handle = $1`,
      [handle]
    );
    return res.json({ ok: true });
  })
);

// IMPORT a candidate handle into the DSB (scrape its profile + insert into tiktok_influencers)
tiktokOutreachRouter.post(
  "/fsb/tiktok/network/import",
  a(async (req, res) => {
    const handleInput = String(req.body?.handle || "").trim();
    const handle = normalizeHandle(handleInput);
    if (!handle) return res.status(400).json({ ok: false, error: "invalid_handle" });

    const profile =
      (await scrapeProfileViaWorker(handle).catch(() => null)) ||
      (await scrapeTikTokProfile(handle).catch(() => null));
    if (!profile) return res.status(502).json({ ok: false, error: "scrape_failed" });

    const result = await upsertScrapedProfile(profile);
    return res.json({
      ok: true,
      id: String(result.id),
      handle: profile.handle,
      hasEmail: Boolean(profile.email),
      alreadyContacted: result.alreadyContacted,
    });
  })
);
