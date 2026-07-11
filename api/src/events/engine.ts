// api/src/events/engine.ts
import { pool } from "../db.js";
import { recomputeViewerWeek } from "./viewer_week.js";
import { recomputeGlobalChest } from "./global_chest.js";
import { recomputeClipRace } from "./clip_race.js";
import { recomputeBurnBoss } from "./burn_boss.js";
import { proposeDuos, recomputeDuoWeek } from "./duo_week.js";
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
export const WEEK_MS = 7 * 24 * 3600_000;

// Ordre de rotation ACTÉ par Lucas (11 juil) : l'event de lancement est la
// Semaine du Viewer (déclenchée par le cadenas, cf launch_lock.ts), puis
// la rotation hebdo reprend à partir de son ANCRE (fin de l'event 1).
const CYCLE: string[] = [
  "viewer_week",
  "clip_race",
  "global_chest",
  "wheel_week",
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

export function weekStartUtcMsParis(now = new Date()) {
  const p = tzParts(now);
  const wd = weekdayIndexFr(p.weekday);
  const deltaToMon = wd - 1;

  const safeNoonUtc = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
  const mondayNoonUtc = safeNoonUtc - deltaToMon * 24 * 3600_000;
  const pm = tzParts(new Date(mondayNoonUtc));

  return parisMidnightUtcMs(pm.year, pm.month, pm.day);
}

// Rotation ancrée sur la fin de l'event de lancement (anchorMs = un lundi
// Paris) : la semaine qui démarre à l'ancre = clip_race (index 1, le
// viewer_week index 0 étant l'event de lancement lui-même).
function cycleIndexForWeek(weekStartUtcMs: number, anchorMs: number | null) {
  if (anchorMs && Number.isFinite(anchorMs)) {
    const weeksSinceAnchor = Math.round((weekStartUtcMs - anchorMs) / WEEK_MS);
    return (((weeksSinceAnchor + 1) % 6) + 6) % 6;
  }
  const weeksSinceEpoch = Math.floor(weekStartUtcMs / WEEK_MS);
  return ((weeksSinceEpoch % 6) + 6) % 6;
}

// flag de lancement (app_flags.events_launch) — lu à chaque tick (60s).
// Tant que le cadenas n'est pas déverrouillé : AUCUNE création/ouverture
// d'event (la page /event montre la scène cadenas).
async function getLaunchFlagRow(): Promise<{ unlocked: boolean; anchorMs: number | null }> {
  try {
    const r = await pool.query(`SELECT value FROM app_flags WHERE key='events_launch'`);
    const v = r.rows?.[0]?.value ?? {};
    return { unlocked: !!v.unlocked, anchorMs: Number.isFinite(Number(v.anchorMs)) ? Number(v.anchorMs) : null };
  } catch {
    return { unlocked: false, anchorMs: null };
  }
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

async function ensureWeekEvent(weekStartUtcMs: number, anchorMs: number | null) {
  // pas de semaine hebdo pendant l'event de lancement (il court jusqu'à
  // l'ancre) ni avant elle
  if (anchorMs && weekStartUtcMs < anchorMs) return;

  const startAt = new Date(weekStartUtcMs).toISOString();
  const endAt = new Date(weekStartUtcMs + WEEK_MS).toISOString();

  const cycle_index = cycleIndexForWeek(weekStartUtcMs, anchorMs);
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
      const launch = await getLaunchFlagRow();

      if (!launch.unlocked) {
        // CADENAS FERMÉ : la plateforme est EN ATTENTE du lancement
        // communautaire → aucun event ne doit tourner. On neutralise tout
        // event de rotation (scheduled ET live) en 'archived' : réversible
        // (les scores restent en base), SANS distribution de récompenses.
        // L'event de lancement, lui, est créé sous le même verrou que le
        // passage unlocked=true (cf launch_lock.clickLock) → jamais archivé.
        await pool.query(`UPDATE events SET state='archived', updated_at=NOW() WHERE state IN ('scheduled','live')`);
      } else {
        await ensureWeekEvent(ws, launch.anchorMs);
        await closeIfNeeded();
        await openIfNeeded();
        await ensureWeekEvent(ws + WEEK_MS, launch.anchorMs);
      }
      await unfeatureExpiredStreamers();

      // ✅ recompute dans le tick (donc toutes les minutes)
      const cur = await getCurrentEvent();
      if (cur && cur.type === "viewer_week" && cur.state === "live") {
        await recomputeViewerWeek(cur.id);
      }
      // wheel_week n'est PLUS recomputé ici : les points s'accumulent à
      // chaque spin (event_scores.points +=, cf events/wheel_event.ts
      // performSpin) — un recompute écraserait cet accumulateur.
      if (cur && cur.type === "global_chest" && cur.state === "live") {
        await recomputeGlobalChest(cur.id);
      }
      if (cur && cur.type === "clip_race" && cur.state === "live") {
        await recomputeClipRace(cur.id);
      }
      if (cur && cur.type === "burn_boss" && cur.state === "live") {
        await recomputeBurnBoss(cur.id);
      }
      if (cur && cur.type === "duo_week" && cur.state === "live") {
        // proposeDuos est idempotent (skip si des duos existent déjà) : pas
        // besoin de détecter explicitement "le 1er tick", on peut l'appeler
        // à chaque tick tant que l'event est live.
        await proposeDuos(cur.id);
        await recomputeDuoWeek(cur.id);
      }
    } catch (e: any) {
      console.warn("[events-engine] tick failed", e?.message || e);
    }
  };

  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), Math.max(5_000, Number(everyMs || 60_000)));
}
