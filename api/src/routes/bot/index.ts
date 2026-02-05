// api/src/routes/bot/index.ts
import { Router } from "express";
import { botDiscordGuildRouter } from "./bot_discord_guild.js";
import { botDiscordWelcomeRouter } from "./bot_discord_welcome.js";

export const botRouter = Router();

// Toutes les routes bot doivent vivre ici
botRouter.use(botDiscordGuildRouter);
botRouter.use(botDiscordWelcomeRouter);
