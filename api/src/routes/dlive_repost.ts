import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { resolveImmutableUsernameForDlive } from "../dlive_resolve.js";
import { sendDliveChatMessage } from "../dlive_send.js";

export const dliveRepostRouter = Router();

function norm(s: any) {
  return String(s || "").trim();
}

function isModLikeRole(role: any) {
  const r = String(role || "").toLowerCase();
  return ["mod", "moderator", "streamer_mod", "streamer_moderator", "admin", "streamer"].includes(r);
}

// mini rate-limit mémoire par slug (anti spam)
const LAST_SEND = new Map<string, number>();
const MIN_INTERVAL_MS = 3300;

dliveRepostRouter.post(
  "/dlive/repost",
  a(async (req, res) => {
    const secret = String(process.env.BOT_INTERNAL_SECRET || "").trim();
    const got = String(req.headers["x-bot-secret"] || "").trim();
    if (!secret || got !== secret) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const slug = norm(req.body?.slug).toLowerCase();
    const messageRaw = norm(req.body?.message);

    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });
    if (!messageRaw) return res.status(400).json({ ok: false, error: "empty_message" });

    // hard cap (DLive + safe)
    const message = messageRaw.slice(0, 180);

    // double-sécurité: si l'appelant est mod/owner => on refuse
    const senderRole = norm(req.body?.senderRole);
    const senderIsModLike = !!req.body?.senderIsModLike;
    const senderIsOwner = !!req.body?.senderIsOwner;

    if (senderIsOwner || senderIsModLike || isModLikeRole(senderRole)) {
      return res.json({ ok: true, skipped: "privileged_sender" });
    }

    // anti spam cadence
    const k = slug;
    const now = Date.now();
    const last = LAST_SEND.get(k) || 0;
    if (now - last < MIN_INTERVAL_MS) {
      return res.json({ ok: true, skipped: "rate_limited" });
    }

    // récupère la cible DLive du streamer (linked ou provider)
    const q = await pool.query(
      `
      SELECT
        s.id,
        s.slug,
        s.is_live AS "isLive",
        s.dlive_use_linked AS "useLinked",
        s.dlive_link_displayname AS "linkedDisplayname",
        s.dlive_link_username AS "linkedUsername",
        pa.channel_slug AS "providerChannelSlug",
        pa.channel_username AS "providerChannelUsername"
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.provider='dlive'
       AND pa.assigned_to_streamer_id = s.id
      WHERE lower(s.slug)=lower($1)
      LIMIT 1
      `,
      [slug]
    );

    const row = q.rows?.[0];
    if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    // ✅ on repost QUE si live (sinon DLive chat = inutile)
    if (!row.isLive) return res.json({ ok: true, skipped: "not_live" });

    const useLinked = !!row.useLinked;

    // on tente d'avoir un displayname/slug d'abord
    const dliveDisplayOrSlug = useLinked
      ? norm(row.linkedDisplayname)
      : norm(row.providerChannelSlug);

    // fallback username (immutable parfois déjà connu)
    const dliveUsernameMaybe = useLinked
      ? norm(row.linkedUsername)
      : norm(row.providerChannelUsername);

    const target = dliveDisplayOrSlug || dliveUsernameMaybe;
    if (!target) return res.json({ ok: true, skipped: "no_dlive_target" });

    // résout en immutable (dlive-xxxx) si nécessaire
    const immutable =
      target.toLowerCase().startsWith("dlive-")
        ? target
        : await resolveImmutableUsernameForDlive(target);

    if (!immutable) return res.json({ ok: true, skipped: "cannot_resolve_immutable" });

    // envoi Graphigo (token BOT)
    const ok = await sendDliveChatMessage({
      streamerImmutableUsername: immutable,
      message,
    });

    if (ok) LAST_SEND.set(k, now);

    return res.json({ ok: true, sent: ok, immutable });
  })
);
