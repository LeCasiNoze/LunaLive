// api/src/agenda_notif_poller.ts
import webpush from "web-push";
import { pool } from "./db.js";
let vapidReady = false;
function ensureVapid() {
    if (vapidReady)
        return;
    vapidReady = true;
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv)
        throw new Error("VAPID_KEYS_MISSING");
    const subject = process.env.VAPID_SUBJECT ||
        (process.env.MAIL_FROM ? `mailto:${process.env.MAIL_FROM}` : "mailto:admin@localhost");
    webpush.setVapidDetails(subject, pub, priv);
}
export function startAgendaNotifPoller(intervalMs = 30_000) {
    const ms = Math.max(10_000, Number(intervalMs) || 30_000);
    const tick = async () => {
        ensureVapid();
        // Fenêtre: notif à envoyer pour les occurrences qui démarrent dans [now+10m, now+11m)
        const q = `
      WITH due AS (
        SELECT
          s.user_id,
          s.streamer_id,
          s.rule_id,
          r.title,
          r.kind,
          r.day_of_week,
          r.date_ymd,
          r.start_time,
          st.slug,
          st.display_name AS "displayName",
          CASE
            WHEN r.kind='event'
              THEN ((r.date_ymd::date + r.start_time::time) AT TIME ZONE 'Europe/Paris')
            ELSE (((now() AT TIME ZONE 'Europe/Paris')::date + r.start_time::time) AT TIME ZONE 'Europe/Paris')
          END AS occ_start
        FROM agenda_subscriptions s
        JOIN streamer_agenda_rules r ON r.id = s.rule_id
        JOIN streamers st ON st.id = s.streamer_id
        WHERE
          (
            (r.kind='event')
            OR
            (r.kind='regular' AND r.day_of_week = EXTRACT(DOW FROM (now() AT TIME ZONE 'Europe/Paris'))::int)
          )
      ),
      windowed AS (
        SELECT *
        FROM due
        WHERE occ_start >= (now() + interval '10 minutes')
          AND occ_start <  (now() + interval '11 minutes')
      ),
      ins AS (
        INSERT INTO agenda_notif_log(streamer_id, rule_id, user_id, occ_start)
        SELECT streamer_id, rule_id, user_id, occ_start
        FROM windowed
        ON CONFLICT (user_id, rule_id, occ_start) DO NOTHING
        RETURNING user_id, streamer_id, rule_id, occ_start
      )
      SELECT w.*
      FROM windowed w
      JOIN ins i
        ON i.user_id=w.user_id AND i.rule_id=w.rule_id AND i.occ_start=w.occ_start
    `;
        const { rows } = await pool.query(q);
        if (!rows.length)
            return;
        const baseWeb = String(process.env.PUBLIC_WEB_BASE || "").replace(/\/$/, "");
        for (const r of rows) {
            const uid = Number(r.user_id);
            const title = String(r.title || "Événement");
            const displayName = String(r.displayName || r.slug || "Streamer");
            const url = baseWeb ? `${baseWeb}/s/${encodeURIComponent(String(r.slug || ""))}` : `/s/${encodeURIComponent(String(r.slug || ""))}`;
            const payload = {
                type: "agenda",
                slug: String(r.slug || ""),
                displayName,
                agendaTitle: title,
                url,
                occStart: new Date(r.occ_start).toISOString(),
            };
            const subs = await pool.query(`SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE user_id=$1
         ORDER BY updated_at DESC`, [uid]);
            for (const s of subs.rows) {
                const subscription = {
                    endpoint: String(s.endpoint),
                    keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
                };
                try {
                    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 900 });
                }
                catch (e) {
                    const status = e?.statusCode ?? e?.status;
                    if (status === 404 || status === 410) {
                        await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]);
                    }
                }
            }
        }
    };
    tick().catch(() => { });
    const t = setInterval(() => tick().catch(() => { }), ms);
    return () => clearInterval(t);
}
