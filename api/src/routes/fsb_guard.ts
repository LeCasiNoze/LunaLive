import type { NextFunction, Request, Response } from "express";

export const FSB_ALLOWED_USER_IDS = new Set([4, 15, 71]);

export function canAccessFsb(user: any) {
  return FSB_ALLOWED_USER_IDS.has(Number(user?.id || 0));
}

export function requireFsbAccess(req: Request, res: Response, next: NextFunction) {
  if (!canAccessFsb((req as any).user)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}
