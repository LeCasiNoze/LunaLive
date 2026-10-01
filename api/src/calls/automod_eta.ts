import type { Pool } from "pg";

export function estimateCallMinutes(input: { callsAhead: number; currentIncluded: boolean; durationMs: number; deadlineAt: number | null; pausedAt: number | null; now: number }): number {
  const duration = Math.max(0, input.durationMs);
  const currentRemaining = input.deadlineAt === null ? duration : Math.max(0, input.deadlineAt - (input.pausedAt ?? input.now));
  const future = Math.max(0, input.callsAhead - (input.currentIncluded ? 1 : 0));
  return Math.max(0, Math.ceil((future * duration + currentRemaining) / 60_000));
}
/** A confirmation must still succeed if runtime telemetry is absent or stale. */
export async function automodCallWaitSuffix(pool: Pool, streamerId: number, callId: string): Promise<string> {
  try {
    const { rows } = await pool.query(`SELECT desired_enabled,runtime_status,runtime_seen_at,dashboard_settings FROM automod_control WHERE streamer_id=$1`, [streamerId]);
    const control = rows[0], runtime = control?.runtime_status;
    if (!control?.desired_enabled || !runtime || runtime.phase !== "running" || Date.now() - new Date(control.runtime_seen_at).getTime() > 30_000) return "";
    const queue = await pool.query(`SELECT id::text AS id FROM calls_queue WHERE streamer_id=$1 ORDER BY pos,id`, [streamerId]);
    const index = queue.rows.findIndex(row => row.id === callId);
    if (index < 0) return "";
    const durationMs = Number(control.dashboard_settings?.slotDurationMs ?? runtime.config?.slotDurationMs);
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) return "";
    if (!runtime.slot?.callId) return ` — dans ~${Math.ceil(index * durationMs / 60_000)} min`;
    const currentIncluded = queue.rows.slice(0, index).some(row => row.id === String(runtime.slot.callId));
    const minutes = estimateCallMinutes({ callsAhead: index, currentIncluded, durationMs,
      deadlineAt: Number.isSafeInteger(runtime.slotDeadlineAt) ? runtime.slotDeadlineAt : null,
      pausedAt: Number.isSafeInteger(runtime.recoveryPausedAt) ? runtime.recoveryPausedAt : null, now: Date.now() });
    return ` — dans ~${minutes} min`;
  } catch { return ""; }
}
