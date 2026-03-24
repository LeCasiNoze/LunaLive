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

import {
  getChatSettings,
  patchChatSettings,
  containsLink,
  formatSettingsChangeMessage,
  type ChatSettings,
  type ChatSettingsPatch,
} from "./chat/chat_settings.js";

export let chatIo: Server | null = null;

type ChatMode = "public" | "popup";

type SocketData = {
  user?: AuthUser;
  slug?: string; // canonical slug (db)
  streamerId?: number;
  chatMode?: ChatMode;

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
    // token invalide => guest
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
} | null> {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT
        id,
        slug,
        user_id AS "ownerUserId",
        appearance,
        is_live AS "isLive",
        viewers
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
    appearance: row.appearance ?? {},
    isLive: !!row.isLive,
    viewers: Number(row.viewers ?? 0),
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

// ✅ helper: emit to both chat rooms (public + popup), without legacy room
function emitChatAll(io: Server, slug: string, event: string, payload?: any) {
  const s = String(slug).trim();
  if (!s) return;
  io.to(`chat:${s}:public`).emit(event as any, payload);
  io.to(`chat:${s}:popup`).emit(event as any, payload);
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
    isBot: true,
    style: {
      nameColor: appearance.chat.usernameColor,
      msgColor: appearance.chat.messageColor,
    },
  };

  emitChatAll(io, meta.slug, "chat:message", msg);
}

// ✅ resolve dlive username for streamer (linked displayname or provider account slug)
async function getDliveDisplaynameForStreamer(streamerId: number): Promise<string | null> {
  // 1) linked — préférer l'immutable username (dlive-xxxx) si déjà connu en DB
  {
    const r = await pool.query(
      `SELECT dlive_use_linked AS "useLinked", dlive_link_username AS "username", dlive_link_displayname AS "dn"
       FROM streamers WHERE id=$1 LIMIT 1`,
      [streamerId]
    );
    const row = r.rows?.[0];
    if (row?.useLinked) {
      const u = String(row?.username || "").trim();
      if (u) return u; // ✅ username immutable direct, évite un appel API DLive
      const d = String(row?.dn || "").trim();
      if (d) return d;
    }
  }
  // 2) provider account assigned
  {
    const r = await pool.query(
      `SELECT pa.channel_slug AS "slug", pa.channel_username AS "username"
       FROM provider_accounts pa
       WHERE pa.provider='dlive' AND pa.assigned_to_streamer_id=$1
       LIMIT 1`,
      [streamerId]
    );
    const row = r.rows?.[0];
    const u = String(row?.username || "").trim();
    if (u) return u;
    const s = String(row?.slug || "").trim();
    if (s) return s;
  }
  return null;
}

async function safeInitDliveBridge(io: Server, streamerId: number, slug: string) {
  try {
    const st = await readSettings(streamerId);
    if (!st?.dliveSyncPublic && !st?.dliveSyncPopup) return;

    const dn = await getDliveDisplaynameForStreamer(streamerId);
    if (!dn) return;

    ensureDliveBridge({
      io,
      pool,
      slug,
      dliveUsername: dn,
      publicOn: !!st.dliveSyncPublic,
      popupOn: !!st.dliveSyncPopup,
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

    socket.on(
      "stream:join",
      async (
        { slug, token }: { slug: string; token?: string; uid?: string | number },
        cb?: (ack: any) => void
      ) => {
        try {
          const s = String(slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          // ✅ si token fourni, on l’injecte puis on re-tryAuth (utile pour overlay OBS)
          if (token) {
            (socket.handshake.auth as any) = { ...(socket.handshake.auth as any), token: String(token) };
            tryAuth(socket);
          }

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          // ✅ sécurité : seul owner (ou admin) peut rejoindre les alerts OBS
          const u = (socket.data as SocketData).user;
          const isAdmin = u?.role === "admin";
          const isOwner = !!u && meta.ownerUserId != null && Number(meta.ownerUserId) === Number(u.id);
          if (!isAdmin && !isOwner) return cb?.({ ok: false, error: "forbidden" });

          // ✅ room attendue par me_overlay.ts
          socket.join(`stream:${String(meta.slug).toLowerCase()}`);

          cb?.({ ok: true, slug: meta.slug });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "join_failed") });
        }
      }
    );

    socket.on(
      "chat:join",
      async (
        { slug, mode }: { slug: string; mode?: ChatMode },
        cb?: (ack: any) => void
      ) => {
        try {
          const s = String(slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          data.slug = meta.slug;
          data.streamerId = meta.id;

          const m: ChatMode = mode === "popup" ? "popup" : "public";
          data.chatMode = m;

          data.appearance = normalizeAppearance(meta.appearance);

          try {
            if (data.slug && data.chatMode) {
              socket.leave(`chat:${data.slug}:${data.chatMode}`);
            }
          } catch {}
          
          // ✅ IMPORTANT: join ONLY ONE chat room (no legacy room => no duplicates)
          socket.join(`chat:${meta.slug}:${m}`);

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, data.user);
          data.role = rp.role;
          data.perms = rp.perms;
          data.state = rp.state;

          if (data.user) trackSocket(meta.slug, data.user.id, socket.id);

          // init dlive bridge if needed
          void safeInitDliveBridge(io, meta.id, meta.slug);

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

    // settings get (mod/admin/owner)
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

    // settings set + system message
    socket.on(
      "chat:settings_set",
      async ({ slug, patch }: { slug: string; patch: ChatSettingsPatch }, cb?: (ack: any) => void) => {
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
          if (old.dliveSyncPublic !== next.dliveSyncPublic) changed.dliveSyncPublic = next.dliveSyncPublic;
          if (old.dliveSyncPopup !== next.dliveSyncPopup) changed.dliveSyncPopup = next.dliveSyncPopup;

          // ✅ broadcast settings to both rooms
          emitChatAll(io, meta.slug, "chat:settings", { ok: true, settings: next });

          if (Object.keys(changed).length > 0) {
            const sysText = formatSettingsChangeMessage({
              actorUsername: u.username,
              actorRole: rp.role || "viewer",
              changed,
            });
            await sendBotChat(io, meta, sysText);
          }

          // ✅ init/update bridge
          try {
            const dn = await getDliveDisplaynameForStreamer(meta.id);
            ensureDliveBridge({
              io,
              pool,
              slug: meta.slug,
              dliveUsername: dn,
              publicOn: !!next.dliveSyncPublic,
              popupOn: !!next.dliveSyncPopup,
            });
          } catch (e: any) {
            console.warn("[chat_socket] dlive bridge init failed", e?.message || e);
          }

          cb?.({ ok: true, settings: next });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "settings_set_failed") });
        }
      }
    );

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

        if (!settings.allowLinks && containsLink(text)) return cb?.({ ok: false, error: "links_disabled" });

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

          if (out.handled && !out.showOriginalInChat) return cb?.({ ok: true });
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

        // ✅ broadcast to both rooms (public + popup) WITHOUT duplicates
        emitChatAll(io, meta.slug, "chat:message", msg);

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

        emitChatAll(io, meta.slug, "chat:cleared");
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

    // moderation delete / timeout / ban...
    socket.on(
      "chat:delete",
      async ({ slug, messageId }: { slug: string; messageId: number }, cb?: (ack: any) => void) => {
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

          emitChatAll(io, meta.slug, "chat:message_deleted", { ok: true, id: mid });
          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "delete_failed") });
        }
      }
    );

    // (le reste moderation/ban/timeout est inchangé — pas besoin pour le fix doublons)
    // Tu peux garder tes handlers timeout/ban/unban/etc tels quels,
    // mais quand tu fais des emits "chat:moderation_changed" ou messages bot,
    // utilise emitChatAll() pour rester cohérent.

    socket.on("disconnect", () => {
      try {
        if (data.user && data.slug) untrackSocket(data.slug, data.user.id, socket.id);
      } catch {}
    });
  });
}


 
