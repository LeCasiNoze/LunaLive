// bot/src/runtime/runner.ts
import type { Pool } from "pg";
import type { BotEnv } from "../env.js";
import type { BotCommand, BotStreamerSettings, StreamerRow } from "../core/types.js";
import { Cooldowns } from "../core/cooldowns.js";
import { dispatch } from "../core/dispatch.js";
import { loadAutoposts, loadCommands } from "./config.js";
import { LunaLiveDbTransport } from "../providers/lunalive/db_transport.js";
import { logEvent } from "../log.js";
import { tryHandleClipCommand } from "../modules/clips/clip.js";

const BOT_TEXT_MAX = 500;

function preview(v: any, n = 140) {
  const s = String(v ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export class StreamerRunner {
  private alive = false;
  private transport: LunaLiveDbTransport;
  private cooldowns = new Cooldowns();

  private commands: Map<string, BotCommand> = new Map();
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

  getSettings(): BotStreamerSettings {
    return {
      enabled: Boolean(this.settings.enabled),
      prefix: String(this.settings.prefix || ""),
      liveOnly: Boolean(this.settings.liveOnly),
    };
  }

  updateSettings(next: BotStreamerSettings) {
    this.settings = {
      enabled: Boolean(next.enabled),
      prefix: String(next.prefix || this.env.BOT_DEFAULT_PREFIX),
      liveOnly: Boolean(next.liveOnly),
    };

    console.log("[bot] runner settings updated", {
      slug: this.streamer.slug,
      id: this.streamer.id,
      prefix: this.settings.prefix,
      liveOnly: this.settings.liveOnly,
    });

    void (async () => {
      try {
        await logEvent(this.pool, this.streamer.id, "info", "runner settings updated", {
          prefix: this.settings.prefix,
          liveOnly: this.settings.liveOnly,
        });
      } catch {}
    })();
  }

  start() {
    if (this.alive) return;
    this.alive = true;

    const prefix0 = this.settings.prefix || this.env.BOT_DEFAULT_PREFIX;

    console.log("[bot] runner start", {
      slug: this.streamer.slug,
      id: this.streamer.id,
      prefix: prefix0,
      liveOnly: this.settings.liveOnly,
      startFromNow: this.env.BOT_CHAT_START_FROM_NOW,
    });

    void (async () => {
      try {
        await logEvent(this.pool, this.streamer.id, "info", "runner start", {
          slug: this.streamer.slug,
          prefix: prefix0,
        });
      } catch {}
    })();

    const sendBotText = async (
      t: any,
      reason: "send" | "autopost" | "clip" = "send"
    ) => {
      let out = String(t ?? "").replace(/\r\n/g, "\n");

      if (!out.trim()) return;

      if (out.length > BOT_TEXT_MAX) {
        // on tronque en sécurité (normalement l’API empêchera d’enregistrer > 500)
        out = out.slice(0, BOT_TEXT_MAX);
        try {
          await logEvent(this.pool, this.streamer.id, "warn", "bot message truncated", {
            max: BOT_TEXT_MAX,
            reason,
          });
        } catch {}
      }

      await this.transport.send(out);

      try {
        await logEvent(this.pool, this.streamer.id, "info", reason, { t: preview(out) });
      } catch {}
    };

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
    this.transport.start(async (msg: any) => {
      if (!this.alive) return;

      const prefix = this.settings.prefix || this.env.BOT_DEFAULT_PREFIX;

      const botUserId = Number(this.env.BOT_USER_ID ?? 1);
      if (Number(msg.userId) === botUserId) return; // évite boucles

      const body = String(msg.body || "").trim();

      // ✅ BUILTIN: !clip (avant dispatch des commandes custom)
      // Par défaut: tout le monde (option modo-only viendra après)
      try {
        const handled = await tryHandleClipCommand({
          pool: this.pool,
          streamer: this.streamer,
          prefix,
          msg,
          send: async (t: string) => {
            await sendBotText(t, "clip");
          },
          allowEveryone: true,
        });
        if (handled) return;
      } catch {}

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
          send: async (t: string) => {
            await sendBotText(t, "send");
          },
        },
        msg,
        commands: this.commands,
        cooldowns: this.cooldowns,
      });
    });

    // autoposts minimal (round-robin)
    const autopostTick = async () => {
      if (!this.alive) return;
      if (!this.autoposts.length) return;

      const it = this.autoposts.shift()!;
      this.autoposts.push(it);

      try {
        await sendBotText(it.message, "autopost");
      } catch (e: any) {
        try {
          await logEvent(this.pool, this.streamer.id, "warn", "autopost failed", {
            err: e?.message || String(e),
          });
        } catch {}
      }

      this.autopostTimer = setTimeout(autopostTick, Math.max(10, it.everySec) * 1000);
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
