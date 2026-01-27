// api/src/routes/admin.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { a } from "../utils/async.js";
import { slugify } from "../slug.js";
import { ensureAssignedDliveAccount, releaseAccountForStreamerId } from "../provider_accounts.js";
import { runSlotsUpdate } from "../calls/updater.js";

export const adminRouter = Router();

// ─────────────────────────────────────────────
// Helpers (safe)
// ─────────────────────────────────────────────
async function regclassExists(name: string): Promise<boolean> {
  const full = name.includes(".") ? name : `public.${name}`;
  const r = await pool.query(`SELECT to_regclass($1) AS reg`, [full]);
  return !!r.rows?.[0]?.reg;
}

function normIp(raw: any): string {
  let s = String(raw || "").trim();
  if (s.startsWith("::ffff:")) s = s.slice("::ffff:".length);
  if (s.includes(",")) s = s.split(",")[0].trim();
  return s;
}

function parseUntil(v: any): Date | null | "bad" {
  if (v == null || v === "") return null; // permanent
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) return "bad";
  return d;
}

async function safeScalar<T>(sql: string, params: any[], key: string): Promise<T | null> {
  try {
    const r = await pool.query(sql, params);
    const v = r.rows?.[0]?.[key];
    return v == null ? null : (v as T);
  } catch {
    return null;
  }
}

function readInt(v: any): number | null {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function normalizeSlug(input: string) {
  const s = String(input || "").trim();
  if (!s) return "";
  // on accepte déjà un slug propre, sinon slugify
  const cleaned = s.toLowerCase();
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned)) return cleaned;
  return slugify(s);
}

// ─────────────────────────────────────────────
// Requests (streamer apply)
// ─────────────────────────────────────────────
adminRouter.get(
  "/admin/requests",
  requireAdminKey,
  a(async (req, res) => {
    const status = String((req.query as any)?.status || "").trim();
    const allowed = new Set(["pending", "approved", "rejected"]);

    const where = allowed.has(status) ? `WHERE r.status = $1` : "";
    const params = allowed.has(status) ? [status] : [];

    const { rows } = await pool.query(
      `
      SELECT r.id, r.status, r.created_at AS "createdAt",
             u.id AS "userId", u.username
      FROM streamer_requests r
      JOIN users u ON u.id = r.user_id
      ${where}
      ORDER BY r.created_at DESC
      `,
      params
    );

    res.json({ ok: true, requests: rows });
  })
);

adminRouter.post(
  "/admin/requests/:id/approve",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const upd = await client.query(
        `UPDATE streamer_requests
         SET status='approved', updated_at=NOW()
         WHERE id = $1
         RETURNING user_id`,
        [id]
      );
      if (!upd.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      const userId = upd.rows[0].user_id;

      await client.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);

      const u = await client.query(`SELECT username FROM users WHERE id=$1`, [userId]);
      const username = String(u.rows[0]?.username || `user-${userId}`);
      let slug = slugify(username);

      const exists = await client.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
      if (exists.rows[0]) slug = `${slug}-${userId}`;

      // crée si absent
      await client.query(
        `INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
         VALUES ($1,$2,$3,'',0,false)
         ON CONFLICT (user_id) DO NOTHING`,
        [slug, username, userId]
      );

      // ✅ si le streamer existait déjà, on le "réactive"
      await client.query(
        `UPDATE streamers
         SET suspended_until=NULL, updated_at=NOW()
         WHERE user_id=$1`,
        [userId]
      );

      const s = await client.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
      const streamerId = Number(s.rows[0]?.id || 0);
      if (!streamerId) {
        await client.query("ROLLBACK");
        return res.status(500).json({ ok: false, error: "streamer_missing" });
      }

      const conn = await ensureAssignedDliveAccount(client, streamerId);
      if (!conn) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "no_free_provider_account" });
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

adminRouter.post(
  "/admin/requests/:id/reject",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);

    const { rows } = await pool.query(
      `UPDATE streamer_requests
       SET status='rejected', updated_at=NOW()
       WHERE id = $1
       RETURNING user_id`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const userId = rows[0].user_id;

    // si un streamer existe déjà, on libère le provider
    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
    if (streamerId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await releaseAccountForStreamerId(client, streamerId);
        await client.query(
          `UPDATE streamers SET suspended_until=NOW(), updated_at=NOW(), featured=false WHERE id=$1`,
          [streamerId]
        );
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }

    await pool.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);

    // NOTE: on ne delete plus forcément le streamer ici (au choix)
    // On garde le streamer + suspended_until (ça permet re-approve proprement).
    // Si tu veux l'ancien comportement (delete), dé-commente :
    // await pool.query(`DELETE FROM streamers WHERE user_id=$1`, [userId]);

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────
// Admin Streamers (create / ban / unban)
// ─────────────────────────────────────────────
adminRouter.post(
  "/admin/streamers",
  requireAdminKey,
  a(async (req, res) => {
    const displayName = String(req.body.displayName || "").trim();
    const rawSlug = String(req.body.slug || "").trim();

    if (!displayName && !rawSlug) return res.status(400).json({ ok: false, error: "bad_input" });

    let slug = normalizeSlug(rawSlug || displayName);
    if (!slug) return res.status(400).json({ ok: false, error: "slug_required" });

    // unique slug (simple)
    const exists = await pool.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
    if (exists.rows[0]) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

    await pool.query(
      `INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live, featured, suspended_until)
       VALUES ($1,$2,NULL,'',0,false,false,NULL)`,
      [slug, displayName || slug]
    );

    res.json({ ok: true });
  })
);

/**
 * DELETE /admin/streamers/:slug
 * => "Supprimer" côté admin = BAN (rejected)
 * - permanent: suspended_until = 'infinity'
 * - temporaire: ?durationSec=3600  (1h)
 *
 * Effets:
 * - streamer_requests => rejected
 * - users.role => viewer (si lié à user)
 * - release provider account
 * - streamers.featured=false, is_live=false, viewers=0
 */
adminRouter.delete(
  "/admin/streamers/:slug",
  requireAdminKey,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const durationSec =
      readInt((req.query as any)?.durationSec) ??
      readInt((req.body as any)?.durationSec) ??
      null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const cur = await client.query(
        `SELECT id, user_id
         FROM streamers
         WHERE slug=$1
         FOR UPDATE`,
        [slug]
      );
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      const streamerId = Number(cur.rows[0].id);
      const userId = cur.rows[0].user_id ? Number(cur.rows[0].user_id) : null;

      // streamer "manuel" (pas de user lié) -> on peut vraiment supprimer
      if (!userId) {
        await client.query(`DELETE FROM streamers WHERE id=$1`, [streamerId]);
        await client.query("COMMIT");
        return res.json({ ok: true, deleted: true });
      }

      // 1) streamer_requests -> rejected (upsert)
      await client.query(
        `INSERT INTO streamer_requests (user_id, status)
         VALUES ($1,'rejected')
         ON CONFLICT (user_id)
         DO UPDATE SET status='rejected', updated_at=NOW()`,
        [userId]
      );

      // 2) user role -> viewer
      await client.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);

      // 3) release provider account
      await releaseAccountForStreamerId(client, streamerId);

      // 4) suspend streamer
      if (durationSec) {
        await client.query(
          `UPDATE streamers
           SET suspended_until = NOW() + ($1::int * INTERVAL '1 second'),
               featured = FALSE,
               is_live = FALSE,
               viewers = 0,
               updated_at = NOW()
           WHERE id = $2`,
          [durationSec, streamerId]
        );
      } else {
        await client.query(
          `UPDATE streamers
           SET suspended_until = 'infinity'::timestamptz,
               featured = FALSE,
               is_live = FALSE,
               viewers = 0,
               updated_at = NOW()
           WHERE id = $1`,
          [streamerId]
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true, banned: true, temporary: !!durationSec, durationSec: durationSec ?? null });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

adminRouter.post(
  "/admin/streamers/:slug/unban",
  requireAdminKey,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const cur = await client.query(
        `SELECT id, user_id
         FROM streamers
         WHERE slug=$1
         FOR UPDATE`,
        [slug]
      );
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      const streamerId = Number(cur.rows[0].id);
      const userId = cur.rows[0].user_id ? Number(cur.rows[0].user_id) : null;
      if (!userId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "streamer_has_no_user" });
      }

      // remettre approved + role streamer
      await client.query(
        `INSERT INTO streamer_requests (user_id, status)
         VALUES ($1,'approved')
         ON CONFLICT (user_id)
         DO UPDATE SET status='approved', updated_at=NOW()`,
        [userId]
      );

      await client.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);

      await client.query(
        `UPDATE streamers
         SET suspended_until=NULL, updated_at=NOW()
         WHERE id=$1`,
        [streamerId]
      );

      // ré-assign provider account (si possible)
      const conn = await ensureAssignedDliveAccount(client, streamerId);
      if (!conn) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "no_free_provider_account" });
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

// ─────────────────────────────────────────────
// Site bans (user + ip) - cash pistache V1
// ─────────────────────────────────────────────
adminRouter.post(
  "/admin/bans/user",
  requireAdminKey,
  a(async (req, res) => {
    const userId = Number(req.body.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "bad_userId" });

    const untilParsed = parseUntil(req.body.until);
    if (untilParsed === "bad") return res.status(400).json({ ok: false, error: "bad_until" });

    const reason = req.body.reason != null ? String(req.body.reason).trim().slice(0, 300) : null;

    await pool.query(
      `INSERT INTO site_user_bans (user_id, until, reason, created_by)
       VALUES ($1,$2,$3,$4)`,
      [userId, untilParsed, reason, "admin"]
    );

    res.json({ ok: true });
  })
);

adminRouter.post(
  "/admin/bans/user/unban",
  requireAdminKey,
  a(async (req, res) => {
    const userId = Number(req.body.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "bad_userId" });

    await pool.query(
      `UPDATE site_user_bans
       SET revoked_at = NOW()
       WHERE user_id=$1 AND revoked_at IS NULL`,
      [userId]
    );

    res.json({ ok: true });
  })
);

adminRouter.post(
  "/admin/bans/ip",
  requireAdminKey,
  a(async (req, res) => {
    const ip = normIp(req.body.ip);
    if (!ip) return res.status(400).json({ ok: false, error: "bad_ip" });

    const untilParsed = parseUntil(req.body.until);
    if (untilParsed === "bad") return res.status(400).json({ ok: false, error: "bad_until" });

    const reason = req.body.reason != null ? String(req.body.reason).trim().slice(0, 300) : null;
    const userId = req.body.userId ? Number(req.body.userId) : null;

    await pool.query(
      `INSERT INTO site_ip_bans (ip, until, reason, created_by, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [ip, untilParsed, reason, "admin", userId]
    );

    res.json({ ok: true });
  })
);

adminRouter.post(
  "/admin/bans/ip/unban",
  requireAdminKey,
  a(async (req, res) => {
    const ip = normIp(req.body.ip);
    if (!ip) return res.status(400).json({ ok: false, error: "bad_ip" });

    await pool.query(
      `UPDATE site_ip_bans
       SET revoked_at = NOW()
       WHERE ip=$1 AND revoked_at IS NULL`,
      [ip]
    );

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────
adminRouter.get(
  "/admin/users",
  requireAdminKey,
  a(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.email_verified AS "emailVerified",
        u.role,
        u.rubis,
        u.created_ip AS "createdIp",
        u.last_login_ip AS "lastLoginIp",
        u.last_login_at AS "lastLoginAt",
        u.created_at AS "createdAt",
        sr.status AS "requestStatus",
        s.slug AS "streamerSlug"
      FROM users u
      LEFT JOIN streamer_requests sr ON sr.user_id = u.id
      LEFT JOIN streamers s ON s.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ ok: true, users: rows });
  })
);

adminRouter.get(
  "/admin/users/:id/details",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const r = await pool.query(
      `
      SELECT
        u.id            AS "userId",
        u.created_at    AS "createdAt",
        u.last_login_at AS "lastLoginAt",
        u.created_ip    AS "createdIp",
        u.last_login_ip AS "lastLoginIp"
      FROM users u
      WHERE u.id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    let messagesCount: number | null = null;
    if (await regclassExists("chat_messages")) {
      messagesCount = await safeScalar<number>(
        `SELECT COUNT(*)::int AS c
         FROM chat_messages
         WHERE user_id=$1 AND deleted_at IS NULL`,
        [id],
        "c"
      );
    }

    const spent = await pool.query(
      `
      SELECT COALESCE(SUM(-e.delta), 0)::int AS spent
      FROM rubis_tx_entries e
      JOIN rubis_tx t ON t.id = e.tx_id
      WHERE e.entity = 'user'
        AND e.user_id = $1
        AND e.delta < 0
        AND t.status = 'succeeded'
      `,
      [id]
    );
    const rubisSpent = Number(spent.rows?.[0]?.spent || 0);

    return res.json({
      ok: true,
      userId: r.rows[0].userId,
      createdAt: r.rows[0].createdAt ?? null,
      lastLoginAt: r.rows[0].lastLoginAt ?? null,
      messagesCount,
      rubisSpent,
      siteSpentEur: null,
      createdIp: r.rows[0].createdIp ?? null,
      lastLoginIp: r.rows[0].lastLoginIp ?? null,
    });
  })
);

adminRouter.patch(
  "/admin/users/:id",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    const role = req.body.role ? String(req.body.role) : null;

    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
    if (role && !["viewer", "streamer", "admin"].includes(role)) {
      return res.status(400).json({ ok: false, error: "bad_role" });
    }

    if (role) {
      await pool.query(`UPDATE users SET role=$1 WHERE id=$2`, [role, id]);

      if (role === "streamer") {
        await pool.query(
          `INSERT INTO streamer_requests (user_id, status)
           VALUES ($1,'approved')
           ON CONFLICT (user_id) DO UPDATE SET status='approved', updated_at=NOW()`,
          [id]
        );

        const u = await pool.query(`SELECT username FROM users WHERE id=$1`, [id]);
        const username = String(u.rows[0]?.username || `user-${id}`);
        let slug = slugify(username);

        const exists = await pool.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
        if (exists.rows[0]) slug = `${slug}-${id}`;

        await pool.query(
          `INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
           VALUES ($1,$2,$3,'',0,false)
           ON CONFLICT (user_id) DO NOTHING`,
          [slug, username, id]
        );

        await pool.query(`UPDATE streamers SET suspended_until=NULL, updated_at=NOW() WHERE user_id=$1`, [id]);

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const s = await client.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [id]);
          const streamerId = Number(s.rows[0]?.id || 0);
          if (!streamerId) throw new Error("streamer_missing");

          const conn = await ensureAssignedDliveAccount(client, streamerId);
          if (!conn) {
            await client.query("ROLLBACK");
            return res.status(409).json({ ok: false, error: "no_free_provider_account" });
          }

          await client.query("COMMIT");
        } finally {
          client.release();
        }
      }

      if (role === "viewer") {
        await pool.query(`UPDATE streamer_requests SET status='rejected', updated_at=NOW() WHERE user_id=$1`, [id]);

        const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [id]);
        const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
        if (streamerId) {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await releaseAccountForStreamerId(client, streamerId);
            await client.query(
              `UPDATE streamers SET suspended_until='infinity'::timestamptz, featured=false, updated_at=NOW() WHERE id=$1`,
              [streamerId]
            );
            await client.query("COMMIT");
          } finally {
            client.release();
          }
        }
      }
    }

    const out = await pool.query(`SELECT id, username, role, rubis, created_at AS "createdAt" FROM users WHERE id=$1`, [
      id,
    ]);
    if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, user: out.rows[0] });
  })
);

// ─────────────────────────────────────────────
// Provider accounts
// ─────────────────────────────────────────────
adminRouter.get(
  "/admin/provider-accounts",
  requireAdminKey,
  a(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        pa.id,
        pa.provider,
        pa.channel_slug AS "channelSlug",
        pa.rtmp_url AS "rtmpUrl",
        pa.assigned_at AS "assignedAt",
        pa.released_at AS "releasedAt",
        s.id::text AS "assignedStreamerId",
        s.slug AS "assignedStreamerSlug",
        s.display_name AS "assignedStreamerName",
        u.username AS "assignedUsername"
      FROM provider_accounts pa
      LEFT JOIN streamers s ON s.id = pa.assigned_to_streamer_id
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY pa.id ASC
    `);

    res.json({ ok: true, accounts: rows });
  })
);

adminRouter.post(
  "/admin/provider-accounts",
  requireAdminKey,
  a(async (req, res) => {
    const provider = String(req.body.provider || "dlive").trim() || "dlive";
    const channelSlug = String(req.body.channelSlug || "").trim();
    const rtmpUrl = String(req.body.rtmpUrl || "").trim();
    const streamKey = String(req.body.streamKey || "").trim();

    if (!channelSlug) return res.status(400).json({ ok: false, error: "channelSlug_required" });
    if (!rtmpUrl) return res.status(400).json({ ok: false, error: "rtmpUrl_required" });
    if (!streamKey) return res.status(400).json({ ok: false, error: "streamKey_required" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO provider_accounts (provider, channel_slug, rtmp_url, stream_key)
         VALUES ($1,$2,$3,$4)
         RETURNING id, provider, channel_slug AS "channelSlug", rtmp_url AS "rtmpUrl"`,
        [provider, channelSlug, rtmpUrl, streamKey]
      );
      res.json({ ok: true, account: rows[0] });
    } catch {
      res.status(400).json({ ok: false, error: "already_exists_or_bad_input" });
    }
  })
);

adminRouter.delete(
  "/admin/provider-accounts/:id",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const cur = await pool.query(`SELECT assigned_to_streamer_id FROM provider_accounts WHERE id=$1 LIMIT 1`, [id]);
    if (!cur.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    if (cur.rows[0].assigned_to_streamer_id) {
      return res.status(409).json({ ok: false, error: "assigned_release_first" });
    }

    await pool.query(`DELETE FROM provider_accounts WHERE id=$1`, [id]);
    res.json({ ok: true });
  })
);

adminRouter.post(
  "/admin/provider-accounts/:id/release",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const { rowCount } = await pool.query(
      `UPDATE provider_accounts
       SET assigned_to_streamer_id=NULL, released_at=NOW()
       WHERE id=$1`,
      [id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  })
);

adminRouter.post(
  "/admin/provider-accounts/:id/assign",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    const streamerId = Number(req.body.streamerId);

    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
    if (!streamerId) return res.status(400).json({ ok: false, error: "streamerId_required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const acc = await client.query(
        `SELECT id, assigned_to_streamer_id
         FROM provider_accounts
         WHERE id=$1
         FOR UPDATE`,
        [id]
      );
      if (!acc.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      if (acc.rows[0].assigned_to_streamer_id) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "already_assigned" });
      }

      const s = await client.query(`SELECT id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
      if (!s.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
      }

      const already = await client.query(`SELECT 1 FROM provider_accounts WHERE assigned_to_streamer_id=$1 LIMIT 1`, [
        streamerId,
      ]);
      if (already.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "streamer_already_has_account" });
      }

      await client.query(
        `UPDATE provider_accounts
         SET assigned_to_streamer_id=$1, assigned_at=NOW(), released_at=NULL
         WHERE id=$2`,
        [streamerId, id]
      );

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

// ─────────────────────────────────────────────
// Slots updater
// ─────────────────────────────────────────────
adminRouter.post(
  "/admin/slots/update",
  requireAdminKey,
  a(async (_req, res) => {
    const r = await runSlotsUpdate(pool);
    if (!r.ok) return res.status(500).json({ ok: false, error: r.error });

    const byProvider: Record<string, { name: string; slotKey?: string | null }[]> = {};
    for (const it of r.inserted) {
      const p = (it.provider ? String(it.provider) : "unknown").trim() || "unknown";
      (byProvider[p] ||= []).push({ name: it.name, slotKey: it.slotKey });
    }

    for (const k of Object.keys(byProvider)) {
      byProvider[k].sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json({
      ok: true,
      fetched: r.fetched,
      added: r.inserted.length,
      byProvider,
    });
  })
);
