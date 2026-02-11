import { pool } from "../db.js";

type EventRow = {
  id: number;
  type: string;
  cycle_index: number;
  start_at: string;
  end_at: string;
  state: string;
  config: any;
  result: any;
};

const TZ = "Europe/Paris";
const WEEK_MS = 7 * 24 * 3600_000;

// Rotation 6 semaines
const CYCLE: string[] = [
  "clip_race",
  "viewer_week",
  "wheel_week",
  "global_chest",
  "burn_boss",
  "duo_week",
];

/** ---- TZ helpers (sans lib) ---- */
function getTzParts(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);

  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour"),
    mm: get("minute"),
    ss: get("second"),
  };
}

function tzOffsetMs(timeZone: string, date: Date) {
  // offset = (wallTime interpreted as UTC) - (actual UTC)
  const p = getTzParts(timeZone, date);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUTC - date.getTime();
}

function parisLocalToUtcMs(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
  // Convert Paris local time to UTC ms (2-pass for DST)
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let utc = guess - tzOffsetMs(TZ, new Date(guess));
  utc = guess - tzOffsetMs(TZ, new Date(utc));
  return utc;
}

function weekStartUtcMsParis(now = new Date()) {
  const p = getTzParts(TZ, now); // Paris wall date
  // weekday of that Paris date (Mon=1..Sun=7)
  const weekdayUtc = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0..6 (Sun=0)
  const weekday = weekdayUtc === 0 ? 7 : weekdayUtc;
  const deltaToMon = weekday - 1;

  // Monday 00:00 Paris of current week
  const monUtc = parisLocalToUtcMs(p.y, p.m, p.d - deltaToMon, 0, 0, 0);
  return monUtc;
}

function cycleIndexForWeek(weekStartUtcMs: number) {
  // Stable index based on weekStart bucket
  const weeksSinceEpoch = Math.floor(weekStartUtcMs / WEEK_MS);
  const idx = ((weeksSinceEpoch % 6) + 6) % 6;
  return idx;
}

/** ---- Core engine ---- */

async function getCurrentEvent(now = new Date()): Promise<EventRow | null> {
  const r = await pool.query(
    `
    SELECT *
    FROM events
    WHERE start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `
  );
  return (r.rows?.[0] as EventRow) ?? null;
}

async function ensureWeekEvent(weekStartUtcMs: number) {
  const startAt = new Date(weekStartUtcMs).toISOString();
  const endAt = new Date(weekStartUtcMs + WEEK_MS).toISOString();

  const cycle_index = cycleIndexForWeek(weekStartUtcMs);
  const type = CYCLE[cycle_index] || "viewer_week";

  // default config per type (optional: fetch from event_type_configs)
  const cfgRes = await pool.query(`SELECT config FROM event_type_configs WHERE type=$1`, [type]);
  const config = cfgRes.rows?.[0]?.config ?? {};

  await pool.query(
    `
    INSERT INTO events(type, cycle_index, start_at, end_at, state, config)
    VALUES ($1,$2,$3::timestamptz,$4::timestamptz,'scheduled',$5::jsonb)
    ON CONFLICT (start_at, end_at) DO NOTHING
    `,
    [type, cycle_index, startAt, endAt, JSON.stringify(config)]
  );
}

async function openIfNeeded(now = new Date()) {
  await pool.query(
    `
    UPDATE events
    SET state='live', updated_at=NOW()
    WHERE state='scheduled'
      AND start_at <= NOW()
      AND NOW() < end_at
    `
  );
}

async function closeIfNeeded(now = new Date()) {
  // Close all events that ended and were live/scheduled (idempotent)
  // Snapshot placeholder: result stays {} for now
  await pool.query(
    `
    UPDATE events
    SET state='closed', updated_at=NOW()
    WHERE state IN ('scheduled','live')
      AND end_at <= NOW()
    `
  );
}

export function startEventsEnginePoller(everyMs = 60_000) {
  const tick = async () => {
    try {
      const ws = weekStartUtcMsParis(new Date());
      await ensureWeekEvent(ws);
      await closeIfNeeded();
      await openIfNeeded();

      // Also pre-create next week (handy for UI/admin)
      await ensureWeekEvent(ws + WEEK_MS);
    } catch (e: any) {
      console.warn("[events-engine] tick failed", e?.message || e);
    }
  };

  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), Math.max(5_000, Number(everyMs || 60_000)));
}
