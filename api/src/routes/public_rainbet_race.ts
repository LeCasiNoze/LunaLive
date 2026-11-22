import { Router } from "express";
import { pool } from "../db.js";

// Lecture seule du classement publié (déjà masqué) par NozeBot : la clé Rainbet reste dans le service du bot.
export const publicRainbetRaceRouter = Router();
const CACHE_MS = 60_000;
let cache: { at: number; body: unknown } | null = null;

publicRainbetRaceRouter.get("/race", async (_req, res) => {
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      const { rows } = await pool.query(
        `SELECT data, updated_at FROM rainbet_race_public WHERE id='current' LIMIT 1`
      ).catch(() => ({ rows: [] as any[] }));
      const row = rows[0];
      cache = { at: Date.now(), body: row
        ? { ok: true, ...row.data, stale: Date.now() - new Date(row.updated_at).getTime() > 30 * 60_000 }
        : { ok: false, error: "not_ready" } };
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json(cache.body);
  } catch {
    res.status(500).json({ ok: false, error: "unavailable" });
  }
});
