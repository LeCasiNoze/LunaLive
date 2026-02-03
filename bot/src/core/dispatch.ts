// bot/src/core/dispatch.ts
import type { BotCommand, ChatMsg, CommandContext } from "./types.js";
import { applyTemplate } from "./template.js";
import { Cooldowns } from "./cooldowns.js";

type DispatchOpts = {
  ctx: CommandContext;
  msg: ChatMsg;
  commands: Map<string, BotCommand>; // trigger (sans prefix, lower) -> cmd
  cooldowns: Cooldowns;
};

function normalizeTrigger(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const first = s.split(/\s+/)[0];
  return first.replace(/^[!/]+/g, "").toLowerCase();
}

export async function dispatch(opts: DispatchOpts) {
  const { ctx, msg, commands, cooldowns } = opts;

  const txtRaw = String(msg.body || "");
  const txt = txtRaw.trim();
  if (!txt) return;

  if (!txt.startsWith(ctx.prefix)) return;

  const after = txt.slice(ctx.prefix.length).trimStart();
  if (!after) return;

  // ne lower-case PAS le message complet (on veut garder les args)
  const parts = after.split(/\s+/g).filter(Boolean);
  const trigger = normalizeTrigger(parts[0] || "");
  const args = parts.slice(1);

  if (!trigger) return;

  // ──────────────────────────────────────────
  // 🎯 PRÉDICTIONS — !1 / !2 (SILENCIEUX)
  // ──────────────────────────────────────────
  if (trigger === "1" || trigger === "2") {
    const choice = trigger === "2" ? 2 : 1;

    try {
      await ctx.predictions?.bet({
        userId: msg.userId,
        username: msg.username,
        choice,
        streamerId: ctx.streamer.id,
      });
    } catch {
      // volontairement silencieux
    }

    return;
  }

  // ──────────────────────────────────────────
  // built-in minimal
  // ──────────────────────────────────────────
  if (trigger === "ping") {
    const cdKey = `u:${msg.userId}:ping`;
    if (!cooldowns.allow(cdKey, 3)) return;
    await ctx.send(`pong @${msg.username} ✅`);
    return;
  }

  // ──────────────────────────────────────────
  // commandes personnalisées
  // ──────────────────────────────────────────
  const cmd = commands.get(trigger);
  if (!cmd || !cmd.enabled) return;

  const cdKey = `u:${msg.userId}:cmd:${trigger}`;
  if (!cooldowns.allow(cdKey, cmd.cooldownSec || 3)) return;

  const rendered = applyTemplate(cmd.response, {
    user: msg.username,
    streamer: ctx.streamer.displayName,
    slug: ctx.streamer.slug,

    trigger,
    args: args.join(" "),
    arg1: args[0] ?? "",
    arg2: args[1] ?? "",
    arg3: args[2] ?? "",
    arg4: args[3] ?? "",
    arg5: args[4] ?? "",
    arg6: args[5] ?? "",
    arg7: args[6] ?? "",
    arg8: args[7] ?? "",
    arg9: args[8] ?? "",
  });

  // garde retours à la ligne
  const out = String(rendered ?? "").replace(/\r\n/g, "\n");

  if (out.trim()) {
    const finalOut = out.trimEnd();

    // 1) LunaLive (1 seule fois)
    await ctx.send(finalOut);

    // 2) DLive (si branché)
    if (ctx.sendDlive) {
      const lines = finalOut
        .split("\n")
        .map((s) => s.trimEnd())
        .filter((s) => s.trim().length > 0);

      for (const line of lines) {
        await ctx.sendDlive(line, { trigger });
      }
    }
  }
}
