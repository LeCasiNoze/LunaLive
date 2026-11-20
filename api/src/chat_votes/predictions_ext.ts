// Prédictions jouables depuis le chat Rumble : !1 / !2, changement de camp
// possible jusqu'à la fin des paris.
// - lecasinoze / belvaa (BCoins actifs) : mise en BCoins, identifiée par l'id
//   Rumble (portefeuille nozecoin_accounts, table prediction_ext_bets).
// - autres chaînes : mise en rubis via le compte LunaLive lié (prediction_bets).
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { inTransaction } from "../automod-shop/wallet.js";
import { validRumbleIdentity } from "../automod-shop/rules.js";
import { coinsSchema, InsufficientCoins, walletSid } from "../nozecoins/wallet.js";
import { move } from "../nozecoins/blackjack.js";
import { addBet, getActivePrediction } from "../predictions/predictions.store.js";
import type { PredictionRow } from "../predictions/predictions.types.js";
import { externalAccountsSchema, resolveExternalUser, CONNECTIONS_URL } from "../community/external-accounts.js";
import { getActiveSiteUserBan } from "../auth.js";
import { claimDailyBonusToday } from "../services/dailyBonus.js";
import { emitChatAll } from "../socket_emit.js";
import { clip, formatRemaining, pct, rumbleVoteTarget, sendRumbleVoteText } from "./rumble_out.js";

const TAX_RATE = 0.1;
const COIN_SLUGS = new Set(["lecasinoze", "belvaa"]);

export type RumbleVoteMessage = {
  streamerId: number;
  slug: string;
  rumbleUserId: string;
  username: string;
  createdAt: Date;
};

export function usesBCoins(slug: string) {
  return process.env.NOZECOINS_ENABLED === "true" && COIN_SLUGS.has(String(slug).toLowerCase());
}

const currencyLabel = (slug: string) => (usesBCoins(slug) ? "BCoins" : "rubis");
const betsOpen = (p: { status: string; bets_close_at: string | Date }) =>
  p.status === "open" && new Date(p.bets_close_at).getTime() > Date.now();

/** Mises rubis (site + Rumble lié) et BCoins (Rumble) réunies. */
export async function predictionTotals(pool: Pool, predictionId: number) {
  const r = await pool.query(
    `SELECT choice, COUNT(*)::int AS n, COALESCE(SUM(amount),0)::int AS total FROM (
       SELECT choice, amount FROM prediction_bets WHERE prediction_id=$1
       UNION ALL
       SELECT choice, amount FROM prediction_ext_bets WHERE prediction_id=$1
     ) x GROUP BY choice`,
    [predictionId]
  );
  const out = { count: 0, total1: 0, total2: 0, count1: 0, count2: 0 };
  for (const row of r.rows) {
    if (Number(row.choice) === 1) { out.total1 = Number(row.total); out.count1 = Number(row.n); }
    else if (Number(row.choice) === 2) { out.total2 = Number(row.total); out.count2 = Number(row.n); }
  }
  out.count = out.count1 + out.count2;
  return { ...out, totalStake: out.total1 + out.total2 };
}

export async function emitPredictionTotals(pool: Pool, io: Server | null | undefined, slug: string, predictionId: number) {
  if (!io) return;
  const t = await predictionTotals(pool, predictionId);
  emitChatAll(io, slug, "act:predict", {
    round: predictionId,
    pctYes: t.totalStake ? pct(t.total1, t.totalStake) : null,
    count: t.count,
    totalStake: t.totalStake,
  });
}

const optionLine = (p: PredictionRow, withCmd: boolean) =>
  `[1] ${clip(p.option1_label, 40)}${withCmd ? " → tape !1" : ""} | [2] ${clip(p.option2_label, 40)}${withCmd ? " → tape !2" : ""}`;

// ── annonces Rumble ──────────────────────────────────────────────────────

/** Annonce de lancement (une seule fois, réclamée atomiquement). */
export async function announcePredictionOnRumble(pool: Pool, slug: string, predictionId: number) {
  const claimed = await pool.query(
    `UPDATE predictions SET ext_announced_at=NOW(), ext_reminded_at=NOW()
      WHERE id=$1 AND ext_announced_at IS NULL AND status='open' AND bets_close_at > NOW()
      RETURNING *`,
    [predictionId]
  );
  const p = claimed.rows[0] as PredictionRow | undefined;
  if (!p) return;
  const vid = await rumbleVoteTarget(pool, Number(p.streamer_id));
  if (!vid) return;
  const left = formatRemaining(new Date(p.bets_close_at).getTime() - Date.now());
  await sendRumbleVoteText(pool, vid,
    `[PRÉDICTION] ${clip(p.question, 110)} | ${optionLine(p, true)} | Mise : ${Number(p.fixed_stake) || 10} ${currencyLabel(slug)} | Fin dans ${left} | Tu peux changer de camp avant la fin`);
}

export async function announcePredictionResultOnRumble(pool: Pool, pred: PredictionRow, winning: 1 | 2) {
  const vid = await rumbleVoteTarget(pool, Number(pred.streamer_id));
  if (!vid) return;
  const label = winning === 1 ? pred.option1_label : pred.option2_label;
  await sendRumbleVoteText(pool, vid, `[PRÉDICTION] Résultat : [${winning}] ${clip(label, 60)} l'emporte | Gains crédités aux gagnants`);
}

/** Rappels périodiques + annonce de fermeture des paris (appelé par le ticker). */
export async function tickPredictionsOnRumble(pool: Pool, reminderSec: number) {
  const due = await pool.query(
    `SELECT p.*, s.slug FROM predictions p JOIN streamers s ON s.id=p.streamer_id
      WHERE p.status IN ('open','locked') AND p.ext_closed_announced_at IS NULL
        AND p.created_at > NOW() - INTERVAL '6 hours'
        AND lower(s.platform)='rumble'`
  );
  for (const row of due.rows) {
    const p = row as PredictionRow & { slug: string; ext_announced_at: Date | null; ext_reminded_at: Date | null };
    const remaining = new Date(p.bets_close_at).getTime() - Date.now();
    if (!p.ext_announced_at) {
      if (remaining > 10_000) await announcePredictionOnRumble(pool, p.slug, Number(p.id));
      else await pool.query(`UPDATE predictions SET ext_announced_at=NOW() WHERE id=$1 AND ext_announced_at IS NULL`, [p.id]);
      continue;
    }
    if (remaining <= 0) {
      const claimed = await pool.query(
        `UPDATE predictions SET ext_closed_announced_at=NOW() WHERE id=$1 AND ext_closed_announced_at IS NULL RETURNING id`, [p.id]);
      if (!claimed.rows[0]) continue;
      const vid = await rumbleVoteTarget(pool, Number(p.streamer_id));
      if (!vid) continue;
      const t = await predictionTotals(pool, Number(p.id));
      await sendRumbleVoteText(pool, vid,
        `[PRÉDICTION] Paris fermés | [1] ${clip(p.option1_label, 40)} ${pct(t.total1, t.totalStake)}% | [2] ${clip(p.option2_label, 40)} ${pct(t.total2, t.totalStake)}% | ${t.count} parieur${t.count > 1 ? "s" : ""} | Résultat bientôt`);
      continue;
    }
    if (remaining < 15_000) continue;
    const claimed = await pool.query(
      `UPDATE predictions SET ext_reminded_at=NOW()
        WHERE id=$1 AND (ext_reminded_at IS NULL OR ext_reminded_at <= NOW() - ($2 || ' seconds')::interval) RETURNING id`,
      [p.id, reminderSec]
    );
    if (!claimed.rows[0]) continue;
    const vid = await rumbleVoteTarget(pool, Number(p.streamer_id));
    if (!vid) continue;
    const t = await predictionTotals(pool, Number(p.id));
    await sendRumbleVoteText(pool, vid,
      `[PRÉDICTION] Plus que ${formatRemaining(remaining)} pour parier | ${optionLine(p, true)} | ${t.count} parieur${t.count > 1 ? "s" : ""}`);
  }
}

// ── paris depuis Rumble ──────────────────────────────────────────────────

/** Bascule une mise rubis existante vers l'autre camp (mise inchangée). */
export async function switchRubisBet(pool: Pool, predictionId: number, userId: number, choice: 1 | 2) {
  return inTransaction(pool, async (c) => {
    const p = (await c.query(`SELECT status, bets_close_at FROM predictions WHERE id=$1 FOR UPDATE`, [predictionId])).rows[0];
    if (!p || !betsOpen(p)) throw new Error("bets_closed");
    const bet = (await c.query(`SELECT choice, amount FROM prediction_bets WHERE prediction_id=$1 AND user_id=$2 FOR UPDATE`, [predictionId, userId])).rows[0];
    if (!bet) return "none" as const;
    if (Number(bet.choice) === choice) return "same" as const;
    const amount = Number(bet.amount);
    await c.query(`UPDATE prediction_bets SET choice=$3 WHERE prediction_id=$1 AND user_id=$2`, [predictionId, userId, choice]);
    await c.query(
      `UPDATE predictions SET total_pool_1=total_pool_1+$2, total_pool_2=total_pool_2-$2 WHERE id=$1`,
      [predictionId, choice === 1 ? amount : -amount]
    );
    return "switched" as const;
  });
}

async function betWithBCoins(pool: Pool, m: RumbleVoteMessage, p: PredictionRow, choice: 1 | 2): Promise<string> {
  await coinsSchema(pool);
  const sid = await walletSid(pool, m.streamerId);
  const stake = Math.max(1, Number(p.fixed_stake) || 10);
  const label = choice === 1 ? p.option1_label : p.option2_label;
  try {
    const outcome = await inTransaction(pool, async (c) => {
      const cur = (await c.query(`SELECT status, bets_close_at FROM predictions WHERE id=$1 FOR UPDATE`, [p.id])).rows[0];
      if (!cur || !betsOpen(cur)) return "closed" as const;
      const prev = (await c.query(
        `SELECT choice FROM prediction_ext_bets WHERE prediction_id=$1 AND provider='rumble' AND external_id=$2 FOR UPDATE`,
        [p.id, m.rumbleUserId])).rows[0];
      if (prev) {
        if (Number(prev.choice) === choice) return "same" as const;
        await c.query(
          `UPDATE prediction_ext_bets SET choice=$3, username=$4, updated_at=NOW() WHERE prediction_id=$1 AND provider='rumble' AND external_id=$2`,
          [p.id, m.rumbleUserId, choice, m.username.slice(0, 80)]);
        return "switched" as const;
      }
      await c.query(
        `INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username) VALUES($1,$2,$3)
         ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET username=EXCLUDED.username`,
        [sid, m.rumbleUserId, m.username.slice(0, 80)]);
      await c.query(`SELECT 1 FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE`, [sid, m.rumbleUserId]);
      await move(c, sid, m.rumbleUserId, -stake, `prediction:${p.id}:bet`, "prediction_bet");
      await c.query(
        `INSERT INTO prediction_ext_bets(prediction_id,provider,external_id,username,wallet_sid,choice,amount)
         VALUES($1,'rumble',$2,$3,$4,$5,$6)`,
        [p.id, m.rumbleUserId, m.username.slice(0, 80), sid, choice, stake]);
      return "placed" as const;
    });
    if (outcome === "closed") return `@${m.username} les paris sont fermés.`;
    if (outcome === "same") return `@${m.username} tu es déjà sur [${choice}] ${clip(label, 50)}.`;
    if (outcome === "switched") return `@${m.username} camp changé : [${choice}] ${clip(label, 50)}.`;
    return `@${m.username} pari enregistré : [${choice}] ${clip(label, 50)} (${stake} BCoins).`;
  } catch (e) {
    if (e instanceof InsufficientCoins) {
      return `@${m.username} pas assez de BCoins (solde ${e.balance}, mise ${stake}). Tape !claim pour en recevoir.`;
    }
    throw e;
  }
}

async function betWithRubis(pool: Pool, m: RumbleVoteMessage, p: PredictionRow, choice: 1 | 2): Promise<string> {
  await externalAccountsSchema(pool);
  let userId: number | null;
  try { userId = await resolveExternalUser(pool, "rumble", m.rumbleUserId, m.streamerId); }
  catch { return `@${m.username} vérifie tes comptes liés : ${CONNECTIONS_URL}`; }
  if (!userId) return `@${m.username} lie ton compte Rumble à LunaLive pour parier en rubis : ${CONNECTIONS_URL}`;
  if ((await getActiveSiteUserBan(userId)).banned) return `@${m.username} participation indisponible.`;
  const label = choice === 1 ? p.option1_label : p.option2_label;
  const switched = await switchRubisBet(pool, Number(p.id), userId, choice);
  if (switched === "same") return `@${m.username} tu es déjà sur [${choice}] ${clip(label, 50)}.`;
  if (switched === "switched") return `@${m.username} camp changé : [${choice}] ${clip(label, 50)}.`;
  const stake = Math.max(1, Number(p.fixed_stake) || 10);
  try {
    await addBet(pool, p, userId, choice, stake);
  } catch (e) {
    const code = String((e as Error)?.message || "");
    if (code === "insufficient_rubis") return `@${m.username} pas assez de rubis (mise ${stake}). Tape !claim pour ton bonus du jour.`;
    if (code === "bets_closed") return `@${m.username} les paris sont fermés.`;
    throw e;
  }
  return `@${m.username} pari enregistré : [${choice}] ${clip(label, 50)} (${stake} rubis).`;
}

/**
 * !N pendant une prédiction ouverte. Renvoie la réponse à poster sur Rumble,
 * ou null si aucune prédiction n'est active (la commande suit son chemin habituel).
 */
export async function handleRumblePredictionVote(pool: Pool, io: Server | undefined, m: RumbleVoteMessage, choice: number) {
  const p = await getActivePrediction(pool, m.streamerId);
  if (!p) return null;
  if (!betsOpen(p)) {
    // Fenêtre de résolution : on répond seulement si la fin est récente.
    if (Date.now() - new Date(p.bets_close_at).getTime() > 10 * 60_000) return null;
    return `@${m.username} les paris sont fermés.`;
  }
  if (choice !== 1 && choice !== 2) return `@${m.username} choix invalide : tape !1 ou !2.`;
  if (!validRumbleIdentity(m.rumbleUserId)) return null;
  const reply = usesBCoins(m.slug)
    ? await betWithBCoins(pool, m, p, choice)
    : await betWithRubis(pool, m, p, choice);
  await emitPredictionTotals(pool, io, m.slug, Number(p.id)).catch(() => {});
  return reply;
}

/** !claim sur une chaîne en rubis : bonus quotidien du compte LunaLive lié. */
export async function handleRumbleRubisClaim(pool: Pool, m: RumbleVoteMessage) {
  if (usesBCoins(m.slug)) return null;
  await externalAccountsSchema(pool);
  let userId: number | null;
  try { userId = await resolveExternalUser(pool, "rumble", m.rumbleUserId, m.streamerId); }
  catch { return `@${m.username} vérifie tes comptes liés : ${CONNECTIONS_URL}`; }
  if (!userId) return `@${m.username} lie ton compte Rumble à LunaLive pour recevoir tes rubis : ${CONNECTIONS_URL}`;
  if ((await getActiveSiteUserBan(userId)).banned) return `@${m.username} indisponible.`;
  const r = await claimDailyBonusToday(pool, userId);
  if (r.alreadyClaimed) return `@${m.username} bonus du jour déjà récupéré. Reviens demain !`;
  const rubis = r.granted.filter((g: any) => g.type === "rubis").reduce((a: number, g: any) => a + Number(g.amount || 0), 0);
  return rubis > 0
    ? `@${m.username} bonus du jour : +${rubis} rubis.`
    : `@${m.username} bonus du jour récupéré (ticket de roue sur LunaLive).`;
}

/** Gains BCoins des mises Rumble (pot séparé du pot rubis, même taxe de 10 %). */
export async function settleExtPredictionBets(pool: Pool, pred: PredictionRow, winning: 1 | 2) {
  const bets = (await pool.query(
    `SELECT external_id, wallet_sid, choice, amount FROM prediction_ext_bets WHERE prediction_id=$1 AND provider='rumble'`,
    [pred.id])).rows;
  if (!bets.length) return;
  await coinsSchema(pool);
  const potTotal = bets.reduce((a, b) => a + Number(b.amount), 0);
  const potNet = potTotal - Math.floor(potTotal * TAX_RATE);
  const winners = bets.filter((b) => Number(b.choice) === winning);
  const poolWin = winners.reduce((a, b) => a + Number(b.amount), 0);
  await inTransaction(pool, async (c) => {
    for (const w of winners) {
      const gain = poolWin > 0 ? Math.floor((Number(w.amount) * potNet) / poolWin) : 0;
      if (gain > 0) await move(c, Number(w.wallet_sid), String(w.external_id), gain, `prediction:${pred.id}:win`, "prediction_win");
      await c.query(
        `UPDATE prediction_ext_bets SET payout=$3 WHERE prediction_id=$1 AND provider='rumble' AND external_id=$2`,
        [pred.id, w.external_id, gain]);
    }
    await c.query(`UPDATE prediction_ext_bets SET payout=0 WHERE prediction_id=$1 AND choice<>$2`, [pred.id, winning]);
  });
}
