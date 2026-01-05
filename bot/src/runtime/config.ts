import type { Pool } from "pg";
import type { BotAutopost, BotCommand } from "../core/types.js";

export async function loadCommands(pool: Pool, streamerId: number): Promise<Map<string, BotCommand>> {
  const map = new Map<string, BotCommand>();
  try {
    const r = await pool.query(
      `SELECT trigger, response, enabled, cooldown_sec
       FROM bot_commands
       WHERE streamer_id=$1`,
      [streamerId]
    );

    for (const row of r.rows) {
      const trigger = String(row.trigger || "").trim().toLowerCase();
      if (!trigger) continue;
      map.set(trigger, {
        trigger,
        response: String(row.response || ""),
        enabled: Boolean(row.enabled),
        cooldownSec: Number(row.cooldown_sec || 3)
      });
    }
  } catch (e: any) {
    // table missing => ok au début
    if (String(e?.code || "") !== "42P01") throw e;
  }
  return map;
}

export async function loadAutoposts(pool: Pool, streamerId: number): Promise<BotAutopost[]> {
  try {
    const r = await pool.query(
      `SELECT message, every_sec, enabled
       FROM bot_autoposts
       WHERE streamer_id=$1
       ORDER BY id ASC`,
      [streamerId]
    );
    return r.rows.map((row) => ({
      message: String(row.message || ""),
      everySec: Number(row.every_sec || 0),
      enabled: Boolean(row.enabled)
    })).filter(a => a.enabled && a.message.trim() && a.everySec > 0);
  } catch (e: any) {
    if (String(e?.code || "") !== "42P01") throw e;
    return [];
  }
}
