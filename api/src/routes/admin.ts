// api/src/routes/admin.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { a } from "../utils/async.js";
import { slugify } from "../slug.js";
import { ensureAssignedDliveAccount, releaseAccountForStreamerId } from "../provider_accounts.js";

export const adminRouter = Router();

adminRouter.get(
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
            await client.query("COMMIT");
          } finally {
            client.release();
          }
        }

        await pool.query(`DELETE FROM streamers WHERE user_id=$1`, [id]);
      }
    }

    const out = await pool.query(`SELECT id, username, role, rubis, created_at AS "createdAt" FROM users WHERE id=$1`, [
      id,
    ]);
    if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, user: out.rows[0] });
  })
);

/* Provider accounts */
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
