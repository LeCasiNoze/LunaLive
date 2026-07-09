import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { addToken, grantEntitlement } from "../services/dailyBonus.js";
import { eventRewardEligibilitySql } from "./eligibility.js";
import { getRankedClips, getRankedStreamers, resolveClipCreatorUserId } from "./clip_race.js";
import { getRankedDuos } from "./duo_week.js";
// Nombre de lignes figées dans events.result.top à la clôture. Générique
// (pas de dépendance à un event précis) : tous les types partagent la même
// taille de snapshot top.
const REWARD_TOP_SNAPSHOT_N = 10;
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
    burn_boss: {
        mode: "boss",
        boss: {
            // HP choisi pour rester ATTEIGNABLE par la petite commu actuelle (cf
            // memory reference_rumble_*) : le barème events/burn_boss.ts (identique
            // à global_chest, cap 60 pts/j watch + claims/calls/chat/spins) fait
            // déjà 150-300 pts/semaine par contributeur régulier SANS rien
            // dépenser ; une quinzaine de réguliers couvrent une bonne part de
            // 4000, le burn rubis (ratio 1:1, sink pur) n'étant qu'un accélérateur
            // optionnel pour finir plus vite. Même logique de calibrage que
            // global_chest.collective.goal=3000 — à remonter une fois le volume
            // réel mesuré sur un premier run.
            hp: 4000,
            ratio: 1, // 1 rubis brûlé = 1 dégât
            minDamage: 50, // même seuil que global_chest.minContribution
            baseRubis: 120,
            entitlement: { kind: "title", codeTemplate: "boss_slayer_YYYYMM" },
            topTiers: [
                { rank: 3, rubis: 180 },
                { rank: 2, rubis: 300 },
                { rank: 1, rubis: 500 },
            ],
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
async function rankWheelWeek(client, eventId) {
    const r = await client.query(`
    SELECT s.user_id, u.username, s.points
    FROM event_scores s
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
// wheel_week n'y figure plus (mode:'wheel', branché directement dans
// closeAndDistribute) — rankWheelWeek reste utilisée par distributeWheel.
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
        if (!config) {
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
        const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
        const ym = String(ymRes.rows?.[0]?.ym ?? "");
        const topSnapshot = ranked.slice(0, REWARD_TOP_SNAPSHOT_N).map((r) => ({
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
 * Distribution "collective" (ex. Coffre communautaire) : pas de classement,
 * un seul total (SUM event_scores.points) comparé à un goal. Si atteint,
 * TOUS les contributeurs éligibles au-dessus de minContribution reçoivent la
 * MÊME récompense — écrits en tier='participation' (pas de notion de rang en
 * mode collectif, rank=NULL). Appelée depuis closeAndDistribute, dans la
 * même transaction (elle fait le COMMIT/ROLLBACK final).
 */
async function distributeCollective(client, eventId, event, cfg) {
    const totalRes = await client.query(`SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
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
    const contributors = await client.query(`
    SELECT s.user_id
    FROM event_scores s
    WHERE s.event_id = $1
      AND s.points >= $2
      AND ${eventRewardEligibilitySql("s.user_id")}
    `, [eventId, cfg.minContribution]);
    const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
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
        const extras = {};
        if (cfg.entitlement) {
            const code = cfg.entitlement.codeTemplate.replace("YYYYMM", ym);
            await grantEntitlement(client, userId, cfg.entitlement.kind, code);
            extras.entitlement = { kind: cfg.entitlement.kind, code };
        }
        await client.query(`
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,'participation',NULL,$3,$4::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `, [eventId, userId, cfg.rubis, JSON.stringify(extras)]);
        participants += 1;
        rubisTotal += cfg.rubis;
    }
    await client.query("COMMIT");
    return { ok: true, alreadyDistributed: false, winners: 0, participants, rubisTotal };
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
async function distributeBoss(client, eventId, event, cfg) {
    const totalRes = await client.query(`SELECT COALESCE(SUM(points), 0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
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
    const rankedRes = await client.query(`
    SELECT s.user_id, u.username, s.points,
           ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
    FROM event_scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    `, [eventId]);
    const ranked = (rankedRes.rows || []).map((r) => ({
        userId: Number(r.user_id),
        username: String(r.username),
        points: Number(r.points),
        rank: Number(r.rank),
    }));
    const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
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
    const grants = new Map();
    for (const row of ranked) {
        if (row.points < cfg.minDamage)
            continue;
        grants.set(row.userId, { tier: "participation", rank: null, rubis: cfg.baseRubis, badge: true });
    }
    for (const tierCfg of cfg.topTiers) {
        const row = ranked.find((r) => r.rank === tierCfg.rank);
        if (!row)
            continue;
        const cur = grants.get(row.userId);
        if (cur) {
            cur.tier = "win";
            cur.rank = tierCfg.rank;
            cur.rubis += tierCfg.rubis;
        }
        else {
            grants.set(row.userId, { tier: "win", rank: tierCfg.rank, rubis: tierCfg.rubis, badge: false });
        }
    }
    let winners = 0;
    let participants = 0;
    let rubisTotal = 0;
    for (const [userId, acc] of grants) {
        await earnRubisTx(client, userId, cfg.rubisOrigin, acc.rubis, {
            purpose: "event_reward",
            eventId,
            eventType: event.type,
            tier: acc.tier,
            rank: acc.rank,
        });
        const extras = {};
        if (acc.badge) {
            const code = cfg.entitlement.codeTemplate.replace("YYYYMM", ym);
            await grantEntitlement(client, userId, cfg.entitlement.kind, code);
            extras.entitlement = { kind: cfg.entitlement.kind, code };
        }
        await client.query(`
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `, [eventId, userId, acc.tier, acc.rank, acc.rubis, JSON.stringify(extras)]);
        if (acc.tier === "win")
            winners += 1;
        else
            participants += 1;
        rubisTotal += acc.rubis;
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
async function distributeClipRace(client, eventId, event, cfg) {
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
    const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
    const ym = String(ymRes.rows?.[0]?.ym ?? "");
    const grants = new Map();
    function addGrant(userId, tier, rank, rubis, reason) {
        const cur = grants.get(userId);
        if (!cur) {
            grants.set(userId, { tier, rank, rubis, reasons: [reason] });
            return;
        }
        cur.rubis += rubis;
        cur.reasons.push(reason);
        if (tier === "win")
            cur.tier = "win";
        if (rank != null && (cur.rank == null || rank < cur.rank))
            cur.rank = rank;
    }
    // ── Streamer gagnant (rang 1 du classement streamer) : badge + featured
    // temporaire + dépôt dans SON coffre de commu (pas son wallet perso — cf
    // streamer_chest_lots, même poids que les lots "chest_auto") ────────────
    const winnerStreamer = rankedStreamers[0];
    if (winnerStreamer) {
        await client.query(`INSERT INTO streamer_chests (streamer_id) VALUES ($1) ON CONFLICT (streamer_id) DO NOTHING`, [winnerStreamer.streamerId]);
        await client.query(`INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
       VALUES ($1, 'event_clip_race', $2, $3, $4::jsonb)`, [
            winnerStreamer.streamerId,
            cfg.streamerWin.chestLotWeightBp,
            cfg.streamerWin.rubisToChest,
            JSON.stringify({ eventId, eventType: "clip_race" }),
        ]);
        await client.query(`
      UPDATE streamers
      SET featured = true, featured_until = NOW() + ($2::int * INTERVAL '1 day'), updated_at = NOW()
      WHERE id = $1
      `, [winnerStreamer.streamerId, cfg.streamerWin.featuredDays]);
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
        if (!clip)
            continue;
        const creatorUserId = await resolveClipCreatorUserId(client, clip.author);
        if (!creatorUserId)
            continue;
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
    const partRes = await client.query(`
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
    `, [eventId]);
    let partCount = 0;
    for (const row of partRes.rows || []) {
        if (partCount >= cfg.participation.maxRecipients)
            break;
        const userId = Number(row.user_id);
        if (grants.has(userId))
            continue; // déjà récompensé en 'win' ci-dessus
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
        await client.query(`
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `, [eventId, userId, acc.tier, acc.rank, acc.rubis, JSON.stringify({ reasons: acc.reasons })]);
        if (acc.tier === "win")
            winners += 1;
        else
            participants += 1;
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
async function distributeDuo(client, eventId, event, cfg) {
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
    const ymRes = await client.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'Europe/Paris', 'YYYYMM') AS ym`, [event.start_at]);
    const ym = String(ymRes.rows?.[0]?.ym ?? "");
    const code = cfg.champTitleTemplate.replace("YYYYMM", ym);
    const grants = new Map();
    for (const userId of [winnerDuo.streamerAUserId, winnerDuo.streamerBUserId]) {
        if (!userId)
            continue;
        grants.set(userId, { tier: "win", rank: 1, rubis: 0, badge: true });
    }
    const membersRes = await client.query(`
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
    `, [event.start_at, event.end_at, winnerDuo.streamerAId, winnerDuo.streamerBId, cfg.maxRecipients]);
    for (const row of membersRes.rows || []) {
        const userId = Number(row.user_id);
        const cur = grants.get(userId);
        if (cur) {
            cur.rubis += cfg.memberRubis;
        }
        else {
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
        const extras = { duoId: winnerDuo.duoId };
        if (acc.badge) {
            await grantEntitlement(client, userId, "title", code);
            extras.entitlement = { kind: "title", code };
        }
        await client.query(`
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `, [eventId, userId, acc.tier, acc.rank, acc.rubis, JSON.stringify(extras)]);
        if (acc.tier === "win")
            winners += 1;
        else
            participants += 1;
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
async function distributeWheel(client, eventId, event, cfg) {
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
        const extras = {};
        await grantEntitlement(client, row.userId, "skin", cfg.frameCode);
        extras.entitlement = { kind: "skin", code: cfg.frameCode };
        if (row.rank === 1) {
            await revokePreviousTitle(client, cfg.titleCode);
            await grantEntitlement(client, row.userId, "title", cfg.titleCode);
            const subGranted = await grantPromoSubscriptionTx(client, row.userId, "viewer", cfg.championSubDays);
            extras.title = cfg.titleCode;
            // subGranted=false si le champion détient déjà un abo payant en cours
            // (préservé) — ne pas prétendre dans l'audit qu'on a offert un abo.
            if (subGranted)
                extras.promoSubDays = cfg.championSubDays;
        }
        await client.query(`
      INSERT INTO event_reward_grants (event_id, user_id, tier, rank, rubis, extras)
      VALUES ($1,$2,'win',$3,0,$4::jsonb)
      ON CONFLICT (event_id, user_id) DO NOTHING
      `, [eventId, row.userId, row.rank, JSON.stringify(extras)]);
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
export async function revokePreviousTitle(client, code) {
    await client.query(`DELETE FROM user_entitlements WHERE kind='title' AND code=$1`, [code]);
}
/**
 * Helper réutilisable pour offrir un abo promo (même pattern que welcome.ts /
 * user_subscriptions). Pas utilisé par viewer_week aujourd'hui (ses tiers
 * n'incluent pas d'abo) — prêt pour les events qui en auront besoin (ex.
 * Course aux clips : "abo top-1").
 */
export async function grantPromoSubscriptionTx(client, userId, planCode, days) {
    // Ne JAMAIS écraser un abo payant (provider<>'promo') encore dans sa période,
    // quel que soit son statut : un abo Stripe en dunning (past_due/unpaid) garde
    // current_period_end dans le futur pendant la grâce — l'écraser casserait le
    // lien Stripe (provider_subscription_id) et offrirait un accès gratuit. On
    // n'overwrite que notre propre promo OU un abo expiré/sans période.
    const res = await client.query(`
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
    `, [userId, planCode, `promo_event:${planCode}:${userId}:${Date.now()}`, days]);
    return (res.rowCount ?? 0) > 0;
}
