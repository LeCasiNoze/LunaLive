// bot/src/registry.ts
import type { Pool } from "pg";
import type { BotEnv } from "../env.js";
import type { BotStreamerSettings, StreamerRow } from "../core/types.js";
import { StreamerRunner } from "./runner.js";
import { logEvent } from "../log.js";

type RunnerKey = string;

function sameSettings(a: BotStreamerSettings, b: BotStreamerSettings): boolean {
  return (
    Boolean(a.enabled) === Boolean(b.enabled) &&
    String(a.prefix || "") === String(b.prefix || "") &&
    Boolean(a.liveOnly) === Boolean(b.liveOnly)
  );
}

export class Registry {
  private runners = new Map<RunnerKey, StreamerRunner>();
  private timer: NodeJS.Timeout | null = null;

  // ✅ NEW: keep last is_live to detect live -> off transitions
  private lastLive = new Map<RunnerKey, boolean>();

  constructor(private pool: Pool, private env: BotEnv) {}

  start() {
    if (this.timer) return;

    console.log("[bot] registry start", {
      registryPollMs: this.env.BOT_REGISTRY_POLL_MS,
      forceSlug: this.env.BOT_FORCE_STREAMER_SLUG || null,
      liveOnlyDefault: this.env.BOT_LIVE_ONLY_DEFAULT,
      defaultEnabled: true,
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

    // ✅ clear lastLive cache too
    this.lastLive.clear();
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

  // ✅ NEW: when stream goes OFF, force-close bot_wheel enroll_open
  private async autoCloseBotWheelEnroll(streamerId: number) {
    try {
      await this.pool.query(
        `INSERT INTO bot_wheel_cfg(streamer_id, enroll_open)
         VALUES ($1, FALSE)
         ON CONFLICT (streamer_id)
         DO UPDATE SET enroll_open=FALSE, updated_at=NOW()`,
        [streamerId]
      );
    } catch (e: any) {
      // table missing -> ignore (dev / migration not applied)
      if (String(e?.code || "") === "42P01") return;
      console.log("[bot] bot_wheel autoclose failed", e?.message || e);
    }
  }

  private async syncOnce() {
    // rows = tous les streamers + overrides settings si table existe
    let rows: Array<{
      streamer_id: number;
      slug: string;
      display_name: string;
      is_live: boolean;
      enabled: boolean | null;
      prefix: string | null;
      live_only: boolean | null;
    }> = [];

    // si table settings manque, on fallback sur streamers seulement
    let settingsTableMissing = false;

    try {
      const r = await this.pool.query(`
        SELECT
          s.id AS streamer_id,
          s.slug,
          s.display_name,
          s.is_live,
          b.enabled,
          b.prefix,
          b.live_only
        FROM streamers s
        LEFT JOIN bot_streamer_settings b ON b.streamer_id = s.id
      `);
      rows = r.rows;
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "42P01") {
        settingsTableMissing = true;
      } else {
        try {
          await logEvent(this.pool, null, "warn", "registry query failed", {
            err: e?.message || String(e),
          });
        } catch {}
        console.log("[bot] registry query failed", e?.message || e);
      }
    }

    if (settingsTableMissing) {
      try {
        const r = await this.pool.query(`
          SELECT
            id AS streamer_id,
            slug,
            display_name,
            is_live
          FROM streamers
        `);

        rows = r.rows.map((x: any) => ({
          streamer_id: Number(x.streamer_id),
          slug: String(x.slug),
          display_name: String(x.display_name),
          is_live: Boolean(x.is_live),
          enabled: null,
          prefix: null,
          live_only: null,
        }));

        console.log("[bot] registry: bot_streamer_settings missing (override disabled)");
      } catch (e: any) {
        console.log("[bot] registry streamers fallback failed", e?.message || e);
        rows = [];
      }
    }

    console.log("[bot] registry sync streamers rows=", rows.length);

    const wanted = new Set<string>();

    for (const row of rows) {
      const streamer: StreamerRow = {
        id: Number(row.streamer_id),
        slug: String(row.slug),
        displayName: String(row.display_name),
        isLive: Boolean(row.is_live),
      };

      // ✅ defaults:
      // - enabled default TRUE (bot actif partout)
      // - prefix default env
      // - liveOnly default env
      const settings: BotStreamerSettings = {
        enabled: row.enabled == null ? true : Boolean(row.enabled),
        prefix: String(row.prefix || this.env.BOT_DEFAULT_PREFIX),
        liveOnly: row.live_only == null ? this.env.BOT_LIVE_ONLY_DEFAULT : Boolean(row.live_only),
      };

      const shouldRun = settings.enabled && (!settings.liveOnly || streamer.isLive);

      const key = String(streamer.id);

      // ✅ detect live -> off and autoclose enroll
      const prevLive = this.lastLive.get(key);
      const nowLive = Boolean(streamer.isLive);
      this.lastLive.set(key, nowLive);

      if (prevLive === true && nowLive === false) {
        await this.autoCloseBotWheelEnroll(streamer.id);
      }

      if (!shouldRun) continue;

      wanted.add(key);

      const existing = this.runners.get(key);
      if (!existing) {
        const runner = new StreamerRunner(this.pool, this.env, streamer, settings);
        this.runners.set(key, runner);
        runner.start();

        try {
          await logEvent(this.pool, streamer.id, "info", "registry started runner", {
            slug: streamer.slug,
            forced: false,
            settings,
          });
        } catch {}
        console.log("[bot] registry started runner", streamer.slug);
      } else {
        const prev = existing.getSettings();
        if (!sameSettings(prev, settings)) {
          existing.updateSettings(settings);
          try {
            await logEvent(this.pool, streamer.id, "info", "registry updated runner settings", {
              slug: streamer.slug,
              prev,
              next: settings,
            });
          } catch {}
        }
      }
    }

    // ✅ debug: forceSlug (même si désactivé en DB) — utile en dev
    const forceSlug = this.env.BOT_FORCE_STREAMER_SLUG;
    if (forceSlug) {
      try {
        const streamer = await this.getStreamerBySlug(forceSlug);
        if (streamer) {
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
              console.log("[bot] registry started forced runner", streamer.slug);
            }
          }
        }
      } catch {}
    }

    // stop runners not wanted anymore
    for (const [key, runner] of this.runners) {
      if (!wanted.has(key)) {
        runner.stop();
        this.runners.delete(key);
        console.log("[bot] registry stopped runner", runner.streamer.slug);
      }
    }

    console.log("[bot] registry runners active =", this.runners.size);
  }
}
