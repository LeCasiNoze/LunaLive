import type { Express, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const TZ = "Europe/Oslo";
const HEARTBEAT_TTL_SECONDS = 45;

type AuthUser = { id: number; username: string; role: string };

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing");
  return s;
}

function decodeOptionalUser(req: Request): AuthUser | null {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    return jwt.verify(m[1], getJwtSecret()) as AuthUser;
  } catch {
    return null;
  }
}

function a(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function cleanAnonId(x: any) {
  const s = String(x || "").trim();
  if (!s) return "";
  if (s.length > 80) return "";
  // autorise uuid/letters/numbers/_-:
  if (!/^[a-zA-Z0-9:_-]+$/.test(s)) return "";
  return s;
}

async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT id, slug, is_live AS "isLive", live_started_at AS "liveStartedAt", updated_at AS "updatedAt"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );

  const row = r.rows?.[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: String(row.slug),
    isLive: !!row.isLive,
    liveStartedAt: row.liveStartedAt ? new Date(row.liveStartedAt) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
  };
}

async function ensureOpenLiveSession(streamerId: number) {
  const cur = await pool.query(
    `SELECT id FROM live_sessions WHERE streamer_id=$1 AND ended_at IS NULL LIMIT 1`,
    [streamerId]
  );
  if (cur.rows?.[0]?.id) return Number(cur.rows[0].id);

  // started_at = live_started_at si dispo, sinon NOW
  const ins = await pool.query(
    `INSERT INTO live_sessions (streamer_id, started_at)
     VALUES (
       $1,
       COALESCE((SELECT live_started_at FROM streamers WHERE id=$1), NOW())
     )
     RETURNING id`,
    [streamerId]
  );

  return Number(ins.rows[0].id);
}

async function countActiveViewers(liveSessionId: number) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM viewer_sessions
     WHERE live_session_id=$1
       AND ended_at IS NULL
       AND last_heartbeat_at >= (NOW() - ($2::int * INTERVAL '1 second'))`,
    [liveSessionId, HEARTBEAT_TTL_SECONDS]
  );
  return Number(r.rows?.[0]?.n || 0);
}

function assertPeriod(p: any): "daily" | "weekly" | "monthly" {
  const s = String(p || "daily");
  if (s === "daily" || s === "weekly" || s === "monthly") return s;
  return "daily";
}

function assertMetric(m: any): "viewers_avg" | "viewers_peak" | "messages" | "watch_time" {
  const s = String(m || "viewers_avg");
  if (s === "viewers_avg" || s === "viewers_peak" || s === "messages" || s === "watch_time") return s as any;
  return "viewers_avg";
}

async function getMyStreamerId(userId: number) {
  const r = await pool.query(
    `SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  return r.rows?.[0]?.id ? Number(r.rows[0].id) : 0;
}

function growthPct(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (prev === 0) return cur === 0 ? 0 : null; // "—" côté UI
  return ((cur - prev) / prev) * 100;
}

export function registerStatsRoutes(app: Express) {
  /**
   * Public heartbeat (viewer tracking)
   * body: { slug, anonId }
   * Authorization optional (si connecté => on track user_id)
   */
  app.post(
    "/watch/heartbeat",
    a(async (req, res) => {
      const slug = String(req.body?.slug || "").trim();
      const anonId = cleanAnonId(req.body?.anonId);

      const user = decodeOptionalUser(req);

      // si pas user => anonId obligatoire
      if (!user && !anonId) {
        return res.status(400).json({ ok: false, error: "anon_required" });
      }

      const meta = await getStreamerBySlug(slug);
      if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

      // Si OFFLINE => on ne crée rien, mais on répond ok (utile front)
      if (!meta.isLive) {
        return res.json({ ok: true, isLive: false });
      }

      const liveSessionId = await ensureOpenLiveSession(meta.id);

      const viewerKey = user ? `u:${user.id}` : `a:${anonId}`;
      const ua = String(req.headers["user-agent"] || "").slice(0, 300) || null;
      const ip = (req.ip || null) as any;

      await pool.query(
        `INSERT INTO viewer_sessions
           (live_session_id, streamer_id, viewer_key, user_id, anon_id, started_at, last_heartbeat_at, ended_at, user_agent, ip)
         VALUES
           ($1,$2,$3,$4,$5,NOW(),NOW(),NULL,$6,$7)
         ON CONFLICT (live_session_id, viewer_key)
         DO UPDATE SET last_heartbeat_at=NOW(), ended_at=NULL`,
        [liveSessionId, meta.id, viewerKey, user ? user.id : null, user ? null : anonId, ua, ip]
      );

      // sample / minute
      const viewersNow = await countActiveViewers(liveSessionId);

      await pool.query(
        `INSERT INTO stream_viewer_samples (streamer_id, live_session_id, bucket_ts, viewers)
         VALUES ($1,$2,date_trunc('minute', NOW()),$3)
         ON CONFLICT (streamer_id, bucket_ts)
         DO UPDATE SET viewers=EXCLUDED.viewers, live_session_id=EXCLUDED.live_session_id`,
        [meta.id, liveSessionId, viewersNow]
      );

      res.json({ ok: true, isLive: true, viewersNow });
    })
  );

  /**
   * Streamer dashboard: summary stats (current period + prev period)
   * query: period=daily|weekly|monthly, cursor=YYYY-MM-DD
   */
  app.get(
    "/streamer/me/stats/summary",
    requireAuth,
    a(async (req: any, res) => {
      if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      const period = assertPeriod(req.query.period);
      const cursor = String(req.query.cursor || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

      const streamerId = await getMyStreamerId(req.user!.id);
      if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

      const q = await pool.query(
        `
WITH input AS (
  SELECT
    $1::int AS streamer_id,
    $2::text AS period,
    $3::date AS cursor_date
),
base AS (
  SELECT
    streamer_id,
    period,
    cursor_date,
    CASE
      WHEN period='daily' THEN cursor_date::timestamp
      WHEN period='weekly' THEN date_trunc('week', cursor_date::timestamp)
      WHEN period='monthly' THEN date_trunc('month', cursor_date::timestamp)
    END AS start_local_ts
  FROM input
),
rangebase AS (
  SELECT
    streamer_id,
    period,
    (start_local_ts AT TIME ZONE '${TZ}') AS range_start,
    (
      CASE
        WHEN period='daily' THEN (start_local_ts + INTERVAL '1 day')
        WHEN period='weekly' THEN (start_local_ts + INTERVAL '1 week')
        WHEN period='monthly' THEN (start_local_ts + INTERVAL '1 month')
      END
      AT TIME ZONE '${TZ}'
    ) AS range_end,
    (
      (start_local_ts -
        CASE
          WHEN period='daily' THEN INTERVAL '1 day'
          WHEN period='weekly' THEN INTERVAL '1 week'
          WHEN period='monthly' THEN INTERVAL '1 month'
        END
      ) AT TIME ZONE '${TZ}'
    ) AS prev_start,
    (start_local_ts AT TIME ZONE '${TZ}') AS prev_end
  FROM base
),
ranges AS (
  SELECT 'cur'::text AS k, streamer_id, range_start AS start_at, range_end AS end_at FROM rangebase
  UNION ALL
  SELECT 'prev', streamer_id, prev_start, prev_end FROM rangebase
),
live AS (
  SELECT r.k,
    COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM LEAST(COALESCE(ls.ended_at, NOW()), r.end_at) - GREATEST(ls.started_at, r.start_at)))),0)::float AS stream_seconds
  FROM ranges r
  LEFT JOIN live_sessions ls
    ON ls.streamer_id=r.streamer_id
   AND ls.started_at < r.end_at
   AND COALESCE(ls.ended_at, NOW()) > r.start_at
  GROUP BY r.k
),
days AS (
  SELECT r.k,
    COALESCE(COUNT(DISTINCT d.day),0)::int AS stream_days
  FROM ranges r
  LEFT JOIN LATERAL (
    SELECT gs::date AS day
    FROM live_sessions ls
    JOIN LATERAL generate_series(
      date_trunc('day', timezone('${TZ}', GREATEST(ls.started_at, r.start_at)))::date,
      date_trunc('day', timezone('${TZ}', LEAST(COALESCE(ls.ended_at, NOW()), r.end_at - INTERVAL '1 second')))::date,
      INTERVAL '1 day'
    ) gs ON TRUE
    WHERE ls.streamer_id=r.streamer_id
      AND ls.started_at < r.end_at
      AND COALESCE(ls.ended_at, NOW()) > r.start_at
  ) d ON TRUE
  GROUP BY r.k
),
viewers AS (
  SELECT r.k,
    COALESCE(COUNT(DISTINCT vs.viewer_key),0)::int AS viewers_unique,
    COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM LEAST(COALESCE(vs.ended_at, vs.last_heartbeat_at), r.end_at) - GREATEST(vs.started_at, r.start_at)))),0)::float AS watch_seconds
  FROM ranges r
  LEFT JOIN viewer_sessions vs
    ON vs.streamer_id=r.streamer_id
   AND vs.started_at < r.end_at
   AND COALESCE(vs.ended_at, vs.last_heartbeat_at) > r.start_at
  GROUP BY r.k
),
chat AS (
  SELECT r.k,
    COALESCE(COUNT(*) FILTER (WHERE cm.deleted_at IS NULL),0)::int AS messages,
    COALESCE(COUNT(DISTINCT cm.user_id) FILTER (WHERE cm.deleted_at IS NULL),0)::int AS chatters_unique
  FROM ranges r
  LEFT JOIN chat_messages cm
    ON cm.streamer_id=r.streamer_id
   AND cm.created_at >= r.start_at
   AND cm.created_at < r.end_at
  GROUP BY r.k
),
samples AS (
  SELECT r.k,
    COALESCE(MAX(svs.viewers),0)::int AS peak_viewers,
    COALESCE(AVG(svs.viewers),0)::float AS avg_viewers
  FROM ranges r
  LEFT JOIN stream_viewer_samples svs
    ON svs.streamer_id=r.streamer_id
   AND svs.bucket_ts >= r.start_at
   AND svs.bucket_ts < r.end_at
  GROUP BY r.k
)
SELECT
  rb.period,
  rb.range_start AS "rangeStart",
  rb.range_end AS "rangeEnd",

  (SELECT stream_seconds FROM live WHERE k='cur') AS "streamSeconds",
  (SELECT stream_days FROM days WHERE k='cur') AS "streamDays",
  (SELECT viewers_unique FROM viewers WHERE k='cur') AS "viewersUnique",
  (SELECT watch_seconds FROM viewers WHERE k='cur') AS "watchSeconds",
  (SELECT messages FROM chat WHERE k='cur') AS "messages",
  (SELECT chatters_unique FROM chat WHERE k='cur') AS "chattersUnique",
  (SELECT peak_viewers FROM samples WHERE k='cur') AS "peakViewers",
  (SELECT avg_viewers FROM samples WHERE k='cur') AS "avgViewers",

  (SELECT stream_seconds FROM live WHERE k='prev') AS "prevStreamSeconds",
  (SELECT stream_days FROM days WHERE k='prev') AS "prevStreamDays",
  (SELECT viewers_unique FROM viewers WHERE k='prev') AS "prevViewersUnique",
  (SELECT watch_seconds FROM viewers WHERE k='prev') AS "prevWatchSeconds",
  (SELECT messages FROM chat WHERE k='prev') AS "prevMessages",
  (SELECT chatters_unique FROM chat WHERE k='prev') AS "prevChattersUnique",
  (SELECT peak_viewers FROM samples WHERE k='prev') AS "prevPeakViewers",
  (SELECT avg_viewers FROM samples WHERE k='prev') AS "prevAvgViewers"
FROM rangebase rb
LIMIT 1;
        `,
        [streamerId, period, cursor]
      );

      const row = q.rows?.[0];
      if (!row) return res.json({ ok: true, period, cursor, metrics: {} });

      const streamSeconds = Number(row.streamSeconds || 0);
      const streamHours = streamSeconds / 3600;

      const watchSeconds = Number(row.watchSeconds || 0);
      const watchHours = watchSeconds / 3600;

      const viewersUnique = Number(row.viewersUnique || 0);
      const avgWatchSeconds = viewersUnique > 0 ? watchSeconds / viewersUnique : 0;
      const avgWatchMinutes = avgWatchSeconds / 60;

      const messages = Number(row.messages || 0);
      const messagesPerHour = streamHours > 0 ? messages / streamHours : 0;

      const chattersUnique = Number(row.chattersUnique || 0);
      const engagementRate = viewersUnique > 0 ? chattersUnique / viewersUnique : 0;

      // prev
      const prevStreamSeconds = Number(row.prevStreamSeconds || 0);
      const prevStreamHours = prevStreamSeconds / 3600;
      const prevWatchSeconds = Number(row.prevWatchSeconds || 0);
      const prevWatchHours = prevWatchSeconds / 3600;
      const prevViewersUnique = Number(row.prevViewersUnique || 0);
      const prevAvgWatchSeconds = prevViewersUnique > 0 ? prevWatchSeconds / prevViewersUnique : 0;
      const prevAvgWatchMinutes = prevAvgWatchSeconds / 60;

      const prevMessages = Number(row.prevMessages || 0);
      const prevMessagesPerHour = prevStreamHours > 0 ? prevMessages / prevStreamHours : 0;

      const prevChattersUnique = Number(row.prevChattersUnique || 0);
      const prevEngagementRate = prevViewersUnique > 0 ? prevChattersUnique / prevViewersUnique : 0;

      const peakViewers = Number(row.peakViewers || 0);
      const avgViewers = Number(row.avgViewers || 0);

      const prevPeakViewers = Number(row.prevPeakViewers || 0);
      const prevAvgViewers = Number(row.prevAvgViewers || 0);

      res.json({
        ok: true,
        period,
        cursor,
        rangeStart: new Date(row.rangeStart).toISOString(),
        rangeEnd: new Date(row.rangeEnd).toISOString(),
        metrics: {
          peakViewers: { value: peakViewers, prev: prevPeakViewers, growthPct: growthPct(peakViewers, prevPeakViewers) },
          avgViewers: { value: avgViewers, prev: prevAvgViewers, growthPct: growthPct(avgViewers, prevAvgViewers) },

          streamHours: { value: streamHours, prev: prevStreamHours, growthPct: growthPct(streamHours, prevStreamHours) },
          streamDays: { value: Number(row.streamDays || 0), prev: Number(row.prevStreamDays || 0), growthPct: growthPct(Number(row.streamDays || 0), Number(row.prevStreamDays || 0)) },

          viewersUnique: { value: viewersUnique, prev: prevViewersUnique, growthPct: growthPct(viewersUnique, prevViewersUnique) },

          watchHours: { value: watchHours, prev: prevWatchHours, growthPct: growthPct(watchHours, prevWatchHours) },
          avgWatchMinutes: { value: avgWatchMinutes, prev: prevAvgWatchMinutes, growthPct: growthPct(avgWatchMinutes, prevAvgWatchMinutes) },

          messages: { value: messages, prev: prevMessages, growthPct: growthPct(messages, prevMessages) },
          messagesPerHour: { value: messagesPerHour, prev: prevMessagesPerHour, growthPct: growthPct(messagesPerHour, prevMessagesPerHour) },

          chattersUnique: { value: chattersUnique, prev: prevChattersUnique, growthPct: growthPct(chattersUnique, prevChattersUnique) },
          engagementRate: { value: engagementRate, prev: prevEngagementRate, growthPct: growthPct(engagementRate, prevEngagementRate) },
        },
      });
    })
  );

/**
 * Timeseries pour le graphe (V1)
 * metric: viewers_avg | viewers_peak | messages | watch_time
 */
app.get(
  "/streamer/me/stats/timeseries",
  requireAuth,
  a(async (req: any, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const period = assertPeriod(req.query.period);
    const cursor =
      String(req.query.cursor || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const metric = assertMetric(req.query.metric);

    const streamerId = await getMyStreamerId(req.user!.id);
    if (!streamerId) {
      return res.status(404).json({ ok: false, error: "streamer_not_found" });
    }

    const step = period === "daily" ? "1 hour" : "1 day";
    const bucketSeconds = period === "daily" ? 3600 : 86400;

    // bucket local -> back to timestamptz
    const bucketExprSamples =
      period === "daily"
        ? `date_trunc('hour', svs.bucket_ts AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`
        : `date_trunc('day',  svs.bucket_ts AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`;

    const bucketExprChat =
      period === "daily"
        ? `date_trunc('hour', cm.created_at AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`
        : `date_trunc('day',  cm.created_at AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`;

    // ✅ FIX: qualify columns + use input.bucket_seconds so $4 always has a known type
    const aggSQL =
      metric === "messages"
        ? `
agg AS (
  SELECT ${bucketExprChat} AS bucket, COUNT(*)::float AS v
  FROM chat_messages cm
  CROSS JOIN rb
  WHERE cm.streamer_id=$1
    AND cm.deleted_at IS NULL
    AND cm.created_at >= rb.range_start
    AND cm.created_at < rb.range_end
  GROUP BY 1
)
`
        : metric === "viewers_peak"
        ? `
agg AS (
  SELECT ${bucketExprSamples} AS bucket, MAX(svs.viewers)::float AS v
  FROM stream_viewer_samples svs
  CROSS JOIN rb
  WHERE svs.streamer_id=$1
    AND svs.bucket_ts >= rb.range_start
    AND svs.bucket_ts < rb.range_end
  GROUP BY 1
)
`
: metric === "watch_time"
? `
agg AS (
  SELECT ${bucketExprSamples} AS bucket,
         (AVG(svs.viewers)::float * MAX(input.bucket_seconds)) AS v
  FROM stream_viewer_samples svs
  CROSS JOIN rb
  CROSS JOIN input
  WHERE svs.streamer_id=$1
    AND svs.bucket_ts >= rb.range_start
    AND svs.bucket_ts < rb.range_end
  GROUP BY 1
)
`
        : `
agg AS (
  SELECT ${bucketExprSamples} AS bucket, AVG(svs.viewers)::float AS v
  FROM stream_viewer_samples svs
  CROSS JOIN rb
  WHERE svs.streamer_id=$1
    AND svs.bucket_ts >= rb.range_start
    AND svs.bucket_ts < rb.range_end
  GROUP BY 1
)
`;

    const r = await pool.query(
      `
WITH input AS (
  SELECT
    $1::int      AS streamer_id,
    $2::text     AS period,
    $3::date     AS cursor_date,
    $4::float    AS bucket_seconds,  -- ✅ force type of $4 always
    $5::interval AS step_interval    -- ✅ force type of $5 always
),
base AS (
  SELECT
    input.streamer_id,
    input.period,
    input.cursor_date,
    input.bucket_seconds,
    input.step_interval,
    CASE
      WHEN input.period='daily' THEN input.cursor_date::timestamp
      WHEN input.period='weekly' THEN date_trunc('week', input.cursor_date::timestamp)
      WHEN input.period='monthly' THEN date_trunc('month', input.cursor_date::timestamp)
    END AS start_local_ts
  FROM input
),
rb AS (
  SELECT
    base.streamer_id,
    base.period,
    base.bucket_seconds,
    base.step_interval,
    (base.start_local_ts AT TIME ZONE '${TZ}') AS range_start,
    (
      CASE
        WHEN base.period='daily' THEN (base.start_local_ts + INTERVAL '1 day')
        WHEN base.period='weekly' THEN (base.start_local_ts + INTERVAL '1 week')
        WHEN base.period='monthly' THEN (base.start_local_ts + INTERVAL '1 month')
      END
      AT TIME ZONE '${TZ}'
    ) AS range_end
  FROM base
),
series AS (
  SELECT
    generate_series(rb.range_start, rb.range_end - rb.step_interval, rb.step_interval) AS bucket
  FROM rb
),
${aggSQL}
SELECT
  s.bucket AS t,
  COALESCE(a.v, 0)::float AS v
FROM series s
CROSS JOIN rb
LEFT JOIN agg a ON a.bucket = s.bucket
ORDER BY s.bucket ASC
      `,
      [streamerId, period, cursor, bucketSeconds, step]
    );

    res.json({
      ok: true,
      period,
      cursor,
      metric,
      points: (r.rows || []).map((x: any) => ({
        t: new Date(x.t).toISOString(),
        v: Number(x.v || 0),
      })),
    });
  })
);
}
