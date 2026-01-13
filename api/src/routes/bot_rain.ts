// api/src/routes/bot_rain.ts
import { Router } from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";
import { earnRubisTx } from "../wallet_engine.js";
import type { PoolClient } from "pg";

export const botRainRouter = Router();

const PRESETS: Record<number, number> = {
  10: 1,
  30: 5,
  60: 15,
  120: 50,
};

const ALLOWED_INTERVALS = new Set([10, 30, 60]);

let schemaReady = false;

// Talent: boost rain (appliqué au RECEVEUR)
const RAIN_TALENT_CODE = "talent_rain_boost" as const;

// +10% / +20% / +30% (niveaux 1..3)
const RAIN_BOOST_MULT: Record<number, number> = {
  0: 1.0,
  1: 1.10,
  2: 1.20,
  3: 1.30,
};

function applyRainBoost(base: number, level: number) {
  const lv = Math.max(0, Math.min(3, Number(level || 0)));
  const mult = RAIN_BOOST_MULT[lv] ?? 1;
  // arrondi pour que les petits montants aient un vrai effet (ex: 5 * 1.2 => 6)
  const v = Math.round(Number(base || 0) * mult);
  return Math.max(1, v);
}

async function getRainBoostLevels(client: PoolClient, userIds: number[]) {
  const ids = (userIds || []).map((x) => Number(x)).filter((x) => x > 0);
  const map = new Map<number, number>();
  if (!ids.length) return map;

  try {
    const r = await client.query<{ user_id: number; level: number }>(
      `SELECT user_id, level
       FROM user_talents
       WHERE talent_code = $1
         AND user_id = ANY($2::bigint[])`,
      [RAIN_TALENT_CODE, ids]
    );

    for (const row of r.rows || []) {
      map.set(Number(row.user_id), Math.max(0, Number(row.level || 0)));
    }
  } catch {
    // si table pas dispo (ou autre), on n'applique pas de bonus
  }

  return map;
}

async function ensureSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_rain_cfg (
      streamer_id           INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      enabled               BOOLEAN NOT NULL DEFAULT FALSE,
      interval_min          INT NOT NULL DEFAULT 30,
      rubies_per_user       INT NOT NULL DEFAULT 5,
      join_window_sec       INT NOT NULL DEFAULT 120,
      offline_reset_sec     INT NOT NULL DEFAULT 120,
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_rain_state (
      streamer_id           INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      phase                TEXT NOT NULL DEFAULT 'waiting',  -- disabled|offline|waiting|open
      next_at_ms           BIGINT NOT NULL DEFAULT 0,
      open_at_ms           BIGINT NULL,
      close_at_ms          BIGINT NULL,
      round_id             BIGINT NOT NULL DEFAULT 0,
      offline_since_ms     BIGINT NULL,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_rain_joins (
      id                   BIGSERIAL PRIMARY KEY,
      streamer_id          INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      round_id             BIGINT NOT NULL,
      user_id              INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username             TEXT NOT NULL,
      joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(streamer_id, round_id, user_id)
    );
  `);

  schemaReady = true;
}

function clampInterval(v: any): 10 | 30 | 60 | 120 {
  const n = Number(v);
  if (ALLOWED_INTERVALS.has(n)) return n as any;
  return 30;
}

function asBool(v: any): boolean {
  return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT id, slug, user_id AS "ownerUserId", is_live AS "isLive", appearance
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
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
    isLive: !!row.isLive,
    appearance: normalizeAppearance(row.appearance || {}),
  };
}

async function isMod(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1 FROM streamer_mods
     WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL
     LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

async function canManage(req: any, streamer: { streamerId: number; ownerUserId: number | null }) {
  const u = req.user;
  if (!u?.id) return false;
  const role = String(u.role || "viewer");
  if (role === "admin") return true;
  if (streamer.ownerUserId != null && Number(streamer.ownerUserId) === Number(u.id)) return true;
  return await isMod(streamer.streamerId, Number(u.id));
}

async function sendBotChatAndToast(opts: {
  req: any;
  streamerId: number;
  slug: string;
  body: string;
  toast?: any;
  appearance: any;
}) {
  const botUserId = Number(process.env.BOT_USER_ID || 0);
  const botUsername = String(process.env.BOT_USERNAME || "LunaBot");
  if (!botUserId) {
    console.warn("[bot_rain] BOT_USER_ID missing, skip bot chat");
    return;
  }

  const ins = await pool.query(
    `INSERT INTO chat_messages (streamer_id, user_id, username, body)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at AS "createdAt"`,
    [opts.streamerId, botUserId, botUsername, String(opts.body || "").slice(0, 500)]
  );

  const row = ins.rows?.[0];

  const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
  const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

  const msg = {
    id: Number(row.id),
    userId: botUserId,
    username: botUsername,
    body: String(opts.body || "").slice(0, 500),
    createdAt: new Date(row.createdAt).toISOString(),
    cosmetics,
    style: {
      nameColor: opts.appearance?.chat?.usernameColor,
      msgColor: opts.appearance?.chat?.messageColor,
    },
  };

  const io = opts.req.app?.locals?.io;
  if (io) {
    io.to(`chat:${opts.slug}`).emit("chat:message", msg);
    if (opts.toast?.title) io.to(`chat:${opts.slug}`).emit("ui:toast", opts.toast);
  }
}

async function ensureCfg(streamerId: number) {
  const r = await pool.query(
    `SELECT enabled, interval_min AS "intervalMin", rubies_per_user AS "rubiesPerUser",
            join_window_sec AS "joinWindowSec", offline_reset_sec AS "offlineResetSec"
     FROM bot_rain_cfg
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );
  const row = r.rows?.[0];
  if (row) {
    const intervalMin = clampInterval(row.intervalMin);
    return {
      enabled: !!row.enabled,
      intervalMin,
      rubiesPerUser: Number(row.rubiesPerUser || PRESETS[intervalMin]),
      joinWindowSec: Math.max(30, Number(row.joinWindowSec || 120)),
      offlineResetSec: Math.max(30, Number(row.offlineResetSec || 120)),
    };
  }

  // default insert
  const intervalMin = 30 as const;
  const rubiesPerUser = PRESETS[intervalMin];

  await pool.query(
    `INSERT INTO bot_rain_cfg(streamer_id, enabled, interval_min, rubies_per_user, join_window_sec, offline_reset_sec)
     VALUES ($1,false,$2,$3,120,120)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId, intervalMin, rubiesPerUser]
  );

  return {
    enabled: false,
    intervalMin,
    rubiesPerUser,
    joinWindowSec: 120,
    offlineResetSec: 120,
  };
}

async function ensureState(streamerId: number, intervalMin: number) {
  const r = await pool.query(
    `SELECT phase, next_at_ms AS "nextAtMs", open_at_ms AS "openAtMs", close_at_ms AS "closeAtMs",
            round_id AS "roundId", offline_since_ms AS "offlineSinceMs"
     FROM bot_rain_state
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );

  const row = r.rows?.[0];
  if (row) {
    return {
      phase: String(row.phase || "waiting"),
      nextAtMs: Number(row.nextAtMs || 0),
      openAtMs: row.openAtMs != null ? Number(row.openAtMs) : null,
      closeAtMs: row.closeAtMs != null ? Number(row.closeAtMs) : null,
      roundId: Number(row.roundId || 0),
      offlineSinceMs: row.offlineSinceMs != null ? Number(row.offlineSinceMs) : null,
    };
  }

  const now = Date.now();
  const nextAtMs = now + intervalMin * 60_000;

  await pool.query(
    `INSERT INTO bot_rain_state(streamer_id, phase, next_at_ms, round_id)
     VALUES ($1,'waiting',$2,0)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId, nextAtMs]
  );

  return {
    phase: "waiting",
    nextAtMs,
    openAtMs: null,
    closeAtMs: null,
    roundId: 0,
    offlineSinceMs: null,
  };
}

async function countParticipants(streamerId: number, roundId: number) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM bot_rain_joins
     WHERE streamer_id=$1 AND round_id=$2`,
    [streamerId, roundId]
  );
  return Number(r.rows?.[0]?.n || 0);
}

async function hasJoined(streamerId: number, roundId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1 FROM bot_rain_joins WHERE streamer_id=$1 AND round_id=$2 AND user_id=$3 LIMIT 1`,
    [streamerId, roundId, userId]
  );
  return !!r.rows?.[0];
}

/**
 * Avance la state machine si nécessaire.
 * Important: transitions + side-effects doivent être atomiques => transaction + FOR UPDATE.
 */
async function advanceIfNeeded(req: any, streamer: any, cfg: any) {
  const now = Date.now();

  // disabled => juste mettre phase=disabled (sans casser nextAt)
  if (!cfg.enabled) {
    await pool.query(
      `UPDATE bot_rain_state SET phase='disabled', updated_at=NOW() WHERE streamer_id=$1`,
      [streamer.streamerId]
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock state
    const stRes = await client.query(
      `SELECT phase, next_at_ms AS "nextAtMs", open_at_ms AS "openAtMs", close_at_ms AS "closeAtMs",
              round_id AS "roundId", offline_since_ms AS "offlineSinceMs"
       FROM bot_rain_state
       WHERE streamer_id=$1
       FOR UPDATE`,
      [streamer.streamerId]
    );

    let st = stRes.rows?.[0];
    if (!st) {
      const nextAtMs = now + cfg.intervalMin * 60_000;
      await client.query(
        `INSERT INTO bot_rain_state(streamer_id, phase, next_at_ms, round_id)
         VALUES ($1,'waiting',$2,0)`,
        [streamer.streamerId, nextAtMs]
      );
      st = {
        phase: "waiting",
        nextAtMs,
        openAtMs: null,
        closeAtMs: null,
        roundId: 0,
        offlineSinceMs: null,
      };
    }

    const phase = String(st.phase || "waiting");
    const nextAtMs = Number(st.nextAtMs || 0);
    const closeAtMs = st.closeAtMs != null ? Number(st.closeAtMs) : null;
    const roundId = Number(st.roundId || 0);
    const offlineSinceMs = st.offlineSinceMs != null ? Number(st.offlineSinceMs) : null;

    // offline handling
    if (!streamer.isLive) {
      const offSince = offlineSinceMs ?? now;
      const offDur = now - offSince;

      // set offline_since si absent + phase offline
      await client.query(
        `UPDATE bot_rain_state
         SET phase='offline',
             offline_since_ms = COALESCE(offline_since_ms, $2),
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamer.streamerId, offSince]
      );

      // si offline trop longtemps => reset timer
      if (offDur >= cfg.offlineResetSec * 1000) {
        const resetNext = now + cfg.intervalMin * 60_000;
        await client.query(
          `UPDATE bot_rain_state
           SET phase='waiting',
               next_at_ms=$2,
               open_at_ms=NULL,
               close_at_ms=NULL,
               offline_since_ms=$3,
               updated_at=NOW()
           WHERE streamer_id=$1`,
          [streamer.streamerId, resetNext, offSince]
        );
      }

      await client.query("COMMIT");
      return;
    }

    // live again => clear offline_since
    if (offlineSinceMs != null) {
      await client.query(
        `UPDATE bot_rain_state SET offline_since_ms=NULL, updated_at=NOW() WHERE streamer_id=$1`,
        [streamer.streamerId]
      );
    }

    // transitions
    if ((phase === "waiting" || phase === "offline" || phase === "disabled") && now >= nextAtMs) {
      const newRoundId = roundId + 1;
      const openAt = now;
      const closeAt = now + cfg.joinWindowSec * 1000;

      await client.query(
        `UPDATE bot_rain_state
         SET phase='open',
             round_id=$2,
             open_at_ms=$3,
             close_at_ms=$4,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamer.streamerId, newRoundId, openAt, closeAt]
      );

      await client.query("COMMIT");

      // side-effect AFTER commit (chat + toast)
      const toast = {
        kind: "info",
        title: "🌧️ Rain",
        message: `Rejoins pour gagner ${cfg.rubiesPerUser} rubis (+ bonus talents)`,
        sticky: true,
        dismissible: true,
        durationMs: cfg.joinWindowSec * 1000,
        action: { label: "Rejoindre", event: "ui:rain_join", detail: { slug: streamer.slug } },
      };

      await sendBotChatAndToast({
        req,
        streamerId: streamer.streamerId,
        slug: streamer.slug,
        body: `🌧️ Rain en cours ! [RAIN_OPEN] Tu as ${Math.floor(cfg.joinWindowSec / 60)} min pour rejoindre (bot menu / toast).`,
        toast,
        appearance: streamer.appearance,
      });

      return;
    }

    if (phase === "open" && closeAtMs != null && now >= closeAtMs) {
      // payout
      const curRound = roundId;
      const joins = await client.query(
        `SELECT user_id, username FROM bot_rain_joins WHERE streamer_id=$1 AND round_id=$2`,
        [streamer.streamerId, curRound]
      );

      const userIds = (joins.rows || []).map((x: any) => Number(x.user_id)).filter((x: number) => x > 0);
      const boostByUser = await getRainBoostLevels(client, userIds);

      for (const r of joins.rows || []) {
        const uid = Number(r.user_id);
        if (!uid) continue;

        const level = boostByUser.get(uid) ?? 0;
        const payout = applyRainBoost(cfg.rubiesPerUser, level);

        await earnRubisTx(client, uid, "event_platform", payout, {
          kind: "rain",
          base: cfg.rubiesPerUser,
          talent: { code: RAIN_TALENT_CODE, level },
          streamerId: streamer.streamerId,
          slug: streamer.slug,
          roundId: curRound,
        });
      }

      const next = now + cfg.intervalMin * 60_000;

      await client.query(
        `UPDATE bot_rain_state
         SET phase='waiting',
             next_at_ms=$2,
             open_at_ms=NULL,
             close_at_ms=NULL,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamer.streamerId, next]
      );

      await client.query("COMMIT");

      const n = (joins.rows || []).length;
      await sendBotChatAndToast({
        req,
        streamerId: streamer.streamerId,
        slug: streamer.slug,
        body:
          n > 0
            ? `✅ Rain terminée : ${n} participant(s) ont reçu ${cfg.rubiesPerUser} rubis.`
            : `✅ Rain terminée : aucun participant.`,
        appearance: streamer.appearance,
      });

      return;
    }

    await client.query("COMMIT");
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.warn("[bot_rain] advance failed", e?.message || e);
  } finally {
    client.release();
  }
}

/**
 * GET /me/bot/bot_rain/public?slug=...
 * => état pour viewers + mod (cfg incluse)
 */
botRainRouter.get("/public", async (req: any, res: any) => {
  try {
    await ensureSchema();

    const slug = String(req.query?.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const cfg = await ensureCfg(streamer.streamerId);

    // init state if needed
    await ensureState(streamer.streamerId, cfg.intervalMin);

    // advance machine
    await advanceIfNeeded(req, streamer, cfg);

    // read state again (no lock needed)
    const st = await ensureState(streamer.streamerId, cfg.intervalMin);

    const userId = req.user?.id ? Number(req.user.id) : 0;
    const curRound = st.phase === "open" ? st.roundId : 0;
    const participants = st.phase === "open" ? await countParticipants(streamer.streamerId, curRound) : 0;
    const joined = st.phase === "open" && userId ? await hasJoined(streamer.streamerId, curRound, userId) : false;

    const phase =
      !cfg.enabled ? "disabled" : !streamer.isLive ? "offline" : st.phase === "open" ? "open" : "waiting";

    return res.json({
      ok: true,
      slug: streamer.slug,
      enabled: cfg.enabled,
      intervalMin: cfg.intervalMin,
      rubiesPerUser: cfg.rubiesPerUser,
      isLive: !!streamer.isLive,
      phase,
      serverNowMs: Date.now(),
      nextAtMs: phase === "waiting" ? st.nextAtMs : null,
      joinCloseAtMs: phase === "open" ? st.closeAtMs : null,
      roundId: phase === "open" ? st.roundId : null,
      joined,
      participants,
      canManage: await canManage(req, streamer),
    });
  } catch (e: any) {
    console.error("[bot_rain/public] error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /me/bot/bot_rain/join
 * body: { slug }
 */
botRainRouter.post("/join", async (req: any, res: any) => {
  try {
    await ensureSchema();

    const slug = String(req.body?.slug || req.query?.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const cfg = await ensureCfg(streamer.streamerId);
    await ensureState(streamer.streamerId, cfg.intervalMin);
    await advanceIfNeeded(req, streamer, cfg);

    if (!cfg.enabled) return res.status(409).json({ ok: false, error: "disabled" });
    if (!streamer.isLive) return res.status(409).json({ ok: false, error: "offline" });

    const userId = Number(req.user?.id || 0);
    const username = String(req.user?.username || req.user?.displayName || "user").slice(0, 64);
    if (!userId) return res.status(401).json({ ok: false, error: "auth_required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const stRes = await client.query(
        `SELECT phase, close_at_ms AS "closeAtMs", round_id AS "roundId"
         FROM bot_rain_state
         WHERE streamer_id=$1
         FOR UPDATE`,
        [streamer.streamerId]
      );

      const st = stRes.rows?.[0];
      const phase = String(st?.phase || "waiting");
      const closeAtMs = st?.closeAtMs != null ? Number(st.closeAtMs) : null;
      const roundId = Number(st?.roundId || 0);

      const now = Date.now();
      if (phase !== "open" || !closeAtMs || now >= closeAtMs) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "not_open" });
      }

      await client.query(
        `INSERT INTO bot_rain_joins(streamer_id, round_id, user_id, username)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (streamer_id, round_id, user_id) DO NOTHING`,
        [streamer.streamerId, roundId, userId, username]
      );

      await client.query("COMMIT");

      return res.json({ ok: true, roundId });
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("[bot_rain/join] error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /me/bot/bot_rain/config
 * body: { slug, enabled, intervalMin }
 * => streamer/mod/admin only
 */
botRainRouter.post("/config", async (req: any, res: any) => {
  try {
    await ensureSchema();

    const slug = String(req.body?.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okManage = await canManage(req, streamer);
    if (!okManage) return res.status(403).json({ ok: false, error: "forbidden" });

    const enabled = asBool(req.body?.enabled);
    const intervalMin = clampInterval(req.body?.intervalMin);
    const rubiesPerUser = PRESETS[intervalMin] ?? 5;

    await pool.query(
      `INSERT INTO bot_rain_cfg(streamer_id, enabled, interval_min, rubies_per_user, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (streamer_id) DO UPDATE
         SET enabled=EXCLUDED.enabled,
             interval_min=EXCLUDED.interval_min,
             rubies_per_user=EXCLUDED.rubies_per_user,
             updated_at=NOW()`,
      [streamer.streamerId, enabled, intervalMin, rubiesPerUser]
    );

    // si on change l'interval, on recale next_at si on était en waiting/disabled/offline
    const st = await ensureState(streamer.streamerId, intervalMin);
    if (st.phase !== "open") {
      const nextAtMs = Date.now() + intervalMin * 60_000;
      await pool.query(
        `UPDATE bot_rain_state
         SET phase=$2,
             next_at_ms=$3,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamer.streamerId, enabled ? "waiting" : "disabled", nextAtMs]
      );
    }

    return res.json({ ok: true, enabled, intervalMin, rubiesPerUser });
  } catch (e: any) {
    console.error("[bot_rain/config] error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
