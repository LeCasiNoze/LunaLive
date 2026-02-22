// bot/src/lunaclip/scheduler.ts
// ═══════════════════════════════════════════════════════════════
// LunaClip scheduler désactivé sur Render.
// Le scheduler tourne désormais en LOCAL sur le PC de l'opérateur.
// Ce fichier conserve les exports publics pour éviter les erreurs
// de compilation, mais ne fait plus rien.
// ═══════════════════════════════════════════════════════════════

import type { Pool } from "pg";

export function startLunaClipScheduler(_pool: Pool) {
  console.log("[lunaclip] scheduler désactivé sur Render — tourne en local");
}

export function stopLunaClipScheduler() {}

export function setLock(_streamerId: number | null, _durationSec?: number | null) {}
export function getLockState() {
  return { locked_streamer_id: null, locked_until_ms: null, locked: false };
}
export function forceSwitch(_streamerId: number) {}
export function setMaxWorkers(_n: number) {}
export function setMinWatchSec(_sec: number) {}
export function getAlertMulti() { return 300; }
export function setAlertMulti(_n: number) {}
export function skipStreamer(_streamerId: number) {}
export function getSchedulerState() {
  return {
    enabled: false,
    max_workers: 0,
    min_watch_sec: 0,
    ram_limit_mb: 0,
    priority_queue: [],
    waiting: [],
    skipped_ram: [],
    alert_multi: 300,
    locked: false,
    locked_streamer_id: null,
    locked_until_ms: null,
  };
}
export function getLogs(_limit?: number) { return []; }
export const activeWorkers  = new Map();
export const skippedRam     = new Set<string>();
export const waitingWorkers = new Set<string>();