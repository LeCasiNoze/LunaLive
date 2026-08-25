import { pool } from "./db.js";

const log = (...args: unknown[]) => console.log("[rumble-recruitment-sync]", ...args);

function config() {
  const base = process.env.NIVORA_API_BASE?.replace(/\/$/, "");
  const key = process.env.NIVORA_BOT_INTERNAL_KEY;
  return base && key ? { base, key } : null;
}

type RecordedTarget = {
  slug: string;
  displayName: string;
  rumbleUrl: string;
  followers: number;
};

async function pullRecordedTargets() {
  const cfg = config();
  if (!cfg || process.env.RUMBLE_RECRUITMENT_MONITOR_ENABLED === "0") return;
  const response = await fetch(`${cfg.base}/api/internal/recruitment/rumble?mode=targets`, {
    headers: { "x-nivora-bot-key": cfg.key },
  });
  if (!response.ok) throw new Error(`Nivora targets returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { targets?: unknown };
  if (!Array.isArray(payload.targets) || payload.targets.length > 500) throw new Error("Nivora targets payload is invalid");
  const targets: RecordedTarget[] = payload.targets.flatMap((raw: any) => {
    const slug = typeof raw?.slug === "string" ? raw.slug.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug)) return [];
    return [{
      slug,
      displayName: typeof raw?.displayName === "string" ? raw.displayName.slice(0, 120) : slug,
      rumbleUrl: typeof raw?.rumbleUrl === "string" && raw.rumbleUrl.startsWith("https://rumble.com/")
        ? raw.rumbleUrl : `https://rumble.com/user/${slug}`,
      followers: Math.max(0, Math.round(Number(raw?.followers) || 0)),
    }];
  });
  if (!targets.length) return;

  const values = [
    targets.map((target) => target.slug),
    targets.map((target) => target.displayName),
    targets.map((target) => target.rumbleUrl),
    targets.map((target) => target.followers),
  ];
  await pool.query(
    `WITH input AS (
       SELECT * FROM UNNEST($1::text[],$2::text[],$3::text[],$4::int[])
         AS t(slug,display_name,rumble_url,followers)
     )
     UPDATE rumble_outreach_contacts contact SET
       display_name=COALESCE(NULLIF(contact.display_name,''),input.display_name),
       rumble_url=input.rumble_url,
       followers=GREATEST(contact.followers,input.followers),
       updated_at=NOW()
     FROM input WHERE lower(contact.slug)=lower(input.slug)`,
    values
  );
  await pool.query(
    `WITH input AS (
       SELECT * FROM UNNEST($1::text[],$2::text[],$3::text[],$4::int[])
         AS t(slug,display_name,rumble_url,followers)
     )
     INSERT INTO rumble_outreach_contacts
       (slug,display_name,rumble_url,followers,source_data,notes)
     SELECT lower(input.slug),input.display_name,input.rumble_url,input.followers,
       jsonb_build_array(jsonb_build_object('url',input.rumble_url,'label','Nivora recorded-stream discovery')),
       'Découvert dans les diffusions enregistrées ; live surveillé directement hors catégorie.'
     FROM input
     WHERE NOT EXISTS (
       SELECT 1 FROM rumble_outreach_contacts existing WHERE lower(existing.slug)=lower(input.slug)
     )
     ON CONFLICT (slug) DO NOTHING`,
    values
  );
  log(`pulled ${targets.length} recorded-stream monitoring target(s) from Nivora`);
}

async function sync(recentOnly = false) {
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
       AND ($1::boolean = FALSE OR is_live = TRUE OR last_stream_ended_at > NOW() - INTERVAL '2 minutes')
     ORDER BY monitoring_updated_at DESC LIMIT 500`,
    [recentOnly]
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
  log(`synced ${candidates.length} ${recentOnly ? "live/recent" : "total"} candidates`);
}

export function startRumbleRecruitmentSync() {
  if (!config() || process.env.RUMBLE_RECRUITMENT_MONITOR_ENABLED === "0") return;
  setTimeout(() => void pullRecordedTargets().catch((error) => log("target pull failed", error)), 5_000);
  setTimeout(() => void sync().catch((error) => log("initial sync failed", error)), 20_000);
  setInterval(() => void pullRecordedTargets().catch((error) => log("target pull failed", error)), 10 * 60_000);
  setInterval(() => void sync(true).catch((error) => log("live sync failed", error)), 30_000);
  setInterval(() => void sync().catch((error) => log("sync failed", error)), 5 * 60_000);
}
