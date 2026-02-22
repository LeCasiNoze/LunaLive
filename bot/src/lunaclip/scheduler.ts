// bot/src/lunaclip/scheduler.ts
// ═══════════════════════════════════════════════════════════════
// LunaClip scheduler désactivé sur Render.
// Le scheduler tourne désormais en LOCAL sur le PC de l'opérateur.
// Ce fichier conserve les exports publics pour éviter les erreurs
// de compilation, mais ne fait plus rien.
// ═══════════════════════════════════════════════════════════════

import type { Pool } from "pg";

export interface LogEntry {
  ts:     number;
  slug:   string;
  source: string;
  msg:    string;
}

export interface WorkerStats {
  mode:                string;
  consecutive_unknown: number;
  frames_total:        number;
  frames_with_value:   number;
  last_value_secs_ago: number;
}

export interface ActiveWorker {
  streamerId:      number;
  streamerSlug:    string;
  dliveSlug:       string;
  sessionId:       bigint;
  liveCreatedAtMs: number;
  process:         unknown;
  status:          "running" | "stopped" | "error";
  startedAt:       Date;
  lastFrame:       unknown | null;
  provider:        string | null;
  hlsUrl:          string;
  workerStats:     WorkerStats;
}

export function startLunaClipScheduler(_pool: Pool): void {
  console.log("[lunaclip] scheduler désactivé sur Render — tourne en local");
}

export function stopLunaClipScheduler(): void {}

export function setLock(_streamerId: number | null, _durationSec?: number | null): void {}
export function getLockState() {
  return { locked_streamer_id: null as number | null, locked_until_ms: null as number | null, locked: false };
}
export function forceSwitch(_streamerId: number): void {}
export function setMaxWorkers(_n: number): void {}
export function setMinWatchSec(_sec: number): void {}
export function getAlertMulti(): number { return 300; }
export function setAlertMulti(_n: number): void {}
export function skipStreamer(_streamerId: number): void {}
export function getSchedulerState() {
  return {
    enabled:            false,
    max_workers:        0,
    min_watch_sec:      0,
    ram_limit_mb:       0,
    priority_queue:     [] as number[],
    waiting:            [] as string[],
    skipped_ram:        [] as string[],
    alert_multi:        300,
    locked:             false,
    locked_streamer_id: null as number | null,
    locked_until_ms:    null as number | null,
  };
}
export function getLogs(_limit?: number): LogEntry[] { return []; }

export const activeWorkers  = new Map<number, ActiveWorker>();
export const skippedRam     = new Set<string>();
export const waitingWorkers = new Set<string>();