// Aiguillage des commandes de vote venues du chat Rumble.
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { handleRumblePollVote } from "./polls.js";
import { handleRumblePredictionVote, handleRumbleRubisClaim } from "./predictions_ext.js";

// Le flux SSE rejoue l'historique à la (re)connexion : jamais de vote rejoué.
const fresh = (at: Date) => Number.isFinite(at.getTime()) && Date.now() - at.getTime() <= 120_000 && at.getTime() - Date.now() <= 30_000;

/**
 * Renvoie la réponse à poster sur Rumble, ou null si la commande ne concerne
 * pas un vote en cours (elle continue alors vers les autres gestionnaires,
 * ex. votes de mode Automod sur !1-!4).
 */
export async function handleRumbleVoteCommand(
  pool: Pool,
  io: Server | undefined,
  m: { streamerId: number; slug: string; rumbleUserId: string; username: string; text: string; createdAt: Date }
): Promise<string | null> {
  const text = m.text.trim();
  if (!fresh(m.createdAt)) return null;
  const num = /^!(\d{1,2})$/.exec(text);
  if (num) {
    const choice = Number(num[1]);
    return (await handleRumblePollVote(pool, io, m, choice)) ?? (await handleRumblePredictionVote(pool, io, m, choice));
  }
  if (/^!claim$/i.test(text)) return handleRumbleRubisClaim(pool, m);
  return null;
}
