import express from "express";
import cors from "cors";
import { pool, migrate, seedIfEmpty } from "./db.js";
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdminKey } from "./auth.js";
import { slugify } from "./slug.js";
import type { Request, Response, NextFunction } from "express";

const app = express();
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
      `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers
       FROM streamers
       WHERE slug = $1
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json(rows[0]);
  })
);

/* Auth */
app.post(
  "/auth/register",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (username.length < 3) return res.status(400).json({ ok: false, error: "username_too_short" });
    if (password.length < 6) return res.status(400).json({ ok: false, error: "password_too_short" });

    const hash = await hashPassword(password);

    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1,$2)
       RETURNING id, username, rubis, role`,
      [username, hash]
    );

    const user = rows[0];
    const token = signToken(user);
    res.json({ ok: true, token, user });
  })
);

app.post(
  "/auth/login",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const { rows } = await pool.query(
      `SELECT id, username, rubis, role, password_hash
       FROM users WHERE username = $1 LIMIT 1`,
      [username]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ ok: false, error: "bad_credentials" });

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "bad_credentials" });

    const user = { id: u.id, username: u.username, rubis: u.rubis, role: u.role };
    const token = signToken(user);
    res.json({ ok: true, token, user });
  })
);

app.get(
  "/me",
  requireAuth,
  a(async (req, res) => {
    // token contient déjà user, mais on revalide depuis DB pour role/rubis à jour
    const { rows } = await pool.query(
      `SELECT id, username, rubis, role FROM users WHERE id = $1 LIMIT 1`,
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
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
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
    const { rows } = await pool.query(
      `UPDATE streamer_requests SET status='approved', updated_at=NOW()
       WHERE id = $1
       RETURNING user_id`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const userId = rows[0].user_id;

    // role streamer
    await pool.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);

    // create streamer profile if missing
    const u = await pool.query(`SELECT username FROM users WHERE id=$1`, [userId]);
    const username = String(u.rows[0]?.username || `user-${userId}`);
    let slug = slugify(username);

    const exists = await pool.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
    if (exists.rows[0]) slug = `${slug}-${userId}`;

    await pool.query(
      `INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
       VALUES ($1,$2,$3,'',0,false)
       ON CONFLICT (user_id) DO NOTHING`,
      [slug, username, userId]
    );

    res.json({ ok: true });
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

    // 🔻 repasse le user en viewer
    await pool.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);

    // 🔻 supprime le streamer profile lié à ce user (s’il existe)
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

    const r = await pool.query(`SELECT user_id FROM streamers WHERE slug=$1 LIMIT 1`, [slug]);
    const userId = r.rows[0]?.user_id ?? null;

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


app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "server_error" });
});

const port = Number(process.env.PORT || 3001);

(async () => {
  await migrate();
  await seedIfEmpty();
  app.listen(port, () => console.log(`[api] listening on :${port}`));
})();
