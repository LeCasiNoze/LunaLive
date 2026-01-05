import type { Pool } from "pg";
import type { BotEnv } from "../env.js";
import type { BotStreamerSettings, StreamerRow } from "../core/types.js";
import { StreamerRunner } from "./runner.js";
import { logEvent } from "../log.js";

type RunnerKey = string;

export class Registry {
  private runners = new Map<RunnerKey, StreamerRunner>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private pool: Pool, private env: BotEnv) {}

  start() {
    if (this.timer) return;
    const tick = async () => this.syncOnce();
    this.timer = setInterval(tick, this.env.BOT_REGISTRY_POLL_MS);
    void tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const r of this.runners.values()) r.stop();
    this.runners.clear();
  }

  private async syncOnce() {
    // But: lister streamers "bot enabled"
    // Au début, si table pas là → aucun runner (safe).
    let rows: Array<{
      streamer_id: number;
      enabled: boolean;
      prefix: string | null;
      live_only: boolean | null;
      slug: string;
      display_name: string;
      is_live: boolean;
    }> = [];

    try {
      const r = await this.pool.query(`
        SELECT
          b.streamer_id,
          b.enabled,
          b.prefix,
          b.live_only,
          s.slug,
          s.display_name,
          s.is_live
        FROM bot_streamer_settings b
        JOIN streamers s ON s.id=b.streamer_id
        WHERE b.enabled = TRUE
      `);
      rows = r.rows;
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code !== "42P01") {
        await logEvent(this.pool, null, "warn", "registry query failed", { err: e?.message || String(e) });
      }
      return;
    }

    const wanted = new Set<string>();

    for (const row of rows) {
      const streamer: StreamerRow = {
        id: Number(row.streamer_id),
        slug: String(row.slug),
        displayName: String(row.display_name),
        isLive: Boolean(row.is_live)
      };

      const settings: BotStreamerSettings = {
        enabled: Boolean(row.enabled),
        prefix: String(row.prefix || this.env.BOT_DEFAULT_PREFIX),
        liveOnly: row.live_only == null ? this.env.BOT_LIVE_ONLY_DEFAULT : Boolean(row.live_only)
      };

      // si liveOnly et offline => on n'exécute pas
      if (settings.liveOnly && !streamer.isLive) {
        continue;
      }

      const key = String(streamer.id);
      wanted.add(key);

      if (!this.runners.has(key)) {
        const runner = new StreamerRunner(this.pool, this.env, streamer, settings);
        this.runners.set(key, runner);
        runner.start();
        await logEvent(this.pool, streamer.id, "info", "registry started runner");
      }
    }

    // stop runners not wanted anymore
    for (const [key, runner] of this.runners) {
      if (!wanted.has(key)) {
        runner.stop();
        this.runners.delete(key);
        await logEvent(this.pool, runner.streamer.id, "info", "registry stopped runner");
      }
    }
  }
}
