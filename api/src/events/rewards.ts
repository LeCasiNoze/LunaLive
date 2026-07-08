import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { addToken, grantEntitlement } from "../services/dailyBonus.js";
import { eventRewardEligibilitySql } from "./eligibility.js";

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

type EventRewardConfig = RankingEventRewardConfig | CollectiveEventRewardConfig;

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
