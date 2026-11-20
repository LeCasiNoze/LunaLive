// Annonces texte des prédictions/sondages vers le chat Rumble du streamer.
// Le chat LunaLive garde ses cartes stylées : rien n'est écrit dans
// chat_messages ici, seul Rumble reçoit ces lignes.
import type { Pool } from "pg";
import { sendRumbleMessageReliable } from "../rumble_chat_bridge.js";
import { shopReplyChunks } from "../automod-shop/rules.js";

/** Vidéo live Rumble à viser, ou null si la chaîne ne joue pas via Rumble. */
export async function rumbleVoteTarget(pool: Pool, streamerId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT s.platform, ri.is_live, ri.live_video_id_numeric, cs.rumble_commands_enabled
       FROM streamers s
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       LEFT JOIN streamer_chat_settings cs ON cs.streamer_id = s.id
      WHERE s.id = $1`,
    [streamerId]
  );
  const row = r.rows[0];
  if (!row || String(row.platform || "").toLowerCase() !== "rumble") return null;
  if (!row.is_live || !row.rumble_commands_enabled || !row.live_video_id_numeric) return null;
  return String(row.live_video_id_numeric);
}

export async function sendRumbleVoteText(pool: Pool, videoId: string, text: string) {
  for (const chunk of shopReplyChunks(text)) await sendRumbleMessageReliable(pool, videoId, chunk);
}

export function formatRemaining(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export const clip = (s: unknown, max: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
