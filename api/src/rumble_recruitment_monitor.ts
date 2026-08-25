import type { PoolClient } from "pg";
import { pool } from "./db.js";
import {
  fetchRumbleGamblingCategoryLives,
  fetchRumbleLiveInfoFromUsername,
  type RumbleCategorySnapshot,
  type RumbleLiveInfo,
} from "./rumble.js";
import { connectRumbleChatSse } from "./rumble_chat_bridge.js";

type Contact = { id: number; slug: string; display_name: string; rumble_url: string; is_live: boolean; live_video_id: string | null };
type PendingChatActivity = { messageId: string; chatterKey: string; createdAt: Date };
type LiveState = {
  videoId: string;
  videoIdNumeric: string | null;
  messageIds: Set<string>;
  chatters: Set<string>;
  messages: number;
  stopChat: (() => void) | null;
  chatRetryAt: number;
  pendingActivity: Map<string, PendingChatActivity>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
};

const states = new Map<number, LiveState>();
const categoryAbsences = new Map<number, { count: number; snapshotAt: number }>();
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

async function upsertDiscoveredLives(snapshot: RumbleCategorySnapshot) {
  const lives = [...snapshot.lives.values()];
  if (!lives.length) return;
  await pool.query(
    `WITH discovered AS (
       SELECT * FROM UNNEST($1::text[],$2::text[],$3::text[],$4::int[])
         AS t(slug,display_name,rumble_url,followers)
     )
     INSERT INTO rumble_outreach_contacts
       (slug,display_name,rumble_url,followers,source_data,notes)
     SELECT slug,display_name,rumble_url,followers,
            jsonb_build_array(jsonb_build_object('url',rumble_url,'label','Rumble Gambling & Slots live index')),
            'Découvert automatiquement en live. Langue et géographie à vérifier.'
     FROM discovered
     ON CONFLICT (slug) DO UPDATE SET
       rumble_url=EXCLUDED.rumble_url,
       followers=GREATEST(rumble_outreach_contacts.followers,EXCLUDED.followers)`,
    [
      lives.map((live) => live.username),
      lives.map((live) => live.username),
      lives.map((live) => live.profileUrl),
      lives.map((live) => live.followers),
    ]
  );
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

function rememberMessageId(state: LiveState, messageId: string) {
  state.messageIds.add(messageId);
  while (state.messageIds.size > 1_000) {
    const oldest = state.messageIds.values().next().value;
    if (oldest === undefined) break;
    state.messageIds.delete(oldest);
  }
}

async function flushChatActivity(state: LiveState, contactId: number, videoId: string): Promise<void> {
  if (state.flushing) {
    await state.flushing;
    if (state.pendingActivity.size) await flushChatActivity(state, contactId, videoId);
    return;
  }
  if (!state.pendingActivity.size) return;
  if (state.flushTimer) clearTimeout(state.flushTimer);
  state.flushTimer = null;
  const batch = [...state.pendingActivity.values()];
  state.pendingActivity.clear();
  state.flushing = pool.query(
    `WITH input AS (
       SELECT * FROM UNNEST($3::text[],$4::text[],$5::timestamptz[])
         AS t(message_id,chatter_key,created_at)
     ), inserted_messages AS (
       INSERT INTO rumble_outreach_chat_activity (contact_id,video_id,message_id,chatter_key,created_at)
       SELECT $1,$2,message_id,chatter_key,created_at FROM input
       ON CONFLICT DO NOTHING RETURNING 1
     )
     INSERT INTO rumble_outreach_chatters (contact_id,video_id,chatter_key)
     SELECT DISTINCT $1,$2,chatter_key FROM input ON CONFLICT DO NOTHING`,
    [contactId, videoId, batch.map((item) => item.messageId), batch.map((item) => item.chatterKey), batch.map((item) => item.createdAt)]
  ).then(() => undefined).catch((error: any) => {
    for (const item of batch) {
      if (!state.pendingActivity.has(item.messageId)) state.pendingActivity.set(item.messageId, item);
    }
    console.warn("[rumble-recruitment] chat batch persist failed", error?.message || error);
  }).finally(() => { state.flushing = null; });
  await state.flushing;
}

function queueChatActivity(state: LiveState, contactId: number, videoId: string, item: PendingChatActivity) {
  state.pendingActivity.set(item.messageId, item);
  if (state.pendingActivity.size >= 25) {
    void flushChatActivity(state, contactId, videoId);
  } else if (!state.flushTimer) {
    state.flushTimer = setTimeout(() => void flushChatActivity(state, contactId, videoId), 5_000);
  }
}

async function startChat(contact: Contact, videoId: string, videoIdNumeric: string | null) {
  const previous = states.get(contact.id);
  if (previous?.videoId === videoId && previous.stopChat) return previous;
  if (previous?.videoId === videoId && previous.chatRetryAt > Date.now()) return previous;
  previous?.stopChat?.();
  if (previous?.videoId !== videoId) {
    if (previous?.flushTimer) clearTimeout(previous.flushTimer);
    if (previous) await flushChatActivity(previous, contact.id, previous.videoId);
  }

  let state: LiveState;
  if (previous?.videoId === videoId) {
    state = previous;
  } else {
    const persisted = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM rumble_outreach_chat_activity WHERE contact_id=$1 AND video_id=$2) AS messages,
         ARRAY(SELECT chatter_key FROM rumble_outreach_chatters WHERE contact_id=$1 AND video_id=$2) AS chatters,
         ARRAY(SELECT message_id FROM rumble_outreach_chat_activity
               WHERE contact_id=$1 AND video_id=$2 ORDER BY created_at DESC LIMIT 1000) AS message_ids`,
      [contact.id, videoId]
    );
    const row = persisted.rows[0] || {};
    const messageIds = new Set<string>((row.message_ids || []).map(String));
    const chatters = new Set<string>((row.chatters || []).map(String));
    state = {
      videoId, videoIdNumeric, messageIds, chatters, messages: Number(row.messages || 0), stopChat: null, chatRetryAt: 0,
      pendingActivity: new Map(), flushTimer: null, flushing: null,
    };
  }
  state.videoIdNumeric = videoIdNumeric;
  states.set(contact.id, state);
  if (!videoIdNumeric) return state;

  state.stopChat = await connectRumbleChatSse(
    videoIdNumeric,
    (message) => {
      if (state.messageIds.has(message.msgId)) return;
      rememberMessageId(state, message.msgId);
      const chatterKey = message.userId || message.username.toLowerCase();
      state.chatters.add(chatterKey);
      state.messages += 1;
      queueChatActivity(state, contact.id, videoId, {
        messageId: message.msgId, chatterKey, createdAt: message.createdAt,
      });
    },
    (noChatAvailable) => {
      state.stopChat = null;
      state.chatRetryAt = Math.max(state.chatRetryAt, Date.now() + (noChatAvailable ? 5 * 60_000 : 30_000));
    }
  );
  if (!state.stopChat) state.chatRetryAt = Date.now() + 2 * 60_000;
  return state;
}

async function markLive(contact: Contact, info: RumbleLiveInfo) {
  const videoId = info.videoId || `live-${contact.id}`;
  const state = await startChat(contact, videoId, info.videoIdNumeric);
  const viewers = info.viewersCount;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (contact.is_live && contact.live_video_id && contact.live_video_id !== videoId) {
      await client.query(
        `UPDATE rumble_outreach_streams SET
           ended_at=COALESCE(ended_at,NOW()),
           chat_messages=GREATEST(chat_messages,(
             SELECT COUNT(*)::int FROM rumble_outreach_chat_activity WHERE contact_id=$1 AND video_id=$2
           )),
           unique_chatters=GREATEST(unique_chatters,(
             SELECT COUNT(*)::int FROM rumble_outreach_chatters WHERE contact_id=$1 AND video_id=$2
           )),
           updated_at=NOW()
         WHERE contact_id=$1 AND video_id=$2`,
        [contact.id, contact.live_video_id]
      );
      await client.query(
        `DELETE FROM rumble_outreach_chat_activity WHERE contact_id=$1 AND video_id=$2`,
        [contact.id, contact.live_video_id]
      );
      await client.query(
        `DELETE FROM rumble_outreach_chatters WHERE contact_id=$1 AND video_id=$2`,
        [contact.id, contact.live_video_id]
      );
    }
    await client.query(
    `INSERT INTO rumble_outreach_streams
       (contact_id, video_id, video_id_numeric, started_at, viewers_sum, viewers_samples, viewers_avg, viewers_peak, unique_chatters, chat_messages)
     VALUES ($1,$2,$3,COALESCE($4::timestamptz,NOW()),$5::int,$6,$5::int,$5::int,$7,$8)
     ON CONFLICT (contact_id, video_id) DO UPDATE SET
       video_id_numeric=COALESCE(EXCLUDED.video_id_numeric, rumble_outreach_streams.video_id_numeric),
       viewers_sum=rumble_outreach_streams.viewers_sum + $5::int,
       viewers_samples=rumble_outreach_streams.viewers_samples + $6,
       viewers_avg=CASE WHEN rumble_outreach_streams.viewers_samples + $6 > 0
         THEN ROUND((rumble_outreach_streams.viewers_sum + $5::int)::numeric / (rumble_outreach_streams.viewers_samples + $6))::int
         ELSE rumble_outreach_streams.viewers_avg END,
       viewers_peak=GREATEST(rumble_outreach_streams.viewers_peak,$5::int),
       unique_chatters=GREATEST(rumble_outreach_streams.unique_chatters,$7),
       chat_messages=GREATEST(rumble_outreach_streams.chat_messages,$8),
       ended_at=NULL,
       updated_at=NOW()`,
    [contact.id, videoId, info.videoIdNumeric, info.createdAt, viewers ?? 0, viewers == null ? 0 : 1, state.chatters.size, state.messages]
  );
    await client.query(
    `UPDATE rumble_outreach_contacts SET
       is_live=TRUE, viewers_current=$2, viewers_peak=GREATEST(viewers_peak,$2),
       live_video_id=$3, live_video_id_numeric=$4,
       live_started_at=CASE WHEN live_video_id IS DISTINCT FROM $3
         THEN COALESCE($5::timestamptz,NOW()) ELSE COALESCE(live_started_at,$5::timestamptz,NOW()) END,
       last_stream_started_at=CASE WHEN live_video_id IS DISTINCT FROM $3
         THEN COALESCE($5::timestamptz,NOW()) ELSE last_stream_started_at END,
       unique_chatters_current=$6, chat_messages_current=$7,
       monitoring_updated_at=NOW(), updated_at=NOW()
     WHERE id=$1`,
    [contact.id, viewers ?? 0, videoId, info.videoIdNumeric, info.createdAt, state.chatters.size, state.messages]
  );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markOffline(contact: Contact) {
  const state = states.get(contact.id);
  state?.stopChat?.();
  if (state?.flushTimer) clearTimeout(state.flushTimer);
  if (state) await flushChatActivity(state, contact.id, state.videoId);

  if (!contact.is_live && !contact.live_video_id) {
    states.delete(contact.id);
    await pool.query(
      `UPDATE rumble_outreach_contacts
       SET viewers_current=0, unique_chatters_current=0, chat_messages_current=0,
           monitoring_updated_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [contact.id]
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (contact.is_live || contact.live_video_id) {
      await client.query(
        `UPDATE rumble_outreach_streams SET
           ended_at=COALESCE(ended_at,NOW()),
           unique_chatters=GREATEST(unique_chatters,$3,(
             SELECT COUNT(*)::int FROM rumble_outreach_chatters WHERE contact_id=$1 AND video_id=$2
           )),
           chat_messages=GREATEST(chat_messages,$4,(
             SELECT COUNT(*)::int FROM rumble_outreach_chat_activity WHERE contact_id=$1 AND video_id=$2
           )),
           updated_at=NOW()
         WHERE contact_id=$1 AND video_id=$2`,
        [contact.id, contact.live_video_id, state?.chatters.size || 0, state?.messages || 0]
      );
    }
    await client.query(
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
    if (contact.live_video_id) {
      await client.query(`DELETE FROM rumble_outreach_chat_activity WHERE contact_id=$1 AND video_id=$2`, [contact.id, contact.live_video_id]);
      await client.query(`DELETE FROM rumble_outreach_chatters WHERE contact_id=$1 AND video_id=$2`, [contact.id, contact.live_video_id]);
    }
    await client.query("COMMIT");
    states.delete(contact.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function monitorOne(contact: Contact, snapshot: RumbleCategorySnapshot | null) {
  const username = rumbleUsername(contact);
  const indexedLive = snapshot?.lives.get(username.toLowerCase());
  if (!indexedLive) {
    // Recorded-stream discovery also finds creators who do not list their live
    // in Gambling & Slots. Probe their canonical /live page so their audience
    // and unique chatters are still measured on the next broadcast.
    const targeted = await fetchRumbleLiveInfoFromUsername(username);
    if (targeted.isLive) {
      categoryAbsences.delete(contact.id);
      await markLive(contact, targeted);
      return;
    }
    if (!contact.is_live) {
      categoryAbsences.delete(contact.id);
      await markOffline(contact);
      return;
    }
    const previous = categoryAbsences.get(contact.id);
    const snapshotAt = snapshot?.fetchedAt ?? Date.now();
    if (previous?.snapshotAt === snapshotAt) return;
    const count = (previous?.count || 0) + 1;
    categoryAbsences.set(contact.id, { count, snapshotAt });
    if (count >= 3) {
      categoryAbsences.delete(contact.id);
      await markOffline(contact);
    }
    return;
  }
  categoryAbsences.delete(contact.id);
  const info: RumbleLiveInfo = {
    username,
    isLive: true,
    viewersCount: indexedLive.viewersCount,
    title: indexedLive.title,
    thumbnailUrl: indexedLive.thumbnailUrl,
    videoUrl: indexedLive.videoUrl,
    hlsUrl: null,
    videoId: indexedLive.videoId,
    videoIdNumeric: indexedLive.videoIdNumeric,
    createdAt: indexedLive.createdAt,
  };
  await markLive(contact, info);
}

async function tick() {
  if (running || !enabled()) return;
  running = true;
  try {
    if (!(await acquireSingletonLock())) return;
    const categoryLives = await fetchRumbleGamblingCategoryLives();
    if (categoryLives) await upsertDiscoveredLives(categoryLives);
    const contacts = await dueContacts();
    // Two concurrent probes keep request pressure low and avoid long serial batches.
    for (let index = 0; index < contacts.length; index += 2) {
      const batch = contacts.slice(index, index + 2);
      const results = await Promise.allSettled(batch.map((contact) => monitorOne(contact, categoryLives)));
      results.forEach((result, resultIndex) => {
        if (result.status === "rejected") {
          console.warn(
            `[rumble-recruitment] monitor failed for ${batch[resultIndex]?.display_name || "unknown"}`,
            result.reason?.message || result.reason
          );
        }
      });
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
