import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { addToken, grantEntitlement } from "../services/dailyBonus.js";
import { eventRewardEligibilitySql } from "./eligibility.js";
import { getRankedClips, getRankedStreamers, resolveClipCreatorUserId } from "./clip_race.js";

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
type CollectiveRewardConfig = {
  goal: number; // barre communautaire à atteindre pour déclencher la distribution
  minContribution: number;
  rubis: number;
  entitlement?: { kind: "skin" | "title"; codeTemplate: string };
  rubisOrigin: string;
};

// Union discriminée par `mode` : absent = ranking classique (tiers +
// participation), 'collective' = un seul palier commun (cf CollectiveRewardConfig).
type RankingEventRewardConfig = {
  mode?: undefined;
  tiers: RewardTier[];
  participation: ParticipationConfig;
  rubisOrigin: string;
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
  streamerWin: {
    rubisToChest: number; // dépôt dans streamer_chest_lots (coffre de sa commu, pas son wallet perso)
    chestLotWeightBp: number; // poids du lot dans le tirage du coffre (0-2000, cf chest.ts MAX_OUT_WEIGHT_BP)
    entitlement: { kind: "skin" | "title"; codeTemplate: string };
    featuredDays: number; // durée de streamers.featured=true (cf featured_until, nettoyé par engine.ts)
  };
  clipTiers: Array<{ rank: number; rubis: number }>; // top-3 clips, rubis croissants du rang 3 au rang 1
  creatorSubDays: number; // abo viewer offert au créateur (résolu) du clip rang 1 uniquement
  participation: { rubis: number; maxRecipients: number };
  rubisOrigin: string;
};

type ClipRaceEventRewardConfig = {
  mode: "clip_race";
  clipRace: ClipRaceRewardConfig;
};

type EventRewardConfig = RankingEventRewardConfig | CollectiveEventRewardConfig | ClipRaceEventRewardConfig;

export const EVENT_REWARD_CONFIGS: Record<string, EventRewardConfig> = {
  viewer_week: {
    tiers: [
      { rankFrom: 1, rankTo: 1, rubis: 600, entitlement: { kind: "title", codeTemplate: "vw_champion_YYYYMM" } },
      { rankFrom: 2, rankTo: 3, rubis: 300 },
      { rankFrom: 4, rankTo: 5, rubis: 150 },
    ],
    participation: { minScore: 200, rubis: 40, wheelTickets: 1, maxRecipients: 40 },
    rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
  },
  wheel_week: {
    tiers: [
      { rankFrom: 1, rankTo: 1, rubis: 600, entitlement: { kind: "title", codeTemplate: "wheel_king_YYYYMM" } },
      { rankFrom: 2, rankTo: 3, rubis: 300 },
      { rankFrom: 4, rankTo: 5, rubis: 150 },
    ],
    // minScore=50 : ~5 jours de spin gratuit à la moyenne de la roue (gain
    // moyen/spin ≈ 10,3 rubis d'après la pondération des segments dans
    // wheel.ts) — atteignable par la simple régularité, sans dépendre d'un
    // gros lot de chance.
    participation: { minScore: 50, rubis: 40, wheelTickets: 1, maxRecipients: 40 },
    rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
  },
  global_chest: {
    mode: "collective",
    collective: {
      // Petite commu actuelle (cf memory reference_rumble_*) : avec le barème
      // events/global_chest.ts (60 pts/j watch cap + claims/calls/chat/spins),
      // une quinzaine de contributeurs réguliers sur la semaine atteignent déjà
      // 100-250 pts chacun sans rien dépenser ; quelques dépôts rubis (sink)
      // suffisent à franchir 3000. Objectif volontairement modeste pour que le
      // premier tirage du cycle soit un succès visible — à remonter une fois le
      // volume réel de la commu mesuré sur un premier run.
      goal: 3000,
      minContribution: 50,
      rubis: 150,
      entitlement: { kind: "title", codeTemplate: "chest_YYYYMM" },
      rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    },
  },
  clip_race: {
    mode: "clip_race",
    clipRace: {
      streamerWin: {
        rubisToChest: 400,
        // Même poids que les lots "chest_auto" (cf chest_jobs.ts OUT_WEIGHT_BP) :
        // pleinement tirable, pas un lot symbolique noyé dans le coffre.
        chestLotWeightBp: 2000,
        entitlement: { kind: "title", codeTemplate: "clip_race_streamer_YYYYMM" },
        featuredDays: 7,
      },
      clipTiers: [
        { rank: 1, rubis: 250 },
        { rank: 2, rubis: 120 },
        { rank: 3, rubis: 60 },
      ],
      creatorSubDays: 7,
      participation: { rubis: 25, maxRecipients: 40 },
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

const RANKING_PROVIDERS: Record<string, RankingProvider> = {
  viewer_week: rankViewerWeek,
  wheel_week: rankWheelWeek,
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
 * Distribution "collective" (ex. Coffre communautaire) : pas de classement,
 * un seul total (SUM event_scores.points) comparé à un goal. Si atteint,
 * TOUS les contributeurs éligibles au-dessus de minContribution reçoivent la
 * MÊME récompense — écrits en tier='participation' (pas de notion de rang en
 * mode collectif, rank=NULL). Appelée depuis closeAndDistribute, dans la
 * même transaction (elle fait le COMMIT/ROLLBACK final).
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
  const reached = communityTotal >= cfg.goal;

  if (!reached) {
    await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
      eventId,
      JSON.stringify({ reached: false }),
    ]);
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants: 0, rubisTotal: 0 };
  }

  const contributors = await client.query(
    `
    SELECT s.user_id
    FROM event_scores s
    WHERE s.event_id = $1
      AND s.points >= $2
      AND ${eventRewardEligibilitySql("s.user_id")}
    `,
    [eventId, cfg.minContribution]
  );

  const ymRes = await client.query(
    `SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`,
    [event.start_at]
  );
  const ym = String(ymRes.rows?.[0]?.ym ?? "");

  await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [
    eventId,
    JSON.stringify({ communityTotal, goal: cfg.goal, reached: true, winners: contributors.rowCount ?? 0 }),
  ]);

  let participants = 0;
  let rubisTotal = 0;

  for (const row of contributors.rows) {
    const userId = Number(row.user_id);

    await earnRubisTx(client, userId, cfg.rubisOrigin, cfg.rubis, {
      purpose: "event_reward",
      eventId,
      eventType: event.type,
      tier: "participation",
    });

    const extras: Record<string, any> = {};
    if (cfg.entitlement) {
      const code = cfg.entitlement.codeTemplate.replace("YYYYMM", ym);
      await grantEntitlement(client, userId, cfg.entitlement.kind, code);
      extras.entitlement = { kind: cfg.entitlement.kind, code };
    }

    await client.query(
      `
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,'participation',NULL,$3,$4::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `,
      [eventId, userId, cfg.rubis, JSON.stringify(extras)]
    );

    participants += 1;
    rubisTotal += cfg.rubis;
  }

  await client.query("COMMIT");
  return { ok: true, alreadyDistributed: false, winners: 0, participants, rubisTotal };
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
  const winnerStreamer = rankedStreamers[0];
  if (winnerStreamer) {
    await client.query(
      `INSERT INTO streamer_chests (streamer_id) VALUES ($1) ON CONFLICT (streamer_id) DO NOTHING`,
      [winnerStreamer.streamerId]
    );
    await client.query(
      `INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
       VALUES ($1, 'event_clip_race', $2, $3, $4::jsonb)`,
      [
        winnerStreamer.streamerId,
        cfg.streamerWin.chestLotWeightBp,
        cfg.streamerWin.rubisToChest,
        JSON.stringify({ eventId, eventType: "clip_race" }),
      ]
    );
    await client.query(
      `
      UPDATE streamers
      SET featured = true, featured_until = NOW() + ($2::int * INTERVAL '1 day'), updated_at = NOW()
      WHERE id = $1
      `,
      [winnerStreamer.streamerId, cfg.streamerWin.featuredDays]
    );

    if (winnerStreamer.userId) {
      const code = cfg.streamerWin.entitlement.codeTemplate.replace("YYYYMM", ym);
      await grantEntitlement(client, winnerStreamer.userId, cfg.streamerWin.entitlement.kind, code);
      addGrant(winnerStreamer.userId, "win", 1, 0, {
        kind: "streamer_win",
        streamerId: winnerStreamer.streamerId,
        streamerSlug: winnerStreamer.slug,
        chestDeposit: cfg.streamerWin.rubisToChest,
        entitlement: { kind: cfg.streamerWin.entitlement.kind, code },
        featuredDays: cfg.streamerWin.featuredDays,
      });
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
    WITH voters AS (
      SELECT user_id, COUNT(*)::int AS votes_cast
      FROM event_clip_votes
      WHERE event_id = $1
      GROUP BY user_id
    ),
    creators AS (
      SELECT u.id AS user_id, SUM(ecs.votes)::int AS votes_received
      FROM event_clip_scores ecs
      JOIN bot_clips bc ON bc.id = ecs.clip_id
      JOIN users u ON lower(u.username) = lower(bc.author)
      WHERE ecs.event_id = $1
        AND bc.author IS NOT NULL AND btrim(bc.author) <> ''
        AND lower(bc.author) <> 'lunaclip'
      GROUP BY u.id
    ),
    combined AS (
      SELECT
        COALESCE(v.user_id, c.user_id) AS user_id,
        (COALESCE(v.votes_cast,0) + COALESCE(c.votes_received,0)) AS score
      FROM voters v
      FULL OUTER JOIN creators c ON c.user_id = v.user_id
    )
    SELECT user_id, score
    FROM combined
    WHERE ${eventRewardEligibilitySql("combined.user_id")}
    ORDER BY score DESC, user_id ASC
    `,
    [eventId]
  );

  let partCount = 0;
  for (const row of partRes.rows || []) {
    if (partCount >= cfg.participation.maxRecipients) break;
    const userId = Number(row.user_id);
    if (grants.has(userId)) continue; // déjà récompensé en 'win' ci-dessus

    addGrant(userId, "participation", null, cfg.participation.rubis, {
      kind: "participation",
      score: Number(row.score),
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
) {
  await client.query(
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
      OR user_subscriptions.status NOT IN ('active','trialing')
      OR (user_subscriptions.current_period_end IS NOT NULL AND user_subscriptions.current_period_end <= NOW())
    `,
    [userId, planCode, `promo_event:${planCode}:${userId}:${Date.now()}`, days]
  );
}
