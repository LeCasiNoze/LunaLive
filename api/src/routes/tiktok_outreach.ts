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
      // Fallback: regex an email anywhere in HTML (signature often appears)
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
    return null;
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

const DEFAULT_SUBJECT = "Collab LunaLive — landing page casino";
const DEFAULT_BODY = `Salut {{name}},

Je découvre ton compte TikTok et j'aime beaucoup ce que tu fais.

Je m'occupe de LunaLive, une plateforme française autour du streaming et des casinos en ligne. On cherche des créateurs comme toi pour collaborer sur une landing page dédiée (avec ton lien d'affiliation, tes conditions, et un suivi des perfs).

Si l'idée t'intéresse, réponds simplement à ce mail, je t'envoie tous les détails du deal.

À très vite,
L'équipe LunaLive
https://lunalive.win`;

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

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

    const vars = {
      name: row.display_name || `@${row.handle}`,
      handle: row.handle,
    };
    const subject = renderTemplate(parsed.data.subject || DEFAULT_SUBJECT, vars);
    const body = renderTemplate(parsed.data.body || DEFAULT_BODY, vars);
    const html = `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6;color:#0d1b2e">${body
      .split("\n")
      .map((line) => (line.trim() ? `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br/>"))
      .join("")}</div>`;

    try {
      await sendMail(row.email, subject, body, html);
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
