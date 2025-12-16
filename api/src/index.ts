import express from "express";
import cors from "cors";
import { pool, migrate, seedIfEmpty } from "./db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireAdminKey,
} from "./auth.js";
import { slugify } from "./slug.js";
import type { Request, Response, NextFunction } from "express";
import { sendVerifyCode } from "./utils/mailer.js";
import {
  ensureAssignedDliveAccount,
  releaseAccountForStreamerId,
} from "./provider_accounts.js";
import { startDlivePoller } from "./dlive_poller.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

const a =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/* Health */
app.get("/health", (_req, res) => res.json({ ok: true }));

/* Public */
app.get(
  "/lives",
  a(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers
       FROM streamers
       WHERE is_live = TRUE
         AND (suspended_until IS NULL OR suspended_until < NOW())
       ORDER BY viewers DESC`
    );
    res.json(rows);
  })
);

app.get(
  "/streamers",
  a(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers, is_live AS "isLive", featured
       FROM streamers
       WHERE (suspended_until IS NULL OR suspended_until < NOW())
       ORDER BY LOWER(display_name) ASC`
    );
    res.json(rows);
  })
);

app.get(
  "/streamers/:slug",
  a(async (req, res) => {
    const slug = String(req.params.slug || "");
    const { rows } = await pool.query(
      `SELECT s.id::text AS id,
              s.slug,
              s.display_name AS "displayName",
              s.title,
              s.viewers,
              s.is_live AS "isLive",
              pa.provider AS "provider",
              pa.channel_slug AS "providerChannelSlug"
       FROM streamers s
       LEFT JOIN provider_accounts pa
         ON pa.assigned_to_streamer_id = s.id
        AND pa.provider = 'dlive'
       WHERE s.slug = $1
         AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json(rows[0]);
  })
);

/* ───────────────────────────────────────────── */
/* Auth                                          */
/* ───────────────────────────────────────────── */

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function genCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.post(
  "/auth/register",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");

    if (username.length < 3) return res.status(400).json({ ok: false, error: "username_too_short" });
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "email_invalid" });
    if (password.length < 6) return res.status(400).json({ ok: false, error: "password_too_short" });

    // Nettoie les pending expirés
    await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);

    // Déjà pris dans users ?
    const u1 = await pool.query(
      `SELECT 1 FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($2) LIMIT 1`,
      [username, email]
    );
    if (u1.rows[0]) return res.status(400).json({ ok: false, error: "already_used" });

    // Déjà pris en pending ?
    const u2 = await pool.query(
      `SELECT 1 FROM pending_registrations WHERE lower(username)=lower($1) OR lower(email)=lower($2) LIMIT 1`,
      [username, email]
    );
    if (u2.rows[0]) return res.status(400).json({ ok: false, error: "already_pending" });

    const passwordHash = await hashPassword(password);

    const code = genCode6();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    try {
      await pool.query(
        `INSERT INTO pending_registrations (username, email, password_hash, code_hash, expires_at, created_ip)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [username, email, passwordHash, codeHash, expiresAt, req.ip]
      );
    } catch (e: any) {
      // sécurité en cas de race condition sur index unique
      return res.status(400).json({ ok: false, error: "already_pending" });
    }

    const NODE_ENV = process.env.NODE_ENV || "development";
    const IS_DEV = NODE_ENV !== "production";

    try {
      await sendVerifyCode(email, code, 15);
    } catch (e) {
      console.warn("[auth/register] mail failed:", e);

      // ✅ DEV: on garde le pending (sinon /verify => no_pending)
      if (IS_DEV) {
        return res.json({ ok: true, needsVerify: true, devCode: code });
      }

      // ✅ PROD: on supprime le pending pour permettre de réessayer
      await pool.query(
        `DELETE FROM pending_registrations
        WHERE lower(username)=lower($1) OR lower(email)=lower($2)`,
        [username, email]
      );

      return res.status(500).json({ ok: false, error: "mail_failed" });
    }

    res.json({ ok: true, needsVerify: true });

  })
);

app.post(
  "/auth/register/verify",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const code = String(req.body.code || "").trim();

    if (!username) return res.status(400).json({ ok: false, error: "username_required" });
    if (code.length < 4) return res.status(400).json({ ok: false, error: "code_required" });

    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, code_hash, expires_at
       FROM pending_registrations
       WHERE lower(username)=lower($1)
       LIMIT 1`,
      [username]
    );

    const p = rows[0];
    if (!p) return res.status(400).json({ ok: false, error: "no_pending" });

    if (new Date(p.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [p.id]);
      return res.status(400).json({ ok: false, error: "code_expired" });
    }

    const ok = await verifyPassword(code, p.code_hash);
    if (!ok) return res.status(400).json({ ok: false, error: "bad_code" });

    // Crée le vrai user
    let created;
    try {
      created = await pool.query(
        `INSERT INTO users (username, email, email_verified, password_hash, role, rubis, created_ip, last_login_ip, last_login_at)
         VALUES ($1,$2,TRUE,$3,'viewer',0,$4,$4,NOW())
         RETURNING id, username, rubis, role, email_verified AS "emailVerified"`,
        [p.username, p.email, p.password_hash, req.ip]
      );
    } catch (e: any) {
      // race condition : si entre temps un user a été créé
      await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [p.id]);
      return res.status(400).json({ ok: false, error: "already_used" });
    }

    await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [p.id]);

    const user = created.rows[0];
    const token = signToken({
      id: user.id,
      username: user.username,
      rubis: user.rubis,
      role: user.role,
    });

    res.json({ ok: true, token, user });
  })
);

app.post(
  "/auth/register/resend",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    if (!username) return res.status(400).json({ ok: false, error: "username_required" });

    // Nettoie les pending expirés
    await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);

    const { rows } = await pool.query(
      `SELECT id, email FROM pending_registrations
       WHERE lower(username)=lower($1)
       LIMIT 1`,
      [username]
    );

    const p = rows[0];
    if (!p) return res.status(400).json({ ok: false, error: "no_pending" });

    const code = genCode6();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `UPDATE pending_registrations
       SET code_hash=$1, expires_at=$2
       WHERE id=$3`,
      [codeHash, expiresAt, p.id]
    );

    const NODE_ENV = process.env.NODE_ENV || "development";
    const IS_DEV = NODE_ENV !== "production";

    try {
      await sendVerifyCode(p.email, code, 15);
    } catch (e) {
      console.warn("[auth/resend] mail failed:", e);
      if (IS_DEV) return res.json({ ok: true, needsVerify: true, devCode: code });
      return res.status(500).json({ ok: false, error: "mail_failed" });
    }

    res.json({ ok: true, needsVerify: true });
  })
);

app.post(
  "/auth/login",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const { rows } = await pool.query(
      `SELECT id, username, rubis, role, password_hash, email_verified
       FROM users
       WHERE lower(username) = lower($1)
       LIMIT 1`,
      [username]
    );

    const u = rows[0];
    if (!u) return res.status(401).json({ ok: false, error: "bad_credentials" });
    if (!u.email_verified) return res.status(401).json({ ok: false, error: "email_not_verified" });

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "bad_credentials" });

    await pool.query(`UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, [req.ip, u.id]);

    const user = { id: u.id, username: u.username, rubis: u.rubis, role: u.role };
    const token = signToken(user);
    res.json({ ok: true, token, user });
  })
);

app.get(
  "/me",
  requireAuth,
  a(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, username, rubis, role, email_verified AS "emailVerified"
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user!.id]
    );
    if (!rows[0]) return res.status(401).json({ ok: false, error: "unauthorized" });
    res.json({ ok: true, user: rows[0] });
  })
);

/* Streamer request */
app.post(
  "/streamer/apply",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;

    const { rows } = await pool.query(
      `INSERT INTO streamer_requests (user_id, status)
      VALUES ($1, 'pending')
      ON CONFLICT (user_id) DO UPDATE
        SET status='pending', updated_at = NOW()
      RETURNING id, status, created_at AS "createdAt"`,
      [userId]
    );

    res.json({ ok: true, request: rows[0] });
  })
);

app.get(
  "/streamer/request",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT id, status, created_at AS "createdAt"
       FROM streamer_requests
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    res.json({ ok: true, request: rows[0] || null });
  })
);

/* Streamer (dashboard) */
app.get(
  "/streamer/me",
  requireAuth,
  a(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id::text AS id, slug, display_name AS "displayName",
              title, viewers, is_live AS "isLive", featured
       FROM streamers
       WHERE user_id = $1
       LIMIT 1`,
      [req.user!.id]
    );
    res.json({ ok: true, streamer: rows[0] || null });
  })
);

app.patch(
  "/streamer/me",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const title = String(req.body.title ?? "").trim();
    if (title.length > 140) {
      return res.status(400).json({ ok: false, error: "title_too_long" });
    }

    const { rows } = await pool.query(
      `UPDATE streamers
       SET title = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING id::text AS id, slug, display_name AS "displayName",
                 title, viewers, is_live AS "isLive", featured`,
      [title, req.user!.id]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, streamer: rows[0] });
  })
);

app.get(
  "/streamer/me/connection",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const { rows } = await pool.query(
      `SELECT pa.provider,
              pa.channel_slug AS "channelSlug",
              pa.rtmp_url AS "rtmpUrl",
              pa.stream_key AS "streamKey"
       FROM provider_accounts pa
       JOIN streamers s ON s.id = pa.assigned_to_streamer_id
       WHERE s.user_id = $1
       LIMIT 1`,
      [req.user!.id]
    );

    res.json({ ok: true, connection: rows[0] || null });
  })
);

/* Admin */
app.get(
  "/admin/requests",
  requireAdminKey,
  a(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.created_at AS "createdAt",
              u.id AS "userId", u.username
       FROM streamer_requests r
       JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC`
    );
    res.json({ ok: true, requests: rows });
  })
);

app.post(
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

      await client.query(
        `INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
         VALUES ($1,$2,$3,'',0,false)
         ON CONFLICT (user_id) DO NOTHING`,
        [slug, username, userId]
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
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

app.get(
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

app.patch(
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

        // Assigne un compte provider (tx simple)
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
        await pool.query(
          `UPDATE streamer_requests SET status='rejected', updated_at=NOW() WHERE user_id=$1`,
          [id]
        );
        const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [id]);
        const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
        if (streamerId) {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await releaseAccountForStreamerId(client, streamerId);
            await client.query("COMMIT");
          } finally {
            client.release();
          }
        }

        await pool.query(`DELETE FROM streamers WHERE user_id=$1`, [id]);
      }
    }

    const out = await pool.query(
      `SELECT id, username, role, rubis, created_at AS "createdAt" FROM users WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, user: out.rows[0] });
  })
);

app.post(
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

    // libère le compte provider (si existe)
    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
    if (streamerId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await releaseAccountForStreamerId(client, streamerId);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }

    await pool.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);
    await pool.query(`DELETE FROM streamers WHERE user_id=$1`, [userId]);

    res.json({ ok: true });
  })
);

app.post(
  "/admin/streamers",
  requireAdminKey,
  a(async (req, res) => {
    const slug = slugify(String(req.body.slug || ""));
    const displayName = String(req.body.displayName || "").trim();
    if (!displayName) return res.status(400).json({ ok: false, error: "displayName_required" });

    const { rows } = await pool.query(
      `INSERT INTO streamers (slug, display_name)
       VALUES ($1,$2)
       RETURNING id::text AS id, slug, display_name AS "displayName"`,
      [slug, displayName]
    );
    res.json({ ok: true, streamer: rows[0] });
  })
);

app.delete(
  "/admin/streamers/:slug",
  requireAdminKey,
  a(async (req, res) => {
    const slug = String(req.params.slug || "");

    const r = await pool.query(
      `SELECT id, user_id FROM streamers WHERE slug=$1 LIMIT 1`,
      [slug]
    );
    const streamerId = r.rows[0]?.id ? Number(r.rows[0].id) : null;
    const userId = r.rows[0]?.user_id ?? null;

    if (streamerId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await releaseAccountForStreamerId(client, streamerId);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }

    await pool.query(`DELETE FROM streamers WHERE slug=$1`, [slug]);

    if (userId) {
      await pool.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);
      await pool.query(
        `UPDATE streamer_requests SET status='rejected', updated_at=NOW() WHERE user_id=$1`,
        [userId]
      );
    }

    res.json({ ok: true });
  })
);

/* Admin — Provider accounts */
app.get(
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

app.post(
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
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: "already_exists_or_bad_input" });
    }
  })
);

app.delete(
  "/admin/provider-accounts/:id",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const cur = await pool.query(
      `SELECT assigned_to_streamer_id FROM provider_accounts WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (!cur.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    if (cur.rows[0].assigned_to_streamer_id) {
      return res.status(409).json({ ok: false, error: "assigned_release_first" });
    }

    await pool.query(`DELETE FROM provider_accounts WHERE id=$1`, [id]);
    res.json({ ok: true });
  })
);

app.post(
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

app.post(
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

      const s = await client.query(
        `SELECT id FROM streamers WHERE id=$1 LIMIT 1`,
        [streamerId]
      );
      if (!s.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
      }

      const already = await client.query(
        `SELECT 1 FROM provider_accounts WHERE assigned_to_streamer_id=$1 LIMIT 1`,
        [streamerId]
      );
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
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally {
      client.release();
    }
  })
);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "server_error" });
});

const port = Number(process.env.PORT || 3001);

(async () => {
  await migrate();
  await seedIfEmpty();
  startDlivePoller();
  app.listen(port, () => console.log(`[api] listening on :${port}`));
})();
