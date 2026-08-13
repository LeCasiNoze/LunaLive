import { startNivoraDiscordBot, type NivoraDiscordEnv } from "./discord.js";

const env: NivoraDiscordEnv = {
  NIVORA_DISCORD_BOT_TOKEN: process.env.NIVORA_DISCORD_BOT_TOKEN,
  NIVORA_DISCORD_GUILD_ID: process.env.NIVORA_DISCORD_GUILD_ID,
  NIVORA_API_BASE: process.env.NIVORA_API_BASE,
  NIVORA_BOT_INTERNAL_KEY: process.env.NIVORA_BOT_INTERNAL_KEY,
  NIVORA_TELEGRAM_BOT_TOKEN: process.env.NIVORA_TELEGRAM_BOT_TOKEN,
  NIVORA_TELEGRAM_REFILL_CHAT_ID: process.env.NIVORA_TELEGRAM_REFILL_CHAT_ID,
};

const stop = await startNivoraDiscordBot(env);
const shutdown = async () => { await stop(); process.exit(0); };
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
