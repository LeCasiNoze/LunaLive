// api/src/routes/subscriptions.ts
import express from "express";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { spendSupport } from "../economy/engine.js";
import { SUB_PRICE_RUBIS } from "../economy/config.js";

export const subscriptionsRouter = express.Router();

type StreamerRow = { streamerId: number; streamerOwnerUserId: number };

function errMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as any).message;
    if (typeof m === "string") return m;
  }
  return String(e || "error");
}

async function getStreamerBySlug(slug: string): Promise<StreamerRow | null> {
  const s = await pool.query(
    `SELECT id, user_id
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );
  const row = s.rows?.[0];
  if (!row) return null;
  return { streamerId: Number(row.id), streamerOwnerUserId: Number(row.user_id) };
}

/**
 * MVP "sub actif" :
 * - soit tx rubis_tx purpose='sub' (self ou gift via beneficiaryUserId)
 * - soit claim dans sub_gift_claims
 *
 * IMPORTANT: on ignore les achats "gift pool" (meta.giftPool = true),
 * sinon le gifter deviendrait sub juste en offrant un pack.
 */
async function hasSub(streamerId: number, userId: number): Promise<boolean> {
  const tx = await pool.query(
    `
    SELECT 1
    FROM rubis_tx
    WHERE status='succeeded'
      AND kind='support'
      AND purpose='sub'
      AND COALESCE((meta->>'giftPool')::boolean, false) = false
      AND (meta->>'streamerId')::int = $1
      AND COALESCE(NULLIF(meta->>'beneficiaryUserId','')::int, from_user_id) = $2
    LIMIT 1
    `,
    [streamerId, userId]
  );
  if (tx.rows?.[0]) return true;

  const claim = await pool.query(
    `SELECT 1 FROM sub_gift_claims WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
    [streamerId, userId]
  );
  return !!claim.rows?.[0];
}

/** Public: check sub status pour un user (utile pour menu chat) */
subscriptionsRouter.get("/streamers/:slug/sub-status/:userId", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, error: "bad_user" });
  }

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  try {
    const isSub = await hasSub(streamer.streamerId, userId);
    return res.json({ ok: true, isSub });
  } catch (e: unknown) {
    return res.status(400).json({ ok: false, error: errMessage(e) });
  }
});

subscriptionsRouter.post("/streamers/:slug/subscribe", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const viewerUserId = Number((req as any).user!.id);

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { streamerId, streamerOwnerUserId } = streamer;

  if (streamerOwnerUserId && streamerOwnerUserId === viewerUserId) {
    return res.status(400).json({ ok: false, error: "cannot_sub_to_self" });
  }

  // ✅ évite de repayer si déjà sub (MVP)
  if (await hasSub(streamerId, viewerUserId)) {
    return res.status(400).json({ ok: false, error: "already_sub" });
  }

  try {
    await spendSupport({
      userId: viewerUserId,
      streamerId,
      streamerOwnerUserId,
      amount: SUB_PRICE_RUBIS,
      purpose: "sub",
      meta: { slug },
    });

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [viewerUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    return res.json({ ok: true, newBalance });
  } catch (e: unknown) {
    return res.status(400).json({ ok: false, error: errMessage(e) });
  }
});

/**
 * Gift sub ciblé (menu chat)
 * Body: { recipientUserId: number }
 */
subscriptionsRouter.post("/streamers/:slug/gift-sub", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const gifterUserId = Number((req as any).user!.id);

  const recipientUserId = Number((req.body as any)?.recipientUserId);
  if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) {
    return res.status(400).json({ ok: false, error: "bad_recipient" });
  }
  if (recipientUserId === gifterUserId) {
    return res.status(400).json({ ok: false, error: "cannot_gift_to_self" });
  }

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { streamerId, streamerOwnerUserId } = streamer;

  if (streamerOwnerUserId && streamerOwnerUserId === recipientUserId) {
    return res.status(400).json({ ok: false, error: "cannot_gift_to_streamer" });
  }

  // recipient existe ?
  const r = await pool.query(`SELECT id, username FROM users WHERE id=$1 LIMIT 1`, [recipientUserId]);
  const recipient = r.rows?.[0];
  if (!recipient) return res.status(404).json({ ok: false, error: "recipient_not_found" });

  // ✅ pas de gift si déjà sub
  if (await hasSub(streamerId, recipientUserId)) {
    return res.status(400).json({ ok: false, error: "recipient_already_sub" });
  }

  try {
    await spendSupport({
      userId: gifterUserId,
      beneficiaryUserId: recipientUserId,
      streamerId,
      streamerOwnerUserId,
      amount: SUB_PRICE_RUBIS,
      purpose: "sub",
      meta: {
        slug,
        gift: true,
        recipientUserId,
        recipientUsername: String(recipient.username || ""),
      },
    });

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [gifterUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    return res.json({
      ok: true,
      newBalance,
      giftedTo: { id: recipientUserId, username: String(recipient.username || "") },
    });
  } catch (e: unknown) {
    return res.status(400).json({ ok: false, error: errMessage(e) });
  }
});

/**
 * Gift subs "pack" (pool) -> paiement immédiat, puis viewers claim
 * Body: { count: number }
 */
subscriptionsRouter.post("/streamers/:slug/gift-subs", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const gifterUserId = Number((req as any).user!.id);

  const count = Number((req.body as any)?.count);
  if (!Number.isFinite(count) || count <= 0 || count > 100) {
    return res.status(400).json({ ok: false, error: "bad_count" });
  }

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { streamerId, streamerOwnerUserId } = streamer;

  const totalPrice = count * SUB_PRICE_RUBIS;

  try {
    // ✅ paiement support au streamer (mais NE DONNE PAS sub au gifter)
    await spendSupport({
      userId: gifterUserId,
      streamerId,
      streamerOwnerUserId,
      amount: totalPrice,
      purpose: "sub",
      meta: { slug, giftPool: true, count },
    });

    // crée pool (expires: MVP 30 jours — tu peux mettre NULL si tu veux "infini")
    const p = await pool.query(
      `INSERT INTO sub_gift_pools (streamer_id, gifter_user_id, total, remaining, expires_at, meta)
       VALUES ($1,$2,$3,$3, now() + interval '30 days', $4::jsonb)
       RETURNING id, remaining`,
      [streamerId, gifterUserId, count, JSON.stringify({ slug })]
    );

    const poolId = String(p.rows?.[0]?.id);
    const remaining = Number(p.rows?.[0]?.remaining ?? count);

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [gifterUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    return res.json({ ok: true, poolId, remaining, newBalance });
  } catch (e: unknown) {
    return res.status(400).json({ ok: false, error: errMessage(e) });
  }
});

/** Status: combien de subs restent + est-ce que moi je peux claim */
subscriptionsRouter.get("/streamers/:slug/gift-subs/status", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { streamerId } = streamer;

  try {
    const sum = await pool.query(
      `SELECT COALESCE(SUM(remaining),0)::int AS remaining
       FROM sub_gift_pools
       WHERE streamer_id=$1
         AND remaining > 0
         AND (expires_at IS NULL OR expires_at > now())`,
      [streamerId]
    );
    const remaining = Number(sum.rows?.[0]?.remaining ?? 0);

    const meUserId = (req as any).user?.id != null ? Number((req as any).user.id) : null;

    if (!meUserId) {
      return res.json({ ok: true, remaining, canClaim: false, myClaimed: false });
    }

    const myClaimedQ = await pool.query(
      `SELECT 1 FROM sub_gift_claims WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
      [streamerId, meUserId]
    );
    const myClaimed = !!myClaimedQ.rows?.[0];

    const isSub = myClaimed ? true : await hasSub(streamerId, meUserId);
    const canClaim = remaining > 0 && !isSub;

    return res.json({ ok: true, remaining, canClaim, myClaimed });
  } catch (e: unknown) {
    return res.status(400).json({ ok: false, error: errMessage(e) });
  }
});

/** Claim 1 sub depuis le pool */
subscriptionsRouter.post("/streamers/:slug/gift-subs/claim", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const userId = Number((req as any).user!.id);

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { streamerId } = streamer;

  // déjà sub ? (tx ou claim)
  if (await hasSub(streamerId, userId)) {
    return res.status(400).json({ ok: false, error: "already_sub" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // récupère un pool dispo
    const p = await client.query(
      `SELECT id
       FROM sub_gift_pools
       WHERE streamer_id=$1
         AND remaining > 0
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [streamerId]
    );
    const poolId = p.rows?.[0]?.id;
    if (!poolId) throw new Error("no_gifts_available");

    // insert claim (1 seule fois par user/streamer)
    const ins = await client.query(
      `INSERT INTO sub_gift_claims (streamer_id, pool_id, user_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (streamer_id, user_id) DO NOTHING
       RETURNING id`,
      [streamerId, poolId, userId]
    );
    if (!ins.rows?.[0]) throw new Error("already_claimed");

    // décrémente remaining
    const up = await client.query(
      `UPDATE sub_gift_pools
       SET remaining = remaining - 1
       WHERE id=$1 AND remaining > 0
       RETURNING remaining`,
      [poolId]
    );
    if (!up.rows?.[0]) throw new Error("pool_empty");

    await client.query("COMMIT");

    return res.json({ ok: true, poolId: String(poolId), remaining: Number(up.rows[0].remaining) });
  } catch (e: unknown) {
    try { await client.query("ROLLBACK"); } catch {}
    return res.status(400).json({ ok: false, error: errMessage(e) });
  } finally {
    client.release();
  }
});
