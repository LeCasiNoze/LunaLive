import { z } from "zod";

export const BOT_TEXT_MAX = 500;

// Convertit CRLF -> LF, garde les retours à la ligne, retire juste les espaces finaux.
export function normalizeMultiline(v: any) {
  return String(v ?? "").replace(/\r\n/g, "\n").trimEnd();
}

// "!discord" => "discord", "discord test" => "discord"
export function normalizeTrigger(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const first = s.split(/\s+/)[0];
  return first.replace(/^[!/]+/g, "").toLowerCase();
}

export const TriggerSchema = z
  .string()
  .transform((v) => normalizeTrigger(v))
  .refine((v) => v.length >= 1, "Trigger vide")
  .refine((v) => v.length <= 32, "Trigger trop long (max 32)")
  .refine(
    (v) => /^[a-z0-9_-]+$/.test(v),
    "Trigger invalide (a-z 0-9 _ - uniquement)"
  );

export const EnabledSchema = z.boolean().optional();

export const CooldownSecSchema = z
  .number()
  .int()
  .min(0)
  .max(3600)
  .optional();

export const BotTextSchema = z
  .string()
  .transform((v) => normalizeMultiline(v))
  .refine((v) => v.length >= 1, "Texte vide")
  .refine((v) => v.length <= BOT_TEXT_MAX, `Max ${BOT_TEXT_MAX} caractères`);

export const CommandCreateSchema = z.object({
  trigger: TriggerSchema,
  response: BotTextSchema,
  enabled: EnabledSchema,
  cooldownSec: CooldownSecSchema,
});

export const CommandPatchSchema = z.object({
  trigger: TriggerSchema.optional(),
  response: BotTextSchema.optional(),
  enabled: EnabledSchema,
  cooldownSec: CooldownSecSchema,
});

export const AutopostCreateSchema = z.object({
  message: BotTextSchema,
  everySec: z.number().int().min(10).max(86400),
  enabled: EnabledSchema,
});

export const AutopostPatchSchema = z.object({
  message: BotTextSchema.optional(),
  everySec: z.number().int().min(10).max(86400).optional(),
  enabled: EnabledSchema,
});

export const LogsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? 50);
      if (!Number.isFinite(n)) return 50;
      return Math.max(1, Math.min(200, Math.floor(n)));
    }),
});

export const TestSendSchema = z.object({
  body: z
    .string()
    .optional()
    .transform((v) => normalizeMultiline(v ?? "Test ✅")),
});
