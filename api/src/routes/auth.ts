import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "../auth.js";
import { sendVerifyCode } from "../utils/mailer.js";

export const authRouter = Router();

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function genCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ───────────────── REGISTER ───────────────── */

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

    await pool.query(
      `INSERT INTO pending_registrations (username, email, password_hash, code_hash, expires_at, created_ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [username, email, passwordHash, codeHash, expiresAt, req.ip]
    );

    await sendVerifyCode(email, code, 15);
    res.json({ ok: true, needsVerify: true });
  })
);

/* ───────────────── VERIFY ───────────────── */

authRouter.post(
  "/auth/register/verify",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const code = String(req.body.code || "").trim();

    const { rows } = await pool.query(
      `SELECT * FROM pending_registrations WHERE lower(username)=lower($1) LIMIT 1`,
      [username]
    );

    const p = rows[0];
    if (!p) return res.status(400).json({ ok: false, error: "no_pending" });

    const ok = await verifyPassword(code, p.code_hash);
    if (!ok) return res.status(400).json({ ok: false, error: "bad_code" });

    const created = await pool.query(
      `INSERT INTO users (username, email, email_verified, password_hash, role, rubis, created_ip, last_login_ip, last_login_at)
       VALUES ($1,$2,TRUE,$3,'viewer',0,$4,$4,NOW())
       RETURNING id, username, rubis, role, email_verified AS "emailVerified"`,
      [p.username, p.email, p.password_hash, req.ip]
    );

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

/* ───────────────── LOGIN ───────────────── */

authRouter.post(
  "/auth/login",
  a(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const { rows } = await pool.query(
      `SELECT id, username, rubis, role, password_hash, email_verified
       FROM users WHERE lower(username)=lower($1) LIMIT 1`,
      [username]
    );

    const u = rows[0];
    if (!u) return res.status(401).json({ ok: false, error: "bad_credentials" });
    if (!u.email_verified) return res.status(401).json({ ok: false, error: "email_not_verified" });

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "bad_credentials" });

    await pool.query(`UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, [req.ip, u.id]);

    const user = {
      id: u.id,
      username: u.username,
      rubis: u.rubis,
      role: u.role,
    };

    const token = signToken(user);
    res.json({ ok: true, token, user });
  })
);

/* ───────────────── ME ───────────────── */

authRouter.get(
  "/me",
  requireAuth,
  a(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, username, rubis, role, email_verified AS "emailVerified"
       FROM users WHERE id=$1 LIMIT 1`,
      [req.user!.id]
    );

    if (!rows[0]) return res.status(401).json({ ok: false, error: "unauthorized" });
    res.json({ ok: true, user: rows[0] });
  })
);
