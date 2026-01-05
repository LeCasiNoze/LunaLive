// bot/src/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  // ✅ NEW: pour appeler l'API (broadcast socket)
  BOT_API_BASE: z.string().min(1), // ex: https://lunalive-api.onrender.com
  BOT_INTERNAL_KEY: z.string().min(1), // même clé que côté API

  // bot identity (messages)
  BOT_USER_ID: z.coerce.number().int().positive().optional(),
  BOT_USERNAME: z.string().min(1).default("LunaBot"),

  // registry
  BOT_REGISTRY_POLL_MS: z.coerce.number().int().min(1000).default(5000),

  // chat tail
  BOT_CHAT_POLL_MS: z.coerce.number().int().min(200).default(800),
  BOT_CHAT_BATCH: z.coerce.number().int().min(10).max(500).default(200),
  BOT_CHAT_START_FROM_NOW: z.coerce.boolean().default(true),

  // comportement
  BOT_DEFAULT_PREFIX: z.string().min(1).default("!"),
  BOT_LIVE_ONLY_DEFAULT: z.coerce.boolean().default(true),

  // optionnel (ton mode forcé)
  BOT_FORCE_STREAMER_SLUG: z.string().min(1).optional(),

  // health server (optionnel Render)
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
});

export type BotEnv = z.infer<typeof EnvSchema>;

export function loadEnv(): BotEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid env for lunalive-bot");
  }
  return parsed.data;
}
