import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { addToken, grantEntitlement } from "../services/dailyBonus.js";
import { CHEST_PALIERS } from "./global_chest.js";
import { awardXpTx } from "../economy/xp.js";
import { rankViewerWeekStreamers } from "./viewer_week.js";
import { eventRewardEligibilitySql } from "./eligibility.js";
import { getRankedClips, getRankedStreamers, resolveClipCreatorUserId } from "./clip_race.js";
import { getRankedDuos } from "./duo_week.js";

// Nombre de lignes figées dans events.result.top à la clôture. Générique
// (pas de dépendance à un event précis) : tous les types partagent la même
// taille de snapshot top.
const REWARD_TOP_SNAPSHOT_N = 10;

/**
 * Config de récompense par type d'event. Objet TS structuré pour pouvoir
 * migrer vers event_type_configs (DB) plus tard sans changer l'appelant.
 */
type RewardTier = {
  rankFrom: number;
  rankTo: number;
  rubis: number;
  entitlement?: { kind: "skin" | "title"; codeTemplate: string }; // "YYYYMM" remplacé par le mois de l'event
};

type ParticipationConfig = {
  minScore: number;
  rubis: number;
  wheelTickets: number;
  maxRecipients: number;
};

// Récompense "collective" (mode:'collective') : pas de classement, un seul
// palier commun (SUM event_scores.points >= goal) qui, s'il est atteint,
// donne la MÊME récompense à tout contributeur au-dessus de minContribution.
// Récompense "coffre" (mode:'collective'). Les paliers escaladants (rubis +
// tickets) sont réclamés EN DIRECT pendant l'event (cf events/global_chest.ts
// CHEST_PALIERS / claimChestPalier). À la clôture, si la commu a franchi au
// moins le 1er palier : skin exclusif au top-3 contributeurs (permanent, comme
// la roue) + titre "remis en jeu" au #1. Pas de récompense cosmétique à TOUS
// (réservée aux tops, cf feedback Lucas) — le lot "tout le monde" est les paliers.
type CollectiveRewardConfig = {
  minContribution: number;
  topSkinCode: string; // top-3 : cadre exclusif (permanent, jamais révoqué — cf distributeWheel)
  topTitleCode: string; // #1 : titre remis en jeu (cf revokePreviousTitle)
};

// Union discriminée par `mode` : absent = ranking classique (tiers +
// participation), 'collective' = un seul palier commun (cf CollectiveRewardConfig).
type RankingEventRewardConfig = {
  mode?: undefined;
  tiers: RewardTier[];
  participation: ParticipationConfig;
  rubisOrigin: string;
  // Classement STREAMERS (team) — distribué EN PLUS du classement viewer, à la
  // clôture (cf distributeViewerStreamers). subs = coupons 'sub_ticket' au
  // compte du streamer ; rubisToChest = dépôt dans le coffre de sa commu ;
  // featured (rang 1) = mise en avant /lives. Optionnel (viewer_week seul).
  streamerTiers?: {
    chestLotWeightBp: number;
    featuredDays: number;
    tiers: Array<{ rank: number; subs: number; rubisToChest: number }>;
  };
};

type CollectiveEventRewardConfig = {
  mode: "collective";
  collective: CollectiveRewardConfig;
};

// Récompense "sur mesure" (mode:'clip_race') : double classement (clip +
// streamer), pas un simple top-N générique — cf distributeClipRace. Le
// classement lui-même n'est pas dans EVENT_REWARD_CONFIGS (il vit dans
// events/clip_race.ts, recomputé en continu) ; cette config ne porte que le
// barème des lots.
type ClipRaceRewardConfig = {
  // Classement STREAMERS top-3 : subs (coupons sub_ticket) + dépôt coffre +
  // featured (rang 1) + badge (rang 1). Subs volontairement bas (équilibre éco).
  streamerTiers: {
    chestLotWeightBp: number; // poids du lot dans le tirage du coffre (0-2000)
    featuredDays: number; // streamers.featured=true pour le rang 1
    entitlement: { kind: "skin" | "title"; codeTemplate: string }; // badge rang 1
    tiers: Array<{ rank: number; subs: number; rubisToChest: number }>;
  };
  clipTiers: Array<{ rank: number; rubis: number }>; // top-3 clips, rubis au créateur
  creatorSubDays: number; // abo viewer offert au créateur du clip rang 1
  participation: { rubisPerVote: number; maxRubis: number; maxRecipients: number }; // votants : rubisPerVote/vote, plafond maxRubis
  rubisOrigin: string;
};

type ClipRaceEventRewardConfig = {
  mode: "clip_race";
  clipRace: ClipRaceRewardConfig;
};

// Récompense "boss" (mode:'boss', cf docs/events-design.md #5) : un total (SUM
// event_scores.points, mix activité + burns rubis × ratio, cf
// events/burn_boss.ts) comparé à un seuil (hp). Boss tué → à TOUT contributeur
// ≥ minDamage : badge + XP + ticket de roue + 3j de premium promo (perks dont
// !pcall, sans ticket sub) + rubis selon sa TRANCHE DE RANG (dégressif). Le
// top-3 dégâts gagne en plus le cadre "flammes", le #1 le titre remis en jeu.
// Boss survit → aucun grant (spec Lucas), mais hp calibrée bas pour que ce soit
// rare au début.
type BossRewardConfig = {
  hp: number; // vie totale du boss (dégâts cumulés event_scores.points >= hp => tué)
  ratio: number; // 1 rubis brûlé (event_boss_damage) = `ratio` dégâts, lu par events/burn_boss.ts
  minDamage: number; // seuil pour toucher la moindre récompense + le badge
  entitlement: { kind: "skin" | "title"; codeTemplate: string }; // badge "Boss Slayer" à tous ≥ minDamage
  rubisBrackets: Array<{ maxRank: number; rubis: number }>; // rubis dégressif par tranche de rang (1er match)
  allXp: number; // XP à tout contributeur ≥ minDamage
  allWheelTickets: number; // tickets de roue à tous ≥ minDamage
  allPremiumDays: number; // abo viewer promo offert à tous (perks only, pas de ticket sub — cf grantCycleBenefits Stripe-only)
  topSkinCode: string; // top-3 dégâts : cadre exclusif "flammes" (permanent)
  topTitleCode: string; // #1 dégâts : titre remis en jeu (cf revokePreviousTitle)
  rubisOrigin: string;
};

type BossEventRewardConfig = {
  mode: "boss";
  boss: BossRewardConfig;
};

// Récompense "duo" (mode:'duo', cf docs/events-design.md #6) : le classement
// (event_duos + event_duo_scores, cf events/duo_week.ts getRankedDuos) n'est
// pas un simple top-N générique — récompense DOUBLE comme clip_race (badge
// titre aux 2 streamers du duo #1 + participation aux membres des 2 commus),
// donc branchée sur son propre distributeDuo plutôt que sur le ranking
// provider générique.
type DuoRewardConfig = {
  champTitleTemplate: string; // "duo_champ_YYYYMM"
  memberRubis: number; // versé à chaque membre éligible des 2 commus du duo gagnant
  maxRecipients: number; // cap de sécurité (commu de duo = 2 streamers cumulés, potentiellement large)
  rubisOrigin: string;
};

type DuoEventRewardConfig = {
  mode: "duo";
  duo: DuoRewardConfig;
};

// Récompense "roue" (mode:'wheel', cf docs/events-design.md #2 REDESIGN v2).
// Contrairement à RankingEventRewardConfig, PAS de rubis de classement ni de
// participation : les paliers (250/600/1300/2400/4000/7500 pts) sont déjà
// réclamés EN DIRECT pendant l'event (cf events/wheel_event.ts claimPaliers).
// À la clôture, seul le classement compte, prestige only — cf distributeWheel.
type WheelRewardConfig = {
  frameCode: string; // top-3 : cadre de message exclusif (permanent, jamais révoqué)
  titleCode: string; // #1 : titre "remis en jeu" (cf revokePreviousTitle) — code FIXE, pas de suffixe YYYYMM
  championSubDays: number; // #1 : abo viewer offert
};

type WheelEventRewardConfig = {
  mode: "wheel";
  wheel: WheelRewardConfig;
};

type EventRewardConfig =
  | RankingEventRewardConfig
  | CollectiveEventRewardConfig
  | ClipRaceEventRewardConfig
  | BossEventRewardConfig
  | DuoEventRewardConfig
  | WheelEventRewardConfig;

export const EVENT_REWARD_CONFIGS: Record<string, EventRewardConfig> = {
  viewer_week: {
    tiers: [
      { rankFrom: 1, rankTo: 1, rubis: 600, entitlement: { kind: "title", codeTemplate: "vw_champion_YYYYMM" } },
      { rankFrom: 2, rankTo: 3, rubis: 300 },
      { rankFrom: 4, rankTo: 5, rubis: 150 },
    ],
    participation: { minScore: 200, rubis: 40, wheelTickets: 1, maxRecipients: 40 },
    rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    streamerTiers: {
      chestLotWeightBp: 2000, // pleinement tirable (cf chest_auto)
      featuredDays: 7,
      tiers: [
        { rank: 1, subs: 10, rubisToChest: 1000 },
        { rank: 2, subs: 5, rubisToChest: 500 },
        { rank: 3, subs: 3, rubisToChest: 300 },
        { rank: 4, subs: 0, rubisToChest: 100 },
        { rank: 5, subs: 0, rubisToChest: 50 },
      ],
    },
  },
  wheel_week: {
    mode: "wheel",
    wheel: {
      // Codes cf docs/events-cosmetics-todo.md — fixes (pas de YYYYMM) : le
      // cadre s'accumule (permanent, plusieurs joueurs peuvent le porter),
      // le titre est unique et remis en jeu à chaque retour de l'event.
      frameCode: "frame_wheel_roulette",
      titleCode: "title_wheel_king",
      championSubDays: 7,
    },
  },
  global_chest: {
    mode: "collective",
    collective: {
      // Seuil de contribution perso pour toucher le badge de clôture + réclamer
      // les paliers (cf events/global_chest.ts CHEST_MIN_CONTRIBUTION). Les
      // paliers escaladants (rubis/tickets) sont réclamés en direct ; la clôture
      // ne distribue que le prestige : badge à tous + skin top-3 + titre #1.
      minContribution: 50,
      // Codes cosmétiques cf docs/events-cosmetics-todo.md — fixes (pas de
      // YYYYMM) : le skin top-3 s'accumule (permanent), le titre #1 est unique
      // et remis en jeu à chaque retour de l'event.
      topSkinCode: "frame_chest_vault",
      topTitleCode: "title_chest_baron",
    },
  },
  clip_race: {
    mode: "clip_race",
    clipRace: {
      streamerTiers: {
        chestLotWeightBp: 2000, // pleinement tirable (cf chest_auto)
        featuredDays: 7,
        entitlement: { kind: "title", codeTemplate: "clip_race_streamer_YYYYMM" },
        // UN SEUL gagnant (validé Lucas). Subs BAS (20/sem = trop).
        tiers: [
          { rank: 1, subs: 3, rubisToChest: 500 },
        ],
      },
      clipTiers: [
        { rank: 1, rubis: 200 },
      ],
      creatorSubDays: 7,
      participation: { rubisPerVote: 10, maxRubis: 50, maxRecipients: 100 },
      rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    },
  },
  burn_boss: {
    mode: "boss",
    boss: {
      // HP recalibrée BAS (petite commu) pour que le boss soit réellement
      // battable dès les premiers runs — sinon "rien si le boss survit" mord
      // trop (crainte Lucas). Repère mesuré : le coffre de test a fait ~1189
      // dégâts en 4 jours avec 12 contributeurs SANS aucun burn ; sur une
      // semaine c'est ~2000+ de dégâts gratuits, donc 2500 tombe avec
      // l'activité seule + quelques burns. La tension binaire reste sans que
      // la défaite soit réaliste au début. À remonter quand la commu grossira.
      hp: 2500,
      ratio: 1, // 1 rubis brûlé = 1 dégât
      minDamage: 50, // seuil pour toucher la moindre récompense + le badge
      entitlement: { kind: "title", codeTemplate: "boss_slayer_YYYYMM" },
      // Rubis dégressif par tranche de rang dégâts (tranches exclusives, 1er
      // match gagnant). Le top-3 touche le gros, la longue traîne un petit lot.
      rubisBrackets: [
        { maxRank: 1, rubis: 300 },
        { maxRank: 2, rubis: 200 },
        { maxRank: 3, rubis: 120 },
        { maxRank: 10, rubis: 60 },
        { maxRank: 50, rubis: 30 },
        { maxRank: 100, rubis: 15 },
      ],
      allXp: 100,
      allWheelTickets: 1,
      allPremiumDays: 3, // premium viewer promo — perks (dont !pcall) SANS ticket sub ni rubis de cycle
      topSkinCode: "frame_boss_flames",
      topTitleCode: "title_boss_bourreau",
      rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    },
  },
  duo_week: {
    mode: "duo",
    duo: {
      // Titre exclusif "duo_champ_YYYYMM" aux 2 streamers du duo #1 (comme
      // vw_champion/wheel_king) — badge, coût nul.
      champTitleTemplate: "duo_champ_YYYYMM",
      // Même ordre de grandeur que le lot de participation des autres events
      // (viewer_week/wheel_week: 40 rubis), versé ici aux membres des DEUX
      // commus du duo gagnant — une base large de joueurs en profite d'un coup.
      memberRubis: 40,
      // Cap de sécurité : une commu de duo cumule potentiellement deux
      // streamers, donc plus large qu'un top-40 classique. À remonter une
      // fois le volume réel mesuré (même logique que global_chest.collective.goal).
      maxRecipients: 200,
      rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    },
  },
};

export type RankedRow = {
  userId: number;
  username: string;
  points: number;
  rank: number;
};

// Le classement est le SEUL morceau spécifique au type d'event ; tout le
// reste de closeAndDistribute est générique et se branche sur n'importe quel
// type ayant un ranking provider + une config ci-dessus.
type RankingProvider = (client: PoolClient, eventId: number) => Promise<RankedRow[]>;

async function rankViewerWeek(client: PoolClient, eventId: number): Promise<RankedRow[]> {
  const r = await client.query(
    `
    SELECT s.user_id, u.username, s.points
    FROM event_scores_viewer_week s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    `,
    [eventId]
  );

  return (r.rows || []).map((row: any, idx: number) => ({
    userId: Number(row.user_id),
    username: String(row.username),
    points: Number(row.points),
    rank: idx + 1,
  }));
}

async function rankWheelWeek(client: PoolClient, eventId: number): Promise<RankedRow[]> {
  const r = await client.query(
    `
    SELECT s.user_id, u.username, s.points
    FROM event_scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    `,
    [eventId]
  );

  return (r.rows || []).map((row: any, idx: number) => ({
    userId: Number(row.user_id),
    username: String(row.username),
    points: Number(row.points),
    rank: idx + 1,
  }));
}

// wheel_week n'y figure plus (mode:'wheel', branché directement dans
// closeAndDistribute) — rankWheelWeek reste utilisée par distributeWheel.
const RANKING_PROVIDERS: Record<string, RankingProvider> = {
  viewer_week: rankViewerWeek,
};

export type CloseAndDistributeResult =
  | { ok: true; alreadyDistributed: boolean; winners: number; participants: number; rubisTotal: number }
  | { ok: false; error: string };

/**
 * Fige le classement d'un event dans events.result puis distribue les lots
 * (tiers top-N + participation). Idempotent : si des event_reward_grants
 * existent déjà pour cet event, ne redistribue rien.
 */
export async function closeAndDistribute(eventId: number): Promise<CloseAndDistributeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Sérialise les appels concurrents (engine + admin de test) sur le même event.
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [eventId]);

    const evRes = await client.query(`SELECT * FROM events WHERE id=$1`, [eventId]);
    const event = evRes.rows?.[0];
    if (!event) {
      await client.query("ROLLBACK");
      return { ok: false, error: "event_not_found" };
    }

    const config = EVENT_REWARD_CONFIGS[event.type];
    if (!config) {
      await client.query("ROLLBACK");
      return { ok: false, error: "unsupported_type" };
    }

    const existing = await client.query(
      `SELECT tier, rubis FROM event_reward_grants WHERE event_id=$1`,
      [eventId]
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query("COMMIT");
      const winners = existing.rows.filter((r: any) => r.tier === "win").length;
      const participants = existing.rows.filter((r: any) => r.tier === "participation").length;
      const rubisTotal = existing.rows.reduce((sum: number, r: any) => sum + Number(r.rubis || 0), 0);
      return { ok: true, alreadyDistributed: true, winners, participants, rubisTotal };
    }

    if (config.mode === "collective") {
      return await distributeCollective(client, eventId, event, config.collective);
    }

    if (config.mode === "clip_race") {
      return await distributeClipRace(client, eventId, event, config.clipRace);
    }

    if (config.mode === "boss") {
      return await distributeBoss(client, eventId, event, config.boss);
    }

    if (config.mode === "duo") {
      return await distributeDuo(client, eventId, event, config.duo);
    }

    if (config.mode === "wheel") {
      return await distributeWheel(client, eventId, event, config.wheel);
    }

    const rankingProvider = RANKING_PROVIDERS[event.type];
    if (!rankingProvider) {
      await client.query("ROLLBACK");
      return { ok: false, error: "unsupported_type" };
    }

    const ranked = await rankingProvider(client, eventId);

    const ymRes = await client.query(
      `SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`,
      [event.start_at]
    );
    const ym = String(ymRes.rows?.[0]?.ym ?? "");

    const topSnapshot = ranked.slice(0, REWARD_TOP_SNAPSHOT_N).map((r) => ({
      userId: r.userId,
      username: r.username,
      points: r.points,
      rank: r.rank,
    }));

    await client.query(
      `UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`,
      [eventId, JSON.stringify({ rankedAt: new Date().toISOString(), top: topSnapshot, distributed: true })]
    );

    let winners = 0;
    let participants = 0;
    let rubisTotal = 0;
    const winnerUserIds = new Set<number>();

    for (const tier of config.tiers) {
      const rowsInTier = ranked.filter((r) => r.rank >= tier.rankFrom && r.rank <= tier.rankTo);

      for (const row of rowsInTier) {
        winnerUserIds.add(row.userId);

        await earnRubisTx(client, row.userId, config.rubisOrigin, tier.rubis, {
          purpose: "event_reward",
          eventId,
          eventType: event.type,
          tier: "win",
          rank: row.rank,
        });

        const extras: Record<string, any> = {};

        if (tier.entitlement) {
          const code = tier.entitlement.codeTemplate.replace("YYYYMM", ym);
          await grantEntitlement(client, row.userId, tier.entitlement.kind, code);
          extras.entitlement = { kind: tier.entitlement.kind, code };
        }

        await client.query(
          `
          INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
          VALUES ($1,$2,'win',$3,$4,$5::jsonb)
          ON CONFLICT (event_id, user_id) DO NOTHING
          `,
          [eventId, row.userId, row.rank, tier.rubis, JSON.stringify(extras)]
        );

        winners += 1;
        rubisTotal += tier.rubis;
      }
    }

    const participationCandidates = ranked
      .filter((r) => !winnerUserIds.has(r.userId) && r.points >= config.participation.minScore)
      .slice(0, config.participation.maxRecipients);

    for (const row of participationCandidates) {
      await earnRubisTx(client, row.userId, config.rubisOrigin, config.participation.rubis, {
        purpose: "event_reward",
        eventId,
        eventType: event.type,
        tier: "participation",
      });

      await addToken(client, row.userId, "wheel_ticket", config.participation.wheelTickets);

      await client.query(
        `
        INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
        VALUES ($1,$2,'participation',$3,$4,$5::jsonb)
        ON CONFLICT (event_id, user_id) DO NOTHING
        `,
        [
          eventId,
          row.userId,
          row.rank,
          config.participation.rubis,
          JSON.stringify({ wheelTickets: config.participation.wheelTickets }),
        ]
      );

      participants += 1;
      rubisTotal += config.participation.rubis;
    }

    // Classement STREAMERS (team, viewer_week) : subs + dépôt coffre + mise en
    // avant au top-5, dans la même transaction que la distribution viewer.
    if (config.streamerTiers) {
      await distributeViewerStreamers(client, eventId, config.streamerTiers);
    }

    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners, participants, rubisTotal };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Distribution du classement STREAMERS (viewer_week — mécanique team) : top-5.
 * Récompenses = subs à distribuer (coupons 'sub_ticket' au compte du streamer),
 * dépôt de rubis dans le coffre de sa commu (streamer_chest_lots, pas son wallet
 * perso), et mise en avant /lives (streamers.featured) pour le rang 1. Exécutée
 * dans la transaction de closeAndDistribute (pas de COMMIT ici).
 */
async function distributeViewerStreamers(
  client: PoolClient,
  eventId: number,
  cfg: NonNullable<RankingEventRewardConfig["streamerTiers"]>
) {
  const ranked = await rankViewerWeekStreamers(eventId, 5, client);

  for (const tier of cfg.tiers) {
    const st = ranked.find((r) => r.rank === tier.rank);
    if (!st) continue;

    if (tier.rubisToChest > 0) {
      await client.query(
        `INSERT INTO streamer_chests (streamer_id) VALUES ($1) ON CONFLICT (streamer_id) DO NOTHING`,
        [st.streamerId]
      );
      await client.query(
        `INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
         VALUES ($1, 'event_viewer_week', $2, $3, $4::jsonb)`,
        [st.streamerId, cfg.chestLotWeightBp, tier.rubisToChest, JSON.stringify({ eventId, eventType: "viewer_week", rank: tier.rank })]
      );
    }

    if (tier.rank === 1 && cfg.featuredDays > 0) {
      await client.query(
        `UPDATE streamers SET featured=true, featured_until=NOW() + ($2::int * INTERVAL '1 day'), updated_at=NOW() WHERE id=$1`,
        [st.streamerId, cfg.featuredDays]
      );
    }

    if (tier.subs > 0 && st.userId) {
      await client.query(
        `INSERT INTO user_coupons (user_id, code, qty, updated_at)
         VALUES ($1, 'sub_ticket', $2, NOW())
         ON CONFLICT (user_id, code) DO UPDATE SET qty = user_coupons.qty + $2, updated_at = NOW()`,
        [st.userId, tier.subs]
      );
    }

    if (st.userId) {
      await client.query(
        `INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
         VALUES ($1,$2,'win',$3,0,$4::jsonb)
         ON CONFLICT (event_id, user_id) DO NOTHING`,
        [
          eventId,
          st.userId,
          tier.rank,
          JSON.stringify({ kind: "streamer_win", streamerId: st.streamerId, slug: st.slug, subs: tier.subs, rubisToChest: tier.rubisToChest, featured: tier.rank === 1 }),
        ]
      );
    }
  }
}

/**
 * Distribution "collective" (Coffre communautaire). Les paliers escaladants
 * (rubis + tickets) sont réclamés EN DIRECT pendant l'event (cf
 * events/global_chest.ts claimChestPalier) : la clôture ne distribue donc que
 * le PRESTIGE, et seulement si la commu a franchi au moins le 1er palier (le
 * coffre a "réussi"). Miroir de distributeWheel : top-3 contributeurs = skin
 * exclusif (permanent) ; #1 = titre remis en jeu. Rien pour tout le monde ici
 * (cosmétique réservé aux tops, cf feedback Lucas). Appelée depuis
 * closeAndDistribute, dans la même transaction (COMMIT/ROLLBACK final).
 */
async function distributeCollective(
  client: PoolClient,
  eventId: number,
  event: any,
  cfg: CollectiveRewardConfig
): Promise<CloseAndDistributeResult> {
  const totalRes = await client.query(
    `SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`,
    [eventId]
  );
  const communityTotal = Number(totalRes.rows?.[0]?.total ?? 0);
  const firstThreshold = CHEST_PALIERS.length ? CHEST_PALIERS[0].threshold : 1;
  const finalGoal = CHEST_PALIERS.length ? CHEST_PALIERS[CHEST_PALIERS.length - 1].threshold : 0;
  const reached = communityTotal >= firstThreshold;

  const rankedRes = await client.query(
    `
    SELECT s.user_id, u.username, s.points,
           ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
    FROM event_scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND s.points >= $2
      AND ${eventRewardEligibilitySql("s.user_id")}
    `,
    [eventId, cfg.minContribution]
  );
  const ranked = (rankedRes.rows || []).map((r: any) => ({
    userId: Number(r.user_id),
    username: String(r.username),
    points: Number(r.points),
    rank: Number(r.rank),
  }));

  const topSnapshot = ranked.slice(0, REWARD_TOP_SNAPSHOT_N).map((r) => ({
    userId: r.userId,
    username: r.username,
    points: r.points,
    rank: r.rank,
  }));

  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({ communityTotal, goal: finalGoal, reached, topContributors: topSnapshot }),
  ]);

  if (!reached || !ranked.length) {
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const top3 = ranked.filter((r) => r.rank <= 3);
  let winners = 0;

  for (const row of top3) {
    const extras: Record<string, any> = {};

    await grantEntitlement(client, row.userId, "skin", cfg.topSkinCode);
    extras.entitlement = { kind: "skin", code: cfg.topSkinCode };

    if (row.rank === 1) {
      await revokePreviousTitle(client, cfg.topTitleCode);
      await grantEntitlement(client, row.userId, "title", cfg.topTitleCode);
      extras.title = cfg.topTitleCode;
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,'win',$3,0,$4::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, row.userId, row.rank, JSON.stringify(extras)]
    );

    winners += 1;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners, participants: 0, rubisTotal: 0 };
}

/**
 * Distribution "boss" (Boss à abattre, cf docs/events-design.md #5). Comme
 * distributeCollective, un seul total (SUM event_scores.points, mix activité
 * + burns rubis × ratio, cf events/burn_boss.ts) comparé à un seuil (hp). Si
 * le boss n'est PAS tué : events.result {killed:false}, aucun grant (spec
 * Lucas — pas de lot de consolation). Si tué, DEUX récompenses cumulables
 * pour un même compte (pattern Map `grants`, comme distributeClipRace) :
 *  - base : tout contributeur ≥ minDamage (tier='participation', badge inclus)
 *  - bonus : top-N dégâts (tier='win', rang = rang dégâts, rubis croissants)
 * Le badge "boss_slayer" n'est accordé qu'aux contributeurs ayant atteint
 * minDamage — un top-N théorique en dessous du seuil garde son bonus rubis
 * mais pas le badge. Appelée depuis closeAndDistribute, dans la même
 * transaction (elle fait le COMMIT/ROLLBACK final).
 */
async function distributeBoss(
  client: PoolClient,
  eventId: number,
  event: any,
  cfg: BossRewardConfig
): Promise<CloseAndDistributeResult> {
  const totalRes = await client.query(
    `SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`,
    [eventId]
  );
  const totalDamage = Number(totalRes.rows?.[0]?.total ?? 0);
  const killed = totalDamage >= cfg.hp;

  if (!killed) {
    await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
      eventId,
      JSON.stringify({ totalDamage, hp: cfg.hp, killed: false }),
    ]);
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const rankedRes = await client.query(
    `
    SELECT s.user_id, u.username, s.points,
           ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
    FROM event_scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    `,
    [eventId]
  );
  const ranked = (rankedRes.rows || []).map((r: any) => ({
    userId: Number(r.user_id),
    username: String(r.username),
    points: Number(r.points),
    rank: Number(r.rank),
  }));

  const ymRes = await client.query(
    `SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`,
    [event.start_at]
  );
  const ym = String(ymRes.rows?.[0]?.ym ?? "");

  const topDamagers = ranked.slice(0, REWARD_TOP_SNAPSHOT_N).map((r) => ({
    userId: r.userId,
    username: r.username,
    damage: r.points,
    rank: r.rank,
  }));

  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({ totalDamage, hp: cfg.hp, killed: true, topDamagers }),
  ]);

  const badgeCode = cfg.entitlement.codeTemplate.replace("YYYYMM", ym);
  const rubisForRank = (rank: number): number => {
    for (const b of cfg.rubisBrackets) if (rank <= b.maxRank) return b.rubis;
    return 0;
  };

  let winners = 0;
  let participants = 0;
  let rubisTotal = 0;

  // Un SEUL lot par contributeur ≥ minDamage (chaque user apparaît une fois) :
  // rubis (tranche de rang) + XP + ticket de roue + 3j de premium promo (perks
  // dont !pcall, sans ticket sub car grantCycleBenefits n'est déclenché que par
  // Stripe) + badge. Le top-3 gagne en plus le cadre "flammes", le #1 le titre.
  for (const row of ranked) {
    if (row.points < cfg.minDamage) continue;
    const isTop3 = row.rank <= 3;
    const rubis = rubisForRank(row.rank);

    if (rubis > 0) {
      await earnRubisTx(client, row.userId, cfg.rubisOrigin, rubis, {
        purpose: "event_reward",
        eventId,
        eventType: event.type,
        tier: isTop3 ? "win" : "participation",
        rank: row.rank,
      });
    }
    if (cfg.allXp > 0) {
      await awardXpTx(client, row.userId, cfg.allXp, "event_boss", "boss_kill", { eventId });
    }
    if (cfg.allWheelTickets > 0) {
      await client.query(
        `INSERT INTO user_event_tickets (user_id, amount) VALUES ($1, LEAST($2,50))
         ON CONFLICT (user_id) DO UPDATE SET amount = LEAST(user_event_tickets.amount + $2, 50)`,
        [row.userId, cfg.allWheelTickets]
      );
    }
    if (cfg.allPremiumDays > 0) {
      await grantPromoSubscriptionTx(client, row.userId, "viewer", cfg.allPremiumDays);
    }

    const extras: Record<string, any> = { rubis };
    await grantEntitlement(client, row.userId, cfg.entitlement.kind, badgeCode);
    extras.entitlement = { kind: cfg.entitlement.kind, code: badgeCode };
    if (cfg.allPremiumDays > 0) extras.premiumDays = cfg.allPremiumDays;

    if (isTop3) {
      await grantEntitlement(client, row.userId, "skin", cfg.topSkinCode);
      extras.skin = cfg.topSkinCode;
    }
    if (row.rank === 1) {
      await revokePreviousTitle(client, cfg.topTitleCode);
      await grantEntitlement(client, row.userId, "title", cfg.topTitleCode);
      extras.title = cfg.topTitleCode;
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, row.userId, isTop3 ? "win" : "participation", isTop3 ? row.rank : null, rubis, JSON.stringify(extras)]
    );

    if (isTop3) winners += 1;
    else participants += 1;
    rubisTotal += rubis;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners, participants, rubisTotal };
}

/**
 * Distribution "sur mesure" (Course aux clips, cf docs/events-design.md #3).
 * Double classement : CLIP (event_clip_scores) + STREAMER (SUM des votes de
 * ses clips) — cf events/clip_race.ts pour le detail des requêtes. Un même
 * compte peut cumuler plusieurs raisons (ex: créateur du clip #1 ET voteur
 * actif) mais event_reward_grants n'a qu'une ligne par (event_id,user_id) :
 * on agrège donc en mémoire (Map `grants`) avant d'écrire, plutôt que
 * d'insérer une ligne par raison comme le ranking générique. Appelée depuis
 * closeAndDistribute, dans la même transaction (elle fait le COMMIT/ROLLBACK
 * final).
 */
async function distributeClipRace(
  client: PoolClient,
  eventId: number,
  event: any,
  cfg: ClipRaceRewardConfig
): Promise<CloseAndDistributeResult> {
  const rankedClips = await getRankedClips(client, eventId, REWARD_TOP_SNAPSHOT_N);
  const rankedStreamers = await getRankedStreamers(client, eventId, REWARD_TOP_SNAPSHOT_N);

  // Pas de "goal" en mode clip_race (contrairement au coffre collectif) : le
  // classement est toujours figé et distribué tel quel à la clôture.
  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({
      rankedAt: new Date().toISOString(),
      topClips: rankedClips,
      topStreamers: rankedStreamers,
      reached: true,
      distributed: true,
    }),
  ]);

  if (!rankedClips.length) {
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const ymRes = await client.query(
    `SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`,
    [event.start_at]
  );
  const ym = String(ymRes.rows?.[0]?.ym ?? "");

  type GrantAcc = { tier: "win" | "participation"; rank: number | null; rubis: number; reasons: any[] };
  const grants = new Map<number, GrantAcc>();

  function addGrant(userId: number, tier: "win" | "participation", rank: number | null, rubis: number, reason: any) {
    const cur = grants.get(userId);
    if (!cur) {
      grants.set(userId, { tier, rank, rubis, reasons: [reason] });
      return;
    }
    cur.rubis += rubis;
    cur.reasons.push(reason);
    if (tier === "win") cur.tier = "win";
    if (rank != null && (cur.rank == null || rank < cur.rank)) cur.rank = rank;
  }

  // ── Streamer gagnant (rang 1 du classement streamer) : badge + featured
  // temporaire + dépôt dans SON coffre de commu (pas son wallet perso — cf
  // streamer_chest_lots, même poids que les lots "chest_auto") ────────────
  for (const stTier of cfg.streamerTiers.tiers) {
    const st = rankedStreamers.find((s) => s.rank === stTier.rank);
    if (!st) continue;

    await client.query(
      `INSERT INTO streamer_chests (streamer_id) VALUES ($1) ON CONFLICT (streamer_id) DO NOTHING`,
      [st.streamerId]
    );
    await client.query(
      `INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
       VALUES ($1, 'event_clip_race', $2, $3, $4::jsonb)`,
      [st.streamerId, cfg.streamerTiers.chestLotWeightBp, stTier.rubisToChest, JSON.stringify({ eventId, eventType: "clip_race", rank: stTier.rank })]
    );

    if (stTier.rank === 1 && cfg.streamerTiers.featuredDays > 0) {
      await client.query(
        `UPDATE streamers SET featured=true, featured_until=NOW() + ($2::int * INTERVAL '1 day'), updated_at=NOW() WHERE id=$1`,
        [st.streamerId, cfg.streamerTiers.featuredDays]
      );
    }

    if (st.userId) {
      if (stTier.subs > 0) {
        await client.query(
          `INSERT INTO user_coupons (user_id, code, qty, updated_at) VALUES ($1,'sub_ticket',$2,NOW())
           ON CONFLICT (user_id, code) DO UPDATE SET qty = user_coupons.qty + $2, updated_at = NOW()`,
          [st.userId, stTier.subs]
        );
      }
      const extras: Record<string, any> = { kind: "streamer_win", streamerId: st.streamerId, streamerSlug: st.slug, rank: stTier.rank, subs: stTier.subs, chestDeposit: stTier.rubisToChest };
      if (stTier.rank === 1) {
        const code = cfg.streamerTiers.entitlement.codeTemplate.replace("YYYYMM", ym);
        await grantEntitlement(client, st.userId, cfg.streamerTiers.entitlement.kind, code);
        extras.entitlement = { kind: cfg.streamerTiers.entitlement.kind, code };
        extras.featuredDays = cfg.streamerTiers.featuredDays;
      }
      addGrant(st.userId, "win", stTier.rank, 0, extras);
    }
  }

  // ── Top clips (rubis croissants + abo 7j pour le créateur du #1) ────────
  // bot_clips.author est le pseudo de chat brut (cf clip_race.ts), pas une
  // FK users.id : si aucun compte LunaLive ne correspond, le clip reste dans
  // le classement public mais ne génère aucun gain wallet.
  for (const tierCfg of cfg.clipTiers) {
    const clip = rankedClips.find((c) => c.rank === tierCfg.rank);
    if (!clip) continue;

    const creatorUserId = await resolveClipCreatorUserId(client, clip.author);
    if (!creatorUserId) continue;

    addGrant(creatorUserId, "win", clip.rank, tierCfg.rubis, {
      kind: "clip_win",
      clipId: clip.clipId,
      rank: clip.rank,
      votes: clip.votes,
      streamerSlug: clip.streamerSlug,
    });

    if (clip.rank === 1 && cfg.creatorSubDays > 0) {
      await grantPromoSubscriptionTx(client, creatorUserId, "viewer", cfg.creatorSubDays);
      addGrant(creatorUserId, "win", clip.rank, 0, {
        kind: "clip_win_sub",
        clipId: clip.clipId,
        planCode: "viewer",
        days: cfg.creatorSubDays,
      });
    }
  }

  // ── Participation (votants + créateurs résolus actifs, hors gagnants
  // ci-dessus) : contribution = votes castés + votes reçus, gate éligibilité
  // standard (cf eligibility.ts) comme les autres tiers "participation" ────
  const partRes = await client.query(
    `
    SELECT v.user_id, COUNT(*)::int AS votes_cast
    FROM event_clip_votes v
    WHERE v.event_id = $1
      AND ${eventRewardEligibilitySql("v.user_id")}
    GROUP BY v.user_id
    ORDER BY votes_cast DESC, v.user_id ASC
    `,
    [eventId]
  );

  let partCount = 0;
  for (const row of partRes.rows || []) {
    if (partCount >= cfg.participation.maxRecipients) break;
    const userId = Number(row.user_id);
    if (grants.has(userId)) continue; // déjà récompensé en 'win' ci-dessus

    const votesCast = Number(row.votes_cast);
    const rubis = Math.min(votesCast * cfg.participation.rubisPerVote, cfg.participation.maxRubis);
    addGrant(userId, "participation", null, rubis, {
      kind: "participation",
      votesCast,
    });
    partCount += 1;
  }

  // ── Flush : un seul INSERT event_reward_grants par compte ───────────────
  let winners = 0;
  let participants = 0;
  let rubisTotal = 0;

  for (const [userId, acc] of grants) {
    if (acc.rubis > 0) {
      await earnRubisTx(client, userId, cfg.rubisOrigin, acc.rubis, {
        purpose: "event_reward",
        eventId,
        eventType: "clip_race",
        tier: acc.tier,
        rank: acc.rank,
      });
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, userId, acc.tier, acc.rank, acc.rubis, JSON.stringify({ reasons: acc.reasons })]
    );

    if (acc.tier === "win") winners += 1;
    else participants += 1;
    rubisTotal += acc.rubis;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners, participants, rubisTotal };
}

/**
 * Distribution "duo" (Semaine en duo, cf docs/events-design.md #6). Duo #1
 * du classement (getRankedDuos, event_duo_scores.points desc) = duo gagnant.
 * DEUX récompenses cumulables comme distributeBoss/distributeClipRace
 * (pattern Map `grants`, un seul INSERT event_reward_grants par compte) :
 *  - badge titre "duo_champ_YYYYMM" aux 2 streamers du duo (via
 *    streamers.user_id — un streamer sans compte lié ne reçoit rien)
 *  - rubis participation à tout membre ÉLIGIBLE (cf eligibility.ts) des deux
 *    commus du duo gagnant ("commu" = même définition que recomputeDuoWeek :
 *    viewers dont le streamer le plus regardé sur la fenêtre de l'event est A
 *    ou B). Un streamer qui fait aussi partie de sa propre commu ne cumule
 *    pas deux fois : grants est indexé par user_id.
 * S'il n'y a aucun duo (aucun appariement possible cette semaine),
 * events.result {reached:false}, aucun grant. Appelée depuis
 * closeAndDistribute, dans la même transaction (COMMIT/ROLLBACK final).
 */
async function distributeDuo(
  client: PoolClient,
  eventId: number,
  event: any,
  cfg: DuoRewardConfig
): Promise<CloseAndDistributeResult> {
  const ranked = await getRankedDuos(client, eventId, REWARD_TOP_SNAPSHOT_N);

  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({ rankedAt: new Date().toISOString(), topDuos: ranked, reached: ranked.length > 0 }),
  ]);

  if (!ranked.length) {
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const winnerDuo = ranked[0];

  const ymRes = await client.query(
    `SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`,
    [event.start_at]
  );
  const ym = String(ymRes.rows?.[0]?.ym ?? "");
  const code = cfg.champTitleTemplate.replace("YYYYMM", ym);

  type GrantAcc = { tier: "win" | "participation"; rank: number | null; rubis: number; badge: boolean };
  const grants = new Map<number, GrantAcc>();

  for (const userId of [winnerDuo.streamerAUserId, winnerDuo.streamerBUserId]) {
    if (!userId) continue;
    grants.set(userId, { tier: "win", rank: 1, rubis: 0, badge: true });
  }

  const membersRes = await client.query(
    `
    WITH minutes_per_user_streamer AS (
      SELECT svm.user_id, svm.streamer_id, COUNT(DISTINCT svm.bucket_ts)::int AS minutes
      FROM stream_viewer_minutes svm
      WHERE svm.user_id IS NOT NULL AND svm.user_id > 0
        AND svm.bucket_ts >= $1::timestamptz AND svm.bucket_ts < $2::timestamptz
      GROUP BY svm.user_id, svm.streamer_id
    ),
    home_streamer AS (
      SELECT DISTINCT ON (user_id) user_id, streamer_id
      FROM minutes_per_user_streamer
      ORDER BY user_id, minutes DESC, streamer_id ASC
    )
    SELECT hs.user_id
    FROM home_streamer hs
    WHERE hs.streamer_id IN ($3, $4)
      AND ${eventRewardEligibilitySql("hs.user_id")}
    LIMIT $5
    `,
    [event.start_at, event.end_at, winnerDuo.streamerAId, winnerDuo.streamerBId, cfg.maxRecipients]
  );

  for (const row of membersRes.rows || []) {
    const userId = Number(row.user_id);
    const cur = grants.get(userId);
    if (cur) {
      cur.rubis += cfg.memberRubis;
    } else {
      grants.set(userId, { tier: "participation", rank: null, rubis: cfg.memberRubis, badge: false });
    }
  }

  let winners = 0;
  let participants = 0;
  let rubisTotal = 0;

  for (const [userId, acc] of grants) {
    if (acc.rubis > 0) {
      await earnRubisTx(client, userId, cfg.rubisOrigin, acc.rubis, {
        purpose: "event_reward",
        eventId,
        eventType: "duo_week",
        tier: acc.tier,
        rank: acc.rank,
      });
    }

    const extras: Record<string, any> = { duoId: winnerDuo.duoId };
    if (acc.badge) {
      await grantEntitlement(client, userId, "title", code);
      extras.entitlement = { kind: "title", code };
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, userId, acc.tier, acc.rank, acc.rubis, JSON.stringify(extras)]
    );

    if (acc.tier === "win") winners += 1;
    else participants += 1;
    rubisTotal += acc.rubis;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners, participants, rubisTotal };
}

/**
 * Distribution "roue" (Semaine de la roue REDESIGN v2, cf
 * docs/events-design.md #2). Contrairement aux autres modes, PAS de rubis de
 * classement ni de lot de participation à distribuer ici : les paliers sont
 * déjà réclamés EN DIRECT pendant l'event (cf events/wheel_event.ts
 * claimPaliers). À la clôture, seul le classement compte, prestige only :
 * top-3 = cadre de message exclusif (permanent) ; #1 = titre "remis en jeu"
 * (révoqué au précédent titulaire avant réattribution, cf
 * revokePreviousTitle) + abo viewer offert. Appelée depuis
 * closeAndDistribute, dans la même transaction (COMMIT/ROLLBACK final).
 */
async function distributeWheel(
  client: PoolClient,
  eventId: number,
  event: any,
  cfg: WheelRewardConfig
): Promise<CloseAndDistributeResult> {
  const ranked = await rankWheelWeek(client, eventId);

  const topSnapshot = ranked.slice(0, REWARD_TOP_SNAPSHOT_N).map((r) => ({
    userId: r.userId,
    username: r.username,
    points: r.points,
    rank: r.rank,
  }));

  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({ rankedAt: new Date().toISOString(), topLeaderboard: topSnapshot, reached: ranked.length > 0 }),
  ]);

  if (!ranked.length) {
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const top3 = ranked.filter((r) => r.rank <= 3);
  let winners = 0;

  for (const row of top3) {
    const extras: Record<string, any> = {};

    await grantEntitlement(client, row.userId, "skin", cfg.frameCode);
    extras.entitlement = { kind: "skin", code: cfg.frameCode };

    if (row.rank === 1) {
      await revokePreviousTitle(client, cfg.titleCode);
      await grantEntitlement(client, row.userId, "title", cfg.titleCode);
      const subGranted = await grantPromoSubscriptionTx(client, row.userId, "viewer", cfg.championSubDays);
      extras.title = cfg.titleCode;
      // subGranted=false si le champion détient déjà un abo payant en cours
      // (préservé) — ne pas prétendre dans l'audit qu'on a offert un abo.
      if (subGranted) extras.promoSubDays = cfg.championSubDays;
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,'win',$3,0,$4::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, row.userId, row.rank, JSON.stringify(extras)]
    );

    winners += 1;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners, participants: 0, rubisTotal: 0 };
}

/**
 * Pattern générique "titre remis en jeu" (cf docs/events-design.md wheel_week
 * — "Titre champion remis en jeu à chaque distribution d'un event, révoquer
 * le titre du champion précédent de cette famille avant d'accorder le
 * nouveau"). Un titre "remis en jeu" a un code FIXE (pas de suffixe YYYYMM
 * comme les titres mensuels classiques) : un seul compte le porte à la fois.
 * Réutilisable par tout event ayant ce pattern (wheel_week aujourd'hui —
 * viewer_week/burn_boss/duo_week utilisent encore des titres mensuels
 * permanents, non révoqués).
 */
export async function revokePreviousTitle(client: PoolClient, code: string) {
  await client.query(`DELETE FROM user_entitlements WHERE kind='title' AND code=$1`, [code]);
}

/**
 * Helper réutilisable pour offrir un abo promo (même pattern que welcome.ts /
 * user_subscriptions). Pas utilisé par viewer_week aujourd'hui (ses tiers
 * n'incluent pas d'abo) — prêt pour les events qui en auront besoin (ex.
 * Course aux clips : "abo top-1").
 */
export async function grantPromoSubscriptionTx(
  client: PoolClient,
  userId: number,
  planCode: string,
  days: number
): Promise<boolean> {
  // Ne JAMAIS écraser un abo payant (provider<>'promo') encore dans sa période,
  // quel que soit son statut : un abo Stripe en dunning (past_due/unpaid) garde
  // current_period_end dans le futur pendant la grâce — l'écraser casserait le
  // lien Stripe (provider_subscription_id) et offrirait un accès gratuit. On
  // n'overwrite que notre propre promo OU un abo expiré/sans période.
  const res = await client.query(
    `
    INSERT INTO user_subscriptions (
      user_id, plan_code, provider, provider_subscription_id,
      status, current_period_start, current_period_end, cancel_at_period_end,
      updated_at
    )
    VALUES (
      $1, $2, 'promo', $3,
      'active', NOW(), NOW() + ($4::int * INTERVAL '1 day'), TRUE,
      NOW()
    )
    ON CONFLICT (user_id, plan_code)
    DO UPDATE SET
      provider='promo',
      provider_subscription_id=EXCLUDED.provider_subscription_id,
      status='active',
      current_period_start=EXCLUDED.current_period_start,
      current_period_end=GREATEST(user_subscriptions.current_period_end, EXCLUDED.current_period_end),
      cancel_at_period_end=TRUE,
      updated_at=NOW()
    WHERE
      user_subscriptions.provider='promo'
      OR user_subscriptions.current_period_end IS NULL
      OR user_subscriptions.current_period_end <= NOW()
    RETURNING 1
    `,
    [userId, planCode, `promo_event:${planCode}:${userId}:${Date.now()}`, days]
  );
  return (res.rowCount ?? 0) > 0;
}
