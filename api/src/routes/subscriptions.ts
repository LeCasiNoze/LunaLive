// api/src/routes/subscriptions.ts
import express from "express";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { spendRubis } from "../wallet_engine.js";
import { SUB_PRICE_RUBIS } from "../economy.js";
import { chatStore } from "../chat_store.js";

export const subscriptionsRouter = express.Router();
import { emitSpecialCard } from "../socket_emit.js";
import { emitSystemChat } from "../chat_events.js";

// ✅ Durée d’un sub (MVP)
const SUB_DURATION_DAYS = 30;

// coupons
const SUB_TICKET_CODE = "sub_ticket";

// ===== Gift pools (pack + claim) =====
const GIFT_POOL_EXPIRES_DAYS = 30;
const GIFT_POOL_MAX = 100;

type StreamerInfo = {
  id: number;
  slug: string;
  displayName: string;
  ownerUserId: number | null;
  appearance: any;
};

function isActiveSub(expiresAt: any) {
  if (!expiresAt) return false;
  const t = new Date(String(expiresAt)).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  let out = String(tpl || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

function emitSystemToChat(io: any, streamerSlug: string, body: string) {
  if (!io) return;
  const msg = chatStore.addSystem(String(streamerSlug), body);
  io.to(`chat:${String(streamerSlug)}`).emit("chat:message", msg);
}

function normSlug(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

function poolActiveWhere() {
  return `(remaining > 0) AND (expires_at IS NULL OR expires_at > NOW())`;
}

/**
 * ✅ Auto-equip le badge sub de la chaîne (badge_sub_<slug>)
 * uniquement si l'utilisateur n'a PAS déjà un badge équipé
 */
async function autoEquipSubBadgeIfEmpty(userId: number, streamerSlug: string) {
  const slugLower = normSlug(streamerSlug);
  if (!slugLower) return;

  const badgeCode = `badge_sub_${slugLower}`;

  await pool.query(
    `INSERT INTO user_equipped_cosmetics (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  await pool.query(
    `UPDATE user_equipped_cosmetics
     SET badge_code = $2
     WHERE user_id = $1
       AND (badge_code IS NULL OR badge_code = 'none' OR badge_code = '')`,
    [userId, badgeCode]
  );
}

async function getStreamerBySlug(slug: string): Promise<StreamerInfo | null> {
  const s = await pool.query(
    `SELECT id, slug, display_name AS "displayName", user_id AS "ownerUserId", appearance
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );
  const row = s.rows?.[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: String(row.slug || "").trim(),
    displayName: String(row.displayName || row.slug || "").trim(),
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
    appearance: row.appearance || {},
  };
}

async function getSubRow(streamerId: number, userId: number) {
  const r = await pool.query(
    `SELECT expires_at
     FROM streamer_subscriptions
     WHERE streamer_id=$1 AND user_id=$2
     LIMIT 1`,
    [streamerId, userId]
  );
  return r.rows?.[0] || null;
}

async function upsertSub(streamerId: number, userId: number) {
  const r = await pool.query(
    `INSERT INTO streamer_subscriptions (streamer_id, user_id, started_at, expires_at, created_at, updated_at)
     VALUES ($1,$2,NOW(), NOW() + ($3 * INTERVAL '1 day'), NOW(), NOW())
     ON CONFLICT (streamer_id, user_id) DO UPDATE
       SET started_at = CASE
                         WHEN streamer_subscriptions.expires_at < NOW() THEN NOW()
                         ELSE streamer_subscriptions.started_at
                       END,
           expires_at = GREATEST(streamer_subscriptions.expires_at, NOW()) + ($3 * INTERVAL '1 day'),
           updated_at = NOW()
     RETURNING expires_at`,
    [streamerId, userId, SUB_DURATION_DAYS]
  );

  return r.rows?.[0]?.expires_at ?? null;
}

// version TX de upsertSub (pour claim atomique)
async function upsertSubTx(client: any, streamerId: number, userId: number) {
  const r = await client.query(
    `INSERT INTO streamer_subscriptions (streamer_id, user_id, started_at, expires_at, created_at, updated_at)
     VALUES ($1,$2,NOW(), NOW() + ($3 * INTERVAL '1 day'), NOW(), NOW())
     ON CONFLICT (streamer_id, user_id) DO UPDATE
       SET started_at = CASE
                         WHEN streamer_subscriptions.expires_at < NOW() THEN NOW()
                         ELSE streamer_subscriptions.started_at
                       END,
           expires_at = GREATEST(streamer_subscriptions.expires_at, NOW()) + ($3 * INTERVAL '1 day'),
           updated_at = NOW()
     RETURNING expires_at`,
    [streamerId, userId, SUB_DURATION_DAYS]
  );
  return r.rows?.[0]?.expires_at ?? null;
}

// version TX du badge auto-equip (optionnel, mais mieux)
async function autoEquipSubBadgeIfEmptyTx(client: any, userId: number, streamerSlug: string) {
  const slugLower = normSlug(streamerSlug);
  if (!slugLower) return;
  const badgeCode = `badge_sub_${slugLower}`;

  await client.query(
    `INSERT INTO user_equipped_cosmetics (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  await client.query(
    `UPDATE user_equipped_cosmetics
     SET badge_code = $2
     WHERE user_id = $1
       AND (badge_code IS NULL OR badge_code = 'none' OR badge_code = '')`,
    [userId, badgeCode]
  );
}

// ✅ consume coupon atomique
async function consumeCouponTx(client: any, userId: number, code: string, qtyToConsume: number) {
  const qty = Math.max(0, Math.floor(Number(qtyToConsume || 0)));
  if (qty <= 0) return { ok: true, consumed: 0 };

  const cur = await client.query(
    `SELECT qty
     FROM user_coupons
     WHERE user_id=$1 AND code=$2
     FOR UPDATE`,
    [userId, code]
  );

  const have = Number(cur.rows?.[0]?.qty ?? 0);
  if (have < qty) {
    return { ok: false, error: "not_enough_tickets", have };
  }

  const upd = await client.query(
    `UPDATE user_coupons
     SET qty = qty - $3,
         updated_at = NOW()
     WHERE user_id=$1 AND code=$2
     RETURNING qty`,
    [userId, code, qty]
  );

  return { ok: true, consumed: qty, remaining: Number(upd.rows?.[0]?.qty ?? have - qty) };
}

/**
 * SUB classique (moi -> streamer)
 * POST /streamers/:slug/subscribe
 * Body: { useTicket?: boolean }
 */
subscriptionsRouter.post("/streamers/:slug/subscribe", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const viewerUserId = Number(req.user!.id);
  const viewerUsername = String((req.user as any)?.username || "");

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  if (streamer.ownerUserId != null && streamer.ownerUserId === viewerUserId) {
    return res.status(400).json({ ok: false, error: "cannot_sub_to_self" });
  }

  // ✅ empêche de payer si déjà sub actif
  const cur = await getSubRow(streamer.id, viewerUserId);
  if (cur && isActiveSub(cur.expires_at)) {
    return res.status(400).json({ ok: false, error: "already_sub" });
  }

  const useTicket = !!(req.body as any)?.useTicket;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let usedTicket = false;

    if (useTicket) {
      const r = await consumeCouponTx(client, viewerUserId, SUB_TICKET_CODE, 1);
      if (!r.ok) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: r.error || "ticket_error" });
      }
      usedTicket = true;
    }

    await client.query("COMMIT");

    // ✅ dépense sur le ledger vivant (wallet_engine) : sub = support à la chaîne.
    // Crédite streamer_wallets (part cashable = 90% de la valeur pondérée dépensée).
    if (!usedTicket) {
      await spendRubis({
        userId: viewerUserId,
        amount: SUB_PRICE_RUBIS,
        spendKind: "support",
        spendType: "sub",
        streamerId: streamer.id,
        meta: { slug: streamer.slug, kind: "self_sub", paid: "rubis" },
      });
    }

    const expiresAt = await upsertSub(streamer.id, viewerUserId);
    await autoEquipSubBadgeIfEmpty(viewerUserId, streamer.slug);

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [viewerUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    const tpl =
      (streamer.appearance?.chat?.subMessageTemplate && String(streamer.appearance.chat.subMessageTemplate)) ||
      "⭐ {user} s’est abonné à {streamer} !";

    const _body = applyTemplate(tpl, {
      user: viewerUsername || "Quelqu’un",
      streamer: streamer.displayName || streamer.slug,
    });

    const io = req.app.locals.io;
    // Abonnement LunaLive → carte "sub" contextuelle dans le chat.
    emitSpecialCard(io, streamer.slug, "sub", {
      who: viewerUsername || "Quelqu’un",
      months: 1,
    });

    return res.json({ ok: true, newBalance, expiresAt, usedTicket });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  } finally {
    client.release();
  }
});

/**
 * ✅ GIFT SUB à une personne précise
 * POST /streamers/:slug/gift-sub
 * Body: { recipientUserId: number }
 * (inchangé: pas de tickets ici pour l’instant)
 */
subscriptionsRouter.post("/streamers/:slug/gift-sub", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const gifterUserId = Number(req.user!.id);
  const gifterUsername = String((req.user as any)?.username || "");

  const recipientUserId = Number((req.body as any)?.recipientUserId);
  if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) {
    return res.status(400).json({ ok: false, error: "bad_recipient" });
  }
  if (recipientUserId === gifterUserId) {
    return res.status(400).json({ ok: false, error: "cannot_gift_to_self" });
  }

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  if (streamer.ownerUserId != null && streamer.ownerUserId === recipientUserId) {
    return res.status(400).json({ ok: false, error: "cannot_gift_to_streamer" });
  }

  const r = await pool.query(`SELECT id, username FROM users WHERE id=$1 LIMIT 1`, [recipientUserId]);
  const rec = r.rows?.[0];
  if (!rec) return res.status(404).json({ ok: false, error: "recipient_not_found" });
  const recipientUsername = String(rec.username || "");

  const cur = await getSubRow(streamer.id, recipientUserId);
  if (cur && isActiveSub(cur.expires_at)) {
    return res.status(400).json({ ok: false, error: "recipient_already_sub" });
  }

  try {
    await spendRubis({
      userId: gifterUserId,
      amount: SUB_PRICE_RUBIS,
      spendKind: "support",
      spendType: "sub",
      streamerId: streamer.id,
      meta: {
        slug: streamer.slug,
        kind: "gift_sub",
        recipientUserId,
        recipientUsername,
        paid: "rubis",
      },
    });

    const expiresAt = await upsertSub(streamer.id, recipientUserId);
    await autoEquipSubBadgeIfEmpty(recipientUserId, streamer.slug);

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [gifterUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    const tpl =
      (streamer.appearance?.chat?.giftSubMessageTemplate && String(streamer.appearance.chat.giftSubMessageTemplate)) ||
      "🎁 {gifter} a offert un sub à {user} sur {streamer} !";

    const _body = applyTemplate(tpl, {
      gifter: gifterUsername || "Quelqu’un",
      user: recipientUsername || "Quelqu’un",
      streamer: streamer.displayName || streamer.slug,
    });

    const io = req.app.locals.io;
    // Sub offert → carte "sub" contextuelle (le bénéficiaire, offert par).
    emitSpecialCard(io, streamer.slug, "sub", {
      who: recipientUsername || "Quelqu’un",
      months: 1,
      giftedBy: gifterUsername || "Quelqu’un",
    });

    return res.json({
      ok: true,
      newBalance,
      expiresAt,
      giftedTo: { id: recipientUserId, username: recipientUsername },
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  }
});

/**
 * ✅ CREATE GiftPool (payer un pack de N subs)
 * POST /streamers/:slug/gift-subs
 * Body: { count: number, useTickets?: number }
 */
subscriptionsRouter.post("/streamers/:slug/gift-subs", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const gifterUserId = Number(req.user!.id);
  const gifterUsername = String((req.user as any)?.username || "");

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const countRaw = Number((req.body as any)?.count);
  const count = Math.max(1, Math.min(GIFT_POOL_MAX, Math.floor(countRaw)));
  if (!Number.isFinite(countRaw) || count <= 0) {
    return res.status(400).json({ ok: false, error: "bad_count" });
  }

  const useTicketsRaw = Number((req.body as any)?.useTickets ?? 0);
  const useTicketsWanted = Math.max(0, Math.min(count, Math.floor(useTicketsRaw)));

  // rubis à payer = (count - useTickets) * price
  const amountRubis = Math.max(0, (count - useTicketsWanted) * SUB_PRICE_RUBIS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let usedTickets = 0;

    if (useTicketsWanted > 0) {
      const r = await consumeCouponTx(client, gifterUserId, SUB_TICKET_CODE, useTicketsWanted);
      if (!r.ok) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: r.error || "ticket_error" });
      }
      usedTickets = useTicketsWanted;
    }

    // crée le pool
    const ins = await client.query(
      `INSERT INTO sub_gift_pools (streamer_id, gifter_user_id, total, remaining, expires_at, meta)
       VALUES ($1,$2,$3,$3, NOW() + ($4 * INTERVAL '1 day'), $5::jsonb)
       RETURNING id, remaining, expires_at`,
      [
        streamer.id,
        gifterUserId,
        count,
        GIFT_POOL_EXPIRES_DAYS,
        JSON.stringify({ slug: streamer.slug, paidRubis: amountRubis, usedTickets }),
      ]
    );

    await client.query("COMMIT");

    // ✅ ledger SUPPORT (vivant) seulement sur la partie rubis
    if (amountRubis > 0) {
      await spendRubis({
        userId: gifterUserId,
        amount: amountRubis,
        spendKind: "support",
        spendType: "sub",
        streamerId: streamer.id,
        meta: { slug: streamer.slug, kind: "gift_pool_create", count, usedTickets, paid: "mix" },
      });
    }

    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [gifterUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    const io = req.app.locals.io;
    emitSystemChat(
      io,
      streamer.slug,
      `🎁 ${gifterUsername || "Quelqu’un"} a offert ${count} sub${count > 1 ? "s" : ""} à la commu !`
    );

    return res.json({
      ok: true,
      newBalance,
      usedTickets,
      paidRubis: amountRubis,
      pool: {
        id: String(ins.rows[0].id),
        remaining: Number(ins.rows[0].remaining),
        expiresAt: ins.rows[0].expires_at,
      },
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  } finally {
    client.release();
  }
});

/**
 * ✅ STATUS (reste combien ? et est-ce que moi je peux claim ?)
 * GET /streamers/:slug/gift-subs/status
 */
subscriptionsRouter.get("/streamers/:slug/gift-subs/status", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const userId = Number(req.user!.id);

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const sub = await getSubRow(streamer.id, userId);
  const isSub = !!(sub && isActiveSub(sub.expires_at));

  const q = await pool.query(
    `SELECT COALESCE(SUM(remaining),0)::int AS remaining,
            MIN(expires_at) AS next_expires_at
     FROM sub_gift_pools
     WHERE streamer_id=$1 AND ${poolActiveWhere()}`,
    [streamer.id]
  );

  const remaining = Number(q.rows?.[0]?.remaining ?? 0);
  const nextExpiresAt = q.rows?.[0]?.next_expires_at ?? null;

  return res.json({
    ok: true,
    remaining,
    nextExpiresAt,
    isSub,
    canClaim: remaining > 0 && !isSub,
  });
});

/**
 * ✅ CLAIM (atomique)
 * POST /streamers/:slug/gift-subs/claim
 */
subscriptionsRouter.post("/streamers/:slug/gift-subs/claim", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const userId = Number(req.user!.id);
  const username = String((req.user as any)?.username || "");

  const streamer = await getStreamerBySlug(slug);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const cur = await getSubRow(streamer.id, userId);
  if (cur && isActiveSub(cur.expires_at)) {
    return res.status(400).json({ ok: false, error: "already_sub" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pick = await client.query(
      `SELECT id
       FROM sub_gift_pools
       WHERE streamer_id=$1 AND ${poolActiveWhere()}
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [streamer.id]
    );

    const poolId = pick.rows?.[0]?.id;
    if (!poolId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "no_pool" });
    }

    const claim = await client.query(
      `INSERT INTO sub_gift_claims (streamer_id, pool_id, user_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (streamer_id, user_id) DO NOTHING
       RETURNING id`,
      [streamer.id, poolId, userId]
    );

    if (!claim.rows?.[0]?.id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "already_claimed" });
    }

    const upd = await client.query(
      `UPDATE sub_gift_pools
       SET remaining = remaining - 1
       WHERE id=$1 AND remaining > 0
       RETURNING remaining, expires_at`,
      [poolId]
    );

    if (!upd.rows?.[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "race_lost" });
    }

    const expiresAt = await upsertSubTx(client, streamer.id, userId);
    await autoEquipSubBadgeIfEmptyTx(client, userId, streamer.slug);

    await client.query("COMMIT");

    const io = req.app.locals.io;
    // Claim d'un sub offert = nouveau sub actif → carte "sub" contextuelle.
    emitSpecialCard(io, streamer.slug, "sub", { who: username || "Quelqu’un", months: 1 });

    return res.json({
      ok: true,
      expiresAt,
      remaining: Number(upd.rows[0].remaining),
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  } finally {
    client.release();
  }
});
