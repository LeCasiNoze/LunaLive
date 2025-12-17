import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { chatStore } from "./chat_store";
import type { AuthUser } from "./auth";

type SocketData = {
  user?: AuthUser;
  slug?: string;
  lastSendAt?: number;
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

async function isStreamerOwner(userId: number, slug: string) {
  const r = await pool.query(`SELECT user_id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
  const ownerId = r.rows?.[0]?.user_id;
  return ownerId && Number(ownerId) === Number(userId);
}

export function attachChat(io: Server) {
  // auth middleware (guest allowed)
  io.use((socket, next) => {
    tryAuth(socket);
    next();
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;

    socket.on("chat:join", async ({ slug }: { slug: string }, cb?: (ack: any) => void) => {
      try {
        const s = String(slug || "").trim();
        if (!s) return cb?.({ ok: false, error: "bad_slug" });

        data.slug = s;
        socket.join(`chat:${s}`);

        const u = data.user;

        const isAdmin = u?.role === "admin";
        const owner = u ? await isStreamerOwner(u.id, s) : false;

        const role = !u ? "guest" : isAdmin ? "admin" : owner ? "streamer" : "viewer";

        const perms = {
          canSend: !!u,
          canDelete: isAdmin || owner,
          canTimeout: isAdmin || owner,
          canBan: isAdmin || owner,
          canClear: isAdmin || owner,
          canMod: isAdmin || owner, // MVP: owner/admin only (mods plus tard)
        };

        cb?.({
          ok: true,
          role,
          perms,
          me: u ? { id: u.id, username: u.username, role: u.role } : null,
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

        let text = String(body || "");
        text = text.replace(/\r/g, "").trim();
        if (!text) return cb?.({ ok: false, error: "empty" });
        if (text.length > 200) text = text.slice(0, 200);

        // anti-spam: 1 msg / 200ms
        const t = Date.now();
        if (data.lastSendAt && t - data.lastSendAt < 200) {
          return cb?.({ ok: false, error: "rate_limited" });
        }
        data.lastSendAt = t;

        const msg = chatStore.addMessage(s, {
          userId: u.id,
          username: u.username,
          body: text,
        });

        io.to(`chat:${s}`).emit("chat:message", msg);
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

        const isAdmin = u.role === "admin";
        const owner = await isStreamerOwner(u.id, s);
        if (!isAdmin && !owner) return cb?.({ ok: false, error: "forbidden" });

        chatStore.clear(s);
        io.to(`chat:${s}`).emit("chat:cleared");
        cb?.({ ok: true });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || "clear_failed") });
      }
    });
  });
}
