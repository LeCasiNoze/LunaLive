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
        async (r: { channelSlug: string; streamerId: number }) => {
          try {
            const info = await fetchDliveLiveInfo(r.channelSlug);

            const isLive = info.isLive;
            const viewers = isLive ? (info.watchingCount ?? 0) : 0;

            // MVP: on met à jour is_live + viewers (on ne force pas title)
            await pool.query(
              `UPDATE streamers
               SET is_live=$1, viewers=$2, updated_at=NOW()
               WHERE id=$3`,
              [isLive, viewers, r.streamerId]
            );
          } catch (e) {
            console.warn("[dlive] poll failed", r.channelSlug, e);
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
  // Render: évite de bloquer un shutdown propre
  (id as any).unref?.();
}
