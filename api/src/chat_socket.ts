// api/src/chat_socket.ts
import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { chatStore } from "./chat_store.js";
import type { AuthUser } from "./auth.js";
import { normalizeAppearance, type Appearance } from "./appearance.js";
import { getChatCosmeticsForUsers } from "./chat_cosmetics.js";
import { parseBangCommand, handleCallsCommand } from "./calls/commands.js";
import { handleGlobalCommand, isGlobalCommand } from "./services/global_commands.js";
import { ensureDliveBridge } from "./dlive_chat_bridge.js";
import { ensureRumbleBridge } from "./rumble_chat_bridge.js";

import {
  getChatSettings,
  patchChatSettings,
  containsLink,
  formatSettingsChangeMessage,
  type ChatSettings,
  type ChatSettingsPatch,
} from "./chat/chat_settings.js";

export let chatIo: Server | null = null;

// Active cam broadcasters: slug → { socketId, slot, filters }
const camBroadcasters = new Map<string, { socketId: string; slot: number; filters?: Record<string, any> }>();

// Screen share exclusif : un seul partage d'écran actif à la fois,
// peu importe qui est le "streamer principal". Un nouveau register kick l'ancien.
let screenBroadcaster: { socketId: string; slug: string; at: number } | null = null;

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

  const key = s.toLowerCase();
  const hit = streamerMetaCache.get(key);
  if (hit && Date.now() - hit.at < 5_000) return hit.meta;
  const running = streamerMetaInflight.get(key);
  if (running) return running;

  const promise = pool.query(
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
    )
    .then((r) => {
      const row = r.rows?.[0];
      const meta = row
        ? {
            id: Number(row.id),
            slug: String(row.slug),
            ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
            appearance: row.appearance ?? {},
            isLive: !!row.isLive,
            viewers: Number(row.viewers ?? 0),
          }
        : null;
      streamerMetaCache.set(key, { at: Date.now(), meta });
      return meta;
    })
    .finally(() => {
      streamerMetaInflight.delete(key);
    });
  streamerMetaInflight.set(key, promise);
  return promise;
}

const streamerMetaCache = new Map<string, { at: number; meta: Awaited<ReturnType<typeof getStreamerMetaBySlug>> }>();
const streamerMetaInflight = new Map<string, Promise<Awaited<ReturnType<typeof getStreamerMetaBySlug>>>>();

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
const settingsInflight = new Map<number, Promise<ChatSettings>>();
async function readSettings(streamerId: number) {
  const now = Date.now();
  const hit = settingsCache.get(streamerId);
  if (hit && now - hit.at < 5000) return hit.settings;
  const running = settingsInflight.get(streamerId);
  if (running) return running;
  const promise = getChatSettings(pool, streamerId).finally(() => {
    settingsInflight.delete(streamerId);
  });
  settingsInflight.set(streamerId, promise);
  const s = await promise;
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
    role: "bot",
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
  if (String(process.env.ENABLE_DLIVE_CHAT_BRIDGE || "0") !== "1") return;
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

async function safeInitRumbleBridge(io: Server, streamerId: number, slug: string, ownerUserId: number | null) {
  try {
    // On suit la même logique que DLive : on n'active le bridge que si l'admin
    // a opté pour la sync public et/ou popup. Réutilise les flags existants
    // (dliveSyncPublic/dliveSyncPopup) pour ne pas multiplier les colonnes —
    // le bridge se choisit selon `streamers.platform` du streamer.
    const st = await readSettings(streamerId);
    if (!st?.dliveSyncPublic && !st?.dliveSyncPopup) return;

    const r = await pool.query(
      `SELECT s.platform, ri.live_video_id_numeric
       FROM streamers s
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.id = $1`,
      [streamerId]
    );
    const row = r.rows?.[0];
    if (!row || String(row.platform || "").toLowerCase() !== "rumble") return;

    ensureRumbleBridge({
      io,
      pool,
      slug,
      streamerId,
      streamerOwnerUserId: ownerUserId,
      videoIdNumeric: row.live_video_id_numeric || null,
      publicOn: !!st.dliveSyncPublic,
      popupOn: !!st.dliveSyncPopup,
    });
  } catch (e: any) {
    console.warn("[chat_socket] rumble bridge init failed", e?.message || e);
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

    // ✅ fsb:designer-join — join shared FSB designer room for real-time config sync
    socket.on("fsb:designer-join", (_: any, cb?: (ack: any) => void) => {
      socket.join("fsb:designer");
      cb?.({ ok: true });
    });

    // ✅ obs:subscribe — join public overlay room (no auth)
    // Utilisé par l'OverlayPage pour recevoir obs:config sans token.
    // Pousse aussi IMMÉDIATEMENT la config persistée en DB → fix du bug
    // "au refresh OBS, certains éléments reviennent à leur position par
    // défaut" : avant, l'overlay rendait la config base64 figée dans l'URL
    // ?cfg= (souvent obsolète) et n'était mis à jour que quand le designer
    // pushait un changement. Maintenant : à chaque subscribe (= à chaque
    // refresh OBS), l'overlay reçoit la dernière config persistée.
    socket.on("obs:subscribe", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      const s = String(slug || "").trim().toLowerCase();
      if (!s) return cb?.({ ok: false, error: "bad_slug" });
      socket.join(`obsview:${s}`);
      cb?.({ ok: true, slug: s });
      try {
        // Pousse la config DB du slug demandé en priorité, fallback sur fabiozsis
        // (config FSB partagée) si rien n'est trouvé pour ce slug.
        const r = await pool.query(
          `SELECT overlay_config FROM streamers
            WHERE lower(slug) = lower($1) AND overlay_config IS NOT NULL
            LIMIT 1`,
          [s]
        );
        let blob = r.rows?.[0]?.overlay_config ?? null;
        if (!blob) {
          const r2 = await pool.query(
            `SELECT overlay_config FROM streamers
              WHERE lower(slug) = 'fabiozsis' AND overlay_config IS NOT NULL
              LIMIT 1`
          );
          blob = r2.rows?.[0]?.overlay_config ?? null;
        }
        if (blob) {
          // Wrapper v2 = { _wrapper:"v2", active, byMode } pour l'auto-switch.
          // Format legacy = OverlayConfig direct.
          const isV2 = blob && typeof blob === "object" && blob._wrapper === "v2";
          const config = isV2 ? blob.active : blob;
          const byMode = isV2 ? blob.byMode : null;
          socket.emit("obs:config", { config, byMode });
        }
      } catch (e) {
        console.warn("[obs:subscribe] config push failed:", (e as any)?.message || e);
      }
    });

    // ─── WebRTC cam signaling ───────────────────────────────────────────────────

    // Broadcaster registers their cam (stream-control page)
    // Enforces 1 cam per slug: if already registered under another socket, kick the old one
    socket.on("cam:register", async ({ slug, slot }: { slug: string; slot: number }, cb?: (ack: any) => void) => {
      const s = String(slug || "").trim().toLowerCase();
      if (!s) return cb?.({ ok: false, error: "bad_slug" });

      // Kick any existing broadcaster for this slug (different socket = different PC/tab)
      const existing = camBroadcasters.get(s);
      if (existing && existing.socketId !== socket.id) {
        io.to(existing.socketId).emit("cam:kicked", { reason: "another_device_registered" });
        const oldSocket = io.sockets.sockets.get(existing.socketId);
        if (oldSocket) {
          oldSocket.leave("fsb-cam-bcasters");
          oldSocket.data.camSlug = undefined;
        }
        // Notifier les viewers pour qu'ils cleanup leurs PC stale avant qu'on
        // ré-émette cam:registered juste après (sinon écran noir sur le viewer).
        io.to("fsb-cam-viewers").emit("cam:left", { slug: s });
      }

      // Load persisted filters from DB (fallback to any in-memory value)
      let persistedFilters: Record<string, any> | undefined = existing?.filters;
      try {
        const r = await pool.query(
          `SELECT filters FROM fsb_cam_filters WHERE slug = $1 LIMIT 1`,
          [s]
        );
        if (r.rows?.[0]?.filters) persistedFilters = r.rows[0].filters;
      } catch (e) {
        console.error("[cam:register] failed to load filters:", e);
      }

      camBroadcasters.set(s, { socketId: socket.id, slot: Number(slot) || 1, filters: persistedFilters });
      socket.data.camSlug = s;
      socket.join("fsb-cam-bcasters");
      // Broadcaster also joins viewers room so they receive filter updates from others
      socket.join("fsb-cam-viewers");
      // Notify all current viewers (include persisted filters so they show up immediately)
      io.to("fsb-cam-viewers").emit("cam:registered", {
        slug: s, slot: Number(slot) || 1, socketId: socket.id, filters: persistedFilters ?? null,
      });
      cb?.({ ok: true, slug: s, filters: persistedFilters ?? null });
    });

    // Broadcaster updates camera CSS filters
    socket.on("cam:filter-update", ({ slug, filters }: { slug: string; filters: Record<string, number> }) => {
      const s = String(slug || "").trim().toLowerCase();
      const bc = camBroadcasters.get(s);
      if (bc) camBroadcasters.set(s, { ...bc, filters });
      io.to("fsb-cam-viewers").emit("cam:filter-update", { slug: s, filters });
      // Persist to DB so filters survive broadcaster disconnect / server restart
      pool.query(
        `INSERT INTO fsb_cam_filters (slug, filters, updated_at)
           VALUES ($1, $2, now())
         ON CONFLICT (slug) DO UPDATE
           SET filters = EXCLUDED.filters, updated_at = now()`,
        [s, JSON.stringify(filters)]
      ).catch((e) => console.error("[cam:filter-update] persist failed:", e));
    });

    // Broadcaster or viewer leaves cam
    socket.on("cam:leave", () => {
      const slug = socket.data.camSlug as string | undefined;
      if (slug) {
        camBroadcasters.delete(slug);
        socket.data.camSlug = undefined;
        io.to("fsb-cam-viewers").emit("cam:left", { slug });
      }
    });

    // Viewer (overlay / stream-control) subscribes to cam events + gets current list
    socket.on("cam:viewer-join", (_: any, cb?: (ack: any) => void) => {
      socket.join("fsb-cam-viewers");
      const active = Array.from(camBroadcasters.entries()).map(([slug, bc]) => ({
        slug,
        slot: bc.slot,
        socketId: bc.socketId,
        filters: bc.filters ?? null,
      }));
      cb?.({ ok: true, active });
    });

    // Viewer requests stream from a broadcaster
    socket.on("cam:request", ({ fromSlug }: { fromSlug: string }, cb?: (ack: any) => void) => {
      const s = String(fromSlug || "").trim().toLowerCase();
      const bc = camBroadcasters.get(s);
      if (!bc) return cb?.({ ok: false, error: "broadcaster_not_found" });
      // Forward request to broadcaster with viewer's socket id
      io.to(bc.socketId).emit("cam:request", { viewerId: socket.id });
      cb?.({ ok: true });
    });

    // WebRTC offer (broadcaster → viewer)
    socket.on("cam:offer", ({ to, sdp }: { to: string; sdp: any }) => {
      const slug = socket.data.camSlug as string | undefined;
      io.to(to).emit("cam:offer", { from: socket.id, slug: slug ?? "", sdp });
    });

    // WebRTC answer (viewer → broadcaster)
    socket.on("cam:answer", ({ to, sdp }: { to: string; sdp: any }) => {
      io.to(to).emit("cam:answer", { from: socket.id, sdp });
    });

    // ICE candidates (bidirectionnel)
    socket.on("cam:ice", ({ to, candidate }: { to: string; candidate: any }) => {
      io.to(to).emit("cam:ice", { from: socket.id, candidate });
    });

    // ─── Screen share signaling ─────────────────────────────────────────────────
    // Exclusif : un seul partage d'écran actif, nouveau register kick l'ancien.
    // Même shape que cam:* mais canal séparé, une seule room "fsb-screen-viewers".

    socket.on("screen:register", ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      const s = String(slug || "").trim().toLowerCase();
      if (!s) return cb?.({ ok: false, error: "bad_slug" });

      // Kick le précédent partage si différent socket
      if (screenBroadcaster && screenBroadcaster.socketId !== socket.id) {
        io.to(screenBroadcaster.socketId).emit("screen:kicked", { reason: "replaced_by_another_user" });
        const oldSocket = io.sockets.sockets.get(screenBroadcaster.socketId);
        if (oldSocket) oldSocket.data.screenSlug = undefined;
        io.to("fsb-screen-viewers").emit("screen:left", { slug: screenBroadcaster.slug });
      }

      screenBroadcaster = { socketId: socket.id, slug: s, at: Date.now() };
      socket.data.screenSlug = s;
      socket.join("fsb-screen-bcasters");
      // Le broadcaster se rejoint aussi la room viewers pour recevoir d'éventuels
      // signaux (cohérent avec cam:*).
      socket.join("fsb-screen-viewers");
      io.to("fsb-screen-viewers").emit("screen:registered", {
        slug: s, socketId: socket.id,
      });
      cb?.({ ok: true, slug: s });
    });

    socket.on("screen:leave", () => {
      const slug = socket.data.screenSlug as string | undefined;
      if (slug && screenBroadcaster && screenBroadcaster.socketId === socket.id) {
        screenBroadcaster = null;
        socket.data.screenSlug = undefined;
        io.to("fsb-screen-viewers").emit("screen:left", { slug });
      }
    });

    socket.on("screen:viewer-join", (_: any, cb?: (ack: any) => void) => {
      socket.join("fsb-screen-viewers");
      cb?.({
        ok: true,
        active: screenBroadcaster
          ? [{ slug: screenBroadcaster.slug, socketId: screenBroadcaster.socketId }]
          : [],
      });
    });

    socket.on("screen:request", ({ fromSlug }: { fromSlug: string }, cb?: (ack: any) => void) => {
      const s = String(fromSlug || "").trim().toLowerCase();
      if (!screenBroadcaster || screenBroadcaster.slug !== s) {
        return cb?.({ ok: false, error: "broadcaster_not_found" });
      }
      io.to(screenBroadcaster.socketId).emit("screen:request", { viewerId: socket.id });
      cb?.({ ok: true });
    });

    socket.on("screen:offer", ({ to, sdp }: { to: string; sdp: any }) => {
      const slug = socket.data.screenSlug as string | undefined;
      io.to(to).emit("screen:offer", { from: socket.id, slug: slug ?? "", sdp });
    });

    socket.on("screen:answer", ({ to, sdp }: { to: string; sdp: any }) => {
      io.to(to).emit("screen:answer", { from: socket.id, sdp });
    });

    socket.on("screen:ice", ({ to, candidate }: { to: string; candidate: any }) => {
      io.to(to).emit("screen:ice", { from: socket.id, candidate });
    });

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
          // Capture l'ancien mode AVANT de l'écraser, sinon on leave la room
          // qu'on s'apprête à rejoindre (no-op) et l'ancienne reste joined →
          // duplication des messages quand on switche de mode.
          const previousMode = data.chatMode;
          const previousSlug = data.slug;
          data.chatMode = m;

          data.appearance = normalizeAppearance(meta.appearance);

          // Quitte toutes les rooms chat:* précédemment joined par ce socket
          // (cas multi-mode + cas changement de slug)
          try {
            for (const room of socket.rooms) {
              if (typeof room === "string" && room.startsWith("chat:")) {
                if (room !== `chat:${meta.slug}:${m}`) socket.leave(room);
              }
            }
            // sécurité supplémentaire avec les valeurs précédentes
            if (previousSlug && previousMode) {
              socket.leave(`chat:${previousSlug}:${previousMode}`);
            }
          } catch {}

          // ✅ IMPORTANT: join ONLY ONE chat room (no legacy room => no duplicates)
          socket.join(`chat:${meta.slug}:${m}`);

          const rp = await computeRolePerms(meta.id, meta.ownerUserId, data.user);
          data.role = rp.role;
          data.perms = rp.perms;
          data.state = rp.state;

          if (data.user) trackSocket(meta.slug, data.user.id, socket.id);

          // init platform bridges if needed
          void safeInitDliveBridge(io, meta.id, meta.slug);
          void safeInitRumbleBridge(io, meta.id, meta.slug, meta.ownerUserId ?? null);

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

    socket.on("chat:send", async (
      { slug, body, streamControl }: { slug: string; body: string; streamControl?: boolean },
      cb?: (ack: any) => void
    ) => {
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

          // ✅ Stream-control : si ça vient du panneau FSB, on n'affiche JAMAIS
          // la commande dans le chat (gagner de la place visuelle), peu importe
          // showOriginalInChat. Le bot exécute toujours la commande.
          if (out.handled && (streamControl || !out.showOriginalInChat)) return cb?.({ ok: true });

          // Si la commande n'a pas été handled par calls/hunt, essayer les
          // commandes globales (!solde, !profil, !watch, !succes)
          if (!out.handled && isGlobalCommand(bang.cmd)) {
            const g = await handleGlobalCommand({
              pool,
              io,
              slug: meta.slug,
              streamerId: meta.id,
              actorUserId: u.id,
              actorUsername: u.username,
              cmd: bang.cmd,
            });
            if (g.handled) return cb?.({ ok: true });
          }

          // ✅ Stream-control : si c'est un bang qui n'a pas été handled
          // (commande inconnue type "!asdf"), on cache quand même côté chat.
          // L'objectif est d'épurer la timeline du chat.
          if (streamControl) return cb?.({ ok: true });
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

        // Premier chatter du live — ON CONFLICT DO NOTHING : seul le 1er par live est enregistré
        pool.query(
          `INSERT INTO stream_first_chatters (live_session_id, user_id)
           SELECT id, $2 FROM live_sessions
           WHERE streamer_id=$1 AND ended_at IS NULL
           ORDER BY started_at DESC LIMIT 1
           ON CONFLICT (live_session_id) DO NOTHING`,
          [meta.id, u.id]
        ).catch(() => {});

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
          // icône de rôle côté front (viewer/mod/streamer/admin)
          role: data.role === "guest" ? "viewer" : data.role,
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
      // Clean up cam broadcaster if this socket was broadcasting
      const camSlug = socket.data.camSlug as string | undefined;
      if (camSlug && camBroadcasters.get(camSlug)?.socketId === socket.id) {
        camBroadcasters.delete(camSlug);
        io.to("fsb-cam-viewers").emit("cam:left", { slug: camSlug });
      }
      // Clean up screen broadcaster si ce socket partageait son écran
      const screenSlug = socket.data.screenSlug as string | undefined;
      if (screenSlug && screenBroadcaster && screenBroadcaster.socketId === socket.id) {
        screenBroadcaster = null;
        io.to("fsb-screen-viewers").emit("screen:left", { slug: screenSlug });
      }
    });
  });
}


 
