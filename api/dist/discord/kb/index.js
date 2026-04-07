// api/src/discord/kb/index.ts
// Export central de l'encyclopédie LunaLive
// KB_ENTRIES = anciens blocs textuels (fallback)
// KB_BLOCKS  = nouveaux blocs structurés par intent/rôle (prioritaires)
export { isMasterUser, MASTER_DISCORD_USER_ID } from "./_config.js";
// ── Nouveaux blocs enrichis (prioritaires dans la recherche) ─────────────────
export { KB_BLOCKS } from "./blocks/index.js";
// ── Anciens blocs textuels (fallback si pas de bloc enrichi) ─────────────────
import { RUBIS } from "./rubis.js";
import { ABONNEMENTS } from "./abonnements.js";
import { CALLS } from "./calls.js";
import { CHAT_OVERLAY } from "./chat_overlay.js";
import { DLIVE } from "./dlive.js";
import { COMPTE } from "./compte.js";
import { STREAMER } from "./streamer.js";
import { RAIN } from "./rain.js";
import { CHEST } from "./chest.js";
import { WHEEL } from "./wheel.js";
import { PREDICTIONS } from "./predictions.js";
import { CLIPS } from "./clips.js";
import { SHOP } from "./shop.js";
import { MODERATION } from "./moderation.js";
export const KB_ENTRIES = [
    ...RUBIS,
    ...ABONNEMENTS,
    ...CALLS,
    ...CHAT_OVERLAY,
    ...DLIVE,
    ...COMPTE,
    ...STREAMER,
    ...RAIN,
    ...CHEST,
    ...WHEEL,
    ...PREDICTIONS,
    ...CLIPS,
    ...SHOP,
    ...MODERATION,
];
