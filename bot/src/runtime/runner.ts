import type { Pool } from "pg";
import type { BotEnv } from "../env.js";
import type { BotCommand, BotStreamerSettings, StreamerRow } from "../core/types.js";
import { Cooldowns } from "../core/cooldowns.js";
import { dispatch } from "../core/dispatch.js";
import { loadAutoposts, loadCommands } from "./config.js";
import { LunaLiveDbTransport } from "../providers/lunalive/db_transport.js";
import { logEvent } from "../log.js";

function preview(v: any, n = 100) {
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

  // anti-spam simple par (userId/username + trigger)
  private lastCmdAt = new Map<string, number>();

  constructor(
    private pool: Pool,
    private env: BotEnv,
    public streamer: StreamerRow,
    private settings: BotStreamerSettings
  ) {
    this.transport = new LunaLiveDbTransport(pool, env, streamer);
  }

  private renderTemplate(tpl: string, msg: any, trigger: string, args: string[]) {
    const user = String(
      msg?.username ||
        msg?.displayName ||
        (msg?.userId != null ? `user#${msg.userId}` : "user")
    );
    const streamer = String((this.streamer as any)?.displayName || this.streamer.slug || "streamer");

    const vars: Record<string, string> = {
      user,
      streamer,
      trigger,
      args: args.join(" "),
    };
    for (let i = 0; i < 9; i++) vars[`arg${i + 1}`] = args[i] ?? "";

    return String(tpl ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m
    );
  }

  private allowCooldown(key: string, sec: number) {
    const now = Date.now();
    const last = this.lastCmdAt.get(key) ?? 0;
    if (now - last < Math.max(0, sec) * 1000) return false;
    this.lastCmdAt.set(key, now);
    return true;
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

      // prefix dynamique (si settings changent en DB)
      const prefix = this.settings.prefix || this.env.BOT_DEFAULT_PREFIX;

      const botUserId = Number(this.env.BOT_USER_ID ?? 1);
      if (Number(msg.userId) === botUserId) return; // évite boucles

      const body = String(msg.body || "").trim();
      const lower = body.toLowerCase();

      // ✅ debug MVP: ping en dur
      if (lower === `${prefix}ping`) {
        console.log("[bot] cmd ping detected", {
          slug: this.streamer.slug,
          from: msg.username,
        });

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

        // ✅ CUSTOM COMMANDS (fix immédiat)
        const after = body.slice(prefix.length).trimStart();
        if (after) {
          const parts = after.split(/\s+/).filter(Boolean);
          const rawName = parts[0] || "";
          const trigger = rawName.replace(/^[!/]+/g, "").toLowerCase();
          const args = parts.slice(1);

          const cmd = this.commands.get(trigger);
          if (cmd) {
            // match trouvé -> si disabled, on stop ici
            if (!cmd.enabled) return;

            const fromKey = String(msg.userId ?? msg.username ?? "anon");
            const cdKey = `${fromKey}:${trigger}`;
            if (!this.allowCooldown(cdKey, cmd.cooldownSec ?? 3)) return;

            const out = this.renderTemplate(cmd.response, msg, trigger, args).trim();
            if (!out) return;

            try {
              await logEvent(this.pool, this.streamer.id, "info", "cmd matched", {
                trigger,
                from: msg.username,
                userId: msg.userId,
                bodyPreview: preview(body),
              });
            } catch {}

            await this.transport.send(out);

            try {
              await logEvent(this.pool, this.streamer.id, "info", "cmd sent", {
                trigger,
                outPreview: preview(out),
              });
            } catch {}
            return;
          }
        }
      }

      // fallback dispatch (builtins / autres)
      await dispatch({
        ctx: {
          streamer: this.streamer,
          prefix,
          send: async (t: string) => {
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
