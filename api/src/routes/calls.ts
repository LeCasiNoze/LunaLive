// api/src/routes/calls.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { getCallsSettings, resetCalls, deleteCallById, effectiveLimit } from "../calls/queue.js";

// helper: slug -> streamer meta
async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const r = await pool.query(
    `SELECT id, slug, user_id AS "ownerUserId"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: String(row.slug),
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
  };
}

function canModOnStreamer(user: any, meta: { ownerUserId: number | null }) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (meta.ownerUserId != null && Number(meta.ownerUserId) === Number(user.id)) return true;
  // pour MVP: on laisse “mods” gérés par le socket + table streamer_mods (on ne re-check pas ici)
  // si tu veux: on rajoute la query streamer_mods ici aussi.
  return false;
}

export const callsRouter = express.Router();

// public-ish: get settings (only a few)
callsRouter.get("/:slug/config", async (req, res) => {
  try {
    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const s = await getCallsSettings(pool, meta.id);
    res.json({
      ok: true,
      config: {
        enabled: s.enabled,
        allowListec: s.allowListec,
        listecMax: s.listecMax,
        perUserLimit: s.perUserLimit,
        showCmdInChat: s.showCmdInChat,
        showAcceptPublic: s.showAcceptPublic,
      },
    });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "config_failed") });
  }
});

// list queue (auth required, streamer/admin only for MVP)
callsRouter.get("/:slug/list", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const limitRaw = Number(req.query.limit || 50);
    const offsetRaw = Number(req.query.offset || 0);

    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);

    // ✅ Join calls_queue -> slots_catalog pour récupérer image_url
    const { rows } = await pool.query(
      `
      SELECT
        q.id::text AS id,
        q.slot_name AS "slotName",
        q.provider AS provider,
        q.username AS username,
        q.pos AS pos,
        sc.image_url AS "imageUrl"
      FROM calls_queue q
      LEFT JOIN slots_catalog sc
        ON sc.name_key = q.slot_key
      WHERE q.streamer_id = $1
      ORDER BY q.pos ASC
      LIMIT $2 OFFSET $3
      `,
      [meta.id, limit, offset]
    );

    const items = (rows || []).map((r: any) => ({
      id: String(r.id),
      slotName: String(r.slotName),
      provider: r.provider ? String(r.provider) : null,
      username: String(r.username),
      pos: Number(r.pos) || 0,
      imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    }));

    res.json({ ok: true, items });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "list_failed") });
  }
});

// reset queue (auth required, streamer/admin only for MVP)
callsRouter.post("/:slug/reset", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    await resetCalls(pool, meta.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "reset_failed") });
  }
});

// delete one call (auth required, streamer/admin only for MVP)
callsRouter.delete("/:slug/item/:id", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const ok = await deleteCallById(pool, meta.id, String(req.params.id));
    res.json({ ok: true, deleted: ok });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "delete_failed") });
  }
});

// patch config (auth required, streamer/admin only for MVP)
callsRouter.patch("/:slug/config", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const p = req.body || {};
    const enabled = p.enabled != null ? !!p.enabled : null;
    const allowListec = p.allowListec != null ? !!p.allowListec : null;
    const showCmdInChat = p.showCmdInChat != null ? !!p.showCmdInChat : null;
    const showAcceptPublic = p.showAcceptPublic != null ? !!p.showAcceptPublic : null;

    const listecMax = p.listecMax != null ? Math.max(1, Math.min(50, Number(p.listecMax))) : null;
    const perUserLimitRaw = p.perUserLimit != null ? Number(p.perUserLimit) : null;
    const perUserLimit = perUserLimitRaw == null ? null : effectiveLimit(perUserLimitRaw);

    await pool.query(
      `
      INSERT INTO calls_settings (streamer_id)
      VALUES ($1)
      ON CONFLICT (streamer_id) DO NOTHING
      `,
      [meta.id]
    );

    await pool.query(
      `
      UPDATE calls_settings
      SET
        enabled = COALESCE($2, enabled),
        allow_listec = COALESCE($3, allow_listec),
        show_cmd_in_chat = COALESCE($4, show_cmd_in_chat),
        show_accept_public = COALESCE($5, show_accept_public),
        listec_max = COALESCE($6, listec_max),
        per_user_limit = COALESCE($7, per_user_limit),
        updated_at = NOW()
      WHERE streamer_id=$1
      `,
      [meta.id, enabled, allowListec, showCmdInChat, showAcceptPublic, listecMax, perUserLimit]
    );

    // ✅ miroir (Q12): on met à jour chat_settings.show_call_commands si showCmdInChat changé
    if (showCmdInChat != null) {
      await pool.query(
        `
        INSERT INTO chat_settings (streamer_id, show_call_commands)
        VALUES ($1, $2)
        ON CONFLICT (streamer_id) DO UPDATE
          SET show_call_commands = EXCLUDED.show_call_commands
        `,
        [meta.id, showCmdInChat]
      );
    }

    const cfg = await getCallsSettings(pool, meta.id);
    res.json({ ok: true, config: cfg });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "patch_failed") });
  }
});
