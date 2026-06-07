// api/src/utils/ffmpeg_gate.ts
// Mutex global pour sérialiser tous les spawns ffmpeg (clip render + thumbs).
// Évite OOM sur Render 512 MB quand mp4 ffmpeg (90-150 MB buffer) + thumbnail
// ffmpeg (50 MB) tournaient simultanément.
let chain = Promise.resolve();
/**
 * Sérialise l'exécution d'une opération ffmpeg. Tous les appelants attendent
 * leur tour. La concurrence est strictement = 1.
 */
export function withFfmpegSlot(label, fn) {
    const next = chain
        .catch(() => { })
        .then(async () => {
        const start = Date.now();
        try {
            return await fn();
        }
        finally {
            const ms = Date.now() - start;
            if (ms > 1000)
                console.log(`[ffmpeg-gate] ${label}: ${ms}ms`);
        }
    });
    // chain garde la queue vivante mais on retourne la valeur réelle au caller
    chain = next.catch(() => { });
    return next;
}
