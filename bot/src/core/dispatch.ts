import type { BotCommand, ChatMsg, CommandContext } from "./types.js";
import { applyTemplate } from "./template.js";
import { Cooldowns } from "./cooldowns.js";

type DispatchOpts = {
  ctx: CommandContext;
  msg: ChatMsg;
  commands: Map<string, BotCommand>; // trigger -> cmd
  cooldowns: Cooldowns;
};

export async function dispatch(opts: DispatchOpts) {
  const { ctx, msg, commands, cooldowns } = opts;

  const txt = (msg.body || "").trim();
  if (!txt) return;

  // ignore messages bot (si tu veux, tu peux affiner plus tard)
  if (msg.username.toLowerCase() === "lunabot") return;

  if (!txt.startsWith(ctx.prefix)) return;

  const lower = txt.toLowerCase();
  const parts = lower.split(/\s+/g);
  const trig = parts[0];

  // built-ins minimal
  if (trig === `${ctx.prefix}ping`) {
    const cdKey = `u:${msg.userId}:ping`;
    if (!cooldowns.allow(cdKey, 3)) return;
    await ctx.send(`pong @${msg.username} ✅`);
    return;
  }

  const cmd = commands.get(trig);
  if (!cmd || !cmd.enabled) return;

  const cdKey = `u:${msg.userId}:cmd:${trig}`;
  if (!cooldowns.allow(cdKey, cmd.cooldownSec || 3)) return;

  const rendered = applyTemplate(cmd.response, {
    user: msg.username,
    streamer: ctx.streamer.displayName,
    slug: ctx.streamer.slug
  });

  if (rendered.trim()) {
    await ctx.send(rendered.trim());
  }
}
