// api/src/discord/kb/blocks/index.ts
// Export central des blocs enrichis KbBlock
import { RUBIS_BLOCKS } from "./rubis.js";
import { CALLS_BLOCKS } from "./calls.js";
import { ABONNEMENTS_BLOCKS } from "./abonnements.js";
import { DLIVE_SYNC_BLOCKS } from "./dlive_sync.js";
import { BOT_TOOLS_BLOCKS } from "./bot_tools.js";
import { CLIPS_BLOCKS } from "./clips.js";
import { DEVENIR_STREAMER_BLOCKS } from "./devenir_streamer.js";
export const KB_BLOCKS = [
    ...RUBIS_BLOCKS,
    ...CALLS_BLOCKS,
    ...ABONNEMENTS_BLOCKS,
    ...DLIVE_SYNC_BLOCKS,
    ...BOT_TOOLS_BLOCKS,
    ...CLIPS_BLOCKS,
    ...DEVENIR_STREAMER_BLOCKS,
];
