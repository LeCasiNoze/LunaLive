import { z } from "zod";

const Schema = z.object({
  AURIX_DISCORD_TOKEN: z.string().min(1),
  AURIX_DISCORD_APP_ID: z.string().min(1),
  AURIX_GUILD_ID: z.string().min(1).optional(),
  AURIX_TIMEZONE: z.string().min(1).default("Europe/Paris"),
});

export type AurixEnv = {
  DISCORD_TOKEN: string;
  DISCORD_APP_ID: string;
  GUILD_ID?: string;
  TIMEZONE: string;
};

export function loadEnv(): AurixEnv {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[aurix] env invalide :", parsed.error.flatten().fieldErrors);
    throw new Error("Aurix env invalid");
  }
  return {
    DISCORD_TOKEN: parsed.data.AURIX_DISCORD_TOKEN,
    DISCORD_APP_ID: parsed.data.AURIX_DISCORD_APP_ID,
    GUILD_ID: parsed.data.AURIX_GUILD_ID,
    TIMEZONE: parsed.data.AURIX_TIMEZONE,
  };
}
