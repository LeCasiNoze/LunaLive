// api/src/routes/support.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { SUB_PRICE_RUBIS } from "../economy.js";
import { spendRubisTx } from "../wallet_engine.js";

export const supportRouter = express.Router();

supportRouter.post("/support/sub", requireAuth, async (req, res) => {
  const userId = Number(req.user!.id);
  const slug = String(req.body?.slug || "").trim();
  const qty = Math.max(1, Math.min(12, Math.floor(Number(req.body?.qty ?? 1))));

  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const s = await pool.query(
    `SELECT id, slug
     FROM streamers
     WHERE lower(slug)=lower($1)
       AND (suspended_until IS NULL OR suspended_until < NOW())
     LIMIT 1`,
    [slug]
  );
  const streamer = s.rows?.[0];
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const streamerId = Number(streamer.id);
  const amount = SUB_PRICE_RUBIS * qty;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const spend = await spendRubisTx(client, {
      userId,
      amount,
      spendKind: "support",
      spendType: "sub",
      streamerId,
      meta: { slug, qty },
    });

    // subscription: extends by qty*30 days from max(now, expires_at)
    const sub = await client.query(
      `INSERT INTO streamer_subscriptions (streamer_id, user_id, started_at, expires_at)
       VALUES ($1,$2,NOW(), NOW() + ($3::int * INTERVAL '30 days'))
       ON CONFLICT (streamer_id, user_id)
       DO UPDATE SET
         expires_at = GREATEST(streamer_subscriptions.expires_at, NOW()) + ($3::int * INTERVAL '30 days'),
         updated_at = NOW()
       RETURNING expires_at`,
      [streamerId, userId, qty]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      qty,
      spent: spend.spent,
      supportRubis: spend.supportRubis,
      streamerEarnRubis: spend.streamerEarnRubis,
      platformCutRubis: spend.platformCutRubis,
      breakdown: spend.breakdown,
      expiresAt: sub.rows?.[0]?.expires_at ?? null,
    });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}

    const msg = String(e?.message || e);
    if (msg === "insufficient_rubis") return res.status(400).json({ ok: false, error: "insufficient_rubis" });
    if (msg === "bad_amount") return res.status(400).json({ ok: false, error: "bad_amount" });

    console.error("[support/sub] failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});
