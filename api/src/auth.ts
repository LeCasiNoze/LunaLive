// api/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export type AuthUser = { id: number; username: string; role: string };

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

export function signToken(u: { id: number; username: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");

  return jwt.sign({ id: u.id, username: u.username, role: u.role }, secret, {
    expiresIn: "30d",
  });
}

function secretHash8(secret: string) {
  return crypto.createHash("sha1").update(secret).digest("hex").slice(0, 8);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ✅ laisser passer le preflight CORS
  if (req.method === "OPTIONS") return res.sendStatus(204);

  // ✅ Debug activable via env Render: AUTH_DEBUG=1
  const DEBUG = process.env.AUTH_DEBUG === "1";

  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      ...(DEBUG ? { reason: "missing_bearer" } : {}),
    });
  }

  const token = m[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    // ⚠️ ne pas masquer en 401: c’est une misconfig serveur
    return res.status(500).json({
      ok: false,
      error: "server_misconfig",
      ...(DEBUG ? { reason: "jwt_secret_missing" } : {}),
    });
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = decoded;

    if (DEBUG) {
      // preuve consultable dans Network → Headers → Response Headers
      res.setHeader("x-auth-debug", `ok; secret=${secretHash8(secret)}; pid=${process.pid}`);
    }

    return next();
  } catch (e: any) {
    const name = e?.name || "verify_failed";
    const msg = e?.message || "";

    if (DEBUG) {
      res.setHeader(
        "x-auth-debug",
        `fail(${name}); secret=${secretHash8(secret)}; pid=${process.pid}`
      );
    }

    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      ...(DEBUG ? { reason: name, message: msg } : {}),
    });
  }
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key = String(req.headers["x-admin-key"] || "");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

export function tryGetAuthUser(req: Request): AuthUser | null {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(m[1], secret) as AuthUser;
  } catch {
    return null;
  }
}
