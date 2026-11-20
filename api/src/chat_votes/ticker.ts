// Minuteur serveur des votes : rappels Rumble, fermeture des paris annoncée,
// clôture automatique des sondages. Les réclamations se font par UPDATE
// atomique en base : sans danger si plusieurs instances tournent.
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { tickPolls } from "./polls.js";
import { tickPredictionsOnRumble } from "./predictions_ext.js";

export function startChatVotesTicker(pool: Pool, io: Server) {
  const reminderSec = Math.max(30, Number(process.env.CHAT_VOTE_REMINDER_SEC || 60));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await tickPolls(pool, io, reminderSec);
      await tickPredictionsOnRumble(pool, reminderSec);
    } catch (e: any) {
      // tables/colonnes absentes tant que les migrations du boot n'ont pas fini
      if (e?.code !== "42P01" && e?.code !== "42703") console.warn("[chat-votes] tick failed", e?.message || e);
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), 5000);
}
