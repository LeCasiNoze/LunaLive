// api/src/utils/ffmpeg_gate.ts
// Mutex global pour sérialiser tous les spawns ffmpeg (clip render + thumbs).
// Évite OOM sur Render 512 MB quand mp4 ffmpeg (90-150 MB buffer) + thumbnail
// ffmpeg (50 MB) tournaient simultanément.

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;

/**
 * Sérialise l'exécution d'une opération ffmpeg. Tous les appelants attendent
 * leur tour. La concurrence est strictement = 1.
 */
export function withFfmpegSlot<T>(label: string, fn: () => Promise<T>): Promise<T> {
  pending++;
  const next = chain
    .catch(() => {})
    .then(async () => {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        const ms = Date.now() - start;
        if (ms > 1000) console.log(`[ffmpeg-gate] ${label}: ${ms}ms`);
      }
    })
    .finally(() => {
      pending = Math.max(0, pending - 1);
    });
  // chain garde la queue vivante mais on retourne la valeur réelle au caller
  chain = next.catch(() => {});
  return next as Promise<T>;
}

/**
 * Low-priority ffmpeg work such as live thumbnails should never queue behind
 * an active clip render. Returning null lets callers use a cheap fallback.
 */
export function tryWithFfmpegSlot<T>(
  label: string,
  fn: () => Promise<T>,
  maxPending = 1
): Promise<T | null> {
  if (pending >= Math.max(1, maxPending)) return Promise.resolve(null);
  return withFfmpegSlot(label, fn);
}
