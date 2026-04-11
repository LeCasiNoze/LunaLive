import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const featureEventsRouter = Router();

const ALLOWED_KINDS = new Set([
  "page_visit",
  "streamer_tab",
  "bot_tab",
  "clip_open",
  "profile_style_action",
]);

featureEventsRouter.post(
  "/",
  a(async (req: any, res) => {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "auth_required" });

    const kind = String(req.body?.kind || "").trim();
    if (!ALLOWED_KINDS.has(kind)) {
      return res.status(400).json({ ok: false, error: "invalid_kind" });
    }

    const subject = String(req.body?.subject || "").trim().slice(0, 200);
    const sessionId = String(req.body?.sessionId || "").trim().slice(0, 120);
    const rawMeta = req.body?.meta;
    const meta =
      rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta) ? JSON.stringify(rawMeta) : null;

    await pool.query(
      `
      INSERT INTO user_feature_events (user_id, session_id, kind, subject, count, meta, first_at, last_at)
      VALUES ($1,$2,$3,$4,1,$5::jsonb,NOW(),NOW())
      ON CONFLICT (user_id, session_id, kind, subject)
      DO UPDATE SET
        count = user_feature_events.count + 1,
        meta = COALESCE(EXCLUDED.meta, user_feature_events.meta),
        last_at = NOW()
      `,
      [userId, sessionId, kind, subject, meta]
    );

    return res.json({ ok: true });
  })
);
