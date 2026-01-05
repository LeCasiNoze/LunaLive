import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  // bot identity (messages écrits en DB)
  BOT_USER_ID: z.coerce.number().int().positive().optional(),
  BOT_USERNAME: z.string().min(1).default("LunaBot"),

  // registry
  BOT_REGISTRY_POLL_MS: z.coerce.number().int().min(1000).default(5000),

  // chat tail
  BOT_CHAT_POLL_MS: z.coerce.number().int().min(200).default(800),
  BOT_CHAT_BATCH: z.coerce.number().int().min(10).max(500).default(200),

  // comportement
  BOT_DEFAULT_PREFIX: z.string().min(1).default("!"),

  // optionnel: stop si streamer offline (souvent ce que tu veux)
  BOT_LIVE_ONLY_DEFAULT: z.coerce.boolean().default(true),

  // health server (optionnel Render)
  PORT: z.coerce.number().int().min(1).max(65535).optional()
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
