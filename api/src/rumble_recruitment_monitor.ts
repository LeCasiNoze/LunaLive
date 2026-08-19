import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { fetchRumbleLiveInfoFromUsername } from "./rumble.js";
import { connectRumbleChatSse } from "./rumble_chat_bridge.js";

type Contact = { id: number; slug: string; display_name: string; rumble_url: string; is_live: boolean; live_video_id: string | null };
type LiveState = {
  videoId: string;
  videoIdNumeric: string | null;
  messageIds: Set<string>;
  chatters: Set<string>;
  messages: number;
  stopChat: (() => void) | null;
};

const states = new Map<number, LiveState>();
const OFFLINE_INTERVAL_MS = Math.max(60_000, Number(process.env.RUMBLE_RECRUITMENT_OFFLINE_INTERVAL_MS || 180_000));
const LIVE_INTERVAL_MS = Math.max(20_000, Number(process.env.RUMBLE_RECRUITMENT_LIVE_INTERVAL_MS || 30_000));
const BATCH_SIZE = Math.max(1, Math.min(20, Number(process.env.RUMBLE_RECRUITMENT_BATCH_SIZE || 8)));
const TICK_MS = 15_000;
let lockClient: PoolClient | null = null;
let running = false;

function enabled() {
  return process.env.RUMBLE_RECRUITMENT_MONITOR_ENABLED !== "0";
}

async function acquireSingletonLock() {
  if (lockClient) return true;
  const client = await pool.connect();
  const result = await client.query(`SELECT pg_try_advisory_lock(hashtext('rumble_recruitment_monitor')) AS locked`);
  if (!result.rows[0]?.locked) {
    client.release();
    return false;
  }
  lockClient = client;
  client.on("error", () => { lockClient = null; });
  return true;
}

async function dueContacts(): Promise<Contact[]> {
  const result = await pool.query(
    `SELECT id, slug, display_name, rumble_url, is_live, live_video_id
     FROM rumble_outreach_contacts
     WHERE status NOT IN ('do_not_contact', 'skipped', 'onboarded')
       AND (
         monitoring_updated_at IS NULL OR
         (is_live = TRUE AND monitoring_updated_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')) OR
         (is_live = FALSE AND monitoring_updated_at < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
       )
     ORDER BY is_live DESC, monitoring_updated_at ASC NULLS FIRST
     LIMIT $3`,
    [LIVE_INTERVAL_MS, OFFLINE_INTERVAL_MS, BATCH_SIZE]
  );
  return result.rows.map((row) => ({
    id: Number(row.id), slug: String(row.slug), display_name: String(row.display_name), rumble_url: String(row.rumble_url),
    is_live: !!row.is_live, live_video_id: row.live_video_id ? String(row.live_video_id) : null,
  }));
}

function rumbleUsername(contact: Contact) {
  try {
    const url = new URL(contact.rumble_url);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) || contact.slug;
  } catch {
    return contact.slug;
  }
}

async function startChat(contact: Contact, videoId: string, videoIdNumeric: string | null) {
  const previous = states.get(contact.id);
  if (previous?.videoId === videoId && previous.stopChat) return previous;
  previous?.stopChat?.();

  const state: LiveState = previous?.videoId === videoId ? previous : {
    videoId, videoIdNumeric, messageIds: new Set(), chatters: new Set(), messages: 0, stopChat: null,
  };
  state.videoIdNumeric = videoIdNumeric;
  states.set(contact.id, state);
  if (!videoIdNumeric) return state;

  state.stopChat = await connectRumbleChatSse(
    videoIdNumeric,
    (message) => {
      if (state.messageIds.has(message.msgId)) return;
      state.messageIds.add(message.msgId);
      state.chatters.add(message.userId || message.username.toLowerCase());
      state.messages += 1;
      // Bound memory even on exceptionally large chats. The aggregate remains useful.
      if (state.messageIds.size > 20_000) state.messageIds.clear();
    },
    () => { state.stopChat = null; }
  );
  return state;
}

async function markLive(contact: Contact, info: Awaited<ReturnType<typeof fetchRumbleLiveInfoFromUsername>>) {
  const videoId = info.videoId || `live-${contact.id}`;
  const state = await startChat(contact, videoId, info.videoIdNumeric);
  const viewers = info.viewersCount;
  await pool.query(
    `INSERT INTO rumble_outreach_streams
       (contact_id, video_id, video_id_numeric, started_at, viewers_sum, viewers_samples, viewers_avg, viewers_peak, unique_chatters, chat_messages)
     VALUES ($1,$2,$3,COALESCE($4::timestamptz,NOW()),$5,$6,$5,$5,$7,$8)
     ON CONFLICT (contact_id, video_id) DO UPDATE SET
       video_id_numeric=COALESCE(EXCLUDED.video_id_numeric, rumble_outreach_streams.video_id_numeric),
       viewers_sum=rumble_outreach_streams.viewers_sum + $5,
       viewers_samples=rumble_outreach_streams.viewers_samples + $6,
       viewers_avg=CASE WHEN rumble_outreach_streams.viewers_samples + $6 > 0
         THEN ROUND((rumble_outreach_streams.viewers_sum + $5)::numeric / (rumble_outreach_streams.viewers_samples + $6))::int
         ELSE rumble_outreach_streams.viewers_avg END,
       viewers_peak=GREATEST(rumble_outreach_streams.viewers_peak,$5),
       unique_chatters=GREATEST(rumble_outreach_streams.unique_chatters,$7),
       chat_messages=GREATEST(rumble_outreach_streams.chat_messages,$8),
       updated_at=NOW()`,
    [contact.id, videoId, info.videoIdNumeric, info.createdAt, viewers ?? 0, viewers == null ? 0 : 1, state.chatters.size, state.messages]
  );
  await pool.query(
    `UPDATE rumble_outreach_contacts SET
       is_live=TRUE, viewers_current=$2, viewers_peak=GREATEST(viewers_peak,$2),
       live_video_id=$3, live_video_id_numeric=$4,
       live_started_at=COALESCE(live_started_at,$5::timestamptz,NOW()),
       last_stream_started_at=CASE WHEN live_video_id IS DISTINCT FROM $3
         THEN COALESCE($5::timestamptz,NOW()) ELSE last_stream_started_at END,
       unique_chatters_current=$6, chat_messages_current=$7,
       monitoring_updated_at=NOW(), updated_at=NOW()
     WHERE id=$1`,
    [contact.id, viewers ?? 0, videoId, info.videoIdNumeric, info.createdAt, state.chatters.size, state.messages]
  );
}

async function markOffline(contact: Contact) {
  const state = states.get(contact.id);
  state?.stopChat?.();
  states.delete(contact.id);

  if (contact.is_live || contact.live_video_id) {
    await pool.query(
      `UPDATE rumble_outreach_streams SET ended_at=COALESCE(ended_at,NOW()), updated_at=NOW()
       WHERE contact_id=$1 AND video_id=$2`,
      [contact.id, contact.live_video_id]
    );
  }
  await pool.query(
    `WITH summary AS (
       SELECT COUNT(*)::int AS streams,
              COALESCE(ROUND(AVG(viewers_avg)),0)::int AS viewers_avg,
              COALESCE(MAX(viewers_peak),0)::int AS viewers_peak,
              COALESCE(SUM(viewers_samples),0)::int AS viewers_samples,
              COALESCE(ROUND(AVG(unique_chatters)),0)::int AS chatters_avg,
              COALESCE(MAX(unique_chatters),0)::int AS chatters_peak,
              COALESCE(ROUND(AVG(chat_messages)),0)::int AS messages_avg
       FROM rumble_outreach_streams WHERE contact_id=$1
     )
     UPDATE rumble_outreach_contacts c SET
       is_live=FALSE, viewers_current=0, unique_chatters_current=0, chat_messages_current=0,
       streams_observed=s.streams, viewers_avg=s.viewers_avg, viewers_peak=s.viewers_peak,
       viewers_samples=s.viewers_samples, unique_chatters_avg=s.chatters_avg,
       unique_chatters_peak=s.chatters_peak, chat_messages_avg=s.messages_avg,
       last_stream_ended_at=CASE WHEN c.is_live THEN NOW() ELSE c.last_stream_ended_at END,
       live_video_id=NULL, live_video_id_numeric=NULL, live_started_at=NULL,
       monitoring_updated_at=NOW(), updated_at=NOW()
     FROM summary s WHERE c.id=$1`,
    [contact.id]
  );
}

async function monitorOne(contact: Contact) {
  const info = await fetchRumbleLiveInfoFromUsername(rumbleUsername(contact));
  if (info.isLive) await markLive(contact, info);
  else await markOffline(contact);
}

async function tick() {
  if (running || !enabled()) return;
  running = true;
  try {
    if (!(await acquireSingletonLock())) return;
    const contacts = await dueContacts();
    // Two concurrent probes keep request pressure low and avoid long serial batches.
    for (let index = 0; index < contacts.length; index += 2) {
      await Promise.allSettled(contacts.slice(index, index + 2).map(monitorOne));
    }
  } catch (error: any) {
    console.warn("[rumble-recruitment] tick failed", error?.message || error);
  } finally {
    running = false;
  }
}

export function startRumbleRecruitmentMonitor() {
  if (!enabled()) {
    console.log("[rumble-recruitment] disabled");
    return;
  }
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), TICK_MS);
  console.log(`[rumble-recruitment] enabled (offline=${OFFLINE_INTERVAL_MS}ms live=${LIVE_INTERVAL_MS}ms batch=${BATCH_SIZE})`);
}
