import "dotenv/config";
import { z } from "zod";

const Schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  GUILD_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  TIMEZONE: z.string().min(1).default("Europe/Paris"),
});

export type AurixEnv = z.infer<typeof Schema>;

export function loadEnv(): AurixEnv {
  // Best-effort: dotenv.config est déjà appelé via "dotenv/config".
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[aurix] env invalide :", parsed.error.flatten().fieldErrors);
    throw new Error("Aurix env invalid");
  }
  return parsed.data;
}
