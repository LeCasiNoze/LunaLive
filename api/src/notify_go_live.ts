import type { Server as IOServer } from "socket.io";
import { pool } from "./db.js";
import webpush from "web-push";
import { FABIO_STREAMER_ID, FABIO_NOTIF_CHANNEL_ID, FABIO_ROLE_NOTIF_STREAM } from "./discord/constants.js";

// Cooldown Discord persistant en DB (colonne streamers.discord_notif_last_sent_at).
// Survit aux redeploys et bloque les fausses transitions offline→online des pollers.
// Configurable via env DISCORD_NOTIF_COOLDOWN_MIN, default 120 min (2h).
function getDiscordNotifCooldownMin(): number {
  const raw = Number(process.env.DISCORD_NOTIF_COOLDOWN_MIN);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.max(1, Math.floor(raw));
}

/**
 * Tente de "claim" le slot de notification pour un streamer de façon atomique.
 * Renvoie true si la notif peut être envoyée (et marque le timestamp), false sinon.
 */
async function claimDiscordNotifSlot(streamerId: number): Promise<boolean> {
  const cooldownMin = getDiscordNotifCooldownMin();
  const r = await pool.query(
    `UPDATE streamers
     SET discord_notif_last_sent_at = NOW()
     WHERE id = $1
       AND (
         discord_notif_last_sent_at IS NULL
         OR discord_notif_last_sent_at < NOW() - ($2::int * INTERVAL '1 minute')
       )
     RETURNING 1`,
    [streamerId, cooldownMin]
  );
  return (r.rowCount ?? 0) > 0;
}

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
    const url = baseWeb
    ? `${baseWeb}/s/${encodeURIComponent(slug)}`
    : `/s/${encodeURIComponent(slug)}`;

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

  // ─── Discord notif Fabiozsis (indépendant des followers LunaLive) ───────────
  if (streamerId === FABIO_STREAMER_ID) {
    // Cooldown persistant en DB (UPDATE atomique). Si le slot n'est pas claim,
    // une autre source (autre poller / instance / redeploy récent) a déjà notifié.
    const claimed = await claimDiscordNotifSlot(streamerId);
    if (!claimed) {
      console.log(
        `[notify_go_live] Fabiozsis Discord notif skipped (cooldown ${getDiscordNotifCooldownMin()}min)`
      );
    } else {
      const discordClient = (global as any).discordClient;
      if (discordClient) {
        try {
          const rumbleRow = await pool.query(
            `SELECT thumbnail_url FROM streamer_rumble_info WHERE streamer_id = $1 LIMIT 1`,
            [streamerId]
          );
          const thumbnailUrl: string | null = rumbleRow.rows[0]?.thumbnail_url ?? null;
          const ch = await discordClient.channels.fetch(FABIO_NOTIF_CHANNEL_ID).catch(() => null);
          if (ch?.isTextBased?.()) {
            const webBase = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
            await (ch as any).send({
              content: `@everyone <@&${FABIO_ROLE_NOTIF_STREAM}>`,
              embeds: [{
                title: `🔴 ${displayName} est en live !`,
                description:
                  (title ? `**${title}**\n\n` : "") +
                  `Viens nous rejoindre en stream, c'est parti ! 🎰\n\n` +
                  `🌐 [Regarder sur LunaLive](${webBase}/s/${encodeURIComponent(slug)})\n` +
                  `📺 [Regarder sur Rumble](https://rumble.com/user/FabiozsisTV/live)`,
                color: 0xFF0000,
                ...(thumbnailUrl ? { image: { url: thumbnailUrl } } : {}),
                footer: { text: "Fabiozsis • Live Casino" },
                timestamp: new Date().toISOString(),
              }],
              allowedMentions: { parse: ["everyone", "roles"] },
            });
          }
        } catch (e: any) {
          console.warn("[notify_go_live] Fabiozsis Discord notif failed:", e?.message);
        }
      }
    }
  }

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
