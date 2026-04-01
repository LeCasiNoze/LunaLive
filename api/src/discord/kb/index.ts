// api/src/discord/kb/index.ts
// Export central de l'encyclopédie LunaLive
// Agrège toutes les entrées KB des modules thématiques

export type { KbEntry, KbRole, KbSensitivity, KbConfidence, KbCategory, KbLink } from "./types.js";
export { isMasterUser, MASTER_DISCORD_USER_ID } from "./_config.js";

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

import type { KbEntry } from "./types.js";

export const KB_ENTRIES: KbEntry[] = [
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
