import type { Server as IOServer } from "socket.io";
import { pool } from "./db.js";
import webpush from "web-push";

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return;
  vapidReady = true;

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;

  if (!pub || !priv) {
    console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing => system push disabled");
    return;
  }

  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.MAIL_FROM ? `mailto:${process.env.MAIL_FROM}` : "mailto:admin@localhost");

  webpush.setVapidDetails(subject, pub, priv);
}

type GoLivePayload = {
  type: "go_live";
  streamerId: number;
  slug: string;
  displayName: string;
  title: string;
  url: string;
  ts: string;
};

export async function notifyFollowersGoLive(io: IOServer | undefined, streamerId: number) {
  const s = await pool.query(
    `SELECT id, slug, display_name AS "displayName", title
     FROM streamers
     WHERE id=$1
     LIMIT 1`,
    [streamerId]
  );

  const streamer = s.rows?.[0];
  if (!streamer) return;

  const slug = String(streamer.slug || "").trim();
  const displayName = String(streamer.displayName || slug);
  const title = String(streamer.title || "").trim();

  // URL vers le site (à adapter à ton routing front)
  const baseWeb = String(process.env.PUBLIC_WEB_BASE || "").replace(/\/$/, "");
  const url = baseWeb ? `${baseWeb}/watch/${encodeURIComponent(slug)}` : `/watch/${encodeURIComponent(slug)}`;

  const payload: GoLivePayload = {
    type: "go_live",
    streamerId: Number(streamer.id),
    slug,
    displayName,
    title,
    url,
    ts: new Date().toISOString(),
  };

  // followers avec cloche activée
  const f = await pool.query(
    `SELECT user_id
     FROM streamer_follows
     WHERE streamer_id=$1 AND notify_enabled=TRUE`,
    [streamerId]
  );

  const userIds = f.rows.map((r: any) => Number(r.user_id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!userIds.length) return;

  // ✅ A) toast socket (uniquement si site ouvert / socket connecté)
  if (io) {
    for (const uid of userIds) {
      io.to(`user:${uid}`).emit("notify:go_live", payload);
    }
  }

  // ✅ B) system push (même si site fermé) si VAPID + subscriptions
  ensureVapid();
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const subs = await pool.query(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = ANY($1::int[])`,
    [userIds]
  );

  const body = JSON.stringify(payload);

  for (const row of subs.rows) {
    const subscription = {
      endpoint: String(row.endpoint),
      keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
    };

    try {
      await webpush.sendNotification(subscription as any, body, { TTL: 60 });
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      // 410/404 => subscription morte => cleanup
      if (status === 404 || status === 410) {
        await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`, [row.id]);
      } else {
        console.warn("[push] send failed", status, e?.message || e);
      }
    }
  }
}
