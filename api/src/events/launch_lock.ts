// Cadenas de lancement des events (décision Lucas 11 juil).
// Règle : 30 comptes ayant rempli les prérequis (features de base) ET
// cliqué le cadenas → le premier event (Semaine du Viewer) se déclenche
// immédiatement, puis la rotation hebdo reprend (ordre acté : viewer →
// clips → coffre → roue → boss → duo) ancrée sur la fin de cet event.
import { pool } from "../db.js";
import { WEEK_MS, weekStartUtcMsParis } from "./engine.js";

export const LAUNCH_LOCK_TARGET = 30;
const FLAG_KEY = "events_launch";

export type LaunchFlag = {
  unlocked: boolean;
  unlockedAt?: string;
  /** début (ms UTC) de la 1re semaine ISO APRÈS l'event de lancement —
      ancre de la rotation hebdo */
  anchorMs?: number;
};

export async function getLaunchFlag(): Promise<LaunchFlag> {
  try {
    const r = await pool.query(`SELECT value FROM app_flags WHERE key=$1`, [FLAG_KEY]);
    const v = r.rows?.[0]?.value;
    return v && typeof v === "object" ? (v as LaunchFlag) : { unlocked: false };
  } catch {
    // table pas encore migrée : considérer verrouillé (sécurité lancement)
    return { unlocked: false };
  }
}

export async function countLockClicks(): Promise<number> {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM launch_lock_clicks`);
    return Number(r.rows?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function hasClicked(userId: number): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM launch_lock_clicks WHERE user_id=$1`, [userId]);
  return !!r.rows?.[0];
}

async function tableExists(table: string) {
  const r = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  return !!r.rows?.[0]?.reg;
}

// une roue tournée = spin dans N'IMPORTE quelle table de roue (daily,
// ancienne mint, bot). Sans ça le prérequis restait décoché pour les
// comptes ayant tourné la roue avant daily_wheel_spins (bug Lucas).
async function hasAnyWheelSpin(userId: number): Promise<boolean> {
  for (const t of ["daily_wheel_spins", "wheel_spins", "bot_wheel_entries", "event_wheel_spins"]) {
    try {
      if (!(await tableExists(t))) continue;
      const r = await pool.query(`SELECT 1 FROM ${t} WHERE user_id=$1 LIMIT 1`, [userId]);
      if (r.rows?.[0]) return true;
    } catch {
      /* table/colonne absente : on passe */
    }
  }
  return false;
}

// Prérequis = découvrir les features de base (et filtre anti multi-comptes
// léger) : 1 message chat + 1 tour de roue + 1 bonus quotidien.
export async function userPrereqs(userId: number): Promise<Array<{ key: string; label: string; done: boolean }>> {
  const [msg, spin] = await Promise.all([
    pool.query(`SELECT 1 FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL LIMIT 1`, [userId]).then((r) => !!r.rows?.[0]).catch(() => false),
    hasAnyWheelSpin(userId),
  ]);

  let bonus = false;
  for (const t of ["daily_bonus_claims", "user_daily_bonus_claims", "daily_bonus_days"]) {
    if (!(await tableExists(t))) continue;
    try {
      const r = await pool.query(`SELECT 1 FROM ${t} WHERE user_id=$1 LIMIT 1`, [userId]);
      bonus = !!r.rows?.[0];
    } catch {
      bonus = false;
    }
    break;
  }

  return [
    { key: "chat", label: "Envoyer un message dans un chat", done: msg },
    { key: "wheel", label: "Faire un tour de roue", done: spin },
    { key: "daily", label: "Récupérer un bonus quotidien", done: bonus },
  ];
}

/** fin de l'event de lancement = premier lundi (Paris) ≥ maintenant + 7 j
    → l'event dure 7 à 13 jours et se termine pile sur la grille hebdo */
function launchEventEndMs(nowMs: number): number {
  const ws = weekStartUtcMsParis(new Date(nowMs));
  let end = ws + WEEK_MS; // lundi prochain
  while (end < nowMs + WEEK_MS) end += WEEK_MS;
  return end;
}

/**
 * Clic sur le cadenas. Sérialisé par advisory lock (le 30e clic déclenche
 * l'event — pas de double déclenchement possible).
 */
export async function clickLock(userId: number): Promise<
  | { ok: true; count: number; unlocked: boolean; alreadyClicked: boolean }
  | { ok: false; error: string }
> {
  const flag = await getLaunchFlag();
  if (flag.unlocked) return { ok: false, error: "already_unlocked" };

  const reqs = await userPrereqs(userId);
  if (!reqs.every((r) => r.done)) return { ok: false, error: "not_eligible" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(981731)`);

    const ins = await client.query(
      `INSERT INTO launch_lock_clicks (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
      [userId]
    );
    const alreadyClicked = !ins.rows?.[0];

    const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM launch_lock_clicks`);
    const count = Number(cnt.rows?.[0]?.n ?? 0);

    let unlocked = false;
    if (count >= LAUNCH_LOCK_TARGET) {
      // re-check du flag SOUS le lock (un clic concurrent a pu déclencher)
      const f = await client.query(`SELECT value FROM app_flags WHERE key=$1`, [FLAG_KEY]);
      const cur = (f.rows?.[0]?.value ?? {}) as LaunchFlag;
      if (!cur.unlocked) {
        const nowMs = Date.now();
        const endMs = launchEventEndMs(nowMs);

        // ÉVÉNEMENT N°1 : Semaine du Viewer, démarre immédiatement
        await client.query(
          `INSERT INTO events(type, cycle_index, start_at, end_at, state, config)
           VALUES ('viewer_week', 0, NOW(), $1::timestamptz, 'live', '{}'::jsonb)
           ON CONFLICT (start_at, end_at) DO NOTHING`,
          [new Date(endMs).toISOString()]
        );

        const value: LaunchFlag = { unlocked: true, unlockedAt: new Date(nowMs).toISOString(), anchorMs: endMs };
        await client.query(
          `INSERT INTO app_flags (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value=$2::jsonb, updated_at=NOW()`,
          [FLAG_KEY, JSON.stringify(value)]
        );
      }
      unlocked = true;
    }

    await client.query("COMMIT");
    return { ok: true, count, unlocked, alreadyClicked };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
