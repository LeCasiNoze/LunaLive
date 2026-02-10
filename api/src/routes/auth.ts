// api/src/routes/auth.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { hashPassword, verifyPassword, signToken, requireAuth, getActiveSiteUserBan } from "../auth.js";
import { sendVerifyCode } from "../utils/mailer.js";

export const authRouter = Router();

// en haut du fichier (auth.ts)
function defaultAvatarPath(userId: number) {
  const count = Math.max(1, Number(process.env.DEFAULT_AVATAR_COUNT ?? 20));
  const n = (userId % count) + 1;
  const code = String(n).padStart(3, "0");
  return `/Avatar/avatar_${code}.png`;
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function genCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ✅ helper: fetch user + coupons/tokens + subscriptions
async function getUserWithWalletBits(userId: number) {
  const { rows } = await pool.query(
    `SELECT
        u.id,
        u.username,
        u.rubis,
        u.role,
        u.email_verified AS "emailVerified",
        u.avatar_path AS "avatarUrl",


        -- ✅ legacy/facile: viewer actif (tu peux le garder)
        EXISTS (
          SELECT 1
          FROM user_subscriptions us
          WHERE us.user_id = u.id
            AND us.plan_code = 'viewer'
            AND us.status IN ('active','trialing')
            AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
        ) AS "premiumActive",

        -- ✅ NEW: liste complète des subs (viewer + streamer)
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'plan_code', us.plan_code,
              'status', us.status,
              'current_period_start', us.current_period_start,
              'current_period_end', us.current_period_end,
              'cancel_at_period_end', us.cancel_at_period_end,
              'provider', us.provider,
              'provider_subscription_id', us.provider_subscription_id
            )
            ORDER BY us.plan_code
          )
          FROM user_subscriptions us
          WHERE us.user_id = u.id
        ), '[]'::jsonb) AS "user_subscriptions",

        COALESCE((
          SELECT jsonb_object_agg(code, qty)
          FROM user_coupons
          WHERE user_id = u.id AND qty > 0
        ), '{}'::jsonb) AS coupons,

        COALESCE((
          SELECT jsonb_object_agg(token, amount)
          FROM user_tokens
          WHERE user_id = u.id AND amount > 0
        ), '{}'::jsonb) AS tokens

     FROM users u
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

authRouter.post(
  "/auth/register",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");

    if (username.length < 3) return res.status(400).json({ ok: false, error: "username_too_short" });
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "email_invalid" });
    if (password.length < 6) return res.status(400).json({ ok: false, error: "password_too_short" });

    await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);

    const u1 = await pool.query(
      `SELECT 1 FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($2) LIMIT 1`,
      [username, email]
    );
    if (u1.rows[0]) return res.status(400).json({ ok: false, error: "already_used" });

    const u2 = await pool.query(
      `SELECT 1 FROM pending_registrations WHERE lower(username)=lower($1) OR lower(email)=lower($2) LIMIT 1`,
      [username, email]
    );
    if (u2.rows[0]) return res.status(400).json({ ok: false, error: "already_pending" });

    const passwordHash = await hashPassword(password);

    const code = genCode6();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const refSlug = String(req.body.ref || "").trim() || null;

    try {
      await pool.query(
        `INSERT INTO pending_registrations (username, email, password_hash, code_hash, expires_at, created_ip, ref_slug)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [username, email, passwordHash, codeHash, expiresAt, req.ip, refSlug]
      );
    } catch {
      return res.status(400).json({ ok: false, error: "already_pending" });
    }

    const NODE_ENV = process.env.NODE_ENV || "development";
    const IS_DEV = NODE_ENV !== "production";

    try {
      await sendVerifyCode(email, code, 15);
    } catch (e) {
      console.warn("[auth/register] mail failed:", e);

      if (IS_DEV) return res.json({ ok: true, needsVerify: true, devCode: code });

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

authRouter.post(
  "/auth/register/verify",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const code = String(req.body.code || "").trim();

    if (!username) return res.status(400).json({ ok: false, error: "username_required" });
    if (code.length < 4) return res.status(400).json({ ok: false, error: "code_required" });

    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, code_hash, expires_at, ref_slug
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

    let created;
    try {
      created = await pool.query(
        `INSERT INTO users (username, email, email_verified, password_hash, role, rubis, created_ip, last_login_ip, last_login_at)
         VALUES ($1,$2,TRUE,$3,'viewer',0,$4,$4,NOW())
         RETURNING id`,
        [p.username, p.email, p.password_hash, req.ip]
      );
    } catch {
      await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [p.id]);
      return res.status(400).json({ ok: false, error: "already_used" });
    }

    await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [p.id]);

    const userId = Number(created.rows[0].id);
    // ✅ auto-lock referral si ref présent (signup -> streamer slug)
    try {
      const refSlug = String(p.ref_slug || "").trim();
      if (refSlug) {
        const st = await pool.query(
          `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
          [refSlug]
        );
        const streamerId = st.rows?.[0]?.id ? Number(st.rows[0].id) : 0;

        if (streamerId > 0) {
          await pool.query(
            `INSERT INTO user_referrals(user_id, streamer_id, source)
            VALUES ($1,$2,'signup')
            ON CONFLICT (user_id) DO NOTHING`,
            [userId, streamerId]
          );
        }
      }
    } catch (e) {
      console.log("[auth/register/verify] referral lock failed", (e as any)?.message || e);
    }

    await pool.query(
      `UPDATE users SET avatar_path = COALESCE(avatar_path, $2) WHERE id=$1`,
      [userId, defaultAvatarPath(userId)]
    );
    const user = await getUserWithWalletBits(userId);

    const token = signToken({ id: user.id, username: user.username, rubis: user.rubis, role: user.role });

    res.json({ ok: true, token, user });
  })
);

authRouter.post(
  "/auth/register/resend",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    if (!username) return res.status(400).json({ ok: false, error: "username_required" });

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

authRouter.post(
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

    const ban = await getActiveSiteUserBan(Number(u.id));
    if (ban.banned) return res.status(403).json({ ok: false, error: "banned", until: ban.until });

    const fullUser = await getUserWithWalletBits(Number(u.id));
    const token = signToken({ id: fullUser.id, username: fullUser.username, rubis: fullUser.rubis, role: fullUser.role });

    res.json({ ok: true, token, user: fullUser });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  a(async (req, res) => {
    const userId = Number(req.user!.id);
    const user = await getUserWithWalletBits(userId);
    if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
    res.json({ ok: true, user });
  })
);