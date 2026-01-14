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

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractJwtFromReq(req);
  if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });

  try {
    const secret = getJwtSecret();
    req.user = jwt.verify(token, secret) as AuthUser;
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

function getExpectedAdminKey() {
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
  const k = String(req.headers["x-admin-key"] || "").trim();
  if (k) return k;

  const h = String(req.headers.authorization || "").trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();

  return "";
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const expected = getExpectedAdminKey();
  if (!expected) return res.status(500).json({ ok: false, error: "ADMIN_KEY not configured" });

  const provided = extractAdminKey(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}


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
