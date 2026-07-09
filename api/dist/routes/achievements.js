// api/src/routes/achievements.ts
import { Router } from "express";
import { pool } from "../db.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";
import { awardXpTx, levelFromXp } from "../economy/xp.js";
export const achievementsRouter = Router();
const SHOP_ENTITLEMENT_KEYS = new Set(COSMETICS_CATALOG.filter((item) => item.active &&
    item.unlock === "shop" &&
    (typeof item.priceRubis === "number" || typeof item.pricePrestige === "number")).map((item) => `${item.kind}:${item.code}`));
// helper query typé (db.query n'est pas générique chez toi)
const q = (text, params = []) => pool.query(text, params);
async function tableExists(table) {
    const r = await q(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
    return !!r.rows?.[0]?.reg;
}
async function getParisBounds() {
    const r = await q(`
    SELECT
      (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris')::timestamptz AS month_start,
      ((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) + interval '1 month') AT TIME ZONE 'Europe/Paris')::timestamptz AS month_end
  `);
    const monthStart = r.rows?.[0]?.month_start;
    const monthEnd = r.rows?.[0]?.month_end;
    return {
        monthStartIso: monthStart ? new Date(monthStart).toISOString() : new Date().toISOString(),
        monthEndIso: monthEnd ? new Date(monthEnd).toISOString() : new Date().toISOString(),
    };
}
async function safeCount(sql, params = [], fallback = 0) {
    try {
        const r = await q(sql, params);
        const v = Number(r.rows?.[0]?.n ?? fallback);
        return Number.isFinite(v) ? v : fallback;
    }
    catch {
        return fallback;
    }
}
async function safeSum(sql, params = [], fallback = 0) {
    try {
        const r = await q(sql, params);
        const v = Number(r.rows?.[0]?.s ?? fallback);
        return Number.isFinite(v) ? v : fallback;
    }
    catch {
        return fallback;
    }
}
function criteriaProgress(flags) {
    return { current: flags.filter(Boolean).length, target: flags.length };
}
function boolProgress(flag) {
    return { current: flag ? 1 : 0, target: 1 };
}
function hasText(v) {
    return String(v ?? "").trim().length > 0;
}
function activeFeatureFamiliesCount(m) {
    const families = [
        m.watchMinutesTotal > 0 || m.distinctLivesTotal > 0,
        m.chatMessagesTotal > 0,
        m.followsCount > 0 || m.hasNotifyEnabled || m.hasFollowQuick,
        m.wheelSpinsTotal > 0,
        m.dailyBonusDaysMonth > 0,
        m.chestJoinsTotal > 0 || m.chestWinningsTotal > 0,
        m.hasAnySub || m.supportSpentRubis > 0 || m.supportedStreamersDistinct > 0,
    ];
    return families.filter(Boolean).length;
}
async function getMetrics(userId) {
    const { monthStartIso, monthEndIso } = await getParisBounds();
    // users.last_login_at
    const u = await q(`SELECT last_login_at FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const lastLoginAt = u.rows?.[0]?.last_login_at ?? null;
    const hasStreamViewerMinutes = await tableExists("stream_viewer_minutes");
    const hasChatMessages = await tableExists("chat_messages");
    const hasChatMessageStats = await tableExists("chat_message_stats");
    const hasFollows = await tableExists("streamer_follows");
    const hasWheel = await tableExists("daily_wheel_spins");
    const hasChestParticipants = await tableExists("streamer_chest_participants");
    const hasChestPayouts = await tableExists("streamer_chest_payouts");
    const hasSubs = await tableExists("streamer_subscriptions");
    const hasWalletTx = await tableExists("wallet_tx");
    const hasUserAvatars = await tableExists("user_avatars");
    const hasUserEquippedCosmetics = await tableExists("user_equipped_cosmetics");
    const hasUserEntitlements = await tableExists("user_entitlements");
    const hasPredictionBets = await tableExists("prediction_bets");
    const hasPredictions = await tableExists("predictions");
    const hasBotRainJoins = await tableExists("bot_rain_joins");
    const hasBotWheelEntries = await tableExists("bot_wheel_entries");
    const hasPushSubscriptions = await tableExists("push_subscriptions");
    const hasUserReferrals = await tableExists("user_referrals");
    const hasFeatureEvents = await tableExists("user_feature_events");
    // daily bonus: supporte plusieurs noms possibles
    const dailyBonusTables = ["daily_bonus_claims", "user_daily_bonus_claims", "daily_bonus_days"];
    let dailyBonusTable = null;
    for (const t of dailyBonusTables) {
        if (await tableExists(t)) {
            dailyBonusTable = t;
            break;
        }
    }
    const watchMinutesTotal = hasStreamViewerMinutes
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM stream_viewer_minutes WHERE user_id=$1`, [userId])
        : 0;
    const watchMinutesMonth = hasStreamViewerMinutes
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
          AND bucket_ts >= $2::timestamptz
          AND bucket_ts <  $3::timestamptz
        `, [userId, monthStartIso, monthEndIso])
        : 0;
    const distinctLivesTotal = hasStreamViewerMinutes
        ? await safeCount(`
        SELECT COUNT(DISTINCT live_session_id)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
        `, [userId])
        : 0;
    const liveChatMessagesTotal = hasChatMessages
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL`, [userId])
        : 0;
    const archivedChatMessagesTotal = hasChatMessageStats
        ? await safeSum(`SELECT COALESCE(SUM(messages_sent),0)::bigint AS s FROM chat_message_stats WHERE user_id=$1`, [userId])
        : 0;
    const chatMessagesTotal = liveChatMessagesTotal + archivedChatMessagesTotal;
    const followsCount = hasFollows ? await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1`, [userId]) : 0;
    const hasNotifyEnabled = hasFollows
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1 AND notify_enabled=TRUE`, [userId])) > 0
        : false;
    const hasFollowQuick = hasFollows
        ? (await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM streamer_follows f
        JOIN streamers s ON s.id = f.streamer_id
        WHERE f.user_id=$1
          AND s.live_started_at IS NOT NULL
          AND f.created_at >= s.live_started_at
          AND f.created_at <= s.live_started_at + interval '5 minutes'
        `, [userId])) > 0
        : false;
    const wheelSpinsTotal = hasWheel ? await safeCount(`SELECT COUNT(*)::int AS n FROM daily_wheel_spins WHERE user_id=$1`, [userId]) : 0;
    const dailyBonusDaysMonth = dailyBonusTable
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM ${dailyBonusTable}
        WHERE user_id=$1
          AND day >= (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris'))::date)
          AND day <  ((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) + interval '1 month')::date)
        `, [userId])
        : 0;
    const chestJoinsTotal = hasChestParticipants
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_chest_participants WHERE user_id=$1`, [userId])
        : 0;
    const chestWinningsTotal = hasChestPayouts
        ? await safeSum(`SELECT COALESCE(SUM(amount),0)::int AS s FROM streamer_chest_payouts WHERE user_id=$1`, [userId])
        : 0;
    const hasAnySub = hasSubs
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_subscriptions WHERE user_id=$1`, [userId])) > 0
        : false;
    const supportedFromSubs = hasSubs
        ? await safeCount(`SELECT COUNT(DISTINCT streamer_id)::int AS n FROM streamer_subscriptions WHERE user_id=$1`, [userId])
        : 0;
    const supportedFromSupportTx = hasWalletTx
        ? await safeCount(`
        SELECT COUNT(DISTINCT streamer_id)::int AS n
        FROM wallet_tx
        WHERE user_id=$1
          AND kind='spend'
          AND spend_kind='support'
          AND streamer_id IS NOT NULL
        `, [userId])
        : 0;
    const supportedStreamersDistinct = Math.max(supportedFromSubs, supportedFromSupportTx);
    const supportSpentRubis = hasWalletTx
        ? await safeSum(`
        SELECT COALESCE(SUM(amount),0)::int AS s
        FROM wallet_tx
        WHERE user_id=$1
          AND kind='spend'
          AND spend_kind='support'
        `, [userId])
        : 0;
    // Noctambule / Early Bird : 30 minutes watch + 1 msg dans la fenêtre
    async function windowOk(startHour, endHour) {
        if (!hasStreamViewerMinutes || !hasChatMessages)
            return false;
        const ok = await safeCount(`
      WITH w AS (
        SELECT date_trunc('day', (bucket_ts AT TIME ZONE 'Europe/Paris')) AS d,
               COUNT(*)::int AS minutes
        FROM stream_viewer_minutes
        WHERE user_id=$1
          AND bucket_ts >= $2::timestamptz AND bucket_ts < $3::timestamptz
          AND EXTRACT(HOUR FROM (bucket_ts AT TIME ZONE 'Europe/Paris')) >= $4
          AND EXTRACT(HOUR FROM (bucket_ts AT TIME ZONE 'Europe/Paris')) <  $5
        GROUP BY 1
      ),
      c AS (
        SELECT date_trunc('day', (created_at AT TIME ZONE 'Europe/Paris')) AS d,
               COUNT(*)::int AS msgs
        FROM chat_messages
        WHERE user_id=$1 AND deleted_at IS NULL
          AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) >= $4
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) <  $5
        GROUP BY 1
      )
      SELECT COUNT(*)::int AS n
      FROM w
      JOIN c USING (d)
      WHERE w.minutes >= 30 AND c.msgs >= 1
      `, [userId, monthStartIso, monthEndIso, startHour, endHour]);
        return ok > 0;
    }
    const noctambuleOk = await windowOk(2, 6); // 02:00 - 05:59
    const earlyBirdOk = await windowOk(5, 7); // 05:00 - 06:59
    const hasAvatarUploaded = hasUserAvatars
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM user_avatars WHERE user_id=$1`, [userId])) > 0
        : false;
    let hasAnyCosmeticEquipped = false;
    let hasFullLookEquipped = false;
    if (hasUserEquippedCosmetics) {
        try {
            const eq = await q(`
        SELECT username_code, badge_code, title_code, frame_code, hat_code
        FROM user_equipped_cosmetics
        WHERE user_id=$1
        LIMIT 1
        `, [userId]);
            const row = eq.rows?.[0];
            const equippedCodes = row
                ? [row.username_code, row.badge_code, row.title_code, row.frame_code, row.hat_code]
                : [];
            hasAnyCosmeticEquipped = equippedCodes.some(hasText);
            hasFullLookEquipped = equippedCodes.length === 5 && equippedCodes.every(hasText);
        }
        catch {
            hasAnyCosmeticEquipped = false;
            hasFullLookEquipped = false;
        }
    }
    let hasShopPurchase = false;
    if (hasUserEntitlements) {
        try {
            const ent = await q(`SELECT kind, code FROM user_entitlements WHERE user_id=$1`, [userId]);
            hasShopPurchase = (ent.rows || []).some((row) => SHOP_ENTITLEMENT_KEYS.has(`${row.kind}:${row.code}`));
        }
        catch {
            hasShopPurchase = false;
        }
    }
    const predictionBetsTotal = hasPredictionBets
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM prediction_bets WHERE user_id=$1`, [userId])
        : 0;
    const predictionWinsTotal = hasPredictionBets && hasPredictions
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM prediction_bets b
        JOIN predictions p ON p.id = b.prediction_id
        WHERE b.user_id=$1
          AND p.status='resolved'
          AND p.resolved_option IS NOT NULL
          AND b.choice = p.resolved_option
        `, [userId])
        : 0;
    const rainJoinsTotal = hasBotRainJoins
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM bot_rain_joins WHERE user_id=$1`, [userId])
        : 0;
    const wheelJoinsTotal = hasBotWheelEntries
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM bot_wheel_entries WHERE user_id=$1`, [userId])
        : 0;
    const hasPushEnabled = hasPushSubscriptions
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [userId])) > 0
        : false;
    const hasReferral = hasUserReferrals
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM user_referrals WHERE user_id=$1`, [userId])) > 0
        : false;
    const streamerTabsSeenMaxPerStreamer = hasFeatureEvents
        ? await safeCount(`
        SELECT COALESCE(MAX(tab_count),0)::int AS n
        FROM (
          SELECT split_part(subject, '|', 1) AS streamer_key,
                 COUNT(DISTINCT split_part(subject, '|', 2))::int AS tab_count
          FROM user_feature_events
          WHERE user_id=$1
            AND kind='streamer_tab'
            AND POSITION('|' IN subject) > 0
          GROUP BY 1
        ) t
        `, [userId])
        : 0;
    const clipsOpenedTotal = hasFeatureEvents
        ? await safeCount(`
        SELECT COUNT(DISTINCT subject)::int AS n
        FROM user_feature_events
        WHERE user_id=$1
          AND kind='clip_open'
          AND subject <> ''
        `, [userId])
        : 0;
    const botTabsUsedMaxPerStreamer = hasFeatureEvents
        ? await safeCount(`
        SELECT COALESCE(MAX(tab_count),0)::int AS n
        FROM (
          SELECT split_part(subject, '|', 1) AS streamer_key,
                 COUNT(DISTINCT split_part(subject, '|', 2))::int AS tab_count
          FROM user_feature_events
          WHERE user_id=$1
            AND kind='bot_tab'
            AND POSITION('|' IN subject) > 0
          GROUP BY 1
        ) t
        `, [userId])
        : 0;
    const hasVitrineCompleteSession = hasFeatureEvents
        ? (await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM (
          SELECT session_id
          FROM user_feature_events
          WHERE user_id=$1
            AND session_id <> ''
          GROUP BY session_id
          HAVING BOOL_OR(kind='profile_style_action')
             AND BOOL_OR(kind='page_visit' AND subject='profile')
             AND BOOL_OR(kind='page_visit' AND subject='shop')
             AND BOOL_OR(kind='page_visit' AND subject='streamer')
        ) t
        `, [userId])) > 0
        : false;
    // ── Calls ─────────────────────────────────────────────────────────────────
    // calls_queue ne stocke pas user_id — on joint via users.username
    const hasCallsQueue = await tableExists("calls_queue");
    // TODO: si calls_queue obtient une colonne user_id, simplifier ce join
    const callsSentTotalReal = hasCallsQueue
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM calls_queue cq
        JOIN users u ON lower(u.username) = lower(cq.username)
        WHERE u.id = $1
        `, [userId])
        : 0;
    const callsPaidTotal = hasCallsQueue
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM calls_queue cq
        JOIN users u ON lower(u.username) = lower(cq.username)
        WHERE u.id = $1 AND cq.pay IS NOT NULL AND cq.pay > 0
        `, [userId])
        : 0;
    // Multiplicateur = pay / bet (si les deux sont renseignés)
    const callsMaxMultiplier = hasCallsQueue
        ? await safeCount(`
        SELECT COALESCE(MAX(cq.pay / NULLIF(cq.bet, 0)), 0)::numeric AS n
        FROM calls_queue cq
        JOIN users u ON lower(u.username) = lower(cq.username)
        WHERE u.id = $1 AND cq.pay > 0 AND cq.bet > 0
        `, [userId])
        : 0;
    // ── Blackjack ─────────────────────────────────────────────────────────────
    const hasBlackjackHands = await tableExists("blackjack_hands");
    const bjHandsTotal = hasBlackjackHands
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM blackjack_hands WHERE user_id=$1`, [userId])
        : 0;
    const bjHasNatural = hasBlackjackHands
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM blackjack_hands WHERE user_id=$1 AND result='blackjack'`, [userId])) > 0
        : false;
    // 21+3 Trips : cherche colonne side_bet_21_3_result ou result_21_3
    let bjHasBrelan = false;
    if (hasBlackjackHands) {
        try {
            const r = await q(`SELECT COUNT(*)::int AS n
         FROM blackjack_hands
         WHERE user_id=$1
           AND (
             side_bet_21_3_result ILIKE '%trips%'
             OR side_bet_21_3_result ILIKE '%suited trips%'
           )`, [userId]);
            bjHasBrelan = Number(r.rows?.[0]?.n ?? 0) > 0;
        }
        catch {
            // colonne absente — TODO: à activer quand blackjack_hands aura side_bet_21_3_result
            bjHasBrelan = false;
        }
    }
    // Séquence max de victoires consécutives (fenêtre 20 dernières mains)
    let bjConsecutiveWins = 0;
    if (hasBlackjackHands && bjHandsTotal > 0) {
        try {
            const r = await q(`SELECT result FROM blackjack_hands WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [userId]);
            let cur = 0;
            let max = 0;
            for (const row of r.rows) {
                if (row.result === "win" || row.result === "blackjack") {
                    cur++;
                    if (cur > max)
                        max = cur;
                }
                else {
                    cur = 0;
                }
            }
            bjConsecutiveWins = max;
        }
        catch {
            bjConsecutiveWins = 0;
        }
    }
    const bjNetGainTotal = hasBlackjackHands
        ? await safeSum(`SELECT COALESCE(SUM(net_gain),0)::numeric AS s FROM blackjack_hands WHERE user_id=$1`, [userId])
        : 0;
    // ── Économie ──────────────────────────────────────────────────────────────
    const uRow = await q(`SELECT rubis, xp FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const userRubisBalance = Number(uRow.rows?.[0]?.rubis ?? 0);
    const userXp = Number(uRow.rows?.[0]?.xp ?? 0);
    const hasDiscordLinks = await tableExists("discord_links");
    const discordLinked = hasDiscordLinks
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM discord_links WHERE user_id=$1`, [userId])) > 0
        : false;
    // Lifetime rubis gagnés = SUM de tous les crédits (ledger vivant wallet_tx)
    const lifetimeRubisEarned = hasWalletTx
        ? await safeSum(`SELECT COALESCE(SUM(amount),0)::int AS s
         FROM wallet_tx
         WHERE user_id=$1 AND kind='earn'`, [userId])
        : 0;
    // Rubis dépensés au shop = achats cosmétiques + talents (spend_type)
    const shopSpentRubis = hasWalletTx
        ? await safeSum(`SELECT COALESCE(SUM(amount),0)::int AS s
         FROM wallet_tx
         WHERE user_id=$1 AND kind='spend' AND spend_type IN ('cosmetic','talent')`, [userId])
        : 0;
    // Proxy "a déjà eu de l'argent" : lifetimeRubisEarned > 0
    const hasPreviouslyHadRubis = lifetimeRubisEarned > 0;
    // ── Quêtes ────────────────────────────────────────────────────────────────
    const hasQuestProgress = await tableExists("quest_progress");
    const hasQuests = await tableExists("quests");
    const questDailyClaimedTotal = hasQuestProgress && hasQuests
        ? await safeCount(`SELECT COUNT(*)::int AS n
           FROM quest_progress qp
           JOIN quests q ON q.code = qp.quest_code
           WHERE qp.user_id=$1 AND qp.claimed_at IS NOT NULL AND q.type='daily'`, [userId])
        : 0;
    const questWeeklyClaimedTotal = hasQuestProgress && hasQuests
        ? await safeCount(`SELECT COUNT(*)::int AS n
           FROM quest_progress qp
           JOIN quests q ON q.code = qp.quest_code
           WHERE qp.user_id=$1 AND qp.claimed_at IS NOT NULL AND q.type='weekly'`, [userId])
        : 0;
    const questMonthlyClaimedTotal = hasQuestProgress && hasQuests
        ? await safeCount(`SELECT COUNT(*)::int AS n
           FROM quest_progress qp
           JOIN quests q ON q.code = qp.quest_code
           WHERE qp.user_id=$1 AND qp.claimed_at IS NOT NULL AND q.type='monthly'`, [userId])
        : 0;
    // ── Daily lifetime (pas seulement du mois) ────────────────────────────────
    const dailyClaimsTotal = dailyBonusTable
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM ${dailyBonusTable} WHERE user_id=$1`, [userId])
        : 0;
    // Wheel lifetime (réutilise wheelSpinsTotal — déjà calculé ci-dessus)
    const wheelSpinsLifetimeTotal = wheelSpinsTotal;
    // ── Chat Night Owl ────────────────────────────────────────────────────────
    // Messages entre 2h et 5h (heure Paris)
    const chatNightOwlCount = hasChatMessages
        ? await safeCount(`SELECT COUNT(*)::int AS n
         FROM chat_messages
         WHERE user_id=$1
           AND deleted_at IS NULL
           AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) >= 2
           AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 5`, [userId])
        : 0;
    // ── Discord command tracking ──────────────────────────────────────────────
    const hasDiscordCommandUses = await tableExists("discord_command_uses");
    const discordCommandDistinct = hasDiscordCommandUses
        ? await safeCount(`SELECT COUNT(DISTINCT command)::int AS n FROM discord_command_uses WHERE user_id=$1`, [userId])
        : 0;
    const discordSlotUses = hasDiscordCommandUses
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM discord_command_uses WHERE user_id=$1 AND command='slot'`, [userId])
        : 0;
    const discordClaimUses = hasDiscordCommandUses
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM discord_command_uses WHERE user_id=$1 AND command='claim'`, [userId])
        : 0;
    // ── XP cette semaine ─────────────────────────────────────────────────────
    const hasXpEvents = await tableExists("xp_events");
    const xpThisWeek = hasXpEvents
        ? await safeSum(`SELECT COALESCE(SUM(delta),0)::int AS s
         FROM xp_events
         WHERE user_id=$1
           AND created_at >= date_trunc('week', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`, [userId])
        : 0;
    // ── Stream first chatters ─────────────────────────────────────────────────
    const hasStreamFirstChatters = await tableExists("stream_first_chatters");
    const firstChatterCount = hasStreamFirstChatters
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM stream_first_chatters WHERE user_id=$1`, [userId])
        : 0;
    return {
        userId,
        lastLoginAt,
        monthStartIso,
        monthEndIso,
        watchMinutesTotal,
        watchMinutesMonth,
        distinctLivesTotal,
        chatMessagesTotal,
        followsCount,
        hasNotifyEnabled,
        hasFollowQuick,
        wheelSpinsTotal,
        dailyBonusDaysMonth,
        chestJoinsTotal,
        chestWinningsTotal,
        hasAnySub,
        supportedStreamersDistinct,
        supportSpentRubis,
        noctambuleOk,
        earlyBirdOk,
        hasAvatarUploaded,
        hasAnyCosmeticEquipped,
        hasFullLookEquipped,
        hasShopPurchase,
        streamerTabsSeenMaxPerStreamer,
        clipsOpenedTotal,
        predictionBetsTotal,
        predictionWinsTotal,
        rainJoinsTotal,
        wheelJoinsTotal,
        hasPushEnabled,
        hasReferral,
        botTabsUsedMaxPerStreamer,
        hasVitrineCompleteSession,
        callsSentTotal: callsSentTotalReal,
        callsPaidTotal,
        callsMaxMultiplier,
        bjHandsTotal,
        bjHasNatural,
        bjHasBrelan,
        bjConsecutiveWins,
        bjNetGainTotal,
        userRubisBalance,
        lifetimeRubisEarned,
        shopSpentRubis,
        hasPreviouslyHadRubis,
        questDailyClaimedTotal,
        questWeeklyClaimedTotal,
        questMonthlyClaimedTotal,
        dailyClaimsTotal,
        wheelSpinsLifetimeTotal,
        chatNightOwlCount,
        discordLinked,
        discordCommandDistinct,
        discordSlotUses,
        discordClaimUses,
        userXp,
        xpThisWeek,
        firstChatterCount,
    };
}
// ─────────────────────────────────────────────
// ✅ Rewards -> entitlements mapping (succès => cosmétiques)
// Tu as donné :
// - Arc-en-ciel : master_collectionneur
// - Chroma toggle : master_parfait
// - Demon : master_roulette (chez toi c'est master_pretre_roue)
// - Couronne : gold_marathon
// - Halo : master_pilier
// - Lotus crown : master_archiviste
// - Eclipse : master_sous_la_lune
// (le néon = agenda 30j => on le fera après)
// ─────────────────────────────────────────────
const ACH_REWARD_ENTITLEMENTS = {
    // ── Rewards non-title (conservés) + titre en bonus ────────────────────────
    master_collectionneur: [{ kind: "username", code: "uanim_rainbow_scroll" }, { kind: "title", code: "title_ultime" }],
    master_parfait: [{ kind: "username", code: "uanim_chroma_toggle" }, { kind: "title", code: "title_parfait" }],
    // alias "master_roulette" => ton id actuel = master_pretre_roue
    master_pretre_roue: [{ kind: "hat", code: "hat_demon_horn" }, { kind: "title", code: "title_pretre_de_la_roue" }],
    master_roulette: [{ kind: "hat", code: "hat_demon_horn" }, { kind: "title", code: "title_pretre_de_la_roue" }],
    gold_marathon: [{ kind: "hat", code: "hat_carton_crown" }, { kind: "title", code: "title_marathon" }],
    master_pilier: [{ kind: "hat", code: "hat_eclipse_halo" }, { kind: "title", code: "title_pilier" }],
    master_archiviste: [{ kind: "frame", code: "mframe_lotus_crown" }, { kind: "title", code: "title_archiviste" }],
    master_sous_la_lune: [{ kind: "frame", code: "mframe_eclipse" }, { kind: "title", code: "title_sous_la_lune" }],
    // ── Titres existants (5) ──────────────────────────────────────────────────
    bronze_first_chest: [{ kind: "title", code: "title_ratus" }],
    silver_rituel_roue: [{ kind: "title", code: "title_ca_tourne" }],
    silver_supporter: [{ kind: "title", code: "title_vrai_viewer" }],
    gold_assidu: [{ kind: "title", code: "title_no_life" }],
    gold_noctambule: [{ kind: "title", code: "title_batman" }],
    // ── Bronze tuto ───────────────────────────────────────────────────────────
    bronze_welcome: [{ kind: "title", code: "title_bienvenue_sur_lunalive" }],
    bronze_first_login: [{ kind: "title", code: "title_premier_pas" }],
    bronze_first_live: [{ kind: "title", code: "title_premier_live" }],
    bronze_first_message: [{ kind: "title", code: "title_premier_message" }],
    bronze_first_follow: [{ kind: "title", code: "title_premier_follow" }],
    bronze_notify_on: [{ kind: "title", code: "title_cloche_activee" }],
    bronze_first_spin: [{ kind: "title", code: "title_premier_tour" }],
    bronze_pack_de_depart: [{ kind: "title", code: "title_pack_de_depart" }],
    bronze_feed_lance: [{ kind: "title", code: "title_feed_lance" }],
    bronze_first_daily_bonus: [{ kind: "title", code: "title_premier_bonus" }],
    bronze_first_support: [{ kind: "title", code: "title_premier_soutien" }],
    bronze_avatar_pose: [{ kind: "title", code: "title_avatar_pose" }],
    bronze_premier_style: [{ kind: "title", code: "title_premier_style" }],
    bronze_premiere_prediction: [{ kind: "title", code: "title_premiere_prediction" }],
    bronze_sous_la_pluie: [{ kind: "title", code: "title_sous_la_pluie" }],
    bronze_roue_sociale: [{ kind: "title", code: "title_roue_sociale" }],
    bronze_parraine: [{ kind: "title", code: "title_parraine" }],
    level_10_bronze: [{ kind: "title", code: "title_novice" }],
    discord_linked_bronze: [{ kind: "title", code: "title_connecte" }],
    // ── Silver ────────────────────────────────────────────────────────────────
    silver_habitue: [{ kind: "title", code: "title_habitue" }],
    silver_discussion: [{ kind: "title", code: "title_discussion" }],
    silver_fidele: [{ kind: "title", code: "title_regulier" }],
    silver_curieux: [{ kind: "title", code: "title_curieux" }],
    silver_touche_a_tout: [{ kind: "title", code: "title_touche_a_tout" }],
    silver_retour_regulier: [{ kind: "title", code: "title_retour_regulier" }],
    silver_vrai_feed: [{ kind: "title", code: "title_vrai_feed" }],
    silver_coffres: [{ kind: "title", code: "title_coffres_compagnie" }],
    silver_look_complet: [{ kind: "title", code: "title_look_complet" }],
    silver_premier_achat_shop: [{ kind: "title", code: "title_premier_achat_shop" }],
    silver_explorateur_streamer: [{ kind: "title", code: "title_explorateur_streamer" }],
    silver_clip_lover: [{ kind: "title", code: "title_clip_lover" }],
    silver_ping_pret: [{ kind: "title", code: "title_ping_pret" }],
    silver_affut: [{ kind: "title", code: "title_a_l_affut" }],
    call_sent_silver: [{ kind: "title", code: "title_fouineur" }],
    call_paid_silver: [{ kind: "title", code: "title_chanceux" }],
    call_x100_silver: [{ kind: "title", code: "title_petite_frappe" }],
    pred_player_silver: [{ kind: "title", code: "title_gambler" }],
    bj_player_silver: [{ kind: "title", code: "title_nemo" }],
    bj_blackjack_natural: [{ kind: "title", code: "title_21" }],
    rich_silver: [{ kind: "title", code: "title_econome" }],
    lifetime_silver: [{ kind: "title", code: "title_gratteur" }],
    broke_silver: [{ kind: "title", code: "title_ruine" }],
    quest_daily_silver: [{ kind: "title", code: "title_rituel" }],
    wheel_spinner_silver: [{ kind: "title", code: "title_spinner" }],
    daily_silver: [{ kind: "title", code: "title_assidu" }],
    chest_opener_silver: [{ kind: "title", code: "title_rat" }],
    chat_active_silver: [{ kind: "title", code: "title_random" }],
    chat_night_owl_silver: [{ kind: "title", code: "title_vampire" }],
    chat_first_silver: [{ kind: "title", code: "title_first" }],
    watch_silver: [{ kind: "title", code: "title_viewer" }],
    discord_command_silver: [{ kind: "title", code: "title_testeur" }],
    level_25_silver: [{ kind: "title", code: "title_grinder" }],
    collection_silver: [{ kind: "title", code: "title_collectionneur" }],
    // ── Gold ──────────────────────────────────────────────────────────────────
    gold_roulette: [{ kind: "title", code: "title_roulette" }],
    gold_grande_discussion: [{ kind: "title", code: "title_grande_discussion" }],
    gold_explorateur: [{ kind: "title", code: "title_explorateur" }],
    gold_super_follow: [{ kind: "title", code: "title_super_follow" }],
    gold_tour_complet: [{ kind: "title", code: "title_tour_complet" }],
    gold_rituel_lunalive: [{ kind: "title", code: "title_rituel_lunalive" }],
    gold_mecene: [{ kind: "title", code: "title_mecene" }],
    gold_cercle_fidele: [{ kind: "title", code: "title_cercle_fidele" }],
    gold_coffre_fort: [{ kind: "title", code: "title_coffre_fort" }],
    gold_early_bird: [{ kind: "title", code: "title_early_bird" }],
    gold_oracle: [{ kind: "title", code: "title_devin" }],
    gold_maitre_du_bot: [{ kind: "title", code: "title_maitre_du_bot" }],
    gold_vitrine_complete: [{ kind: "title", code: "title_vitrine_complete" }],
    call_sent_gold: [{ kind: "title", code: "title_tracker" }],
    call_paid_gold: [{ kind: "title", code: "title_rentier" }],
    call_x500_gold: [{ kind: "title", code: "title_grosse_frappe" }],
    pred_player_gold: [{ kind: "title", code: "title_accro" }],
    pred_winner_gold: [{ kind: "title", code: "title_instinct" }],
    bj_player_gold: [{ kind: "title", code: "title_shark" }],
    bj_brelan_gold: [{ kind: "title", code: "title_triplette" }],
    bj_streak_gold: [{ kind: "title", code: "title_203" }],
    rich_gold: [{ kind: "title", code: "title_big_blind" }],
    lifetime_gold: [{ kind: "title", code: "title_banquier" }],
    spender_gold: [{ kind: "title", code: "title_flambeur" }],
    quest_daily_gold: [{ kind: "title", code: "title_routine" }],
    quest_weekly_gold: [{ kind: "title", code: "title_studieux" }],
    wheel_spinner_gold: [{ kind: "title", code: "title_beyblade" }],
    daily_gold: [{ kind: "title", code: "title_toujours_la" }],
    chest_opener_gold: [{ kind: "title", code: "title_pilleur" }],
    chat_active_gold: [{ kind: "title", code: "title_connu" }],
    watch_gold: [{ kind: "title", code: "title_fidele" }],
    discord_slots_gold: [{ kind: "title", code: "title_slotteur" }],
    level_50_gold: [{ kind: "title", code: "title_pro" }],
    collection_gold: [{ kind: "title", code: "title_chasseur" }],
    // ── Master ────────────────────────────────────────────────────────────────
    master_polyvalent: [{ kind: "title", code: "title_polyvalent" }],
    master_collection_par_categorie: [{ kind: "title", code: "title_collection_par_categorie" }],
    call_sent_master: [{ kind: "title", code: "title_predateur" }],
    call_paid_master: [{ kind: "title", code: "title_trader" }],
    call_x1000_master: [{ kind: "title", code: "title_max_frappe" }],
    pred_winner_master: [{ kind: "title", code: "title_oracle" }],
    bj_player_master: [{ kind: "title", code: "title_nessie" }],
    bj_lucky_master: [{ kind: "title", code: "title_croupier_slayer" }],
    rich_master: [{ kind: "title", code: "title_baron" }],
    lifetime_master: [{ kind: "title", code: "title_rothschild" }],
    quest_weekly_master: [{ kind: "title", code: "title_acharne" }],
    quest_monthly_master: [{ kind: "title", code: "title_inarretable" }],
    chest_opener_master: [{ kind: "title", code: "title_one_piece" }],
    chat_active_master: [{ kind: "title", code: "title_legende_du_chat" }],
    watch_master: [{ kind: "title", code: "title_brother_eye" }],
    discord_claim_master: [{ kind: "title", code: "title_ephemeride" }],
    level_75_master: [{ kind: "title", code: "title_tryharder" }],
    level_100_master: [{ kind: "title", code: "title_legende" }],
    xp_grinder_master: [{ kind: "title", code: "title_sans_vie" }],
};
let entitlementsEnsured = false;
async function ensureEntitlementsTable() {
    if (entitlementsEnsured)
        return;
    // si la table existe déjà, CREATE IF NOT EXISTS ne casse rien
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id INT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, kind, code)
    );
  `);
    entitlementsEnsured = true;
}
async function grantEntitlementsForUnlocked(userId, unlockedIds) {
    const rewards = [];
    for (const id of unlockedIds) {
        const r = ACH_REWARD_ENTITLEMENTS[id];
        if (r && r.length)
            rewards.push(...r);
    }
    if (!rewards.length)
        return { granted: 0 };
    await ensureEntitlementsTable();
    // insert en batch
    const values = [];
    const rowsSql = [];
    let i = 1;
    for (const r of rewards) {
        rowsSql.push(`($${i++}, $${i++}, $${i++})`);
        values.push(userId, r.kind, r.code);
    }
    const sql = `
    INSERT INTO user_entitlements (user_id, kind, code)
    VALUES ${rowsSql.join(",")}
    ON CONFLICT (user_id, kind, code) DO NOTHING
  `;
    const r = await pool.query(sql, values);
    return { granted: r.rowCount || 0 };
}
const defs = [
    // ───────────────── Bronze (tuto)
    {
        id: "bronze_welcome",
        tier: "bronze",
        category: "Découverte",
        icon: "🌙",
        name: "Bienvenue sur LunaLive",
        desc: "Créer un compte.",
        eval: () => ({ unlocked: true }),
    },
    {
        id: "bronze_first_login",
        tier: "bronze",
        category: "Découverte",
        icon: "🔑",
        name: "Premier pas",
        desc: "Se connecter une fois.",
        eval: (m) => ({ unlocked: !!m.lastLoginAt }),
    },
    {
        id: "bronze_first_live",
        tier: "bronze",
        category: "Watch & Lives",
        icon: "📺",
        name: "Premier live",
        desc: "Regarder un live (5 minutes).",
        eval: (m) => ({ unlocked: m.watchMinutesTotal >= 5, progress: { current: m.watchMinutesTotal, target: 5 } }),
    },
    {
        id: "bronze_first_message",
        tier: "bronze",
        category: "Chat & Social",
        icon: "💬",
        name: "Premier message",
        desc: "Envoyer 1 message dans le chat.",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 1, progress: { current: m.chatMessagesTotal, target: 1 } }),
    },
    {
        id: "bronze_first_follow",
        tier: "bronze",
        category: "Chat & Social",
        icon: "⭐",
        name: "Premier follow",
        desc: "Suivre un streamer.",
        eval: (m) => ({ unlocked: m.followsCount >= 1, progress: { current: m.followsCount, target: 1 } }),
    },
    {
        id: "bronze_notify_on",
        tier: "bronze",
        category: "Chat & Social",
        icon: "🔔",
        name: "Cloche activée",
        desc: "Activer la notification d'un follow.",
        eval: (m) => ({ unlocked: m.hasNotifyEnabled }),
    },
    {
        id: "bronze_first_spin",
        tier: "bronze",
        category: "Roue & Bonus",
        icon: "🎡",
        name: "Premier tour",
        desc: "Faire tourner la roue 1 fois.",
        eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 1, progress: { current: m.wheelSpinsTotal, target: 1 } }),
    },
    {
        id: "bronze_pack_de_depart",
        tier: "bronze",
        category: "Découverte",
        icon: "🧰",
        name: "Pack de départ",
        desc: "Valider live + message + follow + roue.",
        eval: (m) => {
            const steps = [m.watchMinutesTotal >= 5, m.chatMessagesTotal >= 1, m.followsCount >= 1, m.wheelSpinsTotal >= 1];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "bronze_feed_lance",
        tier: "bronze",
        category: "Chat & Social",
        icon: "🛰️",
        name: "Feed lancé",
        desc: "Avoir 3 follows et au moins une cloche activée.",
        eval: (m) => {
            const steps = [m.followsCount >= 3, m.hasNotifyEnabled];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "bronze_first_daily_bonus",
        tier: "bronze",
        category: "Roue & Bonus",
        icon: "🗓️",
        name: "Premier bonus",
        desc: "Récupérer un bonus quotidien 1 fois.",
        eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 1, progress: { current: m.dailyBonusDaysMonth, target: 1 } }),
    },
    {
        id: "bronze_first_support",
        tier: "bronze",
        category: "Support",
        icon: "💎",
        name: "Premier soutien",
        desc: "S'abonner (ou tip) une fois.",
        eval: (m) => ({ unlocked: m.hasAnySub || m.supportSpentRubis > 0 }),
    },
    {
        id: "bronze_first_chest",
        tier: "bronze",
        category: "Coffre",
        icon: "🎁",
        name: "Premier coffre",
        desc: "Participer à un coffre streamer.",
        rewardPreview: "Titre : Ratus",
        eval: (m) => ({ unlocked: m.chestJoinsTotal >= 1, progress: { current: m.chestJoinsTotal, target: 1 } }),
    },
    {
        id: "bronze_avatar_pose",
        tier: "bronze",
        category: "Personnalisation",
        icon: "🖼️",
        name: "Avatar posé",
        desc: "Uploader ton premier avatar.",
        eval: (m) => ({ unlocked: m.hasAvatarUploaded, progress: boolProgress(m.hasAvatarUploaded) }),
    },
    {
        id: "bronze_premier_style",
        tier: "bronze",
        category: "Personnalisation",
        icon: "✨",
        name: "Premier style",
        desc: "Équiper ton premier cosmétique.",
        eval: (m) => ({ unlocked: m.hasAnyCosmeticEquipped, progress: boolProgress(m.hasAnyCosmeticEquipped) }),
    },
    {
        id: "bronze_premiere_prediction",
        tier: "bronze",
        category: "Bot & Fun",
        icon: "🔮",
        name: "Première prédiction",
        desc: "Placer un premier pari.",
        eval: (m) => ({ unlocked: m.predictionBetsTotal >= 1, progress: { current: m.predictionBetsTotal, target: 1 } }),
    },
    {
        id: "bronze_sous_la_pluie",
        tier: "bronze",
        category: "Bot & Fun",
        icon: "🌧️",
        name: "Sous la pluie",
        desc: "Rejoindre une rain.",
        eval: (m) => ({ unlocked: m.rainJoinsTotal >= 1, progress: { current: m.rainJoinsTotal, target: 1 } }),
    },
    {
        id: "bronze_roue_sociale",
        tier: "bronze",
        category: "Bot & Fun",
        icon: "🎯",
        name: "Roue sociale",
        desc: "Rejoindre une roue via LunaBot.",
        eval: (m) => ({ unlocked: m.wheelJoinsTotal >= 1, progress: { current: m.wheelJoinsTotal, target: 1 } }),
    },
    {
        id: "bronze_parraine",
        tier: "bronze",
        category: "Découverte",
        icon: "🫂",
        name: "Parrainé",
        desc: "Arriver via un referral ou lier un code referral.",
        eval: (m) => ({ unlocked: m.hasReferral, progress: boolProgress(m.hasReferral) }),
    },
    // ───────────────── Silver (actif chill)
    {
        id: "silver_habitue",
        tier: "silver",
        category: "Roue & Bonus",
        icon: "📅",
        name: "Habitué",
        eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 10, progress: { current: m.dailyBonusDaysMonth, target: 10 } }),
    },
    {
        id: "silver_rituel_roue",
        tier: "silver",
        category: "Roue & Bonus",
        icon: "🎡",
        name: "Rituel de la roue",
        rewardPreview: "Titre : Ça tourne !",
        eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 10, progress: { current: m.wheelSpinsTotal, target: 10 } }),
    },
    {
        id: "silver_discussion",
        tier: "silver",
        category: "Chat & Social",
        icon: "💬",
        name: "Discussion",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 250, progress: { current: m.chatMessagesTotal, target: 250 } }),
    },
    {
        id: "silver_fidele",
        tier: "silver",
        category: "Watch & Lives",
        icon: "📺",
        name: "Régulier",
        eval: (m) => ({ unlocked: m.distinctLivesTotal >= 10, progress: { current: m.distinctLivesTotal, target: 10 } }),
    },
    {
        id: "silver_curieux",
        tier: "silver",
        category: "Chat & Social",
        icon: "⭐",
        name: "Curieux",
        eval: (m) => ({ unlocked: m.followsCount >= 15, progress: { current: m.followsCount, target: 15 } }),
    },
    {
        id: "silver_touche_a_tout",
        tier: "silver",
        category: "Découverte",
        icon: "🧭",
        name: "Touche-à-tout",
        desc: "Utiliser 5 familles de fonctionnalités du site.",
        eval: (m) => {
            const current = activeFeatureFamiliesCount(m);
            return { unlocked: current >= 5, progress: { current, target: 5 } };
        },
    },
    {
        id: "silver_retour_regulier",
        tier: "silver",
        category: "Roue & Bonus",
        icon: "🔁",
        name: "Retour régulier",
        desc: "Cumuler 7 bonus du mois et 7 spins.",
        eval: (m) => {
            const steps = [m.dailyBonusDaysMonth >= 7, m.wheelSpinsTotal >= 7];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "silver_vrai_feed",
        tier: "silver",
        category: "Chat & Social",
        icon: "📡",
        name: "Vrai feed",
        desc: "Avoir 10 follows et réussir un quick-follow.",
        eval: (m) => {
            const steps = [m.followsCount >= 10, m.hasFollowQuick];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "silver_coffres",
        tier: "silver",
        category: "Coffre",
        icon: "🎁",
        name: "Coffres & compagnie",
        eval: (m) => ({ unlocked: m.chestJoinsTotal >= 10, progress: { current: m.chestJoinsTotal, target: 10 } }),
    },
    {
        id: "silver_supporter",
        tier: "silver",
        category: "Support",
        icon: "💎",
        name: "Supporter",
        rewardPreview: "Titre : Vrai Viewer",
        eval: (m) => ({ unlocked: m.supportSpentRubis >= 1000, progress: { current: m.supportSpentRubis, target: 1000 } }),
    },
    {
        id: "silver_look_complet",
        tier: "silver",
        category: "Personnalisation",
        icon: "🪞",
        name: "Look complet",
        desc: "Équiper badge, titre, frame, hat et effet pseudo.",
        eval: (m) => ({ unlocked: m.hasFullLookEquipped, progress: boolProgress(m.hasFullLookEquipped) }),
    },
    {
        id: "silver_premier_achat_shop",
        tier: "silver",
        category: "Personnalisation",
        icon: "🛍️",
        name: "Premier achat shop",
        desc: "Acheter un premier item au shop.",
        eval: (m) => ({ unlocked: m.hasShopPurchase, progress: boolProgress(m.hasShopPurchase) }),
    },
    {
        id: "silver_explorateur_streamer",
        tier: "silver",
        category: "Découverte",
        icon: "🧭",
        name: "Explorateur streamer",
        desc: "Visiter About, Clips, VOD et Agenda sur une même page streamer.",
        eval: (m) => ({
            unlocked: m.streamerTabsSeenMaxPerStreamer >= 4,
            progress: { current: m.streamerTabsSeenMaxPerStreamer, target: 4 },
        }),
    },
    {
        id: "silver_clip_lover",
        tier: "silver",
        category: "Watch & Lives",
        icon: "🎬",
        name: "Clip lover",
        desc: "Ouvrir 5 clips.",
        eval: (m) => ({ unlocked: m.clipsOpenedTotal >= 5, progress: { current: m.clipsOpenedTotal, target: 5 } }),
    },
    {
        id: "silver_ping_pret",
        tier: "silver",
        category: "Chat & Social",
        icon: "📲",
        name: "Ping prêt",
        desc: "Activer les notifications push du site.",
        eval: (m) => ({ unlocked: m.hasPushEnabled, progress: boolProgress(m.hasPushEnabled) }),
    },
    {
        id: "silver_affut",
        tier: "silver",
        category: "Chat & Social",
        icon: "⏱️",
        name: "À l'affût",
        eval: (m) => ({
            unlocked: m.hasFollowQuick,
            progress: { current: m.hasFollowQuick ? 1 : 0, target: 1 },
        }),
    },
    // ───────────────── Gold (très actif)
    {
        id: "gold_assidu",
        tier: "gold",
        category: "Roue & Bonus",
        icon: "📅",
        name: "No Life",
        hint: "On te voit souvent par ici…",
        rewardPreview: "Titre : No Life",
        eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 20, progress: { current: m.dailyBonusDaysMonth, target: 20 } }),
    },
    {
        id: "gold_roulette",
        tier: "gold",
        category: "Roue & Bonus",
        icon: "🎡",
        name: "Roulette",
        hint: "La roue n'a plus de secrets.",
        eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 50, progress: { current: m.wheelSpinsTotal, target: 50 } }),
    },
    {
        id: "gold_grande_discussion",
        tier: "gold",
        category: "Chat & Social",
        icon: "💬",
        name: "Grande discussion",
        hint: "Ça parle beaucoup ici…",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 2000, progress: { current: m.chatMessagesTotal, target: 2000 } }),
    },
    {
        id: "gold_marathon",
        tier: "gold",
        category: "Watch & Lives",
        icon: "⏳",
        name: "Marathon",
        hint: "Une présence qui commence à peser.",
        rewardPreview: "Chapeau : Carton Crown",
        eval: (m) => ({ unlocked: m.watchMinutesMonth >= 600, progress: { current: m.watchMinutesMonth, target: 600 } }), // 10h
    },
    {
        id: "gold_explorateur",
        tier: "gold",
        category: "Watch & Lives",
        icon: "🧭",
        name: "Explorateur",
        hint: "Tu aimes varier les lives.",
        eval: (m) => ({ unlocked: m.distinctLivesTotal >= 15, progress: { current: m.distinctLivesTotal, target: 15 } }),
    },
    {
        id: "gold_super_follow",
        tier: "gold",
        category: "Chat & Social",
        icon: "🌟",
        name: "Super-follow",
        hint: "Ton feed doit être chargé…",
        eval: (m) => ({ unlocked: m.followsCount >= 20, progress: { current: m.followsCount, target: 20 } }),
    },
    {
        id: "gold_tour_complet",
        tier: "gold",
        category: "Découverte",
        icon: "🗺️",
        name: "Tour complet",
        desc: "Activer 6 grandes familles de fonctionnalités.",
        hint: "Tu connais presque toute la maison.",
        eval: (m) => {
            const current = activeFeatureFamiliesCount(m);
            return { unlocked: current >= 6, progress: { current, target: 6 } };
        },
    },
    {
        id: "gold_rituel_lunalive",
        tier: "gold",
        category: "Roue & Bonus",
        icon: "🌗",
        name: "Rituel LunaLive",
        desc: "Cumuler 20 bonus du mois, 50 spins et 10 coffres.",
        hint: "Quand le site devient une routine.",
        eval: (m) => {
            const steps = [m.dailyBonusDaysMonth >= 20, m.wheelSpinsTotal >= 50, m.chestJoinsTotal >= 10];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "gold_mecene",
        tier: "gold",
        category: "Support",
        icon: "🤝",
        name: "Mécène",
        hint: "Soutenir, encore et encore.",
        eval: (m) => ({ unlocked: m.supportedStreamersDistinct >= 10, progress: { current: m.supportedStreamersDistinct, target: 10 } }),
    },
    {
        id: "gold_cercle_fidele",
        tier: "gold",
        category: "Support",
        icon: "💠",
        name: "Cercle fidèle",
        desc: "Soutenir 3 streamers distincts et y cumuler 2500 rubis.",
        hint: "Un cercle de streamers que tu soutiens vraiment.",
        eval: (m) => {
            const steps = [m.supportedStreamersDistinct >= 3, m.supportSpentRubis >= 2500];
            return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
        },
    },
    {
        id: "gold_coffre_fort",
        tier: "gold",
        category: "Coffre",
        icon: "🧰",
        name: "Coffre-fort",
        hint: "Le coffre t'aime bien.",
        eval: (m) => ({ unlocked: m.chestWinningsTotal >= 200, progress: { current: m.chestWinningsTotal, target: 200 } }),
    },
    {
        id: "gold_noctambule",
        tier: "gold",
        category: "Watch & Lives",
        icon: "🌙",
        name: "Noctambule",
        hint: "Tu traînes tard…",
        rewardPreview: "Titre : Batman",
        eval: (m) => ({ unlocked: m.noctambuleOk }),
    },
    {
        id: "gold_early_bird",
        tier: "gold",
        category: "Watch & Lives",
        icon: "🌅",
        name: "Early Bird",
        hint: "Debout avant tout le monde…",
        eval: (m) => ({ unlocked: m.earlyBirdOk }),
    },
    {
        id: "gold_oracle",
        tier: "gold",
        category: "Bot & Fun",
        icon: "🔮",
        name: "Devin",
        desc: "Gagner 3 prédictions.",
        hint: "Les prédictions commencent à te sourire.",
        eval: (m) => ({ unlocked: m.predictionWinsTotal >= 3, progress: { current: m.predictionWinsTotal, target: 3 } }),
    },
    {
        id: "gold_maitre_du_bot",
        tier: "gold",
        category: "Bot & Fun",
        icon: "🤖",
        name: "Maître du bot",
        desc: "Utiliser au moins 4 tabs du LunaBot sur un même streamer.",
        hint: "Call, hunt, roue, rain... fais le tour de LunaBot.",
        eval: (m) => ({
            unlocked: m.botTabsUsedMaxPerStreamer >= 4,
            progress: { current: m.botTabsUsedMaxPerStreamer, target: 4 },
        }),
    },
    {
        id: "gold_vitrine_complete",
        tier: "gold",
        category: "Personnalisation",
        icon: "🪄",
        name: "Vitrine complète",
        desc: "Personnaliser ton profil puis visiter shop, profil et page streamer dans la même session.",
        hint: "Ton style mérite d'être vu partout.",
        eval: (m) => ({ unlocked: m.hasVitrineCompleteSession, progress: boolProgress(m.hasVitrineCompleteSession) }),
    },
    // ───────────────── Master (rare / tryhard)
    {
        id: "master_sous_la_lune",
        tier: "master",
        category: "Master",
        icon: "🌕",
        name: "Sous la lune",
        hidden: true,
        rewardPreview: "Cadran : Eclipse",
        eval: (m) => ({ unlocked: m.watchMinutesMonth >= 1800, progress: { current: m.watchMinutesMonth, target: 1800 } }), // 30h
    },
    {
        id: "master_pretre_roue",
        tier: "master",
        category: "Master",
        icon: "🎡",
        name: "Prêtre de la roue",
        hidden: true,
        rewardPreview: "Chapeau : Demon Horn",
        eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 200, progress: { current: m.wheelSpinsTotal, target: 200 } }),
    },
    {
        id: "master_archiviste",
        tier: "master",
        category: "Master",
        icon: "📜",
        name: "Archiviste",
        hidden: true,
        rewardPreview: "Cadran : Lotus Crown",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 10000, progress: { current: m.chatMessagesTotal, target: 10000 } }),
    },
    {
        id: "master_pilier",
        tier: "master",
        category: "Master",
        icon: "🛡️",
        name: "Pilier",
        hidden: true,
        rewardPreview: "Chapeau : Eclipse Halo",
        eval: (m) => ({ unlocked: m.supportedStreamersDistinct >= 20, progress: { current: m.supportedStreamersDistinct, target: 20 } }),
    },
    {
        id: "master_parfait",
        tier: "master",
        category: "Master",
        icon: "👑",
        name: "Parfait",
        hidden: true,
        rewardPreview: "Pseudo : Chroma (toggle)",
        eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 30, progress: { current: m.dailyBonusDaysMonth, target: 30 } }),
    },
    {
        id: "master_polyvalent",
        tier: "master",
        category: "Meta",
        icon: "🧠",
        name: "Polyvalent",
        desc: "Débloquer au moins 3 succès gold dans 3 catégories différentes.",
        eval: () => ({ unlocked: false, progress: { current: 0, target: 3 } }),
    },
    {
        id: "master_collection_par_categorie",
        tier: "master",
        category: "Meta",
        icon: "🧩",
        name: "Collection par catégorie",
        desc: "Débloquer tous les succès bronze et silver.",
        eval: () => ({ unlocked: false, progress: { current: 0, target: 1 } }),
    },
    {
        id: "master_collectionneur",
        tier: "master",
        category: "Meta",
        icon: "🏆",
        name: "Ultime",
        hidden: false,
        rewardPreview: "Pseudo : Arc-en-ciel défilant + Titre : Ultime",
        eval: (_m, unlockedCountExceptCollector) => ({
            unlocked: unlockedCountExceptCollector >= 20,
            progress: { current: unlockedCountExceptCollector, target: 20 },
        }),
    },
    // ───────────────── Calls (9)
    {
        id: "call_sent_silver",
        tier: "silver",
        category: "Calls",
        icon: "📞",
        name: "Fouineur",
        desc: "Envoyer 15 calls au total.",
        eval: (m) => ({ unlocked: m.callsSentTotal >= 15, progress: { current: m.callsSentTotal, target: 15 } }),
    },
    {
        id: "call_sent_gold",
        tier: "gold",
        category: "Calls",
        icon: "📞",
        name: "Tracker",
        desc: "Envoyer 75 calls au total.",
        eval: (m) => ({ unlocked: m.callsSentTotal >= 75, progress: { current: m.callsSentTotal, target: 75 } }),
    },
    {
        id: "call_sent_master",
        tier: "master",
        category: "Calls",
        icon: "📞",
        name: "Prédateur",
        desc: "Envoyer 300 calls au total.",
        hidden: true,
        eval: (m) => ({ unlocked: m.callsSentTotal >= 300, progress: { current: m.callsSentTotal, target: 300 } }),
    },
    {
        id: "call_paid_silver",
        tier: "silver",
        category: "Calls",
        icon: "💸",
        name: "Chanceux",
        desc: "Recevoir 5 payouts sur des calls.",
        eval: (m) => ({ unlocked: m.callsPaidTotal >= 5, progress: { current: m.callsPaidTotal, target: 5 } }),
    },
    {
        id: "call_paid_gold",
        tier: "gold",
        category: "Calls",
        icon: "💸",
        name: "Rentier",
        desc: "Recevoir 25 payouts sur des calls.",
        eval: (m) => ({ unlocked: m.callsPaidTotal >= 25, progress: { current: m.callsPaidTotal, target: 25 } }),
    },
    {
        id: "call_paid_master",
        tier: "master",
        category: "Calls",
        icon: "💸",
        name: "Trader",
        desc: "Recevoir 100 payouts sur des calls.",
        hidden: true,
        eval: (m) => ({ unlocked: m.callsPaidTotal >= 100, progress: { current: m.callsPaidTotal, target: 100 } }),
    },
    {
        id: "call_x100_silver",
        tier: "silver",
        category: "Calls",
        icon: "🚀",
        name: "Petite frappe",
        desc: "Observer un multiplicateur ≥ 100× sur un call.",
        // TODO: nécessite calls_queue.bet + calls_queue.pay renseignés sur le bon user
        eval: (m) => ({ unlocked: m.callsMaxMultiplier >= 100, progress: { current: Math.round(m.callsMaxMultiplier), target: 100 } }),
    },
    {
        id: "call_x500_gold",
        tier: "gold",
        category: "Calls",
        icon: "🌕",
        name: "Grosse frappe",
        desc: "Observer un multiplicateur ≥ 500× sur un call.",
        eval: (m) => ({ unlocked: m.callsMaxMultiplier >= 500, progress: { current: Math.round(m.callsMaxMultiplier), target: 500 } }),
    },
    {
        id: "call_x1000_master",
        tier: "master",
        category: "Calls",
        icon: "🌌",
        name: "Max frappe",
        desc: "Observer un multiplicateur ≥ 1000× sur un call.",
        hidden: true,
        eval: (m) => ({ unlocked: m.callsMaxMultiplier >= 1000, progress: { current: Math.round(m.callsMaxMultiplier), target: 1000 } }),
    },
    // ───────────────── Predictions (4)
    {
        id: "pred_player_silver",
        tier: "silver",
        category: "Predictions",
        icon: "🔮",
        name: "Gambler",
        desc: "Placer 10 paris sur des prédictions.",
        eval: (m) => ({ unlocked: m.predictionBetsTotal >= 10, progress: { current: m.predictionBetsTotal, target: 10 } }),
    },
    {
        id: "pred_player_gold",
        tier: "gold",
        category: "Predictions",
        icon: "🔮",
        name: "Accro",
        desc: "Placer 30 paris sur des prédictions.",
        eval: (m) => ({ unlocked: m.predictionBetsTotal >= 30, progress: { current: m.predictionBetsTotal, target: 30 } }),
    },
    {
        id: "pred_winner_gold",
        tier: "gold",
        category: "Predictions",
        icon: "🏅",
        name: "Instinct",
        desc: "Gagner 10 prédictions.",
        eval: (m) => ({ unlocked: m.predictionWinsTotal >= 10, progress: { current: m.predictionWinsTotal, target: 10 } }),
    },
    {
        id: "pred_winner_master",
        tier: "master",
        category: "Predictions",
        icon: "🔭",
        name: "Oracle",
        desc: "Gagner 40 prédictions.",
        hidden: true,
        eval: (m) => ({ unlocked: m.predictionWinsTotal >= 40, progress: { current: m.predictionWinsTotal, target: 40 } }),
    },
    // ───────────────── Blackjack (7)
    {
        id: "bj_player_silver",
        tier: "silver",
        category: "Blackjack",
        icon: "🃏",
        name: "Nemo",
        desc: "Jouer 15 mains de blackjack.",
        eval: (m) => ({ unlocked: m.bjHandsTotal >= 15, progress: { current: m.bjHandsTotal, target: 15 } }),
    },
    {
        id: "bj_player_gold",
        tier: "gold",
        category: "Blackjack",
        icon: "🃏",
        name: "Shark",
        desc: "Jouer 50 mains de blackjack.",
        eval: (m) => ({ unlocked: m.bjHandsTotal >= 50, progress: { current: m.bjHandsTotal, target: 50 } }),
    },
    {
        id: "bj_player_master",
        tier: "master",
        category: "Blackjack",
        icon: "🃏",
        name: "Nessie",
        desc: "Jouer 150 mains de blackjack.",
        hidden: true,
        eval: (m) => ({ unlocked: m.bjHandsTotal >= 150, progress: { current: m.bjHandsTotal, target: 150 } }),
    },
    {
        id: "bj_blackjack_natural",
        tier: "silver",
        category: "Blackjack",
        icon: "🎴",
        name: "21",
        desc: "Obtenir un blackjack naturel (A + 10).",
        eval: (m) => ({ unlocked: m.bjHasNatural, progress: boolProgress(m.bjHasNatural) }),
    },
    {
        id: "bj_brelan_gold",
        tier: "gold",
        category: "Blackjack",
        icon: "🎰",
        name: "Triplette",
        desc: "Réussir un Trips ou Suited Trips au side bet 21+3.",
        eval: (m) => ({ unlocked: m.bjHasBrelan, progress: boolProgress(m.bjHasBrelan) }),
    },
    {
        id: "bj_streak_gold",
        tier: "gold",
        category: "Blackjack",
        icon: "🔥",
        name: "203",
        desc: "Enchaîner 4 victoires consécutives au blackjack.",
        eval: (m) => ({ unlocked: m.bjConsecutiveWins >= 4, progress: { current: m.bjConsecutiveWins, target: 4 } }),
    },
    {
        id: "bj_lucky_master",
        tier: "master",
        category: "Blackjack",
        icon: "🍀",
        name: "Croupier slayer",
        desc: "Accumuler 3000 rubis de gains nets au blackjack.",
        hidden: true,
        eval: (m) => ({ unlocked: m.bjNetGainTotal >= 3000, progress: { current: Math.round(m.bjNetGainTotal), target: 3000 } }),
    },
    // ───────────────── Économie (8)
    {
        id: "rich_silver",
        tier: "silver",
        category: "Économie",
        icon: "💰",
        name: "Économe",
        desc: "Avoir 1 000 rubis en poche.",
        eval: (m) => ({ unlocked: m.userRubisBalance >= 1000, progress: { current: m.userRubisBalance, target: 1000 } }),
    },
    {
        id: "rich_gold",
        tier: "gold",
        category: "Économie",
        icon: "💰",
        name: "Big Blind",
        desc: "Avoir 5 000 rubis en poche.",
        eval: (m) => ({ unlocked: m.userRubisBalance >= 5000, progress: { current: m.userRubisBalance, target: 5000 } }),
    },
    {
        id: "rich_master",
        tier: "master",
        category: "Économie",
        icon: "💰",
        name: "Baron",
        desc: "Avoir 10 000 rubis en poche.",
        hidden: true,
        eval: (m) => ({ unlocked: m.userRubisBalance >= 10000, progress: { current: m.userRubisBalance, target: 10000 } }),
    },
    {
        id: "lifetime_silver",
        tier: "silver",
        category: "Économie",
        icon: "📈",
        name: "Gratteur",
        desc: "Gagner 5 000 rubis au total (toutes sources).",
        eval: (m) => ({ unlocked: m.lifetimeRubisEarned >= 5000, progress: { current: m.lifetimeRubisEarned, target: 5000 } }),
    },
    {
        id: "lifetime_gold",
        tier: "gold",
        category: "Économie",
        icon: "📈",
        name: "Banquier",
        desc: "Gagner 25 000 rubis au total.",
        eval: (m) => ({ unlocked: m.lifetimeRubisEarned >= 25000, progress: { current: m.lifetimeRubisEarned, target: 25000 } }),
    },
    {
        id: "lifetime_master",
        tier: "master",
        category: "Économie",
        icon: "📈",
        name: "Rothschild",
        desc: "Gagner 75 000 rubis au total.",
        hidden: true,
        eval: (m) => ({ unlocked: m.lifetimeRubisEarned >= 75000, progress: { current: m.lifetimeRubisEarned, target: 75000 } }),
    },
    {
        id: "spender_gold",
        tier: "gold",
        category: "Économie",
        icon: "🛒",
        name: "Flambeur",
        desc: "Dépenser 3 000 rubis au shop.",
        eval: (m) => ({ unlocked: m.shopSpentRubis >= 3000, progress: { current: m.shopSpentRubis, target: 3000 } }),
    },
    {
        id: "broke_silver",
        tier: "silver",
        category: "Économie",
        icon: "🪙",
        name: "Ruiné",
        desc: "Être tombé à 0 rubis après avoir eu des économies.",
        // Proxy : balance = 0 ET a déjà gagné des rubis dans sa vie
        eval: (m) => ({ unlocked: m.userRubisBalance === 0 && m.hasPreviouslyHadRubis }),
    },
    // ───────────────── Quêtes (5)
    {
        id: "quest_daily_silver",
        tier: "silver",
        category: "Quêtes",
        icon: "📋",
        name: "Rituel",
        desc: "Compléter 10 quêtes journalières.",
        eval: (m) => ({ unlocked: m.questDailyClaimedTotal >= 10, progress: { current: m.questDailyClaimedTotal, target: 10 } }),
    },
    {
        id: "quest_daily_gold",
        tier: "gold",
        category: "Quêtes",
        icon: "📋",
        name: "Routine",
        desc: "Compléter 50 quêtes journalières.",
        eval: (m) => ({ unlocked: m.questDailyClaimedTotal >= 50, progress: { current: m.questDailyClaimedTotal, target: 50 } }),
    },
    {
        id: "quest_weekly_gold",
        tier: "gold",
        category: "Quêtes",
        icon: "📋",
        name: "Studieux",
        desc: "Compléter 8 quêtes hebdomadaires.",
        eval: (m) => ({ unlocked: m.questWeeklyClaimedTotal >= 8, progress: { current: m.questWeeklyClaimedTotal, target: 8 } }),
    },
    {
        id: "quest_weekly_master",
        tier: "master",
        category: "Quêtes",
        icon: "📋",
        name: "Acharné",
        desc: "Compléter 40 quêtes hebdomadaires.",
        hidden: true,
        eval: (m) => ({ unlocked: m.questWeeklyClaimedTotal >= 40, progress: { current: m.questWeeklyClaimedTotal, target: 40 } }),
    },
    {
        id: "quest_monthly_master",
        tier: "master",
        category: "Quêtes",
        icon: "📋",
        name: "Inarrêtable",
        desc: "Compléter 10 quêtes mensuelles.",
        hidden: true,
        eval: (m) => ({ unlocked: m.questMonthlyClaimedTotal >= 10, progress: { current: m.questMonthlyClaimedTotal, target: 10 } }),
    },
    // ───────────────── Roue & Daily lifetime (4)
    {
        id: "wheel_spinner_silver",
        tier: "silver",
        category: "Roue & Bonus",
        icon: "🎡",
        name: "Spinner",
        desc: "Faire tourner la roue 15 fois au total.",
        eval: (m) => ({ unlocked: m.wheelSpinsLifetimeTotal >= 15, progress: { current: m.wheelSpinsLifetimeTotal, target: 15 } }),
    },
    {
        id: "wheel_spinner_gold",
        tier: "gold",
        category: "Roue & Bonus",
        icon: "🎡",
        name: "Beyblade",
        desc: "Faire tourner la roue 60 fois au total.",
        eval: (m) => ({ unlocked: m.wheelSpinsLifetimeTotal >= 60, progress: { current: m.wheelSpinsLifetimeTotal, target: 60 } }),
    },
    {
        id: "daily_silver",
        tier: "silver",
        category: "Roue & Bonus",
        icon: "🗓️",
        name: "Assidu",
        desc: "Réclamer 15 bonus quotidiens au total (tous mois confondus).",
        eval: (m) => ({ unlocked: m.dailyClaimsTotal >= 15, progress: { current: m.dailyClaimsTotal, target: 15 } }),
    },
    {
        id: "daily_gold",
        tier: "gold",
        category: "Roue & Bonus",
        icon: "🗓️",
        name: "Toujours là",
        desc: "Réclamer 60 bonus quotidiens au total.",
        eval: (m) => ({ unlocked: m.dailyClaimsTotal >= 60, progress: { current: m.dailyClaimsTotal, target: 60 } }),
    },
    // ───────────────── Coffres (3)
    {
        id: "chest_opener_silver",
        tier: "silver",
        category: "Coffre",
        icon: "🎁",
        name: "Rat",
        desc: "Participer à 3 coffres.",
        eval: (m) => ({ unlocked: m.chestJoinsTotal >= 3, progress: { current: m.chestJoinsTotal, target: 3 } }),
    },
    {
        id: "chest_opener_gold",
        tier: "gold",
        category: "Coffre",
        icon: "🎁",
        name: "Pilleur",
        desc: "Participer à 15 coffres.",
        eval: (m) => ({ unlocked: m.chestJoinsTotal >= 15, progress: { current: m.chestJoinsTotal, target: 15 } }),
    },
    {
        id: "chest_opener_master",
        tier: "master",
        category: "Coffre",
        icon: "🎁",
        name: "One Piece",
        desc: "Participer à 50 coffres.",
        hidden: true,
        eval: (m) => ({ unlocked: m.chestJoinsTotal >= 50, progress: { current: m.chestJoinsTotal, target: 50 } }),
    },
    // ───────────────── Chat & Social (5)
    {
        id: "chat_active_silver",
        tier: "silver",
        category: "Chat & Social",
        icon: "💬",
        name: "Random",
        desc: "Envoyer 100 messages dans le chat.",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 100, progress: { current: m.chatMessagesTotal, target: 100 } }),
    },
    {
        id: "chat_active_gold",
        tier: "gold",
        category: "Chat & Social",
        icon: "💬",
        name: "Connu",
        desc: "Envoyer 750 messages dans le chat.",
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 750, progress: { current: m.chatMessagesTotal, target: 750 } }),
    },
    {
        id: "chat_active_master",
        tier: "master",
        category: "Chat & Social",
        icon: "💬",
        name: "Légende du chat",
        desc: "Envoyer 4 000 messages dans le chat.",
        hidden: true,
        eval: (m) => ({ unlocked: m.chatMessagesTotal >= 4000, progress: { current: m.chatMessagesTotal, target: 4000 } }),
    },
    {
        id: "chat_night_owl_silver",
        tier: "silver",
        category: "Chat & Social",
        icon: "🦉",
        name: "Vampire",
        desc: "Envoyer 30 messages entre 2h et 5h du matin.",
        eval: (m) => ({ unlocked: m.chatNightOwlCount >= 30, progress: { current: m.chatNightOwlCount, target: 30 } }),
    },
    {
        id: "chat_first_silver",
        tier: "silver",
        category: "Chat & Social",
        icon: "⚡",
        name: "First",
        desc: "Être le premier à écrire dans le chat sur 5 lives.",
        eval: (m) => ({ unlocked: m.firstChatterCount >= 5, progress: { current: m.firstChatterCount, target: 5 } }),
    },
    // ───────────────── Watch (3)
    {
        id: "watch_silver",
        tier: "silver",
        category: "Watch & Lives",
        icon: "📺",
        name: "Viewer",
        desc: "Regarder 180 minutes de live au total.",
        eval: (m) => ({ unlocked: m.watchMinutesTotal >= 180, progress: { current: m.watchMinutesTotal, target: 180 } }),
    },
    {
        id: "watch_gold",
        tier: "gold",
        category: "Watch & Lives",
        icon: "📺",
        name: "Fidèle",
        desc: "Regarder 900 minutes de live au total.",
        eval: (m) => ({ unlocked: m.watchMinutesTotal >= 900, progress: { current: m.watchMinutesTotal, target: 900 } }),
    },
    {
        id: "watch_master",
        tier: "master",
        category: "Watch & Lives",
        icon: "📺",
        name: "Brother Eye",
        desc: "Regarder 3 000 minutes de live au total.",
        hidden: true,
        eval: (m) => ({ unlocked: m.watchMinutesTotal >= 3000, progress: { current: m.watchMinutesTotal, target: 3000 } }),
    },
    // ───────────────── Discord (4)
    {
        id: "discord_linked_bronze",
        tier: "bronze",
        category: "Discord",
        icon: "🎮",
        name: "Connecté",
        desc: "Lier son compte Discord à LunaLive.",
        eval: (m) => ({ unlocked: m.discordLinked, progress: boolProgress(m.discordLinked) }),
    },
    {
        id: "discord_command_silver",
        tier: "silver",
        category: "Discord",
        icon: "🎮",
        name: "Testeur",
        desc: "Utiliser au moins 4 commandes Discord différentes.",
        eval: (m) => ({ unlocked: m.discordCommandDistinct >= 4, progress: { current: m.discordCommandDistinct, target: 4 } }),
    },
    {
        id: "discord_slots_gold",
        tier: "gold",
        category: "Discord",
        icon: "🎰",
        name: "Slotteur",
        desc: "Jouer 30 fois à /slot sur Discord.",
        eval: (m) => ({ unlocked: m.discordSlotUses >= 30, progress: { current: m.discordSlotUses, target: 30 } }),
    },
    {
        id: "discord_claim_master",
        tier: "master",
        category: "Discord",
        icon: "🎁",
        name: "Éphéméride",
        desc: "Utiliser /claim 150 fois sur Discord.",
        hidden: true,
        eval: (m) => ({ unlocked: m.discordClaimUses >= 150, progress: { current: m.discordClaimUses, target: 150 } }),
    },
    // ───────────────── XP & Levels (6)
    {
        id: "level_10_bronze",
        tier: "bronze",
        category: "XP",
        icon: "⭐",
        name: "Novice",
        desc: "Atteindre le niveau 10.",
        eval: (m) => {
            const level = levelFromXp(m.userXp);
            return { unlocked: level >= 10, progress: { current: level, target: 10 } };
        },
    },
    {
        id: "level_25_silver",
        tier: "silver",
        category: "XP",
        icon: "⭐",
        name: "Grinder",
        desc: "Atteindre le niveau 25.",
        eval: (m) => {
            const level = levelFromXp(m.userXp);
            return { unlocked: level >= 25, progress: { current: level, target: 25 } };
        },
    },
    {
        id: "level_50_gold",
        tier: "gold",
        category: "XP",
        icon: "⭐",
        name: "Pro",
        desc: "Atteindre le niveau 50.",
        eval: (m) => {
            const level = levelFromXp(m.userXp);
            return { unlocked: level >= 50, progress: { current: level, target: 50 } };
        },
    },
    {
        id: "level_75_master",
        tier: "master",
        category: "XP",
        icon: "⭐",
        name: "Tryharder",
        desc: "Atteindre le niveau 75.",
        hidden: true,
        eval: (m) => {
            const level = levelFromXp(m.userXp);
            return { unlocked: level >= 75, progress: { current: level, target: 75 } };
        },
    },
    {
        id: "level_100_master",
        tier: "master",
        category: "XP",
        icon: "🌟",
        name: "Légende",
        desc: "Atteindre le niveau maximum.",
        hidden: true,
        eval: (m) => {
            const level = levelFromXp(m.userXp);
            return { unlocked: level >= 100, progress: { current: level, target: 100 } };
        },
    },
    {
        id: "xp_grinder_master",
        tier: "master",
        category: "XP",
        icon: "⚙️",
        name: "Sans vie",
        desc: "Gagner 8 000 XP en une semaine.",
        hidden: true,
        eval: (m) => ({ unlocked: m.xpThisWeek >= 8000, progress: { current: m.xpThisWeek, target: 8000 } }),
    },
    // ───────────────── Meta (2)
    {
        id: "collection_silver",
        tier: "silver",
        category: "Meta",
        icon: "🧩",
        name: "Collectionneur",
        desc: "Débloquer 20 succès au total.",
        eval: (_m, unlockedCountExceptCollector) => ({
            unlocked: unlockedCountExceptCollector >= 20,
            progress: { current: unlockedCountExceptCollector, target: 20 },
        }),
    },
    {
        id: "collection_gold",
        tier: "gold",
        category: "Meta",
        icon: "🧩",
        name: "Chasseur",
        desc: "Débloquer 50 succès au total.",
        eval: (_m, unlockedCountExceptCollector) => ({
            unlocked: unlockedCountExceptCollector >= 50,
            progress: { current: unlockedCountExceptCollector, target: 50 },
        }),
    },
];
achievementsRouter.get("/", async (req, res) => {
    const user = req.user;
    const userId = user.id;
    const m = await getMetrics(userId);
    const derivedIds = new Set(["master_polyvalent", "master_collection_par_categorie"]);
    const baseDefs = defs.filter((d) => !derivedIds.has(d.id) && d.id !== "master_collectionneur");
    const baseResults = baseDefs.map((d) => ({ def: d, result: d.eval(m, 0) }));
    const bronzeTotal = baseDefs.filter((d) => d.tier === "bronze").length;
    const silverTotal = baseDefs.filter((d) => d.tier === "silver").length;
    const bronzeUnlockedCount = baseResults.filter((x) => x.def.tier === "bronze" && x.result.unlocked).length;
    const silverUnlockedCount = baseResults.filter((x) => x.def.tier === "silver" && x.result.unlocked).length;
    const unlockedGoldCategories = new Set(baseResults.filter((x) => x.def.tier === "gold" && x.result.unlocked).map((x) => x.def.category));
    const derivedResults = {
        master_polyvalent: {
            unlocked: unlockedGoldCategories.size >= 3,
            progress: { current: unlockedGoldCategories.size, target: 3 },
        },
        master_collection_par_categorie: {
            unlocked: bronzeUnlockedCount >= bronzeTotal && silverUnlockedCount >= silverTotal,
            progress: { current: bronzeUnlockedCount + silverUnlockedCount, target: bronzeTotal + silverTotal },
        },
    };
    const unlockedCountExceptCollector = baseResults.filter((x) => x.result.unlocked).length +
        Object.values(derivedResults).filter((x) => x.unlocked).length;
    const collectorResult = defs.find((d) => d.id === "master_collectionneur")?.eval(m, unlockedCountExceptCollector) ?? {
        unlocked: false,
        progress: { current: 0, target: 20 },
    };
    const achievements = defs.map((d) => {
        const r = d.id === "master_collectionneur"
            ? collectorResult
            : derivedResults[d.id]
                ? derivedResults[d.id]
                : d.eval(m, unlockedCountExceptCollector);
        const unlocked = !!r.unlocked;
        const isHiddenLocked = !!d.hidden && !unlocked;
        return {
            id: d.id,
            tier: d.tier,
            category: d.category,
            icon: isHiddenLocked ? "❔" : d.icon,
            name: isHiddenLocked ? "???" : d.name,
            desc: unlocked ? (d.desc ?? null) : d.tier === "bronze" ? (d.desc ?? null) : null,
            hint: !unlocked && d.tier === "gold" ? (d.hint ?? null) : null,
            rewardPreview: d.rewardPreview ?? null,
            unlocked,
            progress: r.progress ?? null,
        };
    });
    const unlockedIds = achievements.filter((a) => a.unlocked).map((a) => a.id);
    let granted = 0;
    try {
        const r = await grantEntitlementsForUnlocked(userId, unlockedIds);
        granted = r.granted;
    }
    catch {
        granted = 0;
    }
    // ── XP au premier unlock ──────────────────────────────────────────────────
    let xpGrantedTotal = 0;
    try {
        const hasUnlocksTable = await tableExists("user_achievements_unlocks");
        if (hasUnlocksTable && unlockedIds.length > 0) {
            // INSERT les unlocks déjà connus (ON CONFLICT DO NOTHING)
            // Puis récupère les lignes fraîchement insérées (xp_awarded=0 = pas encore traité)
            const batchValues = [];
            const batchRows = [];
            let pi = 1;
            for (const id of unlockedIds) {
                batchRows.push(`($${pi++}, $${pi++})`);
                batchValues.push(userId, id);
            }
            await pool.query(`INSERT INTO user_achievements_unlocks (user_id, achievement_id)
         VALUES ${batchRows.join(",")}
         ON CONFLICT (user_id, achievement_id) DO NOTHING`, batchValues);
            // Claim atomique des rows fraîches (xp_awarded = 0 → -1 via UPDATE RETURNING)
            // Le UPDATE atomique évite le double-award si deux requêtes concurrentes arrivent.
            const claimedRows = await pool.query(`UPDATE user_achievements_unlocks
         SET xp_awarded = -1
         WHERE user_id = $1 AND xp_awarded = 0
         RETURNING achievement_id`, [userId]);
            if (claimedRows.rows.length > 0) {
                const XP_BY_TIER = {
                    bronze: 50,
                    silver: 100,
                    gold: 250,
                    master: 500,
                };
                const tierById = {};
                for (const d of defs)
                    tierById[d.id] = d.tier;
                const client = await pool.connect();
                try {
                    await client.query("BEGIN");
                    for (const row of claimedRows.rows) {
                        const tier = tierById[row.achievement_id];
                        const xpAmount = tier ? (XP_BY_TIER[tier] ?? 0) : 0;
                        if (xpAmount > 0) {
                            await awardXpTx(client, userId, xpAmount, "achievement", row.achievement_id, {
                                achievement_id: row.achievement_id,
                            });
                            await client.query(`UPDATE user_achievements_unlocks SET xp_awarded = $3
                 WHERE user_id = $1 AND achievement_id = $2`, [userId, row.achievement_id, xpAmount]);
                            xpGrantedTotal += xpAmount;
                        }
                        // Si xpAmount = 0 (tier inconnu), reste à -1 — traité, pas de double award.
                    }
                    await client.query("COMMIT");
                }
                catch (err) {
                    await client.query("ROLLBACK");
                    console.error("[achievements] XP grant error:", err);
                }
                finally {
                    client.release();
                }
            }
        }
    }
    catch (err) {
        console.error("[achievements] XP hook error:", err);
    }
    res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        monthStart: m.monthStartIso,
        monthEnd: m.monthEndIso,
        achievements,
        grantedEntitlements: granted, // debug (front peut ignorer)
        xpGranted: xpGrantedTotal, // debug (front peut ignorer)
    });
});
/**
 * Helper exportable pour résumer les succès d'un user par tier.
 * Utilisé par les commandes Discord/chat (!succes, /profil) sans passer
 * par la route HTTP.
 */
export async function computeAchievementsSummary(userId) {
    const m = await getMetrics(userId);
    const derivedIds = new Set(["master_polyvalent", "master_collection_par_categorie"]);
    const baseDefs = defs.filter((d) => !derivedIds.has(d.id) && d.id !== "master_collectionneur");
    const baseResults = baseDefs.map((d) => ({ def: d, result: d.eval(m, 0) }));
    const bronzeTotal = baseDefs.filter((d) => d.tier === "bronze").length;
    const silverTotal = baseDefs.filter((d) => d.tier === "silver").length;
    const bronzeUnlockedCount = baseResults.filter((x) => x.def.tier === "bronze" && x.result.unlocked).length;
    const silverUnlockedCount = baseResults.filter((x) => x.def.tier === "silver" && x.result.unlocked).length;
    const unlockedGoldCategories = new Set(baseResults.filter((x) => x.def.tier === "gold" && x.result.unlocked).map((x) => x.def.category));
    const derivedResults = {
        master_polyvalent: { unlocked: unlockedGoldCategories.size >= 3 },
        master_collection_par_categorie: {
            unlocked: bronzeUnlockedCount >= bronzeTotal && silverUnlockedCount >= silverTotal,
        },
    };
    const unlockedCountExceptCollector = baseResults.filter((x) => x.result.unlocked).length +
        Object.values(derivedResults).filter((x) => x.unlocked).length;
    const collectorResult = defs.find((d) => d.id === "master_collectionneur")?.eval(m, unlockedCountExceptCollector) ?? {
        unlocked: false,
    };
    const summary = { bronze: { unlocked: 0, total: 0 }, silver: { unlocked: 0, total: 0 }, gold: { unlocked: 0, total: 0 }, master: { unlocked: 0, total: 0 } };
    for (const d of defs) {
        const tier = d.tier;
        if (!summary[tier])
            continue;
        summary[tier].total += 1;
        let unlocked = false;
        if (d.id === "master_collectionneur")
            unlocked = !!collectorResult.unlocked;
        else if (derivedResults[d.id])
            unlocked = derivedResults[d.id].unlocked;
        else
            unlocked = !!d.eval(m, unlockedCountExceptCollector).unlocked;
        if (unlocked)
            summary[tier].unlocked += 1;
    }
    const totalUnlocked = summary.bronze.unlocked + summary.silver.unlocked + summary.gold.unlocked + summary.master.unlocked;
    const totalAll = summary.bronze.total + summary.silver.total + summary.gold.total + summary.master.total;
    return { byTier: summary, totalUnlocked, totalAll };
}
