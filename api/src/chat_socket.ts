import type { Server as HTTPServer } from "http";
import { Server as IOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "./db"; // ⚠️ doit exposer db.query(sql, params)

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const RATE_MS = 200;
const MAX_CHARS = 200;

type AuthedUser = { id: number; username: string; role: string } | null;

type RoomCtx = {
  streamerId: number;
  slug: string;
  ownerUserId: number | null;
  user: AuthedUser;
  chatRole: "guest" | "viewer" | "mod" | "streamer" | "admin";
};

const lastMsgAt = new Map<string, number>(); // key = `${streamerId}:${userId}`

function roomName(slug: string) {
  return `stream:${slug}`;
}

function nowMs() {
  return Date.now();
}

async function getStreamerBySlug(slug: string) {
  const r = await db.query(
    `select id, slug, user_id as owner_user_id
     from streamers
     where slug = $1
     limit 1`,
    [slug]
  );
  return r.rows[0] || null;
}

async function cleanupOldMessages(streamerId: number) {
  await db.query(
    `delete from chat_messages
     where streamer_id = $1
       and created_at < now() - interval '3 days'`,
    [streamerId]
  );
}

async function getUserFromToken(token: string | undefined): Promise<AuthedUser> {
  const t = String(token || "").trim();
  if (!t) return null;
  try {
    const payload: any = jwt.verify(t, JWT_SECRET);
    const userId = Number(payload?.id || payload?.userId);
    if (!Number.isFinite(userId)) return null;

    const r = await db.query(
      `select id, username, role
       from users
       where id = $1
       limit 1`,
      [userId]
    );
    const u = r.rows[0];
    if (!u) return null;
    return { id: Number(u.id), username: String(u.username), role: String(u.role) };
  } catch {
    return null;
  }
}

async function isMod(streamerId: number, userId: number) {
  const r = await db.query(
    `select 1 from streamer_mods where streamer_id=$1 and user_id=$2 limit 1`,
    [streamerId, userId]
  );
  return !!r.rows[0];
}

async function isBanned(streamerId: number, userId: number) {
  const r = await db.query(
    `select 1 from chat_bans where streamer_id=$1 and user_id=$2 limit 1`,
    [streamerId, userId]
  );
  return !!r.rows[0];
}

async function getActiveTimeout(streamerId: number, userId: number) {
  const r = await db.query(
    `select expires_at
     from chat_timeouts
     where streamer_id=$1 and user_id=$2 and expires_at > now()
     order by expires_at desc
     limit 1`,
    [streamerId, userId]
  );
  return r.rows[0]?.expires_at || null;
}

function computeRole(st: any, user: AuthedUser, mod: boolean) {
  if (!user) return "guest" as const;
  if (user.role === "admin") return "admin" as const;
  if (st?.owner_user_id && Number(st.owner_user_id) === user.id) return "streamer" as const;
  if (mod) return "mod" as const;
  return "viewer" as const;
}

function perms(role: RoomCtx["chatRole"]) {
  const canSend = role !== "guest";
  const canDelete = role === "mod" || role === "streamer" || role === "admin";
  const canTimeout = canDelete;
  const canBan = canDelete;
  const canClear = role === "streamer" || role === "admin";
  const canMod = role === "streamer" || role === "admin";
  return { canSend, canDelete, canTimeout, canBan, canClear, canMod };
}

export function attachChatSocket(server: HTTPServer) {
  const io = new IOServer(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "https://lunalive.onrender.com",
      ],
      credentials: false,
    },
  });

  // socket.data.roomsCtx : Map<slug, RoomCtx>
  io.on("connection", async (socket) => {
    const token = (socket.handshake.auth as any)?.token as string | undefined;
    const user = await getUserFromToken(token);

    const roomCtx = new Map<string, RoomCtx>();
    (socket.data as any).roomCtx = roomCtx;

    socket.on("chat:join", async ({ slug }: { slug: string }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const st = await getStreamerBySlug(s);
        if (!st) return cb?.({ ok: false, error: "streamer_not_found" });

        await cleanupOldMessages(Number(st.id));

        const mod = user ? await isMod(Number(st.id), user.id) : false;
        const chatRole = computeRole(st, user, mod);

        const ctx: RoomCtx = {
          streamerId: Number(st.id),
          slug: String(st.slug),
          ownerUserId: st.owner_user_id ? Number(st.owner_user_id) : null,
          user,
          chatRole,
        };

        roomCtx.set(ctx.slug, ctx);
        socket.join(roomName(ctx.slug));

        cb?.({ ok: true, role: chatRole, perms: perms(chatRole), me: user });
      } catch {
        cb?.({ ok: false, error: "join_failed" });
      }
    });

    socket.on("chat:send", async ({ slug, body }: { slug: string; body: string }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const ctx = roomCtx.get(s);
        if (!ctx) return cb?.({ ok: false, error: "not_joined" });
        if (!ctx.user) return cb?.({ ok: false, error: "auth_required" });

        const text = String(body || "").trim();
        if (!text) return cb?.({ ok: false, error: "empty" });
        if (text.length > MAX_CHARS) return cb?.({ ok: false, error: "too_long" });

        // bans/timeouts
        if (await isBanned(ctx.streamerId, ctx.user.id)) return cb?.({ ok: false, error: "banned" });
        const to = await getActiveTimeout(ctx.streamerId, ctx.user.id);
        if (to) return cb?.({ ok: false, error: "timeout", until: to });

        // rate limit
        const key = `${ctx.streamerId}:${ctx.user.id}`;
        const last = lastMsgAt.get(key) || 0;
        const n = nowMs();
        if (n - last < RATE_MS) return cb?.({ ok: false, error: "rate_limited" });
        lastMsgAt.set(key, n);

        await cleanupOldMessages(ctx.streamerId);

        const ins = await db.query(
          `insert into chat_messages(streamer_id, user_id, username, body)
           values ($1,$2,$3,$4)
           returning id, created_at`,
          [ctx.streamerId, ctx.user.id, ctx.user.username, text]
        );

        const msg = {
          id: Number(ins.rows[0].id),
          userId: ctx.user.id,
          username: ctx.user.username,
          body: text,
          deleted: false,
          createdAt: ins.rows[0].created_at,
          // utile pour le menu "aller sur son stream" plus tard (si on veut)
        };

        io.to(roomName(ctx.slug)).emit("chat:message", msg);
        cb?.({ ok: true });
      } catch {
        cb?.({ ok: false, error: "send_failed" });
      }
    });

    socket.on("chat:delete", async ({ slug, messageId }: { slug: string; messageId: number }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const ctx = roomCtx.get(s);
        if (!ctx) return cb?.({ ok: false, error: "not_joined" });
        if (!ctx.user) return cb?.({ ok: false, error: "auth_required" });

        const p = perms(ctx.chatRole);
        if (!p.canDelete) return cb?.({ ok: false, error: "forbidden" });

        await db.query(
          `update chat_messages
           set deleted_at = now(), deleted_by = $3
           where streamer_id=$1 and id=$2`,
          [ctx.streamerId, Number(messageId), ctx.user.id]
        );

        io.to(roomName(ctx.slug)).emit("chat:deleted", { id: Number(messageId) });
        cb?.({ ok: true });
      } catch {
        cb?.({ ok: false, error: "delete_failed" });
      }
    });

    socket.on(
      "chat:timeout",
      async (
        { slug, userId, seconds }: { slug: string; userId: number; seconds: number },
        cb?: Function
      ) => {
        try {
          const s = String(slug || "").trim();
          const ctx = roomCtx.get(s);
          if (!ctx?.user) return cb?.({ ok: false, error: "auth_required" });

          const p = perms(ctx.chatRole);
          if (!p.canTimeout) return cb?.({ ok: false, error: "forbidden" });

          const sec = Math.max(10, Math.min(60 * 60 * 24, Number(seconds || 0))); // 10s..24h
          await db.query(
            `insert into chat_timeouts(streamer_id, user_id, expires_at, created_by)
             values ($1,$2, now() + ($3 || ' seconds')::interval, $4)`,
            [ctx.streamerId, Number(userId), String(sec), ctx.user.id]
          );

          io.to(roomName(ctx.slug)).emit("chat:timeout_set", { userId: Number(userId), seconds: sec });
          cb?.({ ok: true });
        } catch {
          cb?.({ ok: false, error: "timeout_failed" });
        }
      }
    );

    socket.on("chat:ban", async ({ slug, userId }: { slug: string; userId: number }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const ctx = roomCtx.get(s);
        if (!ctx?.user) return cb?.({ ok: false, error: "auth_required" });

        const p = perms(ctx.chatRole);
        if (!p.canBan) return cb?.({ ok: false, error: "forbidden" });

        await db.query(
          `insert into chat_bans(streamer_id, user_id, created_by)
           values ($1,$2,$3)
           on conflict (streamer_id, user_id) do update set created_at=excluded.created_at, created_by=excluded.created_by`,
          [ctx.streamerId, Number(userId), ctx.user.id]
        );

        io.to(roomName(ctx.slug)).emit("chat:banned", { userId: Number(userId) });
        cb?.({ ok: true });
      } catch {
        cb?.({ ok: false, error: "ban_failed" });
      }
    });

    socket.on("chat:clear", async ({ slug }: { slug: string }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const ctx = roomCtx.get(s);
        if (!ctx?.user) return cb?.({ ok: false, error: "auth_required" });

        const p = perms(ctx.chatRole);
        if (!p.canClear) return cb?.({ ok: false, error: "forbidden" });

        await db.query(`delete from chat_messages where streamer_id=$1`, [ctx.streamerId]);
        io.to(roomName(ctx.slug)).emit("chat:cleared", {});
        cb?.({ ok: true });
      } catch {
        cb?.({ ok: false, error: "clear_failed" });
      }
    });

    socket.on("chat:mod", async ({ slug, userId, make }: { slug: string; userId: number; make: boolean }, cb?: Function) => {
      try {
        const s = String(slug || "").trim();
        const ctx = roomCtx.get(s);
        if (!ctx?.user) return cb?.({ ok: false, error: "auth_required" });

        const p = perms(ctx.chatRole);
        if (!p.canMod) return cb?.({ ok: false, error: "forbidden" });

        const uid = Number(userId);
        if (make) {
          await db.query(
            `insert into streamer_mods(streamer_id, user_id, created_by)
             values ($1,$2,$3)
             on conflict do nothing`,
            [ctx.streamerId, uid, ctx.user.id]
          );
        } else {
          await db.query(`delete from streamer_mods where streamer_id=$1 and user_id=$2`, [ctx.streamerId, uid]);
        }

        io.to(roomName(ctx.slug)).emit("chat:mods_updated", { userId: uid, make: !!make });
        cb?.({ ok: true });
      } catch {
        cb?.({ ok: false, error: "mod_failed" });
      }
    });
  });

  return io;
}
