// api/src/lunaclip/clips.ts
// Wrapper clips pour LunaClip — author='lunaclip', pre=75s, post=15s.
// Stocke live_start_ts pour un matching VOD précis même après coupure de stream.

import type { Pool } from "pg";

const LUNACLIP_AUTHOR   = "lunaclip";
const LUNACLIP_PRE_SEC  = 80;   // 1m20 avant le moment détecté
const LUNACLIP_POST_SEC = 10;   // 10s après le moment détecté

const DEDUP_WINDOW_SEC  = 20;
const DEDUP_HORIZON_MS  = 6 * 3600 * 1000;

export async function addLunaClip(
  pool: Pool,
  streamerId: number,
  title: string,
  atSec: number,
  // ✅ timestamp exact du début du live courant (ms) — fourni par le scheduler
  // Si absent, fallback : on déduit depuis created_ts - atSec (moins précis)
  liveStartTs?: number | null,
): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {

  const nowMs        = Date.now();
  const at           = Math.max(0, Math.floor(atSec));
  // ✅ Si liveStartTs non fourni : estimation (comme avant, moins fiable)
  const liveStart    = (liveStartTs && liveStartTs > 0)
    ? liveStartTs
    : nowMs - at * 1000;

  // ✅ Ajouter la colonne si elle n'existe pas encore (idempotent)
  await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_start_ts BIGINT`).catch(() => {});

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT id FROM bot_clips
       WHERE streamer_id=$1
         AND author=$2
         AND ABS(at_sec - $3) <= $4
         AND created_ts >= $5
       LIMIT 1`,
      [streamerId, LUNACLIP_AUTHOR, at, DEDUP_WINDOW_SEC, nowMs - DEDUP_HORIZON_MS]
    );

    if (dup.rows?.[0]?.id) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "duplicate" };
    }

    const ins = await client.query(
      `INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts, live_start_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [streamerId, title.slice(0, 140), LUNACLIP_AUTHOR, at,
       LUNACLIP_PRE_SEC, LUNACLIP_POST_SEC, nowMs, liveStart]
    );

    await client.query("COMMIT");

    const id = Number(ins.rows?.[0]?.id ?? 0);
    console.log(`[lunaclip] clip id=${id} streamer=${streamerId} at=${at}s live_start=${liveStart} — ${title}`);
    return { ok: true, id };

  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}