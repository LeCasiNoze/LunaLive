// api/src/lunaclip/clips.ts
// Wrapper autour de la logique clips du bot pour LunaClip.
// Réutilise la table bot_clips existante avec author='lunaclip'.

import type { Pool } from "pg";

const LUNACLIP_AUTHOR = "lunaclip";

// Même logique de déduplication que le bot (±20s, 6h)
const DEDUP_WINDOW_SEC  = 20;
const DEDUP_HORIZON_MS  = 6 * 3600 * 1000;

// Limite de clips par streamer si pas d'abo (réutilise la même que le bot)
// LunaClip bypass la limite car c'est un outil interne admin
const LUNACLIP_UNLIMITED = true;

export async function addLunaClip(
  pool: Pool,
  streamerId: number,
  title: string,
  atSec: number,
): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {

  const nowMs = Date.now();
  const at    = Math.max(0, Math.floor(atSec));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Déduplication ±20s dans les 6 dernières heures pour lunaclip
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
      `INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts)
       VALUES ($1, $2, $3, $4, 105, 15, $5)
       RETURNING id`,
      [streamerId, title.slice(0, 140), LUNACLIP_AUTHOR, at, nowMs]
    );

    await client.query("COMMIT");

    const id = Number(ins.rows?.[0]?.id ?? 0);
    console.log(`[lunaclip] clip créé id=${id} streamer=${streamerId} at=${at}s — ${title}`);
    return { ok: true, id };

  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}