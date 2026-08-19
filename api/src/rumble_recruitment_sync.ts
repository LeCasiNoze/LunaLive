import { pool } from "./db.js";

const log = (...args: unknown[]) => console.log("[rumble-recruitment-sync]", ...args);

function config() {
  const base = process.env.NIVORA_API_BASE?.replace(/\/$/, "");
  const key = process.env.NIVORA_BOT_INTERNAL_KEY;
  return base && key ? { base, key } : null;
}

async function sync() {
  const cfg = config();
  if (!cfg || process.env.RUMBLE_RECRUITMENT_MONITOR_ENABLED === "0") return;
  const result = await pool.query(
    `SELECT slug, display_name, rumble_url, followers, instagram_handle, telegram_handle, telegram_url,
            email, discord_url, is_live, viewers_current, viewers_avg, viewers_peak,
            streams_observed, unique_chatters_avg, unique_chatters_peak, chat_messages_avg,
            unique_chatters_current, chat_messages_current,
            last_stream_started_at, last_stream_ended_at, monitoring_updated_at
     FROM rumble_outreach_contacts
     WHERE monitoring_updated_at IS NOT NULL AND status NOT IN ('do_not_contact', 'skipped')
     ORDER BY monitoring_updated_at DESC LIMIT 500`
  );
  const candidates = result.rows.map((row) => ({
    slug: row.slug, displayName: row.display_name, rumbleUrl: row.rumble_url, followers: Number(row.followers || 0),
    instagram: row.instagram_handle, telegram: row.telegram_url || row.telegram_handle,
    email: row.email, discord: row.discord_url,
    live: !!row.is_live, viewers: Number(row.viewers_current || 0), viewersAvg: Number(row.viewers_avg || row.viewers_current || 0),
    viewersPeak: Number(row.viewers_peak || 0), streamsObserved: Number(row.streams_observed || 0),
    uniqueChattersAvg: Number(row.unique_chatters_avg || row.unique_chatters_current || 0), uniqueChattersPeak: Number(row.unique_chatters_peak || row.unique_chatters_current || 0),
    chatMessagesAvg: Number(row.chat_messages_avg || row.chat_messages_current || 0),
    engagementRate: Number(row.viewers_avg || 0) > 0 ? Number(row.unique_chatters_avg || 0) / Number(row.viewers_avg) : null,
    lastStreamStartedAt: row.last_stream_started_at, lastStreamEndedAt: row.last_stream_ended_at,
    updatedAt: row.monitoring_updated_at,
  }));
  if (!candidates.length) return;
  const response = await fetch(`${cfg.base}/api/internal/recruitment/rumble`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nivora-bot-key": cfg.key },
    body: JSON.stringify({ candidates }),
  });
  if (!response.ok) throw new Error(`Nivora returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  log(`synced ${candidates.length} candidates`);
}

export function startRumbleRecruitmentSync() {
  if (!config() || process.env.RUMBLE_RECRUITMENT_MONITOR_ENABLED === "0") return;
  setTimeout(() => void sync().catch((error) => log("initial sync failed", error)), 90_000);
  setInterval(() => void sync().catch((error) => log("sync failed", error)), 5 * 60_000);
}
