import type { PoolClient } from "pg";

export type StreamConnection = {
  provider: "dlive";
  channelSlug: string;
  rtmpUrl: string;
  streamKey: string;
};

export async function getConnectionForStreamerId(
  client: PoolClient,
  streamerId: number
): Promise<StreamConnection | null> {
  const { rows } = await client.query(
    `SELECT provider,
            channel_slug AS "channelSlug",
            rtmp_url AS "rtmpUrl",
            stream_key AS "streamKey"
     FROM provider_accounts
     WHERE assigned_to_streamer_id = $1
     LIMIT 1`,
    [streamerId]
  );
  return rows[0] || null;
}

/**
 * Assigne un compte DLive libre au streamer.
 * - Concurrency-safe: FOR UPDATE SKIP LOCKED
 * - Si déjà assigné: renvoie l’existant
 */
export async function ensureAssignedDliveAccount(
  client: PoolClient,
  streamerId: number
): Promise<StreamConnection | null> {
  const existing = await getConnectionForStreamerId(client, streamerId);
  if (existing) return existing;

  const { rows } = await client.query(
    `WITH picked AS (
       SELECT id
       FROM provider_accounts
       WHERE provider='dlive'
         AND assigned_to_streamer_id IS NULL
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE provider_accounts pa
     SET assigned_to_streamer_id = $1,
         assigned_at = NOW(),
         released_at = NULL
     WHERE pa.id IN (SELECT id FROM picked)
     RETURNING pa.provider,
               pa.channel_slug AS "channelSlug",
               pa.rtmp_url AS "rtmpUrl",
               pa.stream_key AS "streamKey"`,
    [streamerId]
  );

  return rows[0] || null;
}

export async function releaseAccountForStreamerId(
  client: PoolClient,
  streamerId: number
) {
  await client.query(
    `UPDATE provider_accounts
     SET assigned_to_streamer_id = NULL,
         released_at = NOW()
     WHERE assigned_to_streamer_id = $1`,
    [streamerId]
  );
}
