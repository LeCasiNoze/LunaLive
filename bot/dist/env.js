import { z } from "zod";
function parseBoolean(v, fallback) {
    if (v === undefined || v === null || v === "") {
        if (typeof fallback === "boolean")
            return fallback;
        return false;
    }
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s))
        return true;
    if (["false", "0", "no", "n", "off"].includes(s))
        return false;
    return typeof fallback === "boolean" ? fallback : false;
}
const EnvSchema = z.object({
    DATABASE_URL: z.string().min(1),
    // ✅ pour appeler l'API (internal routes)
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
    // ⚠️ Render: "false" ne doit PAS devenir true → custom parse
    BOT_CHAT_START_FROM_NOW: z.preprocess((v) => parseBoolean(v, true), z.boolean()),
    // comportement
    BOT_DEFAULT_PREFIX: z.string().min(1).default("!"),
    // ⚠️ Render: "false" ne doit PAS devenir true → custom parse
    BOT_LIVE_ONLY_DEFAULT: z.preprocess((v) => parseBoolean(v, true), z.boolean()),
    // optionnel (ton mode forcé)
    BOT_FORCE_STREAMER_SLUG: z.string().min(1).optional(),
    // ✅ DLive (pour l'API / dlive_send si le bot en a besoin un jour, et surtout pour cohérence env)
    // (Dans ton architecture actuelle, c'est surtout l'API qui en a besoin, mais on le met là aussi si tu veux mutualiser.)
    DLIVE_BOT_AUTH: z.string().min(1).optional(), // token JWT brut (sans "Bearer ")
    DLIVE_GRAPHQL_ENDPOINT: z.string().min(1).optional(), // default côté code api = https://graphigo.prd.dlive.tv/
    // health server (optionnel Render)
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
});
export function loadEnv() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
        console.error(parsed.error.flatten().fieldErrors);
        throw new Error("Invalid env for lunalive-bot");
    }
    // DEBUG: diagnostic env loading
    console.log("[bot] env debug", {
        cwd: process.cwd(),
        hasApiBase: !!parsed.data.BOT_API_BASE,
        hasInternalKey: !!parsed.data.BOT_INTERNAL_KEY,
        apiBaseLength: parsed.data.BOT_API_BASE.length,
        keyLength: parsed.data.BOT_INTERNAL_KEY.length,
        keyPrefix: parsed.data.BOT_INTERNAL_KEY.length > 8 ?
            `${parsed.data.BOT_INTERNAL_KEY.slice(0, 3)}***${parsed.data.BOT_INTERNAL_KEY.slice(-3)}` :
            '***',
        botUserId: parsed.data.BOT_USER_ID,
        botUsername: parsed.data.BOT_USERNAME
    });
    return parsed.data;
}
