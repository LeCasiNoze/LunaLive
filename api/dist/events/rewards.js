import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { addToken, grantEntitlement } from "../services/dailyBonus.js";
import { eventRewardEligibilitySql } from "./eligibility.js";
import { VIEWER_WEEK_SCORING } from "./viewer_week.js";
export const EVENT_REWARD_CONFIGS = {
    viewer_week: {
        tiers: [
            { rankFrom: 1, rankTo: 1, rubis: 600, entitlement: { kind: "title", codeTemplate: "vw_champion_YYYYMM" } },
            { rankFrom: 2, rankTo: 3, rubis: 300 },
            { rankFrom: 4, rankTo: 5, rubis: 150 },
        ],
        participation: { minScore: 200, rubis: 40, wheelTickets: 1, maxRecipients: 40 },
        rubisOrigin: "event_platform", // poids 0 — non-cashable (cf economy.ts)
    },
};
async function rankViewerWeek(client, eventId) {
    const r = await client.query(`
    SELECT s.user_id, u.username, s.points
    FROM event_scores_viewer_week s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    `, [eventId]);
    return (r.rows || []).map((row, idx) => ({
        userId: Number(row.user_id),
        username: String(row.username),
        points: Number(row.points),
        rank: idx + 1,
    }));
}
const RANKING_PROVIDERS = {
    viewer_week: rankViewerWeek,
};
/**
 * Fige le classement d'un event dans events.result puis distribue les lots
 * (tiers top-N + participation). Idempotent : si des event_reward_grants
 * existent déjà pour cet event, ne redistribue rien.
 */
export async function closeAndDistribute(eventId) {
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
        const rankingProvider = RANKING_PROVIDERS[event.type];
        if (!config || !rankingProvider) {
            await client.query("ROLLBACK");
            return { ok: false, error: "unsupported_type" };
        }
        const existing = await client.query(`SELECT tier, rubis FROM event_reward_grants WHERE event_id=$1`, [eventId]);
        if ((existing.rowCount ?? 0) > 0) {
            await client.query("COMMIT");
            const winners = existing.rows.filter((r) => r.tier === "win").length;
            const participants = existing.rows.filter((r) => r.tier === "participation").length;
            const rubisTotal = existing.rows.reduce((sum, r) => sum + Number(r.rubis || 0), 0);
            return { ok: true, alreadyDistributed: true, winners, participants, rubisTotal };
        }
        const ranked = await rankingProvider(client, eventId);
        const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
        const ym = String(ymRes.rows?.[0]?.ym ?? "");
        const topSnapshot = ranked.slice(0, VIEWER_WEEK_SCORING.TOP_N).map((r) => ({
            userId: r.userId,
            username: r.username,
            points: r.points,
            rank: r.rank,
        }));
        await client.query(`UPDATE events SET result = $2::jsonb, updated_at = NOW() WHERE id=$1`, [eventId, JSON.stringify({ rankedAt: new Date().toISOString(), top: topSnapshot, distributed: true })]);
        let winners = 0;
        let participants = 0;
        let rubisTotal = 0;
        const winnerUserIds = new Set();
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
                const extras = {};
                if (tier.entitlement) {
                    const code = tier.entitlement.codeTemplate.replace("YYYYMM", ym);
                    await grantEntitlement(client, row.userId, tier.entitlement.kind, code);
                    extras.entitlement = { kind: tier.entitlement.kind, code };
                }
                await client.query(`
          INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
          VALUES ($1,$2,'win',$3,$4,$5::jsonb)
          ON CONFLICT (event_id, user_id) DO NOTHING
          `, [eventId, row.userId, row.rank, tier.rubis, JSON.stringify(extras)]);
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
            await client.query(`
        INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
        VALUES ($1,$2,'participation',$3,$4,$5::jsonb)
        ON CONFLICT (event_id, user_id) DO NOTHING
        `, [
                eventId,
                row.userId,
                row.rank,
                config.participation.rubis,
                JSON.stringify({ wheelTickets: config.participation.wheelTickets }),
            ]);
            participants += 1;
            rubisTotal += config.participation.rubis;
        }
        await client.query("COMMIT");
        return { ok: true, alreadyDistributed: false, winners, participants, rubisTotal };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
/**
 * Helper réutilisable pour offrir un abo promo (même pattern que welcome.ts /
 * user_subscriptions). Pas utilisé par viewer_week aujourd'hui (ses tiers
 * n'incluent pas d'abo) — prêt pour les events qui en auront besoin (ex.
 * Course aux clips : "abo top-1").
 */
export async function grantPromoSubscriptionTx(client, userId, planCode, days) {
    await client.query(`
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
    `, [userId, planCode, `promo_event:${planCode}:${userId}:${Date.now()}`, days]);
}
