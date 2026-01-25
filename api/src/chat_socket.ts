// api/src/chat_socket.ts
import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { chatStore } from "./chat_store.js";
import type { AuthUser } from "./auth.js";
import { normalizeAppearance, type Appearance } from "./appearance.js";
import { getChatCosmeticsForUsers } from "./chat_cosmetics.js";
import { parseBangCommand, handleCallsCommand } from "./calls/commands.js";
import { ensureDliveBridge } from "./dlive_chat_bridge.js";

// ✅ chat settings
import {
  getChatSettings,
  patchChatSettings,
  containsLink,
  formatSettingsChangeMessage,
  type ChatSettings,
  type ChatSettingsPatch,
} from "./chat/chat_settings.js";

export let chatIo: Server | null = null;

type SocketData = {
  user?: AuthUser;
  slug?: string; // canonical slug (db)
  streamerId?: number;
  lastSendAt?: number;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  perms?: {
    canSend: boolean;
    canDelete: boolean;
    canTimeout: boolean;
    canBan: boolean;
    canClear: boolean;
    canMod: boolean;
    canManageMods: boolean;
  };
  state?: {
    banned: boolean;
    timeoutUntil?: string | null;
  };
  appearance?: Appearance;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return secret;
}

function tryAuth(socket: Socket) {
  const data = socket.data as SocketData;

  const token =
    (socket.handshake.auth as any)?.token ||
    (() => {
      const h = String(socket.handshake.headers?.authorization || "");
      const m = h.match(/^Bearer\s+(.+)$/i);
      return m ? m[1] : null;
    })();

  if (!token) return;

  try {
    data.user = jwt.verify(String(token), getJwtSecret()) as AuthUser;
  } catch {
    // guest
  }
}

async function getStreamerMetaBySlug(
  slug: string
): Promise<{
  id: number;
  slug: string;
  ownerUserId: number | null;
  appearance: any;
  isLive: boolean;
  viewers: number;

  // ✅ DLive channel source
  dliveUseLinked: boolean;
  dliveLinkedDisplayname: string | null;
  dliveLinkedUsername: string | null;
  providerChannelSlug: string | null;
} | null> {
  const s = String(slug || "").trim();
  if (!s) return null;

  // ✅ NO dlive_links here. Only streamers + provider_accounts
  const r = await pool.query(
    `SELECT
        s.id,
        s.slug,
        s.user_id AS "ownerUserId",
        s.appearance,
        s.is_live AS "isLive",
        s.viewers,

        s.dlive_use_linked AS "dliveUseLinked",
        s.dlive_link_displayname AS "dliveLinkedDisplayname",
        s.dlive_link_username AS "dliveLinkedUsername",

        pa.channel_slug AS "providerChannelSlug"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.provider='dlive'
      AND pa.assigned_to_streamer_id = s.id
     WHERE lower(s.slug)=lower($1)
     LIMIT 1`,
    [s]
  );

  const row = r.rows?.[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: String(row.slug),
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
    appearance: row.appearance ?? {},
    isLive: !!row.isLive,
    viewers: Number(row.viewers ?? 0),

    dliveUseLinked: !!row.dliveUseLinked,
    dliveLinkedDisplayname: row.dliveLinkedDisplayname ? String(row.dliveLinkedDisplayname) : null,
    dliveLinkedUsername: row.dliveLinkedUsername ? String(row.dliveLinkedUsername) : null,
    providerChannelSlug: row.providerChannelSlug ? String(row.providerChannelSlug) : null,
  };
}

async function isStreamerMod(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1
     FROM streamer_mods
     WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL
     LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

async function isBanned(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1
     FROM chat_bans
     WHERE streamer_id=$1 AND user_id=$2
     LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

async function getActiveTimeout(
  streamerId: number,
  userId: number
): Promise<{ expiresAt: string } | null> {
  const r = await pool.query(
    `SELECT expires_at AS "expiresAt"
     FROM chat_timeouts
     WHERE streamer_id=$1 AND user_id=$2 AND expires_at > NOW()
     ORDER BY expires_at DESC
     LIMIT 1`,
    [streamerId, userId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return { expiresAt: new Date(row.expiresAt).toISOString() };
}

async function getUsernameById(userId: number) {
  const r = await pool.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.username ? String(r.rows[0].username) : `user-${userId}`;
}

async function computeRolePerms(
  streamerId: number,
  ownerUserId: number | null,
  user?: AuthUser
): Promise<{
  role: SocketData["role"];
  perms: NonNullable<SocketData["perms"]>;
  state: NonNullable<SocketData["state"]>;
}> {
  const isAdmin = user?.role === "admin";
  const isOwner = !!user && ownerUserId != null && Number(ownerUserId) === Number(user.id);

  const isDbMod = !user ? false : await isStreamerMod(streamerId, user.id);
  const isMod = !!user && (isAdmin || isOwner || isDbMod);

  const banned = !user ? false : await isBanned(streamerId, user.id);
  const timeout = !user ? null : await getActiveTimeout(streamerId, user.id);

  const role: SocketData["role"] = !user
    ? "guest"
    : isAdmin
      ? "admin"
      : isOwner
        ? "streamer"
        : isDbMod
          ? "mod"
          : "viewer";

  const canManageMods = !!user && (isAdmin || isOwner);

  const perms = {
    canSend: !!user && !banned && !timeout,
    canDelete: !!isMod,
    canTimeout: !!isMod,
    canBan: !!isMod,
    canClear: !!isMod,
    canMod: !!isMod,
    canManageMods,
  };

  return {
    role,
    perms,
    state: {
      banned,
      timeoutUntil: timeout?.expiresAt || null,
    },
  };
}

// Push perms live au user ciblé (multi tabs ok)
const socketsBySlugUser = new Map<string, Set<string>>();
function keySlugUser(slug: string, userId: number) {
  return `${String(slug).toLowerCase()}:${Number(userId)}`;
}
function trackSocket(slug: string, userId: number, socketId: string) {
  const key = keySlugUser(slug, userId);
  const set = socketsBySlugUser.get(key) || new Set<string>();
  set.add(socketId);
  socketsBySlugUser.set(key, set);
}
function untrackSocket(slug: string, userId: number, socketId: string) {
  const key = keySlugUser(slug, userId);
  const set = socketsBySlugUser.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) socketsBySlugUser.delete(key);
}

async function pushPermsUpdate(
  io: Server,
  slug: string,
  streamerId: number,
  ownerUserId: number | null,
  userId: number
) {
  const key = keySlugUser(slug, userId);
  const set = socketsBySlugUser.get(key);
  if (!set || set.size === 0) return;

  const r = await pool.query(`SELECT id, username, role FROM users WHERE id=$1 LIMIT 1`, [userId]);
  const row = r.rows?.[0];
  if (!row) return;

  const u = { id: Number(row.id), username: String(row.username), role: String(row.role) } as AuthUser;
  const rp = await computeRolePerms(streamerId, ownerUserId, u);

  for (const sid of set) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    (s.data as SocketData).perms = rp.perms;
    (s.data as SocketData).state = rp.state;
    (s.data as SocketData).role = rp.role;
    s.emit("chat:perms", { ok: true, role: rp.role, perms: rp.perms, state: rp.state });
  }
}

function clampInt(n: any, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

// follow/sub helpers
async function isFollowing(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT 1 FROM streamer_follows WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

async function isActiveSub(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT expires_at
     FROM streamer_subscriptions
     WHERE streamer_id=$1 AND user_id=$2
     LIMIT 1`,
    [streamerId, userId]
  );
  const ex = r.rows?.[0]?.expires_at ? new Date(String(r.rows[0].expires_at)).getTime() : 0;
  return !!ex && ex > Date.now();
}

// tiny cache settings
const settingsCache = new Map<number, { at: number; settings: ChatSettings }>();
async function readSettings(streamerId: number) {
  const now = Date.now();
  const hit = settingsCache.get(streamerId);
  if (hit && now - hit.at < 5000) return hit.settings;
  const s = await getChatSettings(pool, streamerId);
  settingsCache.set(streamerId, { at: now, settings: s });
  return s;
}

async function sendBotChat(io: Server, meta: { id: number; slug: string; appearance: any }, body: string) {
  const botUserId = Number(process.env.BOT_USER_ID || 0);
  const botUsername = String(process.env.BOT_USERNAME || "LunaBot");

  if (!botUserId) {
    console.warn("[chat_socket] BOT_USER_ID missing, skip bot chat");
    return;
  }

  const text = String(body || "").replace(/\r/g, "").trim().slice(0, 500);
  if (!text) return;

  const ins = await pool.query(
    `INSERT INTO chat_messages (streamer_id, user_id, username, body)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at AS "createdAt"`,
    [meta.id, botUserId, botUsername, text]
  );
  const row = ins.rows?.[0];

  const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
  const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

  const appearance = normalizeAppearance(meta.appearance || {});
  const msg = {
    id: Number(row.id),
    userId: botUserId,
    username: botUsername,
    body: text,
    createdAt: new Date(row.createdAt).toISOString(),
    cosmetics,
    style: {
      nameColor: appearance.chat.usernameColor,
      msgColor: appearance.chat.messageColor,
    },
  };

  // 🔥 broadcast sur les 2 rooms (public/popup) + legacy
  io.to(`chat:${meta.slug}:public`).emit("chat:message", msg);
  io.to(`chat:${meta.slug}:popup`).emit("chat:message", msg);
  io.to(`chat:${meta.slug}`).emit("chat:message", msg);
}

function getDliveDisplaynameFromMeta(meta: {
  dliveUseLinked: boolean;
  dliveLinkedDisplayname: string | null;
  providerChannelSlug: string | null;
}) {
  if (meta.dliveUseLinked && meta.dliveLinkedDisplayname) return meta.dliveLinkedDisplayname;
  if (meta.providerChannelSlug) return meta.providerChannelSlug;
  return null;
}

function safeInitDliveBridge(io: Server, meta: any, settings: ChatSettings) {
  try {
    const dliveName = getDliveDisplaynameFromMeta(meta);
    ensureDliveBridge({
      io,
      pool,
      slug: meta.slug,
      dliveUsername: dliveName,
      publicOn: !!(settings as any).dliveSyncPublic,
      popupOn: !!(settings as any).dliveSyncPopup,
    });
  } catch (e: any) {
    console.warn("[chat_socket] dlive bridge init failed", e?.message || e);
  }
}

export function attachChat(io: Server) {
  chatIo = io;

  io.use((socket, next) => {
    tryAuth(socket);
    next();
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;

    function joinUserRoom() {
      if (data.user?.id) socket.join(`user:${data.user.id}`);
    }
    joinUserRoom();

    socket.on("auth:refresh", async ({ token }: { token?: string }, cb?: (ack: any) => void) => {
      try {
        if (token) {
          (socket.handshake.auth as any) = { ...(socket.handshake.auth as any), token };
        }
        tryAuth(socket);
        joinUserRoom();

        cb?.({
          ok: true,
          me: data.user ? { id: data.user.id, username: data.user.username, role: data.user.role } : null,
        });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "auth_refresh_failed") });
      }
    });

    if (data.user?.id) socket.join(`user:${data.user.id}`);

    // ✅ chat join (mode public/popup)
    socket.on(
      "chat:join",
      async (
        { slug, mode }: { slug: string; mode?: "public" | "popup" },
        cb?: (ack: any) => void
      ) => {
        try {
          const s = String(slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          data.slug = meta.slug;
          data.streamerId = meta.id;
          data.appearance = normalizeAppearance(meta.appearance);

          const m = mode === "popup" ? "popup" : "public";
          socket.join(`chat:${meta.slug}:${m}`);

          // legacy room (si tu as encore du front qui écoute chat:${slug})
          socket.join(`chat:${meta.slug}`);

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, data.user);
          data.role = rp.role;
          data.perms = rp.perms;
          data.state = rp.state;

          if (data.user) trackSocket(meta.slug, data.user.id, socket.id);

          // ✅ init dlive bridge si settings ON
          const settings = await readSettings(meta.id);
          safeInitDliveBridge(io, meta, settings);

          cb?.({
            ok: true,
            role: rp.role,
            perms: rp.perms,
            state: rp.state,
            appearance: data.appearance,
            me: data.user ? { id: data.user.id, username: data.user.username, role: data.user.role } : null,
          });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "join_failed") });
        }
      }
    );

    // ✅ PUBLIC stream room
    socket.on("stream:join", async (payload: any, cb?: (ack: any) => void) => {
      try {
        const raw = String(payload?.slug || "").trim();
        if (!raw || raw.length > 64 || !/^[a-z0-9_-]+$/i.test(raw)) {
          return cb?.({ ok: false, error: "bad_slug" });
        }

        const meta = await getStreamerMetaBySlug(raw);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const room = `stream:${String(meta.slug).toLowerCase()}`;
        socket.join(room);

        cb?.({
          ok: true,
          slug: meta.slug,
          isLive: !!meta.isLive,
          viewers: Math.max(0, Number(meta.viewers || 0)),
        });
      } catch {
        cb?.({ ok: false, error: "join_failed" });
      }
    });

    // settings get
    socket.on("chat:settings_get", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
        if (!rp.perms.canMod) return cb?.({ ok: false, error: "forbidden" });

        const settings = await readSettings(meta.id);
        cb?.({ ok: true, settings });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "settings_get_failed") });
      }
    });

    // settings set + system message + refresh dlive bridge
    socket.on(
      "chat:settings_set",
      async (
        { slug, patch }: { slug: string; patch: ChatSettingsPatch },
        cb?: (ack: any) => void
      ) => {
        try {
          const u = data.user;
          if (!u) return cb?.({ ok: false, error: "auth_required" });

          const s = String(slug || data.slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
          if (!rp.perms.canMod) return cb?.({ ok: false, error: "forbidden" });

          const old = await getChatSettings(pool, meta.id);

          const p: ChatSettingsPatch = { ...(patch || {}) };
          if (p.subOnly === true) p.followOnly = false;
          if (p.followOnly === true) p.subOnly = false;

          const next = await patchChatSettings(pool, meta.id, p, u.id);
          settingsCache.set(meta.id, { at: Date.now(), settings: next });

          const changed: ChatSettingsPatch = {};
          if (old.allowLinks !== next.allowLinks) changed.allowLinks = next.allowLinks;
          if (old.followOnly !== next.followOnly) changed.followOnly = next.followOnly;
          if (old.subOnly !== next.subOnly) changed.subOnly = next.subOnly;

          // dlive flags (si tes types ChatSettings les incluent)
          if ((old as any).dliveSyncPublic !== (next as any).dliveSyncPublic)
            (changed as any).dliveSyncPublic = (next as any).dliveSyncPublic;
          if ((old as any).dliveSyncPopup !== (next as any).dliveSyncPopup)
            (changed as any).dliveSyncPopup = (next as any).dliveSyncPopup;

          // broadcast settings to legacy room + new rooms
          io.to(`chat:${meta.slug}`).emit("chat:settings", { ok: true, settings: next });
          io.to(`chat:${meta.slug}:public`).emit("chat:settings", { ok: true, settings: next });
          io.to(`chat:${meta.slug}:popup`).emit("chat:settings", { ok: true, settings: next });

          if (Object.keys(changed).length > 0) {
            const sysText = formatSettingsChangeMessage({
              actorUsername: u.username,
              actorRole: rp.role || "viewer",
              changed,
            });
            await sendBotChat(io, meta, sysText);
          }

          // ✅ refresh dlive bridge state
          safeInitDliveBridge(io, meta, next);

          cb?.({ ok: true, settings: next });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "settings_set_failed") });
        }
      }
    );

    // chat send
    socket.on("chat:send", async ({ slug, body }: { slug: string; body: string }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        if (await isBanned(meta.id, u.id)) return cb?.({ ok: false, error: "banned" });
        const timeout = await getActiveTimeout(meta.id, u.id);
        if (timeout) return cb?.({ ok: false, error: "timed_out", expiresAt: timeout.expiresAt });

        let text = String(body || "");
        text = text.replace(/\r/g, "").trim();
        if (!text) return cb?.({ ok: false, error: "empty" });
        if (text.length > 200) text = text.slice(0, 200);

        const settings = await readSettings(meta.id);

        if (!settings.allowLinks && containsLink(text)) {
          return cb?.({ ok: false, error: "links_disabled" });
        }
        if (settings.followOnly) {
          const ok = await isFollowing(meta.id, u.id);
          if (!ok) return cb?.({ ok: false, error: "follow_only" });
        }
        if (settings.subOnly) {
          const ok = await isActiveSub(meta.id, u.id);
          if (!ok) return cb?.({ ok: false, error: "sub_only" });
        }

        const bang = parseBangCommand(text);
        if (bang) {
          const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);

          const out = await handleCallsCommand({
            pool,
            io,
            slug: meta.slug,
            streamerId: meta.id,
            streamerOwnerUserId: meta.ownerUserId,

            actorUserId: u.id,
            actorUsername: u.username,
            actorRole: (rp.role || "viewer") as any,
            canMod: !!rp.perms.canMod,

            cmd: bang.cmd,
            arg: bang.arg,
          });

          if (out.handled) {
            if (!out.showOriginalInChat) return cb?.({ ok: true });
          }
        }

        const t = Date.now();
        if (data.lastSendAt && t - data.lastSendAt < 200) return cb?.({ ok: false, error: "rate_limited" });
        data.lastSendAt = t;

        const ins = await pool.query(
          `INSERT INTO chat_messages (streamer_id, user_id, username, body)
           VALUES ($1,$2,$3,$4)
           RETURNING id, created_at AS "createdAt"`,
          [meta.id, u.id, u.username, text]
        );

        const row = ins.rows?.[0];

        const appearance = data.appearance ?? normalizeAppearance(meta.appearance);
        const style = {
          nameColor: appearance.chat.usernameColor,
          msgColor: appearance.chat.messageColor,
        };

        const cosmeticsByUser = await getChatCosmeticsForUsers([u.id]);
        const cosmetics = cosmeticsByUser.get(u.id) ?? null;

        const msg = {
          id: Number(row.id),
          userId: u.id,
          username: u.username,
          body: text,
          createdAt: new Date(row.createdAt).toISOString(),
          cosmetics,
          style,
        };

        // broadcast legacy + new rooms
        io.to(`chat:${meta.slug}`).emit("chat:message", msg);
        io.to(`chat:${meta.slug}:public`).emit("chat:message", msg);
        io.to(`chat:${meta.slug}:popup`).emit("chat:message", msg);

        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "send_failed") });
      }
    });

    socket.on("chat:clear", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
        if (!rp.perms.canClear) return cb?.({ ok: false, error: "forbidden" });

        await pool.query(`DELETE FROM chat_messages WHERE streamer_id=$1`, [meta.id]);
        chatStore.clear(meta.slug);

        io.to(`chat:${meta.slug}`).emit("chat:cleared");
        io.to(`chat:${meta.slug}:public`).emit("chat:cleared");
        io.to(`chat:${meta.slug}:popup`).emit("chat:cleared");

        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "clear_failed") });
      }
    });

    socket.on("chat:refresh", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      try {
        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, data.user);

        data.role = rp.role;
        data.perms = rp.perms;
        data.state = rp.state;
        data.appearance = normalizeAppearance(meta.appearance);

        socket.emit("chat:perms", {
          ok: true,
          role: rp.role,
          perms: rp.perms,
          state: rp.state,
          appearance: data.appearance,
        });
        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "refresh_failed") });
      }
    });

    // MODERATION
    socket.on("chat:delete", async ({ slug, messageId }: { slug: string; messageId: number }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
        if (!rp.perms.canDelete) return cb?.({ ok: false, error: "forbidden" });

        const mid = Number(messageId || 0);
        if (!mid) return cb?.({ ok: false, error: "bad_message" });

        const upd = await pool.query(
          `UPDATE chat_messages
           SET deleted_at = NOW(),
               deleted_by = $3
           WHERE id = $1
             AND streamer_id = $2
             AND deleted_at IS NULL
           RETURNING id`,
          [mid, meta.id, u.id]
        );

        if (!upd.rows?.[0]) return cb?.({ ok: false, error: "message_not_found" });

        io.to(`chat:${meta.slug}`).emit("chat:message_deleted", { ok: true, id: mid });
        io.to(`chat:${meta.slug}:public`).emit("chat:message_deleted", { ok: true, id: mid });
        io.to(`chat:${meta.slug}:popup`).emit("chat:message_deleted", { ok: true, id: mid });

        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "delete_failed") });
      }
    });

    socket.on(
      "chat:timeout",
      async (
        { slug, userId, seconds, reason }: { slug: string; userId: number; seconds: number; reason?: string },
        cb?: (ack: any) => void
      ) => {
        try {
          const u = data.user;
          if (!u) return cb?.({ ok: false, error: "auth_required" });

          const s = String(slug || data.slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
          if (!rp.perms.canTimeout) return cb?.({ ok: false, error: "forbidden" });

          const targetId = Number(userId || 0);
          if (!targetId) return cb?.({ ok: false, error: "bad_user" });
          if (targetId === u.id) return cb?.({ ok: false, error: "cannot_self_timeout" });

          const sec = clampInt(seconds, 1, 7 * 24 * 3600);
          const expiresAt = new Date(Date.now() + sec * 1000);

          const r = String(reason || "").trim();
          await pool.query(
            `INSERT INTO chat_timeouts (streamer_id, user_id, expires_at, created_by, reason)
             VALUES ($1,$2,$3,$4,$5)`,
            [meta.id, targetId, expiresAt, u.id, r || null]
          );

          const targetUsername = await getUsernameById(targetId);
          await sendBotChat(io, meta, `⏳ ${targetUsername} timeout ${sec}s${r ? ` — ${r}` : ""}`);

          io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "timeout", userId: targetId });
          io.to(`chat:${meta.slug}:public`).emit("chat:moderation_changed", { type: "timeout", userId: targetId });
          io.to(`chat:${meta.slug}:popup`).emit("chat:moderation_changed", { type: "timeout", userId: targetId });

          await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

          cb?.({ ok: true, expiresAt: expiresAt.toISOString() });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "timeout_failed") });
        }
      }
    );

    socket.on(
      "chat:ban",
      async ({ slug, userId, reason }: { slug: string; userId: number; reason?: string }, cb?: (ack: any) => void) => {
        try {
          const u = data.user;
          if (!u) return cb?.({ ok: false, error: "auth_required" });

          const s = String(slug || data.slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
          if (!rp.perms.canBan) return cb?.({ ok: false, error: "forbidden" });

          const targetId = Number(userId || 0);
          if (!targetId) return cb?.({ ok: false, error: "bad_user" });
          if (targetId === u.id) return cb?.({ ok: false, error: "cannot_self_ban" });

          const r = String(reason || "").trim();
          await pool.query(
            `INSERT INTO chat_bans (streamer_id, user_id, created_by, reason)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (streamer_id, user_id)
             DO UPDATE SET created_at=NOW(), created_by=EXCLUDED.created_by, reason=EXCLUDED.reason`,
            [meta.id, targetId, u.id, r || null]
          );

          const targetUsername = await getUsernameById(targetId);
          await sendBotChat(io, meta, `🚫 ${targetUsername} banni${r ? ` — ${r}` : ""}`);

          io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "ban", userId: targetId });
          io.to(`chat:${meta.slug}:public`).emit("chat:moderation_changed", { type: "ban", userId: targetId });
          io.to(`chat:${meta.slug}:popup`).emit("chat:moderation_changed", { type: "ban", userId: targetId });

          await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "ban_failed") });
        }
      }
    );

    socket.on("disconnect", () => {
      try {
        if (data.user && data.slug) untrackSocket(data.slug, data.user.id, socket.id);
      } catch {}
    });
  });
}
