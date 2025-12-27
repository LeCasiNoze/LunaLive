// api/src/dlive_poller.ts
import { pool } from "./db.js";
import { fetchDliveLiveInfo } from "./dlive.js";
import type { Server as IOServer } from "socket.io";
import { notifyFollowersGoLive } from "./notify_go_live.js";

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

async function applyLiveState(
  streamerId: number,
  isLiveNow: boolean,
  viewersNow: number,
  io?: IOServer
) {
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

      // ✅ NOTIF A (toast socket) + B (push) déclenchées ici (hors transaction)
      notifyFollowersGoLive(io, streamerId).catch(() => {});
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

type PollRow = {
  streamerId: number;

  // Provider assigné (peut être null si streamer utilise une chaîne liée sans provider assigné)
  providerAccountId: number | null;
  providerChannelSlug: string | null;

  // Chaîne effectivement pollée
  channelSlug: string;

  // "assigned" => provider_accounts ; "linked" => streamers.dlive_link_*
  source: "assigned" | "linked";
};

export function startDlivePoller(io?: IOServer) {
  if (process.env.DLIVE_POLL_DISABLED === "1") {
    console.log("[dlive] poller disabled");
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      // ✅ IMPORTANT:
      // - Si dlive_use_linked + dlive_link_displayname => on poll la chaîne liée
      // - Sinon => on poll le provider account assigné
      // - On inclut aussi les streamers qui n'ont PAS de provider account mais utilisent une chaîne liée
      const { rows } = await pool.query<PollRow>(
        `SELECT
           s.id AS "streamerId",
           pa.id AS "providerAccountId",
           pa.channel_slug AS "providerChannelSlug",
           CASE
             WHEN s.dlive_use_linked IS TRUE
              AND s.dlive_link_displayname IS NOT NULL
              AND LENGTH(TRIM(s.dlive_link_displayname)) > 0
             THEN s.dlive_link_displayname
             ELSE pa.channel_slug
           END AS "channelSlug",
           CASE
             WHEN s.dlive_use_linked IS TRUE
              AND s.dlive_link_displayname IS NOT NULL
              AND LENGTH(TRIM(s.dlive_link_displayname)) > 0
             THEN 'linked'
             ELSE 'assigned'
           END AS "source"
         FROM streamers s
         LEFT JOIN provider_accounts pa
           ON pa.provider='dlive'
          AND pa.assigned_to_streamer_id = s.id
         WHERE
           pa.assigned_to_streamer_id IS NOT NULL
           OR (
             s.dlive_use_linked IS TRUE
             AND s.dlive_link_displayname IS NOT NULL
             AND LENGTH(TRIM(s.dlive_link_displayname)) > 0
           )`
      );

      // Safety: si channelSlug null/empty (au cas où)
      const items = rows.filter((r) => r.channelSlug && String(r.channelSlug).trim().length > 0);

      await runWithConcurrency(
        items,
        async (r) => {
          try {
            const info = await fetchDliveLiveInfo(r.channelSlug);

            // ✅ On update le username au bon endroit selon la source
            if (info.username) {
              if (r.source === "assigned" && r.providerAccountId) {
                await pool.query(
                  `UPDATE provider_accounts
                   SET channel_username=$1
                   WHERE id=$2`,
                  [info.username, r.providerAccountId]
                );
              }

              if (r.source === "linked") {
                await pool.query(
                  `UPDATE streamers
                   SET dlive_link_username=$2
                   WHERE id=$1`,
                  [r.streamerId, info.username]
                );
              }
            }

            const isLive = !!info.isLive;
            const viewers = isLive ? Number(info.watchingCount ?? 0) : 0;

            await applyLiveState(r.streamerId, isLive, viewers, io);
          } catch (e) {
            console.warn("[dlive] poll failed", r.channelSlug, e);
            // Option “safe” : si tu veux éviter les LIVE fantômes en cas d’erreur réseau :
            // await applyLiveState(r.streamerId, false, 0).catch(() => {});
          }
        },
        CONCURRENCY
      );

      console.log(`[dlive] poll tick ok (${items.length} channels)`);
    } finally {
      running = false;
    }
  };

  tick().catch((e) => console.warn("[dlive] first tick failed", e));
  const id = setInterval(() => tick().catch((e) => console.warn("[dlive] tick failed", e)), INTERVAL_MS);
  (id as any).unref?.();
}
