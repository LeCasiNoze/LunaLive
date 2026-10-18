import type {Pool} from 'pg';

export async function mig151_call_external_identity(pool:Pool){
  await pool.query(`ALTER TABLE calls_queue ADD COLUMN IF NOT EXISTS external_actor_key TEXT NULL;
    CREATE INDEX IF NOT EXISTS calls_queue_external_actor_idx ON calls_queue(streamer_id,external_actor_key) WHERE external_actor_key IS NOT NULL;
    UPDATE calls_queue SET external_actor_key=username
      WHERE user_id=0 AND external_actor_key IS NULL AND username ~ '^(kick|twitch):[0-9]+$';
    UPDATE calls_queue q SET username=observed.username FROM (
      SELECT DISTINCT ON(e.streamer_id,e.platform,e.user_id)
        e.streamer_id,e.platform || ':' || e.user_id AS actor_key,m.username
      FROM multichat_bridge_events e JOIN chat_messages m
        ON m.streamer_id=e.streamer_id AND m.external_source=e.platform AND m.external_msg_id=e.message_id
      WHERE m.username IS NOT NULL AND length(trim(m.username)) BETWEEN 1 AND 50
      ORDER BY e.streamer_id,e.platform,e.user_id,m.created_at DESC,m.id DESC
    ) observed
    WHERE q.user_id=0 AND q.streamer_id=observed.streamer_id AND q.external_actor_key=observed.actor_key
      AND q.username ~ '^(kick|twitch):[0-9]+$';`);
}
