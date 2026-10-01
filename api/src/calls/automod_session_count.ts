import type { Pool } from "pg";

/** Admission history survives !mcall, moderator removal and slot completion. */
export async function sessionCallCount(pool: Pool, streamerId: number, sessionId: string, startedAt: string): Promise<{callCount: number; initialCallCount: number}> {
  const previous = await pool.query(`SELECT payload FROM automod_session_sync WHERE streamer_id=$1 AND session_id=$2`, [streamerId, sessionId]);
  const stored = previous.rows[0]?.payload;
  let initialCallCount = stored?.initialCallCount;
  if (!Number.isSafeInteger(initialCallCount) || initialCallCount < 0) {
    const pending = await pool.query(`SELECT COUNT(*)::int AS count FROM calls_queue WHERE streamer_id=$1 AND created_at<$2::timestamptz`, [streamerId, startedAt]);
    initialCallCount = Number(pending.rows[0]?.count ?? 0);
  }
  const admitted = await pool.query(`SELECT
    (SELECT COUNT(*) FROM calls_actions WHERE streamer_id=$1 AND action='call_add' AND created_at>=$2::timestamptz) +
    (SELECT COUNT(*) FROM calls_automod_requests WHERE streamer_id=$1 AND created_at>=$2::timestamptz) AS count`, [streamerId, startedAt]);
  return {initialCallCount, callCount: Math.max(Number(stored?.callCount ?? 0), initialCallCount + Number(admitted.rows[0]?.count ?? 0))};
}
