// api/src/chat_socket.ts
import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { chatStore } from "./chat_store.js";
import type { AuthUser } from "./auth.js";
import { normalizeAppearance, type Appearance } from "./appearance.js";

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
    canMod: boolean; // peut modérer (ban/timeout/delete/clear)
    canManageMods: boolean; // peut add/remove mods (owner/admin)
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
): Promise<{ id: number; slug: string; ownerUserId: number | null; appearance: any } | null> {
  const s = String(slug || "").trim();
  if (!s) return null;
  const r = await pool.query(
    `SELECT id, slug, user_id AS "ownerUserId", appearance
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
  };
}

async function isStreamerMod(streamerId: number, userId: number) {
  // ✅ IMPORTANT: ignore les mods soft-removed
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
const socketsBySlugUser = new Map<string, Set<string>>(); // key = `${slug}:${userId}` => socketIds
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

export function attachChat(io: Server) {
  io.use((socket, next) => {
    tryAuth(socket);
    next();
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;

    // 3.A — room perso (pour notif A + multi-tabs)
    if (data.user?.id) {
      socket.join(`user:${data.user.id}`);
    }

    // ✅ 3.A — Room "user:{id}" pour envoyer des notifs (go-live) à l'utilisateur
    // tryAuth() a déjà rempli data.user si token OK (via io.use)
    if (data.user?.id) {
      socket.join(`user:${data.user.id}`);
    }

    socket.on("chat:join", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      try {
        const s = String(slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        data.slug = meta.slug;
        data.streamerId = meta.id;

        // ✅ appearance normalisée (même pour guest)
        data.appearance = normalizeAppearance(meta.appearance);

        socket.join(`chat:${meta.slug}`);

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, data.user);
        data.role = rp.role;
        data.perms = rp.perms;
        data.state = rp.state;

        if (data.user) trackSocket(meta.slug, data.user.id, socket.id);

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
    });

    socket.on("chat:send", async ({ slug, body }: { slug: string; body: string }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        // ban/timeout enforcement
        if (await isBanned(meta.id, u.id)) return cb?.({ ok: false, error: "banned" });
        const timeout = await getActiveTimeout(meta.id, u.id);
        if (timeout) return cb?.({ ok: false, error: "timed_out", expiresAt: timeout.expiresAt });

        let text = String(body || "");
        text = text.replace(/\r/g, "").trim();
        if (!text) return cb?.({ ok: false, error: "empty" });
        if (text.length > 200) text = text.slice(0, 200);

        // anti-spam: 1 msg / 200ms
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

        // ✅ pour l’instant: pas de skins viewers => style = thème streamer
        const appearance = data.appearance ?? normalizeAppearance(meta.appearance);
        const style = {
          nameColor: appearance.chat.usernameColor,
          msgColor: appearance.chat.messageColor,
          // plus tard: badge/hat selon sub + skins
        };

        const msg = {
          id: Number(row.id),
          userId: u.id,
          username: u.username,
          body: text,
          createdAt: new Date(row.createdAt).toISOString(),
          style,
        };

        io.to(`chat:${meta.slug}`).emit("chat:message", msg);
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

        // ✅ refresh aussi appearance (si streamer vient de changer ses couleurs)
        data.appearance = normalizeAppearance(meta.appearance);

        socket.emit("chat:perms", { ok: true, role: rp.role, perms: rp.perms, state: rp.state, appearance: data.appearance });
        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "refresh_failed") });
      }
    });

    // ─────────────────────────────────────────────
    // MODERATION (delete / timeout / ban) + MODS
    // ─────────────────────────────────────────────

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

          io.to(`chat:${meta.slug}`).emit("chat:message_deleted", { ok: true, id: mid });
          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "delete_failed") });
        }
      }
    );

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
          const sys = chatStore.addSystem(meta.slug, `⏳ ${targetUsername} timeout ${sec}s${r ? ` — ${r}` : ""}`);
          io.to(`chat:${meta.slug}`).emit("chat:message", sys);

          io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "timeout", userId: targetId });
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
          const sys = chatStore.addSystem(meta.slug, `🚫 ${targetUsername} banni${r ? ` — ${r}` : ""}`);
          io.to(`chat:${meta.slug}`).emit("chat:message", sys);

          io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "ban", userId: targetId });
          await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "ban_failed") });
        }
      }
    );

    socket.on("chat:untimeout", async ({ slug, userId }: { slug: string; userId: number }, cb?: (ack: any) => void) => {
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

        await pool.query(
          `UPDATE chat_timeouts
           SET expires_at = NOW()
           WHERE streamer_id=$1 AND user_id=$2 AND expires_at > NOW()`,
          [meta.id, targetId]
        );

        const targetUsername = await getUsernameById(targetId);
        const sys = chatStore.addSystem(meta.slug, `✅ ${targetUsername} untimeout`);
        io.to(`chat:${meta.slug}`).emit("chat:message", sys);

        io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "untimeout", userId: targetId });
        await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "untimeout_failed") });
      }
    });

    socket.on("chat:unban", async ({ slug, userId }: { slug: string; userId: number }, cb?: (ack: any) => void) => {
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

        await pool.query(`DELETE FROM chat_bans WHERE streamer_id=$1 AND user_id=$2`, [meta.id, targetId]);

        const targetUsername = await getUsernameById(targetId);
        const sys = chatStore.addSystem(meta.slug, `✅ ${targetUsername} débanni`);
        io.to(`chat:${meta.slug}`).emit("chat:message", sys);

        io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "unban", userId: targetId });
        await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "unban_failed") });
      }
    });

    socket.on("chat:mod_status", async ({ slug, userId }: { slug: string; userId: number }, cb?: (ack: any) => void) => {
      try {
        const u = data.user;
        if (!u) return cb?.({ ok: false, error: "auth_required" });

        const s = String(slug || data.slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        const meta = await getStreamerMetaBySlug(s);
        if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

        const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
        if (!rp.perms.canManageMods) return cb?.({ ok: false, error: "forbidden" });

        const targetId = Number(userId || 0);
        if (!targetId) return cb?.({ ok: false, error: "bad_user" });

        const mod = await isStreamerMod(meta.id, targetId);
        cb?.({ ok: true, isMod: mod });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "mod_status_failed") });
      }
    });

    socket.on(
      "chat:timeout_status",
      async ({ slug, userId }: { slug: string; userId: number }, cb?: (ack: any) => void) => {
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

          const timeout = await getActiveTimeout(meta.id, targetId);
          cb?.({ ok: true, expiresAt: timeout?.expiresAt || null, timeoutUntil: timeout?.expiresAt || null });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "timeout_status_failed") });
        }
      }
    );

    socket.on(
      "chat:mod_set",
      async ({ slug, userId, enabled }: { slug: string; userId: number; enabled: boolean }, cb?: (ack: any) => void) => {
        try {
          const u = data.user;
          if (!u) return cb?.({ ok: false, error: "auth_required" });

          const s = String(slug || data.slug || "").trim();
          if (!s) return cb?.({ ok: false, error: "bad_slug" });

          const meta = await getStreamerMetaBySlug(s);
          if (!meta) return cb?.({ ok: false, error: "streamer_not_found" });

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, u);
          if (!rp.perms.canManageMods) return cb?.({ ok: false, error: "forbidden" });

          const targetId = Number(userId || 0);
          if (!targetId) return cb?.({ ok: false, error: "bad_user" });

          if (meta.ownerUserId != null && Number(targetId) === Number(meta.ownerUserId)) {
            return cb?.({ ok: false, error: "cannot_mod_owner" });
          }

          if (enabled) {
            await pool.query(
              `INSERT INTO streamer_mods (streamer_id, user_id, created_by, created_at, removed_at, removed_by)
               VALUES ($1,$2,$3,NOW(),NULL,NULL)
               ON CONFLICT (streamer_id, user_id) DO UPDATE
                 SET created_at = NOW(),
                     created_by = EXCLUDED.created_by,
                     removed_at = NULL,
                     removed_by = NULL`,
              [meta.id, targetId, u.id]
            );
          } else {
            await pool.query(
              `UPDATE streamer_mods
               SET removed_at = NOW(),
                   removed_by = $3
               WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL`,
              [meta.id, targetId, u.id]
            );
          }

          const targetUsername = await getUsernameById(targetId);
          const sys = chatStore.addSystem(
            meta.slug,
            enabled
              ? `🛡️ ${targetUsername} est maintenant modérateur`
              : `🛡️ ${targetUsername} n'est plus modérateur`
          );
          io.to(`chat:${meta.slug}`).emit("chat:message", sys);

          io.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "mod_set", userId: targetId, enabled: !!enabled });

          await pushPermsUpdate(io, meta.slug, meta.id, meta.ownerUserId, targetId);

          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: String(e?.message || "mod_set_failed") });
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
