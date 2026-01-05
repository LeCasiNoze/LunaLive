import type { Pool } from "pg";
import type { BotEnv } from "../env.js";
import type { BotStreamerSettings, StreamerRow } from "../core/types.js";
import { Cooldowns } from "../core/cooldowns.js";
import { dispatch } from "../core/dispatch.js";
import { loadAutoposts, loadCommands } from "./config.js";
import { LunaLiveDbTransport } from "../providers/lunalive/db_transport.js";
import { logEvent } from "../log.js";

export class StreamerRunner {
  private alive = false;
  private transport: LunaLiveDbTransport;
  private cooldowns = new Cooldowns();

  private commands = new Map();
  private autoposts: { message: string; everySec: number }[] = [];
  private autopostTimer: NodeJS.Timeout | null = null;
  private cfgReloadTimer: NodeJS.Timeout | null = null;

  constructor(
    private pool: Pool,
    private env: BotEnv,
    public streamer: StreamerRow,
    private settings: BotStreamerSettings
  ) {
    this.transport = new LunaLiveDbTransport(pool, env, streamer);
  }

  start() {
    if (this.alive) return;
    this.alive = true;

    const prefix = this.settings.prefix || this.env.BOT_DEFAULT_PREFIX;

    console.log("[bot] runner start", {
      slug: this.streamer.slug,
      id: this.streamer.id,
      prefix,
      liveOnly: this.settings.liveOnly,
      startFromNow: this.env.BOT_CHAT_START_FROM_NOW,
    });

    void (async () => {
      try {
        await logEvent(this.pool, this.streamer.id, "info", "runner start", {
          slug: this.streamer.slug,
          prefix,
        });
      } catch {}
    })();

    // load initial config + refresh périodique
    const reload = async () => {
      try {
        this.commands = await loadCommands(this.pool, this.streamer.id);
        this.autoposts = await loadAutoposts(this.pool, this.streamer.id);
      } catch (e: any) {
        try {
          await logEvent(this.pool, this.streamer.id, "warn", "runner reload failed", {
            err: e?.message || String(e),
          });
        } catch {}
        console.log("[bot] runner reload failed", e?.message || e);
      }
    };

    void reload();
    this.cfgReloadTimer = setInterval(() => void reload(), 10_000);

    // messages
    this.transport.start(async (msg) => {
      if (!this.alive) return;

      const botUserId = this.env.BOT_USER_ID ?? 1;
      if (msg.userId === botUserId) return; // évite boucles

      const body = String(msg.body || "").trim();
      const lower = body.toLowerCase();

      // ✅ debug MVP: ping en dur
      if (lower === `${prefix}ping`) {
        console.log("[bot] cmd !ping detected", { slug: this.streamer.slug, from: msg.username });

        try {
          await logEvent(this.pool, this.streamer.id, "info", "cmd ping", {
            from: msg.username,
            userId: msg.userId,
          });
        } catch {}

        const t = "pong";
        await this.transport.send(t);

        try {
          await logEvent(this.pool, this.streamer.id, "info", "send", { t });
        } catch {}
        return;
      }

      // log seulement si ça ressemble à une commande
      if (body.startsWith(prefix)) {
        console.log("[bot] cmd in", { slug: this.streamer.slug, from: msg.username, body });
        try {
          await logEvent(this.pool, this.streamer.id, "info", "cmd in", {
            from: msg.username,
            userId: msg.userId,
            body,
          });
        } catch {}
      }

      await dispatch({
        ctx: {
          streamer: this.streamer,
          prefix,
          send: async (t) => {
            await this.transport.send(t);
            try {
              await logEvent(this.pool, this.streamer.id, "info", "send", { t });
            } catch {}
          },
        },
        msg,
        commands: this.commands,
        cooldowns: this.cooldowns,
      });
    });

    // autoposts minimal
    const autopostTick = async () => {
      if (!this.alive) return;
      if (!this.autoposts.length) return;

      // simple round-robin
      const it = this.autoposts.shift()!;
      this.autoposts.push(it);

      try {
        await this.transport.send(it.message);
        try {
          await logEvent(this.pool, this.streamer.id, "info", "autopost", {
            message: it.message,
          });
        } catch {}
      } catch (e: any) {
        try {
          await logEvent(this.pool, this.streamer.id, "warn", "autopost failed", {
            err: e?.message || String(e),
          });
        } catch {}
      }

      this.autopostTimer = setTimeout(
        autopostTick,
        Math.max(10, it.everySec) * 1000
      );
    };

    this.autopostTimer = setTimeout(autopostTick, 15_000);
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;

    console.log("[bot] runner stop", { slug: this.streamer.slug });

    this.transport.stop();
    if (this.autopostTimer) clearTimeout(this.autopostTimer);
    if (this.cfgReloadTimer) clearInterval(this.cfgReloadTimer);

    this.autopostTimer = null;
    this.cfgReloadTimer = null;

    void (async () => {
      try {
        await logEvent(this.pool, this.streamer.id, "info", "runner stop");
      } catch {}
    })();
  }
}
