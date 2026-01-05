// api/src/routes/internal_bot.ts
import express from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const internalBotRouter = express.Router();

function requireBotKey(req: express.Request, res: express.Response): boolean {
  const expected = String(process.env.BOT_INTERNAL_KEY || "");
  const got = String(req.header("x-bot-key") || "");
  if (!expected || got !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

function parseBoolish(v: any): boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return null;
}

// --------------------
// 1) Envoi chat bot -> persist + broadcast
// --------------------
internalBotRouter.post(
  "/internal/bot/chat/send",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const streamerId = Number((req.body as any)?.streamerId || 0);
    const bodyRaw = String((req.body as any)?.body || "").replace(/\r/g, "").trim();
    const body = bodyRaw.length > 200 ? bodyRaw.slice(0, 200) : bodyRaw;

    if (!streamerId || !body) {
      return res.status(400).json({ ok: false, error: "bad_request" });
    }

    // streamer meta (slug + appearance)
    const s = await pool.query(
      `SELECT slug, appearance
       FROM streamers
       WHERE id=$1
       LIMIT 1`,
      [streamerId]
    );
    const meta = s.rows?.[0];
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const slug = String(meta.slug);
    const appearance = normalizeAppearance(meta.appearance || {});

    // bot identity
    const botUserId = Number(process.env.BOT_USER_ID || 0);
    const botUsername = String(process.env.BOT_USERNAME || "LunaBot");

    if (!botUserId) {
      return res.status(500).json({ ok: false, error: "BOT_USER_ID_missing" });
    }

    // INSERT message (DB)
    const ins = await pool.query(
      `INSERT INTO chat_messages (streamer_id, user_id, username, body)
       VALUES ($1,$2,$3,$4)
       RETURNING id, created_at AS "createdAt"`,
      [streamerId, botUserId, botUsername, body]
    );

    const row = ins.rows?.[0];

    // cosmetics (optionnel, mais utile)
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
        nameColor: appearance.chat.usernameColor,
        msgColor: appearance.chat.messageColor,
      },
    };

    // socket broadcast LIVE
    const io = req.app.locals.io;
    if (io) io.to(`chat:${slug}`).emit("chat:message", msg);

    return res.json({ ok: true, id: msg.id });
  }
);

// --------------------
// 2) ✅ MVP: Upsert settings bot par streamer (enabled/prefix/liveOnly)
// --------------------
internalBotRouter.post(
  "/internal/bot/streamer/settings",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};

    // accepte streamerId OU slug
    let streamerId = Number(body.streamerId || 0);
    const slug = String(body.slug || "").trim();

    if (!streamerId && slug) {
      const r = await pool.query(
        `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
        [slug]
      );
      streamerId = Number(r.rows?.[0]?.id || 0);
    }

    if (!streamerId) {
      return res.status(400).json({ ok: false, error: "streamer_required" });
    }

    const enabledMaybe = parseBoolish(body.enabled);
    const liveOnlyMaybe = parseBoolish(body.liveOnly);

    const prefixRawProvided = Object.prototype.hasOwnProperty.call(body, "prefix");
    const prefixRaw = prefixRawProvided ? String(body.prefix || "").trim() : null;

    // au moins 1 champ
    if (enabledMaybe === null && liveOnlyMaybe === null && !prefixRawProvided) {
      return res.status(400).json({ ok: false, error: "no_fields" });
    }

    // streamer exists ?
    const s = await pool.query(
      `SELECT id, slug FROM streamers WHERE id=$1 LIMIT 1`,
      [streamerId]
    );
    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    // fetch current (si existe)
    let cur: { enabled: boolean; prefix: string; live_only: boolean } | null = null;
    try {
      const r = await pool.query(
        `SELECT enabled, prefix, live_only
         FROM bot_streamer_settings
         WHERE streamer_id=$1
         LIMIT 1`,
        [streamerId]
      );
      if (r.rows?.[0]) {
        cur = {
          enabled: Boolean(r.rows[0].enabled),
          prefix: String(r.rows[0].prefix || "!"),
          live_only: Boolean(r.rows[0].live_only),
        };
      }
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "42P01") {
        return res.status(500).json({ ok: false, error: "bot_streamer_settings_missing" });
      }
      return res.status(500).json({ ok: false, error: "db_error", detail: e?.message || String(e) });
    }

    const nextEnabled = enabledMaybe === null ? (cur?.enabled ?? false) : enabledMaybe;
    const nextLiveOnly = liveOnlyMaybe === null ? (cur?.live_only ?? true) : liveOnlyMaybe;

    let nextPrefix = cur?.prefix ?? "!";
    if (prefixRawProvided) {
      // si fourni mais vide => "!"
      const p = String(prefixRaw || "!").trim();
      nextPrefix = p.length ? p : "!";
      // garde ça simple: on limite à 5 chars pour éviter n'importe quoi
      if (nextPrefix.length > 5) nextPrefix = nextPrefix.slice(0, 5);
    }

    // upsert
    try {
      await pool.query(
        `
        INSERT INTO bot_streamer_settings (streamer_id, enabled, prefix, live_only)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (streamer_id)
        DO UPDATE SET
          enabled=EXCLUDED.enabled,
          prefix=EXCLUDED.prefix,
          live_only=EXCLUDED.live_only,
          updated_at=now()
      `,
        [streamerId, nextEnabled, nextPrefix, nextLiveOnly]
      );
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: "db_error", detail: e?.message || String(e) });
    }

    return res.json({
      ok: true,
      streamerId,
      slug: String(streamer.slug),
      settings: {
        enabled: nextEnabled,
        prefix: nextPrefix,
        liveOnly: nextLiveOnly,
      },
    });
  }
);
