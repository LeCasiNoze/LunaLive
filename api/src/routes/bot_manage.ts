import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const botManageRouter = Router();

type AuthRole = "viewer" | "streamer" | "admin";

async function requireMyStreamer(req: any) {
  const u = req.user!;
  const role = String(u.role || "") as AuthRole;
  if (role !== "streamer" && role !== "admin") {
    return { ok: false as const, status: 403, error: "forbidden" as const };
  }

  const r = await pool.query(
    `SELECT id, slug, appearance
     FROM streamers
     WHERE user_id=$1
     LIMIT 1`,
    [u.id]
  );

  const row = r.rows?.[0];
  if (!row) return { ok: false as const, status: 404, error: "no_streamer" as const };

  return {
    ok: true as const,
    streamerId: Number(row.id),
    slug: String(row.slug),
    appearance: normalizeAppearance(row.appearance || {}),
  };
}

function normTrigger(input: any) {
  const raw = String(input ?? "").trim();
  const t = raw.replace(/^!+/, "").trim().toLowerCase();
  return t;
}

/* ──────────────────────────────────────────
   OVERVIEW (counts)
────────────────────────────────────────── */
botManageRouter.get(
  "/me/bot/overview",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const [cmds, aps, logs] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM bot_commands WHERE streamer_id=$1`, [s.streamerId]),
      pool.query(`SELECT COUNT(*)::int AS n FROM bot_autoposts WHERE streamer_id=$1`, [s.streamerId]),
      pool.query(`SELECT COUNT(*)::int AS n FROM bot_events WHERE streamer_id=$1`, [s.streamerId]),
    ]);

    return res.json({
      ok: true,
      streamer: { id: String(s.streamerId), slug: s.slug },
      counts: {
        commands: Number(cmds.rows?.[0]?.n || 0),
        autoposts: Number(aps.rows?.[0]?.n || 0),
        logs: Number(logs.rows?.[0]?.n || 0),
      },
    });
  })
);

/* ──────────────────────────────────────────
   COMMANDS
────────────────────────────────────────── */
botManageRouter.get(
  "/me/bot/commands",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const r = await pool.query(
      `SELECT
         id::text AS id,
         trigger,
         response,
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM bot_commands
       WHERE streamer_id=$1
       ORDER BY id DESC`,
      [s.streamerId]
    );

    res.json({ ok: true, commands: r.rows });
  })
);

botManageRouter.post(
  "/me/bot/commands",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const trigger = normTrigger(req.body?.trigger);
    const response = String(req.body?.response ?? "").replace(/\r/g, "").trim();

    if (!trigger) return res.status(400).json({ ok: false, error: "bad_trigger" });
    if (!response) return res.status(400).json({ ok: false, error: "bad_response" });
    if (trigger.length > 32) return res.status(400).json({ ok: false, error: "trigger_too_long" });
    if (response.length > 600) return res.status(400).json({ ok: false, error: "response_too_long" });

    const enabled = req.body?.enabled == null ? true : Boolean(req.body.enabled);

    // évite doublon exact trigger
    const exists = await pool.query(
      `SELECT 1 FROM bot_commands WHERE streamer_id=$1 AND lower(trigger)=lower($2) LIMIT 1`,
      [s.streamerId, trigger]
    );
    if (exists.rows?.[0]) return res.status(409).json({ ok: false, error: "trigger_exists" });

    const ins = await pool.query(
      `INSERT INTO bot_commands(streamer_id, trigger, response, enabled)
       VALUES ($1,$2,$3,$4)
       RETURNING
         id::text AS id,
         trigger,
         response,
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [s.streamerId, trigger, response, enabled]
    );

    res.json({ ok: true, command: ins.rows[0] });
  })
);

botManageRouter.patch(
  "/me/bot/commands/:id",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const patch: any = {};
    if ("trigger" in (req.body ?? {})) patch.trigger = normTrigger(req.body.trigger);
    if ("response" in (req.body ?? {}))
      patch.response = String(req.body.response ?? "").replace(/\r/g, "").trim();
    if ("enabled" in (req.body ?? {})) patch.enabled = Boolean(req.body.enabled);

    if ("trigger" in patch && !patch.trigger) return res.status(400).json({ ok: false, error: "bad_trigger" });
    if ("response" in patch && !patch.response) return res.status(400).json({ ok: false, error: "bad_response" });

    const cur = await pool.query(
      `SELECT id, trigger FROM bot_commands WHERE id=$1 AND streamer_id=$2 LIMIT 1`,
      [id, s.streamerId]
    );
    if (!cur.rows?.[0]) return res.status(404).json({ ok: false, error: "not_found" });

    if (patch.trigger) {
      const dup = await pool.query(
        `SELECT 1 FROM bot_commands WHERE streamer_id=$1 AND lower(trigger)=lower($2) AND id<>$3 LIMIT 1`,
        [s.streamerId, patch.trigger, id]
      );
      if (dup.rows?.[0]) return res.status(409).json({ ok: false, error: "trigger_exists" });
    }

    const trigger = patch.trigger ?? null;
    const response = patch.response ?? null;
    const enabled = patch.enabled ?? null;

    const upd = await pool.query(
      `UPDATE bot_commands
       SET
         trigger = COALESCE($1, trigger),
         response = COALESCE($2, response),
         enabled = COALESCE($3, enabled),
         updated_at = NOW()
       WHERE id=$4 AND streamer_id=$5
       RETURNING
         id::text AS id,
         trigger,
         response,
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [trigger, response, enabled, id, s.streamerId]
    );

    res.json({ ok: true, command: upd.rows[0] });
  })
);

botManageRouter.delete(
  "/me/bot/commands/:id",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const id = String(req.params.id || "").trim();
    const del = await pool.query(
      `DELETE FROM bot_commands WHERE id=$1 AND streamer_id=$2 RETURNING id`,
      [id, s.streamerId]
    );

    res.json({ ok: true, deleted: !!del.rows?.[0] });
  })
);

/* ──────────────────────────────────────────
   AUTOPOSTS
────────────────────────────────────────── */
botManageRouter.get(
  "/me/bot/autoposts",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const r = await pool.query(
      `SELECT
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM bot_autoposts
       WHERE streamer_id=$1
       ORDER BY id DESC`,
      [s.streamerId]
    );

    res.json({ ok: true, autoposts: r.rows });
  })
);

botManageRouter.post(
  "/me/bot/autoposts",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const message = String(req.body?.message ?? "").replace(/\r/g, "").trim();
    const everySec = Number(req.body?.everySec ?? 0);

    if (!message) return res.status(400).json({ ok: false, error: "bad_message" });
    if (!Number.isFinite(everySec) || everySec < 60) {
      return res.status(400).json({ ok: false, error: "bad_every_sec" });
    }
    if (message.length > 600) return res.status(400).json({ ok: false, error: "message_too_long" });

    const enabled = req.body?.enabled == null ? true : Boolean(req.body.enabled);

    const ins = await pool.query(
      `INSERT INTO bot_autoposts(streamer_id, message, every_sec, enabled)
       VALUES ($1,$2,$3,$4)
       RETURNING
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [s.streamerId, message, Math.floor(everySec), enabled]
    );

    res.json({ ok: true, autopost: ins.rows[0] });
  })
);

botManageRouter.patch(
  "/me/bot/autoposts/:id",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const id = String(req.params.id || "").trim();

    const patch: any = {};
    if ("message" in (req.body ?? {})) patch.message = String(req.body.message ?? "").replace(/\r/g, "").trim();
    if ("everySec" in (req.body ?? {})) patch.everySec = Number(req.body.everySec ?? 0);
    if ("enabled" in (req.body ?? {})) patch.enabled = Boolean(req.body.enabled);

    if ("message" in patch && !patch.message) return res.status(400).json({ ok: false, error: "bad_message" });
    if ("everySec" in patch && (!Number.isFinite(patch.everySec) || patch.everySec < 60)) {
      return res.status(400).json({ ok: false, error: "bad_every_sec" });
    }

    const upd = await pool.query(
      `UPDATE bot_autoposts
       SET
         message = COALESCE($1, message),
         every_sec = COALESCE($2, every_sec),
         enabled = COALESCE($3, enabled),
         updated_at = NOW()
       WHERE id=$4 AND streamer_id=$5
       RETURNING
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        patch.message ?? null,
        patch.everySec != null ? Math.floor(patch.everySec) : null,
        patch.enabled ?? null,
        id,
        s.streamerId,
      ]
    );

    if (!upd.rows?.[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, autopost: upd.rows[0] });
  })
);

botManageRouter.delete(
  "/me/bot/autoposts/:id",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const id = String(req.params.id || "").trim();
    const del = await pool.query(
      `DELETE FROM bot_autoposts WHERE id=$1 AND streamer_id=$2 RETURNING id`,
      [id, s.streamerId]
    );

    res.json({ ok: true, deleted: !!del.rows?.[0] });
  })
);

/* ──────────────────────────────────────────
   LOGS
────────────────────────────────────────── */
botManageRouter.get(
  "/me/bot/logs",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));

    const r = await pool.query(
      `SELECT
         id::text AS id,
         level,
         message,
         meta,
         created_at AS "createdAt"
       FROM bot_events
       WHERE streamer_id=$1
       ORDER BY id DESC
       LIMIT $2`,
      [s.streamerId, limit]
    );

    res.json({ ok: true, logs: r.rows });
  })
);

botManageRouter.post(
  "/me/bot/logs/clear",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    await pool.query(`DELETE FROM bot_events WHERE streamer_id=$1`, [s.streamerId]);
    res.json({ ok: true });
  })
);

/* ──────────────────────────────────────────
   TEST SEND (message bot)
────────────────────────────────────────── */
botManageRouter.post(
  "/me/bot/test-send",
  requireAuth,
  a(async (req, res) => {
    const s = await requireMyStreamer(req);
    if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error });

    const bodyRaw = String(req.body?.body || "Test LunaBot ✅").replace(/\r/g, "").trim();
    const body = bodyRaw.length > 200 ? bodyRaw.slice(0, 200) : bodyRaw;

    const botUserId = Number(process.env.BOT_USER_ID || 0);
    const botUsername = String(process.env.BOT_USERNAME || "LunaBot");
    if (!botUserId) return res.status(500).json({ ok: false, error: "BOT_USER_ID_missing" });

    const ins = await pool.query(
      `INSERT INTO chat_messages (streamer_id, user_id, username, body)
       VALUES ($1,$2,$3,$4)
       RETURNING id, created_at AS "createdAt"`,
      [s.streamerId, botUserId, botUsername, body]
    );

    const row = ins.rows?.[0];
    const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
    const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

    const msg = {
      id: Number(row.id),
      userId: botUserId,
      username: botUsername,
      body,
      createdAt: new Date(row.createdAt).toISOString(),
      cosmetics,
      style: {
        nameColor: s.appearance.chat.usernameColor,
        msgColor: s.appearance.chat.messageColor,
      },
    };

    const io = req.app.locals.io;
    if (io) io.to(`chat:${s.slug}`).emit("chat:message", msg);

    res.json({ ok: true, id: msg.id });
  })
);
