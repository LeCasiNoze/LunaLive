// api/src/utils/async.ts
import type { Request, Response, NextFunction } from "express";

export const a =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
