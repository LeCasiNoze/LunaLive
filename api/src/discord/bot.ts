import { Client, GatewayIntentBits, Partials } from "discord.js";

type BotCtx = {
  log: (msg: string) => void;
};

export async function startDiscordBot(ctx: BotCtx) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token) throw new Error("Missing env DISCORD_BOT_TOKEN");
  if (!guildId) throw new Error("Missing env DISCORD_GUILD_ID");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // important: roles/rename
      // MessageContent optional for later. For now we don't need it.
    ],
    partials: [Partials.Channel],
  });

  client.once("ready", async () => {
    ctx.log(`[discord] logged in as ${client.user?.tag ?? "unknown"}`);
    const g = await client.guilds.fetch(guildId).catch(() => null);
    ctx.log(`[discord] guild=${g?.name ?? "unknown"} (${guildId})`);
  });

  client.on("error", (e) => ctx.log(`[discord] error: ${String(e)}`));
  client.on("warn", (m) => ctx.log(`[discord] warn: ${m}`));

  await client.login(token);

  return client;
}
