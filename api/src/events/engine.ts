// api/src/events/engine.ts
import { pool } from "../db.js";
import { recomputeViewerWeek } from "./viewer_week.js";
import { recomputeWheelWeek } from "./wheel_week.js";
import { recomputeGlobalChest } from "./global_chest.js";
import { recomputeClipRace } from "./clip_race.js";
import { recomputeBurnBoss } from "./burn_boss.js";
import { closeAndDistribute, EVENT_REWARD_CONFIGS } from "./rewards.js";

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

const CYCLE: string[] = [
  "clip_race",
  "viewer_week",
  "wheel_week",
  "global_chest",
  "burn_boss",
  "duo_week",
];

/** ---- TZ helpers (Intl, Paris-safe) ---- */
function tzParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string, def = "0") => parts.find((p) => p.type === t)?.value ?? def;

  return {
    year: Number(get("year", "1970")),
    month: Number(get("month", "1")),
    day: Number(get("day", "1")),
    hour: Number(get("hour", "0")),
    minute: Number(get("minute", "0")),
    second: Number(get("second", "0")),
    weekday: get("weekday", "lun."),
  };
}

function weekdayIndexFr(w: string) {
  const s = String(w || "").toLowerCase();
  if (s.startsWith("lun")) return 1;
  if (s.startsWith("mar")) return 2;
  if (s.startsWith("mer")) return 3;
  if (s.startsWith("jeu")) return 4;
  if (s.startsWith("ven")) return 5;
  if (s.startsWith("sam")) return 6;
  return 7;
}

function tzOffsetMsAt(date: Date) {
  const p = tzParts(date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

function parisMidnightUtcMs(y: number, m: number, d: number) {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let utc = guess - tzOffsetMsAt(new Date(guess));
  utc = guess - tzOffsetMsAt(new Date(utc));
  return utc;
}

function weekStartUtcMsParis(now = new Date()) {
  const p = tzParts(now);
  const wd = weekdayIndexFr(p.weekday);
  const deltaToMon = wd - 1;

  const safeNoonUtc = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
  const mondayNoonUtc = safeNoonUtc - deltaToMon * 24 * 3600_000;
  const pm = tzParts(new Date(mondayNoonUtc));

  return parisMidnightUtcMs(pm.year, pm.month, pm.day);
}

function cycleIndexForWeek(weekStartUtcMs: number) {
  const weeksSinceEpoch = Math.floor(weekStartUtcMs / WEEK_MS);
  return ((weeksSinceEpoch % 6) + 6) % 6;
}

/** ---- Core engine ---- */

async function getCurrentEvent(): Promise<EventRow | null> {
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

async function openIfNeeded() {
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

async function closeIfNeeded() {
  const closed = await pool.query(
    `
    UPDATE events
    SET state='closed', updated_at=NOW()
    WHERE state IN ('scheduled','live')
      AND end_at <= NOW()
    RETURNING id, type
    `
  );

  // Clôture générique = state='closed' (fait ci-dessus) pour tous les types.
  // Distribution réelle branchée pour tout type ayant une config de reward
  // (cf EVENT_REWARD_CONFIGS + son ranking provider dans rewards.ts).
  for (const row of closed.rows || []) {
    if (!EVENT_REWARD_CONFIGS[String(row.type)]) continue;
    try {
      await closeAndDistribute(Number(row.id));
    } catch (e: any) {
      console.warn("[events-engine] closeAndDistribute failed", row.id, e?.message || e);
    }
  }
}

// Récompense "featured temporaire" (clip_race, cf rewards.ts distributeClipRace) :
// nettoyage générique, indépendant du type d'event courant.
async function unfeatureExpiredStreamers() {
  await pool.query(
    `
    UPDATE streamers
    SET featured = false, featured_until = NULL, updated_at = NOW()
    WHERE featured_until IS NOT NULL AND featured_until <= NOW()
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
      await ensureWeekEvent(ws + WEEK_MS);
      await unfeatureExpiredStreamers();

      // ✅ recompute dans le tick (donc toutes les minutes)
      const cur = await getCurrentEvent();
      if (cur && cur.type === "viewer_week" && cur.state === "live") {
        await recomputeViewerWeek(cur.id);
      }
      if (cur && cur.type === "wheel_week" && cur.state === "live") {
        await recomputeWheelWeek(cur.id);
      }
      if (cur && cur.type === "global_chest" && cur.state === "live") {
        await recomputeGlobalChest(cur.id);
      }
      if (cur && cur.type === "clip_race" && cur.state === "live") {
        await recomputeClipRace(cur.id);
      }
      if (cur && cur.type === "burn_boss" && cur.state === "live") {
        await recomputeBurnBoss(cur.id);
      }
    } catch (e: any) {
      console.warn("[events-engine] tick failed", e?.message || e);
    }
  };

  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), Math.max(5_000, Number(everyMs || 60_000)));
}
