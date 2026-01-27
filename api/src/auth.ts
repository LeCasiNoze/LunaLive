// api/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

export type AuthUser = {
  id: number;
  username: string;
  role: string;
  rubis?: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ─────────────────────────────────────────────
// Password helpers
// ─────────────────────────────────────────────
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ─────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return secret;
}

// ✅ tolérant : Bearer <jwt> OU <jwt> brut OU x-access-token
function extractJwtFromReq(req: Request): string | null {
  const h = String(req.headers.authorization || "").trim();

  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();

  if (h && h.split(".").length === 3) return h;

  const x = String((req.headers as any)["x-access-token"] || "").trim();
  if (x && x.split(".").length === 3) return x;

  return null;
}

// ✅ on signe MINIMAL (évite rubis stale dans le token)
export function signToken(u: AuthUser) {
  const secret = getJwtSecret();
  const payload = { id: u.id, username: u.username, role: u.role };
  return jwt.sign(payload, secret, { expiresIn: "30d" });
}

// ─────────────────────────────────────────────
// Site-wide bans helpers
// ─────────────────────────────────────────────
function normIp(raw: any): string {
  let s = String(raw || "").trim();
  // express peut renvoyer "::ffff:1.2.3.4"
  if (s.startsWith("::ffff:")) s = s.slice("::ffff:".length);
  // parfois on peut avoir "ip, ip, ip" si mal géré => on prend le 1er
  if (s.includes(",")) s = s.split(",")[0].trim();
  return s;
}

export type SiteBanInfo =
  | { scope: "user"; until: string | null; reason: string | null }
  | { scope: "ip"; until: string | null; reason: string | null };

export async function getActiveSiteBan(opts: {
  userId?: number | null;
  ip?: string | null;
}): Promise<SiteBanInfo | null> {
  const userId = opts.userId != null ? Number(opts.userId) : null;
  const ip = opts.ip ? normIp(opts.ip) : null;

  // 1) ban user
  if (userId) {
    try {
      const r = await pool.query(
        `SELECT until, reason
         FROM site_user_bans
         WHERE user_id=$1
           AND revoked_at IS NULL
           AND (until IS NULL OR until > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      const row = r.rows?.[0];
      if (row) {
        return {
          scope: "user",
          until: row.until ? new Date(row.until).toISOString() : null,
          reason: row.reason != null ? String(row.reason) : null,
        };
      }
    } catch {
      // table peut ne pas exister si migration pas encore passée
    }
  }

  // 2) ban ip
  if (ip) {
    try {
      const r = await pool.query(
        `SELECT until, reason
         FROM site_ip_bans
         WHERE ip=$1
           AND revoked_at IS NULL
           AND (until IS NULL OR until > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [ip]
      );
      const row = r.rows?.[0];
      if (row) {
        return {
          scope: "ip",
          until: row.until ? new Date(row.until).toISOString() : null,
          reason: row.reason != null ? String(row.reason) : null,
        };
      }
    } catch {
      // idem
    }
  }

  return null;
}

export function sendBanned(res: Response, ban: SiteBanInfo) {
  // 403 = pas "unauthorized", mais "refusé"
  return res.status(403).json({
    ok: false,
    error: "banned",
    scope: ban.scope,     // "user" | "ip"
    until: ban.until,     // null => permanent
    reason: ban.reason,   // string|null
  });
}

// ─────────────────────────────────────────────
// Auth middleware (JWT) + ban check
// ─────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const debug = process.env.ADMIN_DEBUG === "1";
  if (debug) res.setHeader("x-auth-guard", "requireAuth");

  const token = extractJwtFromReq(req);
  if (!token) {
    if (debug) res.setHeader("x-auth-result", "missing_token");
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  let user: AuthUser | null = null;
  try {
    const secret = getJwtSecret();
    user = jwt.verify(token, secret) as AuthUser;
    req.user = user;
    if (debug) res.setHeader("x-auth-result", "jwt_ok");
  } catch {
    if (debug) res.setHeader("x-auth-result", "bad_token");
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // ✅ ban check (async without changing signature)
  (async () => {
    const ban = await getActiveSiteBan({ userId: user!.id, ip: req.ip });
    if (ban) {
      if (debug) res.setHeader("x-auth-ban", `${ban.scope}:${ban.until ?? "perm"}`);
      return sendBanned(res, ban);
    }
    return next();
  })().catch((_e) => {
    // en cas d'erreur DB: on laisse passer (évite de casser prod)
    return next();
  });
}

// ─────────────────────────────────────────────
// Admin key helpers
// ─────────────────────────────────────────────
function getExpectedAdminKey(): string {
  return String(
    process.env.ADMIN_KEY ||
      process.env.ADMIN_PASSWORD ||
      process.env.ADMIN_SECRET ||
      process.env.ADMIN_PASS ||
      process.env.ADMIN ||
      ""
  ).trim();
}

// ✅ admin key : accepte x-admin-key OU Bearer <ADMIN_KEY>
function extractAdminKey(req: Request) {
  const k = String((req.headers as any)["x-admin-key"] || "").trim();
  if (k) return k;

  const h = String(req.headers.authorization || "").trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();

  return "";
}

function maskSecret(s: string) {
  const v = String(s || "");
  if (!v) return "";
  if (v.length <= 6) return "***";
  return `${v.slice(0, 2)}***${v.slice(-2)}(len=${v.length})`;
}

// ─────────────────────────────────────────────
// Admin middleware (x-admin-key / Bearer ADMIN_KEY)
// ─────────────────────────────────────────────
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const debug = process.env.ADMIN_DEBUG === "1";
  if (debug) res.setHeader("x-auth-guard", "requireAdminKey");

  const expected = getExpectedAdminKey();
  if (!expected) {
    if (debug) res.setHeader("x-admin-key-check", "no_expected");
    return res.status(500).json({ ok: false, error: "ADMIN_KEY not configured" });
  }

  const provided = extractAdminKey(req);
  const match = !!provided && provided === expected;

  if (debug) {
    res.setHeader("x-admin-key-present", provided ? "1" : "0");
    res.setHeader("x-admin-key-check", match ? "ok" : "fail");

    console.log("[ADMIN_DEBUG] ---- requireAdminKey ----");
    console.log("[ADMIN_DEBUG] method:", req.method);
    console.log("[ADMIN_DEBUG] url:", req.originalUrl || req.url);
    console.log("[ADMIN_DEBUG] headers.authorization:", String(req.headers.authorization || ""));
    console.log("[ADMIN_DEBUG] headers.x-admin-key:", String((req.headers as any)["x-admin-key"] || ""));
    console.log("[ADMIN_DEBUG] headers.x-access-token:", String((req.headers as any)["x-access-token"] || ""));
    console.log("[ADMIN_DEBUG] provided(masked):", maskSecret(provided));
    console.log("[ADMIN_DEBUG] expected(masked):", maskSecret(expected));
    console.log("[ADMIN_DEBUG] match:", match);
    console.log("[ADMIN_DEBUG] ----------------------------");
  }

  if (!match) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  return next();
}

// ─────────────────────────────────────────────
// Optional helper (non-blocking)
// ─────────────────────────────────────────────
export function tryGetAuthUser(req: Request): AuthUser | null {
  const token = extractJwtFromReq(req);
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(token, secret) as AuthUser;
  } catch {
    return null;
  }
}
