// api/src/routes/account_actions.ts
import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { hashPassword, verifyPassword, requireAuth, signToken } from "../auth.js";
import { sendVerifyCode } from "../utils/mailer.js";
import { spendRubisTx } from "../wallet_engine.js";

export const accountActionsRouter = Router();

function genCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidUsername(u: string) {
  const s = String(u || "").trim();
  return s.length >= 3 && s.length <= 32;
}

function isValidPassword(p: string) {
  return String(p || "").length >= 6;
}

function daysSince(ts: any) {
  const t = ts ? new Date(ts).getTime() : 0;
  if (!t) return Infinity;
  return (Date.now() - t) / (24 * 3600 * 1000);
}

async function getUserEmail(userId: number) {
  const { rows } = await pool.query(
    `SELECT email, email_verified
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [userId]
  );
  return {
    email: rows[0]?.email ? String(rows[0].email) : null,
    emailVerified: !!rows[0]?.email_verified,
  };
}

async function invalidatePreviousCodesByUser(userId: number, kind: string) {
  await pool.query(
    `UPDATE account_action_codes
     SET consumed_at=NOW()
     WHERE user_id=$1 AND kind=$2 AND consumed_at IS NULL`,
    [userId, String(kind)]
  );
}

async function invalidatePreviousCodesByEmail(email: string, kind: string) {
  await pool.query(
    `UPDATE account_action_codes
     SET consumed_at=NOW()
     WHERE lower(email)=lower($1) AND kind=$2 AND consumed_at IS NULL`,
    [String(email || "").trim(), String(kind)]
  );
}

async function insertCode(p: {
  userId?: number | null;
  email?: string | null;
  kind: "rename" | "password" | "forgot";
  code: string;
  ip?: string | null;
  minutes?: number;
}) {
  const minutes = Math.max(3, Math.min(60, Number(p.minutes ?? 15) || 15));
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const codeHash = await hashPassword(p.code);

  await pool.query(
    `INSERT INTO account_action_codes (user_id, email, kind, code_hash, expires_at, created_ip)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [p.userId ?? null, p.email ?? null, p.kind, codeHash, expiresAt, p.ip ?? null]
  );

  return { minutes, expiresAt };
}

async function getLatestCodeForUserTx(client: PoolClient, userId: number, kind: string) {
  const MAX_ATTEMPTS = 6;

  const { rows } = await client.query(
    `SELECT id, code_hash, attempts, expires_at
     FROM account_action_codes
     WHERE user_id=$1 AND kind=$2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [userId, String(kind)]
  );

  const row = rows[0];
  if (!row) throw new Error("no_code");
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) throw new Error("too_many_attempts");

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await client.query(`UPDATE account_action_codes SET consumed_at=NOW() WHERE id=$1`, [row.id]);
    throw new Error("code_expired");
  }

  return row as { id: number; code_hash: string; attempts: number; expires_at: any };
}

async function badAttemptTx(client: PoolClient, codeId: number) {
  await client.query(`UPDATE account_action_codes SET attempts=attempts+1 WHERE id=$1`, [codeId]);
}

async function consumeCodeTx(client: PoolClient, codeId: number) {
  await client.query(`UPDATE account_action_codes SET consumed_at=NOW() WHERE id=$1`, [codeId]);
}

async function verifyLatestCodeUserTx(client: PoolClient, userId: number, kind: string, code: string) {
  const row = await getLatestCodeForUserTx(client, userId, kind);
  const ok = await verifyPassword(String(code || "").trim(), String(row.code_hash));
  if (!ok) {
    await badAttemptTx(client, row.id);
    throw new Error("bad_code");
  }
  return row.id;
}

async function verifyConsumeCodeByEmail(email: string, kind: string, code: string) {
  const MAX_ATTEMPTS = 6;

  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts, expires_at
     FROM account_action_codes
     WHERE lower(email)=lower($1) AND kind=$2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(email || "").trim(), String(kind)]
  );

  const row = rows[0];
  if (!row) throw new Error("no_code");
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) throw new Error("too_many_attempts");

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`UPDATE account_action_codes SET consumed_at=NOW() WHERE id=$1`, [row.id]);
    throw new Error("code_expired");
  }

  const ok = await verifyPassword(String(code || "").trim(), String(row.code_hash));
  if (!ok) {
    await pool.query(`UPDATE account_action_codes SET attempts=attempts+1 WHERE id=$1`, [row.id]);
    throw new Error("bad_code");
  }

  await pool.query(`UPDATE account_action_codes SET consumed_at=NOW() WHERE id=$1`, [row.id]);
  return true;
}

/* ─────────────────────────────────────────────
   ✅ RENAME (auth) : code email + 30 jours OU 1000 rubis
───────────────────────────────────────────── */

accountActionsRouter.post(
  "/me/rename/request-code",
  requireAuth,
  a(async (req, res) => {
    const userId = Number(req.user!.id);

    const { email, emailVerified } = await getUserEmail(userId);
    if (!email) return res.status(400).json({ ok: false, error: "email_missing" });
    if (!emailVerified) return res.status(400).json({ ok: false, error: "email_not_verified" });

    await invalidatePreviousCodesByUser(userId, "rename");

    const code = genCode6();
    await insertCode({ userId, email, kind: "rename", code, ip: req.ip, minutes: 15 });

    const IS_DEV = (process.env.NODE_ENV || "development") !== "production";
    try {
      await sendVerifyCode(email, code, 15);
    } catch (e) {
      console.warn("[rename/request-code] mail failed:", e);
      if (IS_DEV) return res.json({ ok: true, devCode: code });
      return res.status(500).json({ ok: false, error: "mail_failed" });
    }

    res.json({ ok: true });
  })
);

accountActionsRouter.post(
  "/me/rename/confirm",
  requireAuth,
  a(async (req, res) => {
    const userId = Number(req.user!.id);
    const newUsername = String(req.body.newUsername || "").trim();
    const code = String(req.body.code || "").trim();
    const payIfNeeded = !!req.body.payIfNeeded;

    if (!isValidUsername(newUsername)) return res.status(400).json({ ok: false, error: "username_invalid" });
    if (code.length < 4) return res.status(400).json({ ok: false, error: "code_required" });

    // username unique (avant tx: ok)
    const u1 = await pool.query(`SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1`, [newUsername]);
    if (u1.rows[0]) return res.status(400).json({ ok: false, error: "username_taken" });

    const u = await pool.query(`SELECT username, rubis, role, last_rename_at FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const me = u.rows[0];
    if (!me) return res.status(401).json({ ok: false, error: "unauthorized" });

    const days = daysSince(me.last_rename_at);
    const COOLDOWN_DAYS = 30;
    const PRICE = 1000;

    const needsPay = Number.isFinite(days) && days < COOLDOWN_DAYS;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ✅ vérifie le code (mais ne le consomme pas si cooldown sans paiement)
      let codeId: number;
      try {
        codeId = await verifyLatestCodeUserTx(client, userId, "rename", code);
      } catch (e: any) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: String(e?.message || "bad_code") });
      }

      if (needsPay && !payIfNeeded) {
        const remainingDays = Math.max(1, Math.ceil(COOLDOWN_DAYS - days));
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "cooldown",
          remainingDays,
          price: PRICE,
        });
      }

      if (needsPay) {
        await spendRubisTx(client, {
          userId,
          amount: PRICE,
          spendKind: "sink",
          spendType: "rename_early",
          streamerId: null,
          meta: { newUsername },
        });
      }

      await client.query(
        `UPDATE users
         SET username=$2, last_rename_at=NOW()
         WHERE id=$1`,
        [userId, newUsername]
      );

        // ✅ si l'utilisateur est streamer, on sync le display_name streamer
       await client.query(
        `UPDATE streamers
        SET display_name=$2, updated_at=NOW()
        WHERE user_id=$1`,
        [userId, newUsername]
        );

      // ✅ consume code seulement si action OK
      await consumeCodeTx(client, codeId);

      const updated = await client.query(
        `SELECT id, username, rubis, role
         FROM users
         WHERE id=$1
         LIMIT 1`,
        [userId]
      );

      await client.query("COMMIT");

      const user = updated.rows[0];
      const token = signToken({ id: user.id, username: user.username, rubis: user.rubis, role: user.role });

      res.json({
        ok: true,
        token,
        user,
        paid: needsPay ? PRICE : 0,
      });
    } catch (e: any) {
      try { await client.query("ROLLBACK"); } catch {}
      const msg = String(e?.message || "server_error");
      if (msg === "insufficient_rubis") return res.status(400).json({ ok: false, error: "insufficient_rubis" });
      return res.status(500).json({ ok: false, error: "server_error" });
    } finally {
      client.release();
    }
  })
);

/* ─────────────────────────────────────────────
   ✅ CHANGE PASSWORD (auth) : code email
───────────────────────────────────────────── */

accountActionsRouter.post(
  "/me/password/request-code",
  requireAuth,
  a(async (req, res) => {
    const userId = Number(req.user!.id);

    const { email, emailVerified } = await getUserEmail(userId);
    if (!email) return res.status(400).json({ ok: false, error: "email_missing" });
    if (!emailVerified) return res.status(400).json({ ok: false, error: "email_not_verified" });

    await invalidatePreviousCodesByUser(userId, "password");

    const code = genCode6();
    await insertCode({ userId, email, kind: "password", code, ip: req.ip, minutes: 15 });

    const IS_DEV = (process.env.NODE_ENV || "development") !== "production";
    try {
      await sendVerifyCode(email, code, 15);
    } catch (e) {
      console.warn("[password/request-code] mail failed:", e);
      if (IS_DEV) return res.json({ ok: true, devCode: code });
      return res.status(500).json({ ok: false, error: "mail_failed" });
    }

    res.json({ ok: true });
  })
);

accountActionsRouter.post(
  "/me/password/confirm",
  requireAuth,
  a(async (req, res) => {
    const userId = Number(req.user!.id);
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (code.length < 4) return res.status(400).json({ ok: false, error: "code_required" });
    if (!isValidPassword(newPassword)) return res.status(400).json({ ok: false, error: "password_too_short" });

    // ici on peut consommer directement, pas de branche "cooldown"
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const codeId = await verifyLatestCodeUserTx(client, userId, "password", code);
      const passwordHash = await hashPassword(newPassword);
      await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [userId, passwordHash]);
      await consumeCodeTx(client, codeId);
      await client.query("COMMIT");
    } catch (e: any) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(400).json({ ok: false, error: String(e?.message || "bad_code") });
    } finally {
      client.release();
    }

    res.json({ ok: true });
  })
);

/* ─────────────────────────────────────────────
   ✅ FORGOT PASSWORD (public) : code email + reset + token
───────────────────────────────────────────── */

accountActionsRouter.post(
  "/auth/forgot/request-code",
  a(async (req, res) => {
    const email = String(req.body.email || "").trim();
    const IS_DEV = (process.env.NODE_ENV || "development") !== "production";

    const neutralOk = (devCode?: string) => res.json(devCode ? { ok: true, devCode } : { ok: true });
    if (!email) return neutralOk();

    const { rows } = await pool.query(
      `SELECT id, email
       FROM users
       WHERE lower(email)=lower($1)
       LIMIT 1`,
      [email]
    );

    const u = rows[0];
    if (!u) return neutralOk();

    await invalidatePreviousCodesByEmail(email, "forgot");

    const code = genCode6();
    await insertCode({ userId: Number(u.id), email: String(u.email), kind: "forgot", code, ip: req.ip, minutes: 15 });

    try {
      await sendVerifyCode(String(u.email), code, 15);
    } catch (e) {
      console.warn("[forgot/request-code] mail failed:", e);
      if (IS_DEV) return neutralOk(code);
      return neutralOk();
    }

    return neutralOk();
  })
);

accountActionsRouter.post(
  "/auth/forgot/confirm",
  a(async (req, res) => {
    const email = String(req.body.email || "").trim();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email) return res.status(400).json({ ok: false, error: "email_required" });
    if (code.length < 4) return res.status(400).json({ ok: false, error: "code_required" });
    if (!isValidPassword(newPassword)) return res.status(400).json({ ok: false, error: "password_too_short" });

    try {
      await verifyConsumeCodeByEmail(email, "forgot", code);
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: String(e?.message || "bad_code") });
    }

    const { rows } = await pool.query(
      `SELECT id, username, rubis, role
       FROM users
       WHERE lower(email)=lower($1)
       LIMIT 1`,
      [email]
    );

    const u = rows[0];
    if (!u) return res.status(400).json({ ok: false, error: "user_not_found" });

    const passwordHash = await hashPassword(newPassword);
    await pool.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [Number(u.id), passwordHash]);

    const user = { id: u.id, username: u.username, rubis: u.rubis, role: u.role };
    const token = signToken(user);

    res.json({ ok: true, token, user });
  })
);
