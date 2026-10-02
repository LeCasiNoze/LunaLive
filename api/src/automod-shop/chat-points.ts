import type { Pool } from 'pg';

// Opt-in Automod overlay only. Resolve the native identity through the archived
// Rumble message, never by username. One bounded bulk query; no per-viewer poll.
export function createChatPointsReader(client: Pick<Pool, 'query'>, now = Date.now) {
  const cache = new Map<string, { at: number; points: number }>();
  let pending: Promise<void> | null = null;
  return async (streamerId: number, messages: any[]): Promise<any[]> => {
    const recent = messages.slice(-8);
    const ids = recent.filter(m => m.rumble === true && Number.isSafeInteger(m.id) && m.id > 0).map(m => m.id);
    const key = (id: number) => `${streamerId}:${id}`;
    try {
      if (pending) await pending;
      const missing = ids.filter(id => !cache.has(key(id)) || now() - cache.get(key(id))!.at >= 10_000);
      if (missing.length) {
        pending = (async () => {
          const r = await client.query(`SELECT cm.id, COALESCE(a.balance-a.reserved,0) AS points
            FROM chat_messages cm
            JOIN rumble_chat_messages rm ON rm.streamer_id=cm.streamer_id AND rm.rumble_msg_id=cm.external_msg_id
            LEFT JOIN automod_points_accounts a ON a.streamer_id=cm.streamer_id AND a.rumble_user_id=rm.rumble_user_id
            WHERE cm.streamer_id=$1 AND cm.id=ANY($2::bigint[]) AND cm.deleted_at IS NULL
              AND cm.external_source='rumble' AND rm.rumble_user_id ~ '^[1-9][0-9]{0,19}$'`, [streamerId, missing]);
          for (const row of r.rows) {
            const id = Number(row.id), points = Number(row.points);
            if (missing.includes(id) && Number.isSafeInteger(points) && points >= 0) cache.set(key(id), { at: now(), points });
          }
          for (const [k, v] of cache) if (now() - v.at >= 10_000) cache.delete(k);
          while (cache.size > 256) cache.delete(cache.keys().next().value!);
        })();
        try { await pending; } finally { pending = null; }
      }
      return recent.map(m => {
        const hit = m.rumble === true ? cache.get(key(m.id)) : undefined;
        return hit && now() - hit.at < 10_000 ? { ...m, automodPoints: hit.points } : { ...m };
      });
    } catch { return recent.map(m => ({ ...m })); } // A wallet outage must not hide chat.
  };
}
