import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { resolveImmutableUsernameForDlive } from "../dlive_resolve.js";
import { sendDliveChatMessage } from "../dlive_send.js";
export const dliveRepostRouter = Router();
function norm(s) {
    return String(s || "").trim();
}
// mini rate-limit mémoire par slug (anti spam)
const LAST_SEND = new Map();
const MIN_INTERVAL_MS = 3300;
dliveRepostRouter.post("/dlive/repost", a(async (req, res) => {
    // ✅ AUTH: x-bot-key / BOT_INTERNAL_KEY (comme /internal/bot/chat/send)
    const expected = String(process.env.BOT_INTERNAL_KEY || "").trim();
    const got = String(req.header("x-bot-key") || "").trim();
    if (!expected || got !== expected) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const messageRaw = norm(req.body?.message);
    if (!messageRaw)
        return res.status(400).json({ ok: false, error: "empty_message" });
    // hard cap (DLive + safe)
    const message = messageRaw.slice(0, 180);
    // ✅ accepte slug OU streamerId
    let slug = norm(req.body?.slug).toLowerCase();
    const streamerId = Number(req.body?.streamerId || 0);
    if (!slug && streamerId > 0) {
        const s = await pool.query(`SELECT slug FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
        slug = norm(s.rows?.[0]?.slug).toLowerCase();
    }
    if (!slug)
        return res.status(400).json({ ok: false, error: "bad_slug" });
    // anti spam cadence
    const k = slug;
    const now = Date.now();
    const last = LAST_SEND.get(k) || 0;
    if (now - last < MIN_INTERVAL_MS) {
        return res.json({ ok: true, skipped: "rate_limited" });
    }
    // récupère la cible DLive du streamer (linked ou provider)
    const q = await pool.query(`
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
      `, [slug]);
    const row = q.rows?.[0];
    if (!row)
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
    // ✅ repost seulement si live (sinon DLive chat = inutile)
    if (!row.isLive)
        return res.json({ ok: true, skipped: "not_live" });
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
    if (!target)
        return res.json({ ok: true, skipped: "no_dlive_target" });
    // résout en immutable (dlive-xxxx) si nécessaire
    const immutable = target.toLowerCase().startsWith("dlive-")
        ? target
        : await resolveImmutableUsernameForDlive(target);
    if (!immutable)
        return res.json({ ok: true, skipped: "cannot_resolve_immutable" });
    // envoi Graphigo (token BOT)
    let sent = false;
    try {
        sent = await sendDliveChatMessage({
            streamerImmutableUsername: immutable,
            message,
        });
    }
    catch (e) {
        // si tu veux voir en logs Render
        console.log("[dlive_repost] send error", e?.message || e);
        sent = false;
    }
    if (sent)
        LAST_SEND.set(k, now);
    return res.json({ ok: true, sent, immutable, slug });
}));
