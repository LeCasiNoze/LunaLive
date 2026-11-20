// Routes des sondages (création/fin par le streamer, vote des viewers du site).
import express from "express";
import { pool } from "../db.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { closePoll, createPoll, getLatestPoll, getOpenPoll, pollSnapshot, PollError, votePoll } from "./polls.js";

export const pollsRouter = express.Router();

async function streamerFromReq(req: any): Promise<{ id: number; slug: string; ownerId: number } | null> {
  const id = Number(req.body?.streamerId ?? req.query?.streamerId);
  const slug = String(req.body?.streamerSlug ?? req.query?.streamerSlug ?? req.body?.slug ?? req.query?.slug ?? "").trim();
  const r = id > 0
    ? await pool.query(`SELECT id, slug, user_id FROM streamers WHERE id=$1`, [id])
    : slug
      ? await pool.query(`SELECT id, slug, user_id FROM streamers WHERE lower(slug)=lower($1)`, [slug])
      : null;
  const row = r?.rows[0];
  return row ? { id: Number(row.id), slug: String(row.slug), ownerId: Number(row.user_id) } : null;
}

const canManage = (req: any, s: { ownerId: number }) => req.user?.role === "admin" || Number(req.user?.id) === s.ownerId;
const io = (req: any) => req.app?.locals?.io;

/** POST /api/bot/polls/create  { streamerId|streamerSlug, question, options[], durationSec } */
pollsRouter.post("/api/bot/polls/create", requireAuth, async (req: any, res) => {
  try {
    const s = await streamerFromReq(req);
    if (!s) return res.status(400).json({ ok: false, reason: "bad_streamer" });
    if (!canManage(req, s)) return res.status(403).json({ ok: false, reason: "forbidden" });
    const options = Array.isArray(req.body?.options) ? req.body.options.map(String) : [];
    const poll = await createPoll(pool, io(req), {
      streamerId: s.id, slug: s.slug, question: String(req.body?.question || ""), options,
      durationSec: Number(req.body?.durationSec), userId: Number(req.user.id),
    });
    return res.json({ ok: true, poll });
  } catch (e: any) {
    if (e instanceof PollError) return res.status(400).json({ ok: false, reason: e.message });
    console.warn("[polls] create", e?.message || e);
    return res.status(500).json({ ok: false, reason: "create_failed" });
  }
});

/** GET /api/bot/polls/current?streamerSlug=  (sondage ouvert, ou terminé depuis < 10 min) */
pollsRouter.get("/api/bot/polls/current", async (req: any, res) => {
  try {
    const s = await streamerFromReq(req);
    if (!s) return res.status(400).json({ ok: false, reason: "bad_streamer" });
    const poll = await getLatestPoll(pool, s.id);
    if (!poll) return res.json({ ok: true, poll: null });
    const user = tryGetAuthUser(req);
    return res.json({ ok: true, poll: await pollSnapshot(pool, poll, user ? `u:${user.id}` : null) });
  } catch (e: any) {
    console.warn("[polls] current", e?.message || e);
    return res.status(500).json({ ok: false, reason: "current_failed" });
  }
});

/** POST /api/bot/polls/vote  { streamerSlug, pollId, choice } */
pollsRouter.post("/api/bot/polls/vote", requireAuth, async (req: any, res) => {
  try {
    const s = await streamerFromReq(req);
    if (!s) return res.status(400).json({ ok: false, reason: "bad_streamer" });
    const poll = await getOpenPoll(pool, s.id);
    if (!poll || (req.body?.pollId != null && Number(req.body.pollId) !== Number(poll.id))) {
      return res.status(409).json({ ok: false, reason: "poll_closed" });
    }
    const result = await votePoll(pool, io(req), s.slug, poll, `u:${req.user.id}`, String(req.user.username || "viewer"), Number(req.body?.choice));
    if (result === "closed") return res.status(409).json({ ok: false, reason: "poll_closed" });
    if (result === "invalid") return res.status(400).json({ ok: false, reason: "bad_choice" });
    return res.json({ ok: true, result, poll: await pollSnapshot(pool, poll, `u:${req.user.id}`) });
  } catch (e: any) {
    console.warn("[polls] vote", e?.message || e);
    return res.status(500).json({ ok: false, reason: "vote_failed" });
  }
});

/** POST /api/bot/polls/close  { streamerId|streamerSlug } */
pollsRouter.post("/api/bot/polls/close", requireAuth, async (req: any, res) => {
  try {
    const s = await streamerFromReq(req);
    if (!s) return res.status(400).json({ ok: false, reason: "bad_streamer" });
    if (!canManage(req, s)) return res.status(403).json({ ok: false, reason: "forbidden" });
    const poll = await getOpenPoll(pool, s.id);
    if (!poll) return res.status(404).json({ ok: false, reason: "no_open_poll" });
    return res.json({ ok: true, poll: await closePoll(pool, io(req), Number(poll.id)) });
  } catch (e: any) {
    console.warn("[polls] close", e?.message || e);
    return res.status(500).json({ ok: false, reason: "close_failed" });
  }
});
