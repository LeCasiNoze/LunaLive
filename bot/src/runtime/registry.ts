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

    console.log("[bot] registry start", {
      registryPollMs: this.env.BOT_REGISTRY_POLL_MS,
      forceSlug: this.env.BOT_FORCE_STREAMER_SLUG || null,
      liveOnlyDefault: this.env.BOT_LIVE_ONLY_DEFAULT,
    });

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

  private async getStreamerBySlug(slug: string): Promise<StreamerRow | null> {
    const s = String(slug || "").trim();
    if (!s) return null;

    const r = await this.pool.query(
      `
      SELECT id, slug, display_name, is_live
      FROM streamers
      WHERE lower(slug) = lower($1)
      LIMIT 1
    `,
      [s]
    );

    const row = r.rows?.[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      slug: String(row.slug),
      displayName: String(row.display_name),
      isLive: Boolean(row.is_live),
    };
  }

  private async syncOnce() {
    let rows: Array<{
      streamer_id: number;
      enabled: boolean;
      prefix: string | null;
      live_only: boolean | null;
      slug: string;
      display_name: string;
      is_live: boolean;
    }> = [];

    let tableMissing = false;

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
      if (code === "42P01") {
        tableMissing = true;
      } else {
        try {
          await logEvent(this.pool, null, "warn", "registry query failed", {
            err: e?.message || String(e),
          });
        } catch {}
        console.log("[bot] registry query failed", e?.message || e);
      }
    }

    const wanted = new Set<string>();

    // 1) streamers configurés en DB (si table existe)
    if (!tableMissing) {
      console.log("[bot] registry sync settings rows=", rows.length);

      for (const row of rows) {
        const streamer: StreamerRow = {
          id: Number(row.streamer_id),
          slug: String(row.slug),
          displayName: String(row.display_name),
          isLive: Boolean(row.is_live),
        };

        const settings: BotStreamerSettings = {
          enabled: Boolean(row.enabled),
          prefix: String(row.prefix || this.env.BOT_DEFAULT_PREFIX),
          liveOnly:
            row.live_only == null
              ? this.env.BOT_LIVE_ONLY_DEFAULT
              : Boolean(row.live_only),
        };

        if (settings.liveOnly && !streamer.isLive) {
          continue;
        }

        const key = String(streamer.id);
        wanted.add(key);

        if (!this.runners.has(key)) {
          const runner = new StreamerRunner(this.pool, this.env, streamer, settings);
          this.runners.set(key, runner);
          runner.start();
          try {
            await logEvent(this.pool, streamer.id, "info", "registry started runner", {
              slug: streamer.slug,
              forced: false,
            });
          } catch {}
          console.log("[bot] registry started runner", streamer.slug);
        }
      }
    } else {
      console.log("[bot] registry: bot_streamer_settings missing (ok for MVP)");
    }

    // 2) ✅ fallback MVP: force slug via env
    const forceSlug = this.env.BOT_FORCE_STREAMER_SLUG;
    if (forceSlug) {
      try {
        const streamer = await this.getStreamerBySlug(forceSlug);
        if (!streamer) {
          try {
            await logEvent(this.pool, null, "warn", "force slug not found", {
              slug: forceSlug,
            });
          } catch {}
          console.log("[bot] force slug not found:", forceSlug);
        } else {
          const settings: BotStreamerSettings = {
            enabled: true,
            prefix: this.env.BOT_DEFAULT_PREFIX,
            liveOnly: this.env.BOT_LIVE_ONLY_DEFAULT,
          };

          if (!settings.liveOnly || streamer.isLive) {
            const key = String(streamer.id);
            wanted.add(key);

            if (!this.runners.has(key)) {
              const runner = new StreamerRunner(this.pool, this.env, streamer, settings);
              this.runners.set(key, runner);
              runner.start();
              try {
                await logEvent(this.pool, streamer.id, "info", "registry started runner (forced)", {
                  slug: streamer.slug,
                  forced: true,
                });
              } catch {}
              console.log("[bot] registry started forced runner", streamer.slug);
            }
          } else {
            console.log("[bot] force runner skipped (offline + liveOnly=true)", {
              slug: streamer.slug,
            });
          }
        }
      } catch (e: any) {
        console.log("[bot] force slug error", e?.message || e);
      }
    }

    // 3) stop runners not wanted anymore
    for (const [key, runner] of this.runners) {
      if (!wanted.has(key)) {
        runner.stop();
        this.runners.delete(key);
        try {
          await logEvent(this.pool, runner.streamer.id, "info", "registry stopped runner", {
            slug: runner.streamer.slug,
          });
        } catch {}
        console.log("[bot] registry stopped runner", runner.streamer.slug);
      }
    }

    console.log("[bot] registry runners active =", this.runners.size);
  }
}
