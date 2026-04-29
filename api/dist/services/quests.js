// api/src/services/quests.ts
//
// Service quêtes daily/weekly/monthly.
// La progression est calculée à la volée depuis les tables existantes
// (chat_messages, wallet_tx, etc.) — pas de duplication d'état. Seuls
// le claim et le seed des quêtes actives par période sont matérialisés.
import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
import { awardXpTx, XP_SOURCES } from "../economy/xp.js";
const TZ = "Europe/Paris";
function parisDateParts(d) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
    };
}
/** ISO week number (lundi=premier jour) basé sur date Paris. */
function isoWeek(d) {
    const { year, month, day } = parisDateParts(d);
    // copier puis utiliser UTC pour le calcul ISO
    const t = new Date(Date.UTC(year, month - 1, day));
    const dayNum = (t.getUTCDay() + 6) % 7; // lundi = 0
    t.setUTCDate(t.getUTCDate() - dayNum + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const wk = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return { year: t.getUTCFullYear(), week: wk };
}
export function getCurrentPeriodKey(type, now = new Date()) {
    if (type === "daily") {
        const { year, month, day } = parisDateParts(now);
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    if (type === "weekly") {
        const { year, week } = isoWeek(now);
        return `${year}-W${String(week).padStart(2, "0")}`;
    }
    // monthly
    const { year, month } = parisDateParts(now);
    return `${year}-${String(month).padStart(2, "0")}`;
}
/** Borne de début de période en SQL `timestamptz`. Pour le calcul de progression. */
export function getPeriodStartSql(type, now = new Date()) {
    if (type === "daily") {
        const { year, month, day } = parisDateParts(now);
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 00:00:00 Europe/Paris`;
    }
    if (type === "weekly") {
        // Début de la semaine ISO (lundi) en Europe/Paris
        const { year, month, day } = parisDateParts(now);
        const t = new Date(Date.UTC(year, month - 1, day));
        const dayNum = (t.getUTCDay() + 6) % 7; // lundi = 0
        t.setUTCDate(t.getUTCDate() - dayNum);
        const py = t.getUTCFullYear();
        const pm = t.getUTCMonth() + 1;
        const pd = t.getUTCDate();
        return `${py}-${String(pm).padStart(2, "0")}-${String(pd).padStart(2, "0")} 00:00:00 Europe/Paris`;
    }
    // monthly
    const { year, month } = parisDateParts(now);
    return `${year}-${String(month).padStart(2, "0")}-01 00:00:00 Europe/Paris`;
}
export function getPeriodExpiresAtIso(type, now = new Date()) {
    // Fin de période = début de la période suivante - 1ms (approx).
    // Pour l'UI on retourne juste la borne sup.
    const { year, month, day } = parisDateParts(now);
    if (type === "daily") {
        const next = new Date(Date.UTC(year, month - 1, day + 1));
        return next.toISOString();
    }
    if (type === "weekly") {
        const t = new Date(Date.UTC(year, month - 1, day));
        const dayNum = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dayNum + 7); // lundi suivant
        return t.toISOString();
    }
    const next = new Date(Date.UTC(year, month, 1));
    return next.toISOString();
}
/** Retourne la progression actuelle d'un user pour une métrique donnée sur la période courante. */
export async function computeMetricProgress(client, userId, metric, type) {
    const periodStart = getPeriodStartSql(type);
    switch (metric) {
        case "login": {
            // Connecté aujourd'hui = au moins une activité (wallet_tx OU last_login_at)
            const r = await client.query(`SELECT 1 FROM users WHERE id = $1
           AND last_login_at >= $2::timestamptz
         LIMIT 1`, [userId, periodStart]);
            return r.rows[0] ? 1 : 0;
        }
        case "chat_msg": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM chat_messages
          WHERE user_id = $1 AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "watch_min": {
            // stream_viewer_minutes: 1 row par bucket_ts (1 min de présence)
            const r = await client.query(`SELECT COUNT(DISTINCT bucket_ts)::int AS m
           FROM stream_viewer_minutes
          WHERE user_id = $1 AND bucket_ts >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.m || 0);
        }
        case "call": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM calls_actions
          WHERE user_id = $1 AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "streamer_visit": {
            const r = await client.query(`SELECT COUNT(DISTINCT streamer_id)::int AS n
           FROM stream_viewer_minutes
          WHERE user_id = $1 AND bucket_ts >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "discord_claim": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM wallet_tx
          WHERE user_id = $1 AND kind = 'earn' AND origin = 'discord_claim'
            AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "discord_blackjack": {
            // 1 partie = 1+ tx blackjack mais on dédoublonne par minute pour éviter de
            // compter natural+win comme 2 parties
            const r = await client.query(`SELECT COUNT(DISTINCT date_trunc('minute', created_at))::int AS n
           FROM wallet_tx
          WHERE user_id = $1 AND kind = 'earn'
            AND origin LIKE 'discord_blackjack%'
            AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "rain_catch": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM wallet_tx
          WHERE user_id = $1 AND kind = 'earn' AND origin = 'farm_watch'
            AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "chest_open": {
            // Payouts de coffres ouverts par cet user
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM streamer_chest_payouts
          WHERE user_id = $1 AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "prediction_bet": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM prediction_bets
          WHERE user_id = $1 AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "daily_claim": {
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM daily_bonus_claims
          WHERE user_id = $1 AND day >= ($2::timestamptz)::date`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        case "sub_send": {
            // Sub envoyé = wallet_tx kind=spend, spend_type='sub' depuis cet user
            const r = await client.query(`SELECT COUNT(*)::int AS n FROM wallet_tx
          WHERE user_id = $1 AND kind = 'spend' AND spend_type = 'sub'
            AND created_at >= $2::timestamptz`, [userId, periodStart]);
            return Number(r.rows[0]?.n || 0);
        }
        default:
            return 0;
    }
}
/** Liste les quêtes actives sur la période courante avec progression du user. */
export async function getActiveQuestsForUser(userId) {
    const client = await pool.connect();
    try {
        const types = ["daily", "weekly", "monthly"];
        const out = [];
        for (const type of types) {
            const periodKey = getCurrentPeriodKey(type);
            const expiresAt = getPeriodExpiresAtIso(type);
            const seeds = await client.query(`SELECT q.code, q.type, q.title, q.description, q.metric, q.target,
                q.reward_rubis, q.reward_origin, q.reward_meta, q.sort_order
           FROM quest_seeds qs
           JOIN quests q ON q.code = qs.quest_code
          WHERE qs.type = $1 AND qs.period_key = $2 AND q.enabled = TRUE
          ORDER BY q.sort_order ASC, q.code ASC`, [type, periodKey]);
            for (const row of seeds.rows) {
                const code = String(row.code);
                const progress = await computeMetricProgress(client, userId, String(row.metric), type);
                const target = Number(row.target);
                const completed = progress >= target;
                // claim status
                const cl = await client.query(`SELECT claimed_at FROM quest_progress
            WHERE user_id = $1 AND quest_code = $2 AND period_key = $3`, [userId, code, periodKey]);
                const claimedAt = cl.rows[0]?.claimed_at
                    ? new Date(cl.rows[0].claimed_at).toISOString()
                    : null;
                out.push({
                    code,
                    type: row.type,
                    title: String(row.title),
                    description: row.description || null,
                    metric: String(row.metric),
                    target,
                    rewardRubis: Number(row.reward_rubis || 0),
                    rewardOrigin: String(row.reward_origin || "quest_daily"),
                    rewardMeta: row.reward_meta || null,
                    sortOrder: Number(row.sort_order || 0),
                    periodKey,
                    progress,
                    completed,
                    claimedAt,
                    claimable: completed && !claimedAt,
                    expiresAt,
                });
            }
        }
        return out.sort((a, b) => {
            const ord = { daily: 0, weekly: 1, monthly: 2 };
            return ord[a.type] - ord[b.type] || a.sortOrder - b.sortOrder;
        });
    }
    finally {
        client.release();
    }
}
/** Claim une quête complétée. Crédite la reward via earnRubisTx. */
export async function claimQuest(userId, questCode) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const q = await client.query(`SELECT code, type, metric, target, reward_rubis, reward_origin, reward_meta
         FROM quests WHERE code = $1 AND enabled = TRUE LIMIT 1`, [questCode]);
        const quest = q.rows[0];
        if (!quest) {
            await client.query("ROLLBACK");
            return { ok: false, error: "quest_not_found" };
        }
        const type = quest.type;
        const periodKey = getCurrentPeriodKey(type);
        // Vérifie que la quête est seedée sur cette période
        const seed = await client.query(`SELECT 1 FROM quest_seeds WHERE quest_code = $1 AND period_key = $2 LIMIT 1`, [questCode, periodKey]);
        if (!seed.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: false, error: "quest_not_active" };
        }
        // Verrouille progress (UPSERT puis lock row)
        await client.query(`INSERT INTO quest_progress (user_id, quest_code, period_key, progress_value)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id, quest_code, period_key) DO NOTHING`, [userId, questCode, periodKey]);
        const lock = await client.query(`SELECT progress_value, claimed_at FROM quest_progress
        WHERE user_id = $1 AND quest_code = $2 AND period_key = $3
        FOR UPDATE`, [userId, questCode, periodKey]);
        const row = lock.rows[0];
        if (row?.claimed_at) {
            await client.query("ROLLBACK");
            return { ok: false, error: "already_claimed" };
        }
        // Recalcule la progression au moment du claim
        const progress = await computeMetricProgress(client, userId, String(quest.metric), type);
        if (progress < Number(quest.target)) {
            await client.query("ROLLBACK");
            return { ok: false, error: "not_completed" };
        }
        const rewardRubis = Number(quest.reward_rubis || 0);
        const rewardOrigin = String(quest.reward_origin || `quest_${type}`);
        const rewardMeta = quest.reward_meta || null;
        // Crédit rubis (si > 0). Origin = quest_daily/weekly/monthly → weight 0.
        if (rewardRubis > 0) {
            await earnRubisTx(client, userId, rewardOrigin, rewardRubis, {
                questCode,
                periodKey,
                ...(rewardMeta || {}),
            });
        }
        // Crédit XP en plus (uncapped pour les quêtes — on veut récompenser)
        const xpAmount = type === "daily"
            ? XP_SOURCES.quest_daily
            : type === "weekly"
                ? XP_SOURCES.quest_weekly
                : XP_SOURCES.quest_monthly;
        const xpResult = await awardXpTx(client, userId, xpAmount, `quest_${type}`, `quest:${questCode}`, {
            questCode,
            periodKey,
        });
        // Reward méta (titre, cosmétique...) — pour `monthly_supporter` etc.
        if (rewardMeta?.title_code) {
            await client.query(`INSERT INTO user_entitlements (user_id, kind, code)
         VALUES ($1, 'title', $2)
         ON CONFLICT DO NOTHING`, [userId, String(rewardMeta.title_code)]).catch(() => { });
        }
        await client.query(`UPDATE quest_progress
          SET progress_value = $4,
              claimed_at = NOW(),
              updated_at = NOW()
        WHERE user_id = $1 AND quest_code = $2 AND period_key = $3`, [userId, questCode, periodKey, progress]);
        await client.query("COMMIT");
        return {
            ok: true,
            rewardRubis,
            rewardMeta,
            xpDelta: xpResult.delta,
            leveledUp: xpResult.leveledUp,
            newLevel: xpResult.newLevel,
        };
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
/** Pioche aléatoirement N quêtes actives parmi le pool d'un type donné. */
export async function seedActiveQuestsForPeriod(type, periodKey, count) {
    const client = await pool.connect();
    try {
        // Si déjà seedé pour cette période, on ne touche pas
        const existing = await client.query(`SELECT 1 FROM quest_seeds WHERE type = $1 AND period_key = $2 LIMIT 1`, [type, periodKey]);
        if (existing.rows[0])
            return { added: [] };
        const pool_ = await client.query(`SELECT code FROM quests WHERE type = $1 AND enabled = TRUE`, [type]);
        const codes = pool_.rows.map((r) => String(r.code));
        if (codes.length === 0)
            return { added: [] };
        // Shuffle (Fisher-Yates) puis prend les N premières
        for (let i = codes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [codes[i], codes[j]] = [codes[j], codes[i]];
        }
        const picked = codes.slice(0, Math.min(count, codes.length));
        for (const code of picked) {
            await client.query(`INSERT INTO quest_seeds (type, period_key, quest_code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`, [type, periodKey, code]);
        }
        return { added: picked };
    }
    finally {
        client.release();
    }
}
/** Fait tourner le seed des 3 périodes pour la date courante. Idempotent. */
export async function seedAllPeriodsIfNeeded() {
    const daily = await seedActiveQuestsForPeriod("daily", getCurrentPeriodKey("daily"), 4);
    const weekly = await seedActiveQuestsForPeriod("weekly", getCurrentPeriodKey("weekly"), 3);
    const monthly = await seedActiveQuestsForPeriod("monthly", getCurrentPeriodKey("monthly"), 2);
    return {
        daily: daily.added,
        weekly: weekly.added,
        monthly: monthly.added,
    };
}
