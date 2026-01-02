// api/src/routes/subscriptions.ts
import express from "express";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { spendSupport } from "../economy/engine.js";
import { SUB_PRICE_RUBIS } from "../economy/config.js";
import { chatStore } from "../chat_store.js";

export const subscriptionsRouter = express.Router();
import { emitSystemChat, formatSubSystemMessage } from "../chat_events.js";
// ✅ Durée d’un sub (MVP)
// Ajuste si tu veux 7j / 30j / 31j / etc.
const SUB_DURATION_DAYS = 30;

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
  // ✅ si déjà sub mais expiré => on "redémarre" (started_at=NOW)
  // ✅ si pas encore expiré => on prolonge depuis expires_at
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

/**
 * SUB classique (moi -> streamer)
 * POST /streamers/:slug/subscribe
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

  try {
    await spendSupport({
      userId: viewerUserId,
      streamerId: streamer.id,
      streamerOwnerUserId: streamer.ownerUserId ?? 0,
      amount: SUB_PRICE_RUBIS,
      purpose: "sub",
      meta: { slug: streamer.slug, kind: "self_sub" },
    });

    const expiresAt = await upsertSub(streamer.id, viewerUserId);

    // solde viewer
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [viewerUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    // ✅ message système (comme follow)
    const tpl =
      (streamer.appearance?.chat?.subMessageTemplate &&
        String(streamer.appearance.chat.subMessageTemplate)) ||
      "⭐ {user} s’est abonné à {streamer} !";

    const body = applyTemplate(tpl, {
      user: viewerUsername || "Quelqu’un",
      streamer: streamer.displayName || streamer.slug,
    });

    const io = req.app.locals.io;
    emitSystemChat(
      io,
      streamer.slug,
      formatSubSystemMessage({
        user: viewerUsername || "Quelqu’un",
        streamer: streamer.displayName || streamer.slug,
        months: 1,
        origin: "self",
      })
    );

    return res.json({ ok: true, newBalance, expiresAt });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || "error") });
  }
});

/**
 * ✅ GIFT SUB à une personne précise
 * POST /streamers/:slug/gift-sub
 * Body: { recipientUserId: number }
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

  // optionnel : empêche d’offrir au streamer owner
  if (streamer.ownerUserId != null && streamer.ownerUserId === recipientUserId) {
    return res.status(400).json({ ok: false, error: "cannot_gift_to_streamer" });
  }

  // recipient existe ?
  const r = await pool.query(`SELECT id, username FROM users WHERE id=$1 LIMIT 1`, [recipientUserId]);
  const rec = r.rows?.[0];
  if (!rec) return res.status(404).json({ ok: false, error: "recipient_not_found" });
  const recipientUsername = String(rec.username || "");

  // ✅ empêche de payer si recipient déjà sub actif
  const cur = await getSubRow(streamer.id, recipientUserId);
  if (cur && isActiveSub(cur.expires_at)) {
    return res.status(400).json({ ok: false, error: "recipient_already_sub" });
  }

  try {
    await spendSupport({
      userId: gifterUserId, // payeur
      streamerId: streamer.id,
      streamerOwnerUserId: streamer.ownerUserId ?? 0,
      amount: SUB_PRICE_RUBIS,
      purpose: "sub", // gift sub = sub (comme tu voulais)
      meta: {
        slug: streamer.slug,
        kind: "gift_sub",
        recipientUserId,
        recipientUsername,
      },
    });

    const expiresAt = await upsertSub(streamer.id, recipientUserId);

    // solde gifter
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [gifterUserId]);
    const newBalance = Number(u.rows?.[0]?.rubis ?? 0);

    // ✅ message système (comme follow)
    const tpl =
      (streamer.appearance?.chat?.giftSubMessageTemplate &&
        String(streamer.appearance.chat.giftSubMessageTemplate)) ||
      "🎁 {gifter} a offert un sub à {user} sur {streamer} !";

    const body = applyTemplate(tpl, {
      gifter: gifterUsername || "Quelqu’un",
      user: recipientUsername || "Quelqu’un",
      streamer: streamer.displayName || streamer.slug,
    });

    const io = req.app.locals.io;
    emitSystemChat(
      io,
      streamer.slug,
      formatSubSystemMessage({
        user: recipientUsername || "Quelqu’un",
        streamer: streamer.displayName || streamer.slug,
        months: 1,
        origin: "gift",
        giftedBy: gifterUsername || "Quelqu’un",
      })
    );

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
