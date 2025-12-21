import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const pushRouter = express.Router();

// clé publique VAPID pour le front
pushRouter.get("/push/vapid-public-key", (_req, res) => {
  res.json({ ok: true, publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// subscribe/upsert
pushRouter.post("/push/subscribe", requireAuth, async (req, res) => {
  const sub = req.body?.subscription ?? req.body;

  const endpoint = String(sub?.endpoint || "").trim();
  const p256dh = String(sub?.keys?.p256dh || "").trim();
  const auth = String(sub?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ ok: false, error: "bad_subscription" });
  }

  const ua = String(req.headers["user-agent"] || "").slice(0, 500);

    await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (endpoint)
    DO UPDATE SET
        user_id=EXCLUDED.user_id,
        p256dh=EXCLUDED.p256dh,
        auth=EXCLUDED.auth,
        user_agent=EXCLUDED.user_agent,
        updated_at=NOW()`,
    [Number(req.user!.id), endpoint, p256dh, auth, ua]
    );

  res.json({ ok: true });
});

// unsubscribe (par endpoint)
pushRouter.post("/push/unsubscribe", requireAuth, async (req, res) => {
  const endpoint = String(req.body?.endpoint || req.body?.subscription?.endpoint || "").trim();
  if (!endpoint) return res.status(400).json({ ok: false, error: "endpoint_required" });

  await pool.query(`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, [
    Number(req.user!.id),
    endpoint,
  ]);

  res.json({ ok: true });
});

import webpush from "web-push";

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  vapidReady = true;

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID_KEYS_MISSING");

  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.MAIL_FROM ? `mailto:${process.env.MAIL_FROM}` : "mailto:admin@localhost");

  webpush.setVapidDetails(subject, pub, priv);
}

pushRouter.post("/push/test", requireAuth, async (req, res) => {
  try {
    ensureVapid();

    const uid = Number(req.user!.id);
    const { rows } = await pool.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC`,
      [uid]
    );

    const baseWeb = String(process.env.PUBLIC_WEB_BASE || "").replace(/\/$/, "");
    const payload = {
      type: "go_live",
      streamerId: 0,
      slug: "test",
      displayName: "TEST",
      title: "Notif de test (site fermé)",
      url: baseWeb ? `${baseWeb}/s/test` : "/s/test",
      ts: new Date().toISOString(),
    };

    const errors: any[] = [];
    for (const row of rows) {
      const subscription = {
        endpoint: String(row.endpoint),
        keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
      };

      try {
        await webpush.sendNotification(subscription as any, JSON.stringify(payload), { TTL: 300 });
      } catch (e: any) {
        const status = e?.statusCode ?? e?.status;
        const msg = e?.message || String(e);

        // ✅ 404/410 => subscription morte => on la supprime direct
        if (status === 404 || status === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`, [row.id]);
          errors.push({ id: row.id, status, msg: "deleted_dead_subscription" });
        } else {
          errors.push({ id: row.id, status, msg });
        }
      }
    }

    return res.json({ ok: true, subs: rows.length, errors });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
