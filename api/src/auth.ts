// api/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

  return jwt.sign(
    { id: u.id, username: u.username, role: u.role },
    secret,
    { expiresIn: "30d" }
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  console.log("[AUTH] header:", req.headers.authorization);
  console.log("[AUTH] JWT_SECRET present:", !!process.env.JWT_SECRET);
  console.log("[AUTH] user:", req.user);
  
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    console.log("[AUTH] no bearer");
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET missing");
    req.user = jwt.verify(m[1], secret) as AuthUser;
    console.log("[AUTH] token OK", req.user);
    return next();
  } catch (e) {
    console.error("[AUTH] verify failed", e);
    return res.status(401).json({ ok: false, error: "unauthorized" });
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
