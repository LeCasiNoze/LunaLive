import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const botManageRouter = Router();

/**
 * Règles produit (MVP)
 * - Commands: OK offline (pas live-only)
 * - Autoposts: configurables offline, mais conceptuellement live-only (le bot les enverra seulement en live)
 * - Logs: consultables offline
 * - Test-send: live-only strict (refus si streamer offline)
 *
 * Modérateur: via table streamer_mods (pas users.role)
 * Admin: override via ?slug=
 */

const LIMITS = {
  maxCommands: 200,
  maxAutoposts: 50,
};

const LIVE_ONLY_RULES = {
  commands: false,
  autoposts: true,
  logs: true,
  testSend: true,
};

type AccessKind = "owner" | "mod" | "admin";
type AuthRole = "viewer" | "streamer" | "admin";

function qSlug(req: any) {
  return String(req.query?.slug ?? req.query?.streamerSlug ?? "").trim();
}

async function getStreamerByOwnerUserId(userId: number) {
  const r = await pool.query(
    `SELECT id, slug, appearance, is_live AS "isLive"
     FROM streamers
     WHERE user_id=$1
     LIMIT 1`,
    [userId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    streamerId: Number(row.id),
    slug: String(row.slug),
    isLive: !!row.isLive,
    appearance: normalizeAppearance(row.appearance || {}),
  };
}

async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT id, slug, appearance, is_live AS "isLive"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );
  const row = r.rows?.[0];
  if (!row) return null;

  return {
    streamerId: Number(row.id),
    slug: String(row.slug),
    isLive: !!row.isLive,
    appearance: normalizeAppearance(row.appearance || {}),
  };
}

async function isStreamerMod(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1
     FROM streamer_mods
     WHERE streamer_id=$1
       AND user_id=$2
       AND removed_at IS NULL
     LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

async function listModStreamers(userId: number) {
  const r = await pool.query(
    `SELECT s.id, s.slug
     FROM streamer_mods sm
     JOIN streamers s ON s.id = sm.streamer_id
     WHERE sm.user_id=$1 AND sm.removed_at IS NULL
     ORDER BY sm.created_at DESC NULLS LAST, s.id DESC`,
    [userId]
  );
  return (r.rows || []).map((x: any) => ({ id: Number(x.id), slug: String(x.slug) }));
}

/**
 * Résout le streamer cible pour Bot Manage.
 *
 * - streamer (owner): son streamer via streamers.user_id
 * - admin:
 *    - si ?slug= -> gère ce streamer
 *    - sinon, s'il est aussi owner d'un streamer -> gère le sien
 *    - sinon -> 400 streamer_required
 * - viewer/mod:
 *    - si ?slug= -> doit être mod de ce streamer
 *    - sinon -> si mod d'1 seul streamer, on le prend
 *              sinon -> 400 streamer_required
 */
async function resolveBotManageTarget(req: any): Promise<
  | { ok: true; streamerId: number; slug: string; appearance: any; isLive: boolean; access: AccessKind }
  | { ok: false; status: number; error: string; detail?: any }
> {
  const u = req.user!;
  const role = String(u.role || "viewer") as AuthRole;
  const slugParam = qSlug(req);

  // Admin override
  if (role === "admin") {
    if (slugParam) {
      const t = await getStreamerBySlug(slugParam);
      if (!t) return { ok: false, status: 404, error: "streamer_not_found" };
      return { ok: true, ...t, access: "admin" };
    }

    const mine = await getStreamerByOwnerUserId(Number(u.id));
    if (mine) return { ok: true, ...mine, access: "admin" };

    return { ok: false, status: 400, error: "streamer_required" };
  }

  // Owner streamer
  const mine = await getStreamerByOwnerUserId(Number(u.id));
  if (mine) return { ok: true, ...mine, access: "owner" };

  // Mod flow
  if (slugParam) {
    const t = await getStreamerBySlug(slugParam);
    if (!t) return { ok: false, status: 404, error: "streamer_not_found" };
    const okMod = await isStreamerMod(t.streamerId, Number(u.id));
    if (!okMod) return { ok: false, status: 403, error: "forbidden" };
    return { ok: true, ...t, access: "mod" };
  }

  const mods = await listModStreamers(Number(u.id));
  if (mods.length === 1) {
    const t = await getStreamerBySlug(mods[0].slug);
    if (!t) return { ok: false, status: 404, error: "streamer_not_found" };
    return { ok: true, ...t, access: "mod" };
  }

  if (mods.length > 1) {
    return {
      ok: false,
      status: 400,
      error: "streamer_required",
      detail: { available: mods },
    };
  }

  return { ok: false, status: 403, error: "forbidden" };
}

function normTrigger(input: any) {
  const raw = String(input ?? "").trim();
  const t = raw.replace(/^!+/, "").trim().toLowerCase();
  return t;
}

function clampInt(n: any, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

async function getBotSettings(streamerId: number) {
  // si pas encore upsert => defaults
  const r = await pool.query(
    `SELECT enabled, prefix, live_only AS "liveOnly"
     FROM bot_streamer_settings
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );
  const row = r.rows?.[0];
  return {
    enabled: row ? !!row.enabled : false,
    prefix: row?.prefix ? String(row.prefix) : "!",
    liveOnly: row ? !!row.liveOnly : true,
  };
}

async function assertLiveIfNeeded(isLive: boolean) {
  if (!isLive) {
    return { ok: false as const, status: 409, error: "live_only" as const };
  }
  return { ok: true as const };
}

// helper pour dupliquer routes /me/bot/* + /api/my/bot/*
function mountAliases(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  ...handlers: any[]
) {
  // ex path="/overview" => /me/bot/overview + /api/my/bot/overview
  (botManageRouter as any)[method](`/me/bot${path}`, ...handlers);
  (botManageRouter as any)[method](`/api/my/bot${path}`, ...handlers);
}

/* ──────────────────────────────────────────
   OVERVIEW (counts + settings + rules + soon)
────────────────────────────────────────── */
const overviewHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const [cmds, aps, logs, settings] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM bot_commands WHERE streamer_id=$1`, [s.streamerId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM bot_autoposts WHERE streamer_id=$1`, [s.streamerId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM bot_events WHERE streamer_id=$1`, [s.streamerId]),
    getBotSettings(s.streamerId),
  ]);

  return res.json({
    ok: true,
    streamer: { id: String(s.streamerId), slug: s.slug },
    access: s.access, // owner | mod | admin
    live: { isLive: !!s.isLive },
    settings,
    limits: LIMITS,
    liveOnlyRules: LIVE_ONLY_RULES,
    counts: {
      commands: Number(cmds.rows?.[0]?.n || 0),
      autoposts: Number(aps.rows?.[0]?.n || 0),
      logs: Number(logs.rows?.[0]?.n || 0),
    },
    modules: {
      commands: { status: "ready" },
      autoposts: { status: "ready" },
      logs: { status: "ready" },
      testSend: { status: "ready" },
      // stubs soon (front)
      wheel: { status: "soon" },
      predictions: { status: "soon" },
      tournaments: { status: "soon" },
      calls: { status: "soon" },
      clips: { status: "soon" },
    },
  });
});

mountAliases("get", "/overview", requireAuth, overviewHandler);

/* ──────────────────────────────────────────
   COMMANDS
────────────────────────────────────────── */
const listCommandsHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const r = await pool.query(
    `SELECT
       id::text AS id,
       trigger,
       response,
       enabled,
       cooldown_sec AS "cooldownSec",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM bot_commands
     WHERE streamer_id=$1
     ORDER BY id DESC`,
    [s.streamerId]
  );

  res.json({ ok: true, commands: r.rows });
});

mountAliases("get", "/commands", requireAuth, listCommandsHandler);

const createCommandHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const trigger = normTrigger(req.body?.trigger);
  const response = String(req.body?.response ?? "").replace(/\r/g, "").trim();
  const enabled = req.body?.enabled == null ? true : Boolean(req.body.enabled);
  const cooldownSec = clampInt(req.body?.cooldownSec ?? 3, 0, 3600);

  if (!trigger) return res.status(400).json({ ok: false, error: "bad_trigger" });
  if (!response) return res.status(400).json({ ok: false, error: "bad_response" });
  if (trigger.length > 32) return res.status(400).json({ ok: false, error: "trigger_too_long" });
  if (response.length > 600) return res.status(400).json({ ok: false, error: "response_too_long" });

  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM bot_commands WHERE streamer_id=$1`, [s.streamerId]);
  if (Number(c.rows?.[0]?.n || 0) >= LIMITS.maxCommands) {
    return res.status(403).json({ ok: false, error: "limit_reached" });
  }

  const exists = await pool.query(
    `SELECT 1 FROM bot_commands WHERE streamer_id=$1 AND lower(trigger)=lower($2) LIMIT 1`,
    [s.streamerId, trigger]
  );
  if (exists.rows?.[0]) return res.status(409).json({ ok: false, error: "trigger_exists" });

  const ins = await pool.query(
    `INSERT INTO bot_commands(streamer_id, trigger, response, enabled, cooldown_sec)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING
       id::text AS id,
       trigger,
       response,
       enabled,
       cooldown_sec AS "cooldownSec",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [s.streamerId, trigger, response, enabled, cooldownSec]
  );

  res.json({ ok: true, command: ins.rows[0] });
});

mountAliases("post", "/commands", requireAuth, createCommandHandler);

const patchCommandHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

  const patch: any = {};
  if ("trigger" in (req.body ?? {})) patch.trigger = normTrigger(req.body.trigger);
  if ("response" in (req.body ?? {})) patch.response = String(req.body.response ?? "").replace(/\r/g, "").trim();
  if ("enabled" in (req.body ?? {})) patch.enabled = Boolean(req.body.enabled);
  if ("cooldownSec" in (req.body ?? {})) patch.cooldownSec = clampInt(req.body.cooldownSec, 0, 3600);

  if ("trigger" in patch && !patch.trigger) return res.status(400).json({ ok: false, error: "bad_trigger" });
  if ("trigger" in patch && String(patch.trigger).length > 32) return res.status(400).json({ ok: false, error: "trigger_too_long" });
  if ("response" in patch && !patch.response) return res.status(400).json({ ok: false, error: "bad_response" });
  if ("response" in patch && String(patch.response).length > 600) return res.status(400).json({ ok: false, error: "response_too_long" });

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

  const upd = await pool.query(
    `UPDATE bot_commands
     SET
       trigger = COALESCE($1, trigger),
       response = COALESCE($2, response),
       enabled = COALESCE($3, enabled),
       cooldown_sec = COALESCE($4, cooldown_sec),
       updated_at = NOW()
     WHERE id=$5 AND streamer_id=$6
     RETURNING
       id::text AS id,
       trigger,
       response,
       enabled,
       cooldown_sec AS "cooldownSec",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [
      patch.trigger ?? null,
      patch.response ?? null,
      patch.enabled ?? null,
      patch.cooldownSec ?? null,
      id,
      s.streamerId,
    ]
  );

  res.json({ ok: true, command: upd.rows[0] });
});

mountAliases("patch", "/commands/:id", requireAuth, patchCommandHandler);

const deleteCommandHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const id = String(req.params.id || "").trim();
  const del = await pool.query(`DELETE FROM bot_commands WHERE id=$1 AND streamer_id=$2 RETURNING id`, [id, s.streamerId]);
  res.json({ ok: true, deleted: !!del.rows?.[0] });
});

mountAliases("delete", "/commands/:id", requireAuth, deleteCommandHandler);

/* ──────────────────────────────────────────
   AUTOPOSTS
────────────────────────────────────────── */
const listAutopostsHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

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
});

mountAliases("get", "/autoposts", requireAuth, listAutopostsHandler);

const createAutopostHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const message = String(req.body?.message ?? "").replace(/\r/g, "").trim();
  const everySec = Number(req.body?.everySec ?? 0);
  const enabled = req.body?.enabled == null ? true : Boolean(req.body.enabled);

  if (!message) return res.status(400).json({ ok: false, error: "bad_message" });
  if (!Number.isFinite(everySec) || everySec < 60) return res.status(400).json({ ok: false, error: "bad_every_sec" });
  if (message.length > 600) return res.status(400).json({ ok: false, error: "message_too_long" });

  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM bot_autoposts WHERE streamer_id=$1`, [s.streamerId]);
  if (Number(c.rows?.[0]?.n || 0) >= LIMITS.maxAutoposts) {
    return res.status(403).json({ ok: false, error: "limit_reached" });
  }

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
});

mountAliases("post", "/autoposts", requireAuth, createAutopostHandler);

const patchAutopostHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const id = String(req.params.id || "").trim();

  const patch: any = {};
  if ("message" in (req.body ?? {})) patch.message = String(req.body.message ?? "").replace(/\r/g, "").trim();
  if ("everySec" in (req.body ?? {})) patch.everySec = Number(req.body.everySec ?? 0);
  if ("enabled" in (req.body ?? {})) patch.enabled = Boolean(req.body.enabled);

  if ("message" in patch && !patch.message) return res.status(400).json({ ok: false, error: "bad_message" });
  if ("message" in patch && String(patch.message).length > 600) return res.status(400).json({ ok: false, error: "message_too_long" });
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
});

mountAliases("patch", "/autoposts/:id", requireAuth, patchAutopostHandler);

const deleteAutopostHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const id = String(req.params.id || "").trim();
  const del = await pool.query(`DELETE FROM bot_autoposts WHERE id=$1 AND streamer_id=$2 RETURNING id`, [id, s.streamerId]);
  res.json({ ok: true, deleted: !!del.rows?.[0] });
});

mountAliases("delete", "/autoposts/:id", requireAuth, deleteAutopostHandler);

/* ──────────────────────────────────────────
   LOGS
────────────────────────────────────────── */
const listLogsHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const limit = clampInt(req.query.limit ?? 50, 1, 200);

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
});

mountAliases("get", "/logs", requireAuth, listLogsHandler);

const clearLogsHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  await pool.query(`DELETE FROM bot_events WHERE streamer_id=$1`, [s.streamerId]);
  res.json({ ok: true });
});

mountAliases("post", "/logs/clear", requireAuth, clearLogsHandler);

/* ──────────────────────────────────────────
   TEST SEND (message bot) — LIVE ONLY STRICT
────────────────────────────────────────── */
const testSendHandler = a(async (req: any, res: any) => {
  const s = await resolveBotManageTarget(req);
  if (!s.ok) return res.status(s.status).json({ ok: false, error: s.error, ...(s.detail ? { detail: s.detail } : {}) });

  const liveCheck = await assertLiveIfNeeded(!!s.isLive);
  if (!liveCheck.ok) return res.status(liveCheck.status).json({ ok: false, error: liveCheck.error });

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
});

mountAliases("post", "/test-send", requireAuth, testSendHandler);
