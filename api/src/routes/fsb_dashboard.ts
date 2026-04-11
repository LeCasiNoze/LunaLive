import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { ensureBotClips } from "../bot_clips/store.js";
import { requireFsbAccess } from "./fsb_guard.js";

function parseDateOnly(input: any, fallback: string) {
  const value = String(input || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function normalizeDateTime(value: any) {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export const fsbDashboardRouter = Router();

fsbDashboardRouter.use("/fsb/dashboard", requireAuth, requireFsbAccess);

fsbDashboardRouter.get(
  "/fsb/dashboard/instagram",
  a(async (req, res) => {
    await ensureBotClips();

    const today = new Date().toISOString().slice(0, 10);
    const from = parseDateOnly((req as any).query?.from, today);
    const to = parseDateOnly((req as any).query?.to, addDays(from, 30));

    const itemsQuery = await pool.query(
      `
      SELECT
        pj.id,
        pj.clip_id,
        pj.status,
        pj.title,
        pj.description,
        pj.scheduled_at,
        to_char(pj.scheduled_at, 'YYYY-MM-DD') AS scheduled_day,
        to_char(pj.scheduled_at, 'HH24:MI') AS scheduled_time,
        pj.platform_url,
        pj.error_msg,
        pj.created_at,
        pj.started_at,
        pj.finished_at,
        ej.output_url,
        bc.thumbnail_url,
        st.slug AS streamer_slug,
        st.display_name AS streamer_name
      FROM publish_jobs pj
      LEFT JOIN edit_jobs ej
        ON ej.id = pj.edit_job_id
      LEFT JOIN bot_clips bc
        ON bc.id = pj.clip_id
      LEFT JOIN streamers st
        ON st.id = bc.streamer_id
      WHERE pj.platform = 'instagram'
        AND pj.scheduled_at >= $1::timestamp
        AND pj.scheduled_at < $2::timestamp
      ORDER BY pj.scheduled_at ASC, pj.id ASC
      `,
      [from, to]
    );

    const summaryQuery = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_in_range,
        COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled_in_range,
        COUNT(*) FILTER (WHERE status = 'done')::int AS published_in_range,
        COUNT(*) FILTER (WHERE status = 'error')::int AS errors_in_range,
        COUNT(*) FILTER (WHERE status = 'uploading')::int AS uploading_in_range,
        (
          SELECT COUNT(*)::int
          FROM publish_jobs
          WHERE platform = 'instagram'
            AND status = 'done'
        ) AS published_all_time,
        (
          SELECT COUNT(*)::int
          FROM publish_jobs
          WHERE platform = 'instagram'
            AND status = 'scheduled'
            AND scheduled_at >= NOW()
        ) AS upcoming_all_time
      FROM publish_jobs
      WHERE platform = 'instagram'
        AND scheduled_at >= $1::timestamp
        AND scheduled_at < $2::timestamp
      `,
      [from, to]
    );

    const recentPublishedQuery = await pool.query(
      `
      SELECT
        pj.id,
        pj.clip_id,
        COALESCE(NULLIF(pj.title, ''), NULLIF(bc.title, ''), 'Clip Instagram') AS title,
        pj.platform_url,
        pj.finished_at,
        bc.thumbnail_url
      FROM publish_jobs pj
      LEFT JOIN bot_clips bc
        ON bc.id = pj.clip_id
      WHERE pj.platform = 'instagram'
        AND pj.status = 'done'
      ORDER BY COALESCE(pj.finished_at, pj.scheduled_at) DESC, pj.id DESC
      LIMIT 5
      `
    );

    const timelineQuery = await pool.query(
      `
      SELECT
        to_char(pj.scheduled_at, 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE pj.status = 'scheduled')::int AS scheduled_count,
        COUNT(*) FILTER (WHERE pj.status = 'done')::int AS published_count,
        COUNT(*) FILTER (WHERE pj.status = 'error')::int AS error_count,
        COUNT(*) FILTER (WHERE pj.status = 'uploading')::int AS uploading_count
      FROM publish_jobs pj
      WHERE pj.platform = 'instagram'
        AND pj.scheduled_at >= $1::timestamp
        AND pj.scheduled_at < $2::timestamp
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [from, to]
    );

    const topStreamersQuery = await pool.query(
      `
      SELECT
        st.slug AS streamer_slug,
        COALESCE(NULLIF(st.display_name, ''), NULLIF(bc.source_displayname, ''), 'Sans streamer') AS streamer_name,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE pj.status = 'scheduled')::int AS scheduled_count,
        COUNT(*) FILTER (WHERE pj.status = 'done')::int AS published_count,
        COUNT(*) FILTER (WHERE pj.status = 'error')::int AS error_count,
        COUNT(*) FILTER (WHERE pj.status = 'uploading')::int AS uploading_count
      FROM publish_jobs pj
      LEFT JOIN bot_clips bc
        ON bc.id = pj.clip_id
      LEFT JOIN streamers st
        ON st.id = bc.streamer_id
      WHERE pj.platform = 'instagram'
        AND pj.scheduled_at >= $1::timestamp
        AND pj.scheduled_at < $2::timestamp
      GROUP BY
        st.slug,
        COALESCE(NULLIF(st.display_name, ''), NULLIF(bc.source_displayname, ''), 'Sans streamer')
      ORDER BY published_count DESC, total_count DESC, streamer_name ASC
      LIMIT 8
      `,
      [from, to]
    );

    const recentErrorsQuery = await pool.query(
      `
      SELECT
        pj.id,
        pj.clip_id,
        COALESCE(NULLIF(pj.title, ''), NULLIF(bc.title, ''), 'Clip Instagram') AS title,
        pj.scheduled_at,
        pj.error_msg,
        pj.platform_url,
        ej.output_url,
        bc.thumbnail_url,
        st.slug AS streamer_slug,
        COALESCE(NULLIF(st.display_name, ''), NULLIF(bc.source_displayname, ''), 'Sans streamer') AS streamer_name
      FROM publish_jobs pj
      LEFT JOIN edit_jobs ej
        ON ej.id = pj.edit_job_id
      LEFT JOIN bot_clips bc
        ON bc.id = pj.clip_id
      LEFT JOIN streamers st
        ON st.id = bc.streamer_id
      WHERE pj.platform = 'instagram'
        AND pj.status = 'error'
      ORDER BY COALESCE(pj.finished_at, pj.started_at, pj.scheduled_at, pj.created_at) DESC, pj.id DESC
      LIMIT 5
      `
    );

    const summaryRow = summaryQuery.rows[0] || {};

    return res.json({
      ok: true,
      range: { from, to },
      summary: {
        totalInRange: Number(summaryRow.total_in_range || 0),
        scheduledInRange: Number(summaryRow.scheduled_in_range || 0),
        publishedInRange: Number(summaryRow.published_in_range || 0),
        errorsInRange: Number(summaryRow.errors_in_range || 0),
        uploadingInRange: Number(summaryRow.uploading_in_range || 0),
        publishedAllTime: Number(summaryRow.published_all_time || 0),
        upcomingAllTime: Number(summaryRow.upcoming_all_time || 0),
      },
      items: itemsQuery.rows.map((row) => ({
        id: Number(row.id || 0),
        clipId: row.clip_id == null ? null : Number(row.clip_id),
        title: String(row.title || "Clip Instagram"),
        description: row.description == null ? null : String(row.description),
        status: String(row.status || ""),
        scheduledAt: normalizeDateTime(row.scheduled_at),
        scheduledDay: row.scheduled_day == null ? null : String(row.scheduled_day),
        scheduledTime: row.scheduled_time == null ? null : String(row.scheduled_time),
        platformUrl: row.platform_url == null ? null : String(row.platform_url),
        errorMessage: row.error_msg == null ? null : String(row.error_msg),
        createdAt: normalizeDateTime(row.created_at),
        startedAt: normalizeDateTime(row.started_at),
        finishedAt: normalizeDateTime(row.finished_at),
        outputUrl: row.output_url == null ? null : String(row.output_url),
        thumbnailUrl: row.thumbnail_url == null ? null : String(row.thumbnail_url),
        streamerSlug: row.streamer_slug == null ? null : String(row.streamer_slug),
        streamerName: row.streamer_name == null ? null : String(row.streamer_name),
      })),
      recentPublished: recentPublishedQuery.rows.map((row) => ({
        id: Number(row.id || 0),
        clipId: row.clip_id == null ? null : Number(row.clip_id),
        title: String(row.title || "Clip Instagram"),
        platformUrl: row.platform_url == null ? null : String(row.platform_url),
        finishedAt: normalizeDateTime(row.finished_at),
        thumbnailUrl: row.thumbnail_url == null ? null : String(row.thumbnail_url),
      })),
      timeline: timelineQuery.rows.map((row) => ({
        day: String(row.day || ""),
        totalCount: Number(row.total_count || 0),
        scheduledCount: Number(row.scheduled_count || 0),
        publishedCount: Number(row.published_count || 0),
        errorCount: Number(row.error_count || 0),
        uploadingCount: Number(row.uploading_count || 0),
      })),
      topStreamers: topStreamersQuery.rows.map((row) => ({
        streamerSlug: row.streamer_slug == null ? null : String(row.streamer_slug),
        streamerName: row.streamer_name == null ? null : String(row.streamer_name),
        totalCount: Number(row.total_count || 0),
        scheduledCount: Number(row.scheduled_count || 0),
        publishedCount: Number(row.published_count || 0),
        errorCount: Number(row.error_count || 0),
        uploadingCount: Number(row.uploading_count || 0),
      })),
      recentErrors: recentErrorsQuery.rows.map((row) => ({
        id: Number(row.id || 0),
        clipId: row.clip_id == null ? null : Number(row.clip_id),
        title: String(row.title || "Clip Instagram"),
        scheduledAt: normalizeDateTime(row.scheduled_at),
        errorMessage: row.error_msg == null ? null : String(row.error_msg),
        platformUrl: row.platform_url == null ? null : String(row.platform_url),
        outputUrl: row.output_url == null ? null : String(row.output_url),
        thumbnailUrl: row.thumbnail_url == null ? null : String(row.thumbnail_url),
        streamerSlug: row.streamer_slug == null ? null : String(row.streamer_slug),
        streamerName: row.streamer_name == null ? null : String(row.streamer_name),
      })),
    });
  })
);
