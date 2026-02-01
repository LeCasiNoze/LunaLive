// api/src/routes/bot/index.ts
import { Router } from "express";
import { botDiscordGuildRouter } from "./discord_guild.js";

export const botRouter = Router();

// Toutes les routes bot doivent vivre ici
botRouter.use(botDiscordGuildRouter);
