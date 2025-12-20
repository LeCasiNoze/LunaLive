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
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh=EXCLUDED.p256dh,
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
