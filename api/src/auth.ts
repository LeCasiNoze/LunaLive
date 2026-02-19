// api/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export type AuthUser = {
  id: number;
  username: string;
  role: string;
  // optionnel (si jamais tu l’avais dans certains tokens)
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

  // Bearer
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();

  // Token brut dans Authorization
  if (h && h.split(".").length === 3) return h;

  // fallback header
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

import type { Pool } from "pg";
import { pool } from "./db.js";

// ─────────────────────────────────────────────
// Site ban helpers (user ban only for now)
// ─────────────────────────────────────────────
type BanState = { banned: boolean; until: string | null };

const banCache = new Map<number, { at: number; state: BanState }>();
const BAN_CACHE_MS = 3000;

export async function getActiveSiteUserBan(userId: number): Promise<BanState> {
  const uid = Number(userId || 0);
  if (!uid) return { banned: false, until: null };

  const now = Date.now();
  const hit = banCache.get(uid);
  if (hit && now - hit.at < BAN_CACHE_MS) return hit.state;

  try {
    const r = await pool.query(
      `
      SELECT until
      FROM site_user_bans
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND (until IS NULL OR until > NOW())
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [uid]
    );

    const row = r.rows?.[0];
    const state: BanState = row
      ? { banned: true, until: row.until ? new Date(row.until).toISOString() : null }
      : { banned: false, until: null };

    banCache.set(uid, { at: now, state });
    return state;
  } catch {
    // si la table n'existe pas encore (avant mig), on ne bloque pas
    const state: BanState = { banned: false, until: null };
    banCache.set(uid, { at: now, state });
    return state;
  }
}

// ─────────────────────────────────────────────
// Auth middleware (JWT)
// ─────────────────────────────────────────────
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const debug = process.env.ADMIN_DEBUG === "1";
  if (debug) res.setHeader("x-auth-guard", "requireAuth");

  const token = extractJwtFromReq(req);
  if (!token) {
    if (debug) res.setHeader("x-auth-result", "missing_token");
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const secret = getJwtSecret();
    req.user = jwt.verify(token, secret) as AuthUser;
    if (debug) res.setHeader("x-auth-result", "ok");
  } catch {
    if (debug) res.setHeader("x-auth-result", "bad_token");
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // ✅ BLOCK: site user ban
  const ban = await getActiveSiteUserBan(req.user!.id);
  if (ban.banned) {
    if (debug) res.setHeader("x-auth-result", "banned");
    return res.status(403).json({ ok: false, error: "banned", until: ban.until });
  }

  return next();
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