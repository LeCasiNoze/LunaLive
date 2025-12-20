// api/src/dlive_poller.ts
import { pool } from "./db.js";
import { fetchDliveLiveInfo } from "./dlive.js";

const INTERVAL_MS = Number(process.env.DLIVE_POLL_INTERVAL_MS || 30_000);
const CONCURRENCY = Math.max(1, Number(process.env.DLIVE_POLL_CONCURRENCY || 5));

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
) {
  const q = items.slice();
  const n = Math.min(concurrency, q.length);
  const workers = Array.from({ length: n }, async () => {
    while (q.length) {
      const item = q.shift()!;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function applyLiveState(streamerId: number, isLiveNow: boolean, viewersNow: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const prev = await client.query(
      `SELECT is_live AS "isLive"
       FROM streamers
       WHERE id=$1
       FOR UPDATE`,
      [streamerId]
    );

    const wasLive = !!prev.rows?.[0]?.isLive;

    // OFF -> ON
    if (isLiveNow && !wasLive) {
      await client.query(
        `UPDATE streamers
         SET is_live=TRUE,
             viewers=$2,
             live_started_at=NOW(),
             updated_at=NOW()
         WHERE id=$1`,
        [streamerId, viewersNow]
      );

      // 1 live ouvert max / streamer
      await client.query(
        `INSERT INTO live_sessions (streamer_id, started_at)
         VALUES ($1, NOW())
         ON CONFLICT (streamer_id) WHERE ended_at IS NULL
         DO NOTHING`,
        [streamerId]
      );

      await client.query("COMMIT");
      return;
    }

    // ON -> OFF
    if (!isLiveNow && wasLive) {
      await client.query(
        `UPDATE streamers
         SET is_live=FALSE,
             viewers=0,
             live_started_at=NULL,
             updated_at=NOW()
         WHERE id=$1`,
        [streamerId]
      );

      await client.query(
        `UPDATE live_sessions
         SET ended_at=NOW()
         WHERE streamer_id=$1
           AND ended_at IS NULL`,
        [streamerId]
      );

      // ferme toutes les viewer sessions encore ouvertes
      await client.query(
        `UPDATE viewer_sessions
         SET ended_at = COALESCE(last_heartbeat_at, NOW())
         WHERE streamer_id=$1
           AND ended_at IS NULL`,
        [streamerId]
      );

      await client.query("COMMIT");
      return;
    }

    // Pas de transition (ON->ON ou OFF->OFF)
    if (isLiveNow) {
      await client.query(
        `UPDATE streamers
         SET viewers=$2, updated_at=NOW()
         WHERE id=$1`,
        [streamerId, viewersNow]
      );
    } else {
      await client.query(
        `UPDATE streamers
         SET is_live=FALSE,
             viewers=0,
             live_started_at=NULL,
             updated_at=NOW()
         WHERE id=$1`,
        [streamerId]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export function startDlivePoller() {
  if (process.env.DLIVE_POLL_DISABLED === "1") {
    console.log("[dlive] poller disabled");
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const { rows } = await pool.query(
        `SELECT pa.id,
                pa.channel_slug AS "channelSlug",
                pa.assigned_to_streamer_id AS "streamerId"
         FROM provider_accounts pa
         WHERE pa.provider='dlive'
           AND pa.assigned_to_streamer_id IS NOT NULL`
      );

      await runWithConcurrency(
        rows,
        async (r: { id: number; channelSlug: string; streamerId: number }) => {
          try {
            const info = await fetchDliveLiveInfo(r.channelSlug);

            if (info.username) {
              await pool.query(
                `UPDATE provider_accounts
                 SET channel_username=$1
                 WHERE id=$2`,
                [info.username, r.id]
              );
            }

            const isLive = !!info.isLive;
            const viewers = isLive ? Number(info.watchingCount ?? 0) : 0;

            // ✅ la logique ON/OFF est ici maintenant
            await applyLiveState(r.streamerId, isLive, viewers);
          } catch (e) {
            console.warn("[dlive] poll failed", r.channelSlug, e);
            // Option “safe” : si tu veux éviter les LIVE fantômes en cas d’erreur réseau,
            // tu peux décommenter ça (ça forcera offline sur échec de poll)
            // await applyLiveState(r.streamerId, false, 0).catch(() => {});
          }
        },
        CONCURRENCY
      );

      console.log(`[dlive] poll tick ok (${rows.length} accounts)`);
    } finally {
      running = false;
    }
  };

  tick().catch((e) => console.warn("[dlive] first tick failed", e));
  const id = setInterval(() => tick().catch((e) => console.warn("[dlive] tick failed", e)), INTERVAL_MS);
  (id as any).unref?.();
}
