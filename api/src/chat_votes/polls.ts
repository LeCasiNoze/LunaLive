// Sondages : une question, N choix, vote gratuit et modifiable jusqu'à la fin.
// Votes du site (voter_key "u:<userId>") et du chat Rumble ("rumble:<id>").
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { emitChatAll, emitChatLine, emitSpecialCard } from "../socket_emit.js";
import { clip, formatRemaining, pct, rumbleVoteTarget, sendRumbleVoteText } from "./rumble_out.js";

export const POLL_MAX_OPTIONS = 12;
export const POLL_MIN_SEC = 30;
export const POLL_MAX_SEC = 3600;

export type PollRow = {
  id: number;
  streamer_id: number;
  question: string;
  options: string[];
  status: "open" | "closed";
  created_at: string;
  ends_at: string;
  closed_at: string | null;
};

export type PollSnapshot = {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  total: number;
  endsAtMs: number;
  status: "open" | "closed";
  myChoice: number | null;
};

export class PollError extends Error {}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function getOpenPoll(pool: Pool, streamerId: number): Promise<PollRow | null> {
  const r = await pool.query(`SELECT * FROM polls WHERE streamer_id=$1 AND status='open' ORDER BY id DESC LIMIT 1`, [streamerId]);
  return r.rows[0] ?? null;
}

export async function getLatestPoll(pool: Pool, streamerId: number): Promise<PollRow | null> {
  const r = await pool.query(
    `SELECT * FROM polls WHERE streamer_id=$1 AND (status='open' OR closed_at > NOW() - INTERVAL '10 minutes')
      ORDER BY id DESC LIMIT 1`, [streamerId]);
  return r.rows[0] ?? null;
}

export async function pollSnapshot(pool: Pool, poll: PollRow, voterKey?: string | null): Promise<PollSnapshot> {
  const r = await pool.query(`SELECT choice, COUNT(*)::int AS n FROM poll_votes WHERE poll_id=$1 GROUP BY choice`, [poll.id]);
  const counts = poll.options.map(() => 0);
  for (const row of r.rows) {
    const i = Number(row.choice) - 1;
    if (i >= 0 && i < counts.length) counts[i] = Number(row.n);
  }
  let myChoice: number | null = null;
  if (voterKey) {
    const mine = await pool.query(`SELECT choice FROM poll_votes WHERE poll_id=$1 AND voter_key=$2`, [poll.id, voterKey]);
    myChoice = mine.rows[0] ? Number(mine.rows[0].choice) : null;
  }
  return {
    id: Number(poll.id),
    question: poll.question,
    options: poll.options,
    counts,
    total: counts.reduce((a, b) => a + b, 0),
    endsAtMs: new Date(poll.ends_at).getTime(),
    status: poll.status,
    myChoice,
  };
}

async function emitPollUpdate(pool: Pool, io: Server | null | undefined, slug: string, poll: PollRow) {
  if (!io) return;
  const snap = await pollSnapshot(pool, poll);
  emitChatAll(io, slug, "poll:update", { ...snap, myChoice: undefined });
}

const resultsLine = (snap: PollSnapshot) =>
  snap.options.map((o, i) => `[${i + 1}] ${clip(o, 40)} ${pct(snap.counts[i] ?? 0, snap.total)}%`).join(" | ");

export async function createPoll(
  pool: Pool,
  io: Server | null | undefined,
  input: { streamerId: number; slug: string; question: string; options: string[]; durationSec: number; userId: number }
) {
  const question = clip(input.question, 200);
  const options = input.options.map((o) => clip(o, 80)).filter(Boolean);
  if (!question) throw new PollError("question_required");
  if (options.length < 2) throw new PollError("two_options_min");
  if (options.length > POLL_MAX_OPTIONS) throw new PollError("too_many_options");
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new PollError("duplicate_options");
  const dur = Math.min(POLL_MAX_SEC, Math.max(POLL_MIN_SEC, Math.round(Number(input.durationSec) || 120)));
  // !1/!2 servent aussi aux prédictions : jamais les deux ouverts en même temps.
  const pred = await pool.query(
    `SELECT 1 FROM predictions WHERE streamer_id=$1 AND status='open' AND bets_close_at > NOW() LIMIT 1`, [input.streamerId]);
  if (pred.rows[0]) throw new PollError("prediction_active");
  let poll: PollRow;
  try {
    poll = (await pool.query(
      `INSERT INTO polls(streamer_id, question, options, created_by, ends_at)
       VALUES($1,$2,$3::jsonb,$4, NOW() + ($5 || ' seconds')::interval) RETURNING *`,
      [input.streamerId, question, JSON.stringify(options), input.userId, dur])).rows[0];
  } catch (e: any) {
    if (e?.code === "23505") throw new PollError("already_open");
    throw e;
  }
  const snap = await pollSnapshot(pool, poll);
  emitSpecialCard(io, input.slug, "poll", { ...snap, pollId: snap.id, durationSec: dur, real: true });
  void announcePollOnRumble(pool, poll).catch((e) => console.warn("[polls] rumble announce", e?.message || e));
  return snap;
}

async function announcePollOnRumble(pool: Pool, poll: PollRow) {
  const claimed = await pool.query(
    `UPDATE polls SET ext_announced_at=NOW(), ext_reminded_at=NOW() WHERE id=$1 AND ext_announced_at IS NULL RETURNING id`, [poll.id]);
  if (!claimed.rows[0]) return;
  const vid = await rumbleVoteTarget(pool, Number(poll.streamer_id));
  if (!vid) return;
  const opts = poll.options.map((o, i) => `[${i + 1}] ${clip(o, 40)} → !${i + 1}`).join(" | ");
  const left = formatRemaining(new Date(poll.ends_at).getTime() - Date.now());
  await sendRumbleVoteText(pool, vid, `[SONDAGE] ${clip(poll.question, 110)} | ${opts} | Fin dans ${left} | Tu peux changer ton vote`);
}

export async function votePoll(
  pool: Pool,
  io: Server | null | undefined,
  slug: string,
  poll: PollRow,
  voterKey: string,
  username: string,
  choice: number
): Promise<"placed" | "switched" | "same" | "closed" | "invalid"> {
  if (poll.status !== "open" || new Date(poll.ends_at).getTime() <= Date.now()) return "closed";
  if (!Number.isInteger(choice) || choice < 1 || choice > poll.options.length) return "invalid";
  const r = await pool.query(
    `WITH prev AS (SELECT choice FROM poll_votes WHERE poll_id=$1 AND voter_key=$2)
     INSERT INTO poll_votes(poll_id, voter_key, username, choice) VALUES($1,$2,$3,$4)
     ON CONFLICT (poll_id, voter_key) DO UPDATE SET choice=EXCLUDED.choice, username=EXCLUDED.username, updated_at=NOW()
     RETURNING (SELECT choice FROM prev) AS previous`,
    [poll.id, voterKey, username.slice(0, 80), choice]);
  const previous = r.rows[0]?.previous == null ? null : Number(r.rows[0].previous);
  if (previous === choice) return "same";
  await emitPollUpdate(pool, io, slug, poll).catch(() => {});
  return previous == null ? "placed" : "switched";
}

/** Clôture (manuelle ou à l'échéance) : réclamée atomiquement, annoncée partout. */
export async function closePoll(pool: Pool, io: Server | null | undefined, pollId: number) {
  const closed = await pool.query(
    `UPDATE polls p SET status='closed', closed_at=NOW() FROM streamers s
      WHERE p.id=$1 AND p.status='open' AND s.id=p.streamer_id RETURNING p.*, s.slug`, [pollId]);
  const row = closed.rows[0] as (PollRow & { slug: string }) | undefined;
  if (!row) return null;
  const snap = await pollSnapshot(pool, row);
  if (io) {
    emitChatAll(io, row.slug, "poll:update", snap);
    const top = Math.max(0, ...snap.counts);
    const winners = snap.total > 0 ? snap.options.filter((_, i) => snap.counts[i] === top) : [];
    emitChatLine(io, row.slug, "recap", winners.length
      ? `📊 Sondage terminé : <b>${esc(winners.join(" / "))}</b> (${pct(top, snap.total)}% · ${snap.total} vote${snap.total > 1 ? "s" : ""})`
      : `📊 Sondage terminé sans vote`);
  }
  const vid = await rumbleVoteTarget(pool, Number(row.streamer_id));
  const claimed = await pool.query(
    `UPDATE polls SET ext_closed_announced_at=NOW() WHERE id=$1 AND ext_closed_announced_at IS NULL RETURNING id`, [pollId]);
  if (vid && claimed.rows[0]) {
    await sendRumbleVoteText(pool, vid,
      `[SONDAGE] Terminé : ${clip(row.question, 90)} | ${resultsLine(snap)} | ${snap.total} votant${snap.total > 1 ? "s" : ""}`);
  }
  return snap;
}

export async function tickPolls(pool: Pool, io: Server | null | undefined, reminderSec: number) {
  const expired = await pool.query(`SELECT id FROM polls WHERE status='open' AND ends_at <= NOW()`);
  for (const row of expired.rows) await closePoll(pool, io, Number(row.id));
  const open = await pool.query(
    `SELECT p.* FROM polls p WHERE p.status='open' AND p.ends_at > NOW() + INTERVAL '15 seconds'
       AND p.ext_announced_at IS NOT NULL
       AND (p.ext_reminded_at IS NULL OR p.ext_reminded_at <= NOW() - ($1 || ' seconds')::interval)`, [reminderSec]);
  for (const poll of open.rows as PollRow[]) {
    const claimed = await pool.query(
      `UPDATE polls SET ext_reminded_at=NOW() WHERE id=$1
        AND (ext_reminded_at IS NULL OR ext_reminded_at <= NOW() - ($2 || ' seconds')::interval) RETURNING id`, [poll.id, reminderSec]);
    if (!claimed.rows[0]) continue;
    const vid = await rumbleVoteTarget(pool, Number(poll.streamer_id));
    if (!vid) continue;
    const snap = await pollSnapshot(pool, poll);
    await sendRumbleVoteText(pool, vid,
      `[SONDAGE] Plus que ${formatRemaining(snap.endsAtMs - Date.now())} pour voter | ${resultsLine(snap)} | ${snap.total} votant${snap.total > 1 ? "s" : ""} | Vote avec !1 à !${snap.options.length}`);
  }
}

/** !N depuis Rumble pendant un sondage ouvert (null = pas de sondage). */
export async function handleRumblePollVote(
  pool: Pool,
  io: Server | undefined,
  m: { streamerId: number; slug: string; rumbleUserId: string; username: string },
  choice: number
) {
  const poll = await getOpenPoll(pool, m.streamerId);
  if (!poll) return null;
  const result = await votePoll(pool, io, m.slug, poll, `rumble:${m.rumbleUserId}`, m.username, choice);
  const label = poll.options[choice - 1] ?? "";
  if (result === "closed") return `@${m.username} le sondage est terminé.`;
  if (result === "invalid") return `@${m.username} choix invalide : tape !1 à !${poll.options.length}.`;
  if (result === "same") return `@${m.username} tu as déjà voté [${choice}] ${clip(label, 50)}.`;
  if (result === "switched") return `@${m.username} vote changé : [${choice}] ${clip(label, 50)}.`;
  return `@${m.username} vote enregistré : [${choice}] ${clip(label, 50)}.`;
}
