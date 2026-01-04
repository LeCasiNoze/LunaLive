// api/src/routes/streamer_tabs.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "../db.js";
import { requireAuth, type AuthUser } from "../auth.js";

export const streamerTabsRouter = Router();

function a(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function getStreamerCore(slug: string) {
  const { rows } = await pool.query(
    `SELECT id, owner_user_id
     FROM streamers
     WHERE lower(slug) = lower($1)
     LIMIT 1`,
    [slug]
  );
  return rows[0] as null | { id: number; owner_user_id: number | null };
}

function canEdit(user: AuthUser, ownerUserId: number | null) {
  if (!user) return false;
  if (String((user as any).role) === "admin") return true;
  const uid = Number((user as any).id);
  return ownerUserId != null && Number(ownerUserId) === uid;
}

/* =========================
 *  ABOUT
 * ========================= */

streamerTabsRouter.get(
  "/:slug/about",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { rows } = await pool.query(
      `SELECT id, position, image_url, link_url, description
       FROM streamer_about_blocks
       WHERE streamer_id = $1
       ORDER BY position ASC`,
      [core.id]
    );

    return res.json({
      ok: true,
      blocks: rows.map((r: any) => ({
        id: Number(r.id),
        imageUrl: r.image_url,
        linkUrl: r.link_url,
        description: r.description,
      })),
    });
  })
);

streamerTabsRouter.put(
  "/:slug/about",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const user = (req as any).user as AuthUser;
    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!canEdit(user, core.owner_user_id)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const blocks = Array.isArray((req.body as any)?.blocks) ? (req.body as any).blocks : null;
    if (!blocks) return res.status(400).json({ ok: false, error: "BAD_BODY" });
    if (blocks.length > 30) return res.status(400).json({ ok: false, error: "TOO_MANY_BLOCKS" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM streamer_about_blocks WHERE streamer_id = $1`, [core.id]);

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i] || {};
        const imageUrl = String(b.imageUrl || "").trim() || null;
        const linkUrl = String(b.linkUrl || "").trim() || null;
        const description = String(b.description || "").trim() || null;

        await client.query(
          `INSERT INTO streamer_about_blocks (streamer_id, position, image_url, link_url, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [core.id, i, imageUrl, linkUrl, description]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e: any) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }
  })
);

/* =========================
 *  AGENDA
 * ========================= */

streamerTabsRouter.get(
  "/:slug/agenda",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { rows } = await pool.query(
      `SELECT id, kind, title, color, day_of_week, date_ymd, start_time, end_time
       FROM streamer_agenda_rules
       WHERE streamer_id = $1
       ORDER BY kind ASC, coalesce(date_ymd, '9999-99-99') ASC, coalesce(day_of_week, 0) ASC, start_time ASC`,
      [core.id]
    );

    return res.json({
      ok: true,
      rules: rows.map((r: any) => ({
        id: Number(r.id),
        kind: r.kind,
        title: r.title,
        color: r.color,
        dayOfWeek: r.day_of_week,
        date: r.date_ymd,
        startTime: r.start_time,
        endTime: r.end_time,
      })),
    });
  })
);

streamerTabsRouter.put(
  "/:slug/agenda",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const user = (req as any).user as AuthUser;
    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!canEdit(user, core.owner_user_id)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const rules = Array.isArray((req.body as any)?.rules) ? (req.body as any).rules : null;
    if (!rules) return res.status(400).json({ ok: false, error: "BAD_BODY" });
    if (rules.length > 80) return res.status(400).json({ ok: false, error: "TOO_MANY_RULES" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM streamer_agenda_rules WHERE streamer_id = $1`, [core.id]);

      for (const raw of rules) {
        const r = raw || {};
        const kind = String(r.kind || "").trim();
        if (kind !== "regular" && kind !== "event") continue;

        const title = String(r.title || "").trim().slice(0, 80) || "Stream";
        const color = String(r.color || "").trim() || "#8b5cf6";
        const startTime = String(r.startTime || "00:00").trim();
        const endTime = String(r.endTime || "00:00").trim();

        const dayOfWeek = kind === "regular" ? Number(r.dayOfWeek ?? 0) : null;
        const dateYmd = kind === "event" ? (String(r.date || "").trim() || null) : null;

        await client.query(
          `INSERT INTO streamer_agenda_rules (streamer_id, kind, title, color, day_of_week, date_ymd, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [core.id, kind, title, color, dayOfWeek, dateYmd, startTime, endTime]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e: any) {
      try { await client.query("ROLLBACK"); } catch {}
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }
  })
);
